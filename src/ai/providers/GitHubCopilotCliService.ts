/**
 * @module GitHubCopilotCliService
 * @description GitHub Copilot CLI SDK integration for Vault Copilot.
 *
 * This module provides the primary AI provider implementation using the
 * GitHub Copilot SDK (`@github/copilot-sdk`). It enables full-featured
 * AI assistance with tool calling, streaming, and custom skill support.
 *
 * ## Features
 *
 * - **Copilot SDK Integration**: Full CopilotClient and CopilotSession support
 * - **Tool Calling**: Built-in vault operations + MCP server tools
 * - **Custom Skills**: Load .skill.md files for specialized behaviors
 * - **Custom Instructions**: Support AGENTS.md and copilot-instructions.md
 * - **Streaming**: Real-time response streaming with delta callbacks
 * - **Tracing**: Integration with TracingService for diagnostics
 *
 * ## Architecture
 *
 * ```
 * GitHubCopilotCliService
 *   ├── CopilotClient (SDK)
 *   │    └── CopilotSession (per conversation)
 *   ├── ToolManager (built-in + MCP tools)
 *   ├── CustomizationLoader (skills, instructions, prompts)
 *   └── McpManager (MCP server tools)
 * ```
 *
 * ## Desktop Only
 *
 * This provider requires the Copilot CLI and is only available on desktop.
 * Mobile platforms should use {@link OpenAIService} instead.
 *
 * @example
 * ```typescript
 * const service = new GitHubCopilotCliService(app, {
 *   model: 'gpt-4.1',
 *   streaming: true,
 *   vaultPath: '/path/to/vault',
 * });
 *
 * await service.initialize();
 * await service.sendMessageStreaming('Help me organize my notes', {
 *   onDelta: (chunk) => appendToUI(chunk),
 * });
 * ```
 *
 * @see {@link AIProvider} for the base class interface
 * @see {@link GitHubCopilotCliManager} for CLI management
 * @since 0.0.1
 */

import { CopilotClient, CopilotSession, SessionEvent, defineTool } from "@github/copilot-sdk";
import { App, TFile } from "obsidian";
import { SkillRegistry, VaultCopilotSkill } from "../customization/SkillRegistry";
import { CustomizationLoader, CustomInstruction, CustomAgent } from "../customization/CustomizationLoader";
import { AgentCache } from "../customization/AgentCache";
import { McpManager, McpManagerEvent } from "../mcp/McpManager";
import { McpTool } from "../mcp/McpTypes";
import { normalizeVaultPath, ensureMarkdownExtension } from "../../utils/pathUtils";
import * as VaultOps from "../tools/VaultOperations";
import { getTracingService } from "../TracingService";
import { TOOL_NAMES, TOOL_DESCRIPTIONS, TOOL_JSON_SCHEMAS } from "../tools/ToolDefinitions";
import type { QuestionRequest, QuestionResponse } from "../../types/questions";
import { BASES_TOOL_NAMES, BASES_TOOL_DESCRIPTIONS, BASES_TOOL_JSON_SCHEMAS, type QueryBaseParams, type AddBaseRecordsParams, type CreateBaseParams, type ReadBaseParams, type UpdateBaseRecordsParams, type EvolveBaseSchemaParams } from "../bases/BasesToolDefinitions";
import { handleQueryBase, handleAddBaseRecords, handleCreateBase, handleReadBase, handleUpdateBaseRecords, handleEvolveBaseSchema } from "../bases/BasesToolHandlers";

export interface GitHubCopilotCliConfig {
	model: string;
	cliPath?: string;
	cliUrl?: string;
	streaming: boolean;
	/** Path to the Obsidian vault directory */
	vaultPath?: string;
	/** Enable tracing and SDK debug logging */
	tracingEnabled?: boolean;
	/** SDK log level (debug, info, warn, error). Default: info */
	logLevel?: 'debug' | 'info' | 'warn' | 'error';
	/** Skill registry for plugin-registered skills */
	skillRegistry?: SkillRegistry;
	/** MCP Manager for MCP server tools */
	mcpManager?: McpManager;
	/** Directories containing skill definition files */
	skillDirectories?: string[];
	/** Directories containing custom agent definition files */
	agentDirectories?: string[];
	/** Directories containing instruction files */
	instructionDirectories?: string[];
	/** Directories containing prompt files */
	promptDirectories?: string[];
	/** Agent cache for looking up agents by name */
	agentCache?: AgentCache;
	/** Optional allowlist of tool names to enable (SDK availableTools) */
	availableTools?: string[];
	/** Request timeout in milliseconds (default: 120000 - 2 minutes) */
	requestTimeout?: number;
	/** Stop timeout in milliseconds before forcing (default: 10000 - 10 seconds) */
	stopTimeout?: number;
}

/** Default timeout for requests (2 minutes) */
const DEFAULT_REQUEST_TIMEOUT = 120000;
/** Default timeout for graceful stop (10 seconds) */
const DEFAULT_STOP_TIMEOUT = 10000;

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
}

/**
 * Model capabilities info (our own primitive types, not SDK types)
 */
export interface ModelCapabilitiesInfo {
	/** Whether the model supports vision */
	supportsVision?: boolean;
	/** Maximum number of tokens in a prompt */
	maxPromptTokens?: number;
	/** Maximum context window size in tokens */
	maxContextWindowTokens?: number;
	/** Supported media types for vision */
	supportedMediaTypes?: string[];
	/** Maximum number of images in a prompt */
	maxPromptImages?: number;
	/** Maximum size of a prompt image in bytes */
	maxPromptImageSize?: number;
}

/**
 * Model policy info (our own primitive types)
 */
export interface ModelPolicyInfo {
	/** Policy state: enabled, disabled, or unconfigured */
	state: "enabled" | "disabled" | "unconfigured";
	/** Terms for using the model */
	terms: string;
}

/**
 * Model info result (our own primitive types, not SDK types)
 * Wraps the SDK's ModelInfo with our own types for API encapsulation
 */
export interface ModelInfoResult {
	/** Model identifier (e.g., "claude-sonnet-4.5") */
	id: string;
	/** Display name */
	name: string;
	/** Model capabilities */
	capabilities: ModelCapabilitiesInfo;
	/** Policy state (if available) */
	policy?: ModelPolicyInfo;
	/** Billing multiplier (if available) */
	billingMultiplier?: number;
}

/**
 * Service class that wraps the GitHub Copilot SDK for use in Obsidian.
 * Handles client lifecycle, session management, and provides Obsidian-specific tools.
 */
export class GitHubCopilotCliService {
	private client: CopilotClient | null = null;
	private session: CopilotSession | null = null;
	private app: App;
	private config: GitHubCopilotCliConfig;
	private messageHistory: ChatMessage[] = [];
	private eventHandlers: ((event: SessionEvent) => void)[] = [];
	private customizationLoader: CustomizationLoader;
	private loadedInstructions: CustomInstruction[] = [];
	private mcpEventUnsubscribe: (() => void) | null = null;
	private questionCallback: ((question: QuestionRequest) => Promise<QuestionResponse | null>) | null = null;
	/** Current subagent recursion depth (max 3) */
	private subagentDepth = 0;
	/** The currently active parent agent (for allowlist checks during subagent invocation) */
	private currentParentAgent?: CustomAgent;

	constructor(app: App, config: GitHubCopilotCliConfig) {
		this.app = app;
		this.config = config;
		this.customizationLoader = new CustomizationLoader(app);
		
		// Subscribe to MCP server changes to update tools
		if (config.mcpManager) {
			const listener = (event: McpManagerEvent) => {
				if (event.type === "server-tools-updated" || event.type === "server-status-changed") {
					// Tools changed - recreate session to pick up new tools
					console.log("[GitHubCopilotCliService] MCP tools changed, session will use updated tools on next message");
				}
			};
			config.mcpManager.on(listener);
			this.mcpEventUnsubscribe = () => config.mcpManager?.off(listener);
		}
	}

	/**
	 * Initialize and start the Copilot client
	 * Handles specific error conditions like missing CLI or connection failures
	 */
	async start(): Promise<void> {
		if (this.client) {
			return;
		}

		const clientOptions: Record<string, unknown> = {};
		
		if (this.config.cliPath) {
			clientOptions.cliPath = this.config.cliPath;
		}
		
		if (this.config.cliUrl) {
			clientOptions.cliUrl = this.config.cliUrl;
		}

		// Set vault path as working directory and add-dir for file access
		if (this.config.vaultPath) {
			// Normalize path for cross-platform compatibility
			const normalizedPath = this.config.vaultPath.replace(/\\/g, "/");
			// Set working directory for the CLI process
			clientOptions.cwd = this.config.vaultPath;
			// Add --add-dir to grant CLI access to the vault directory
			clientOptions.cliArgs = [`--add-dir`, normalizedPath];
		}

		// Enable SDK logging when tracing is enabled
		if (this.config.tracingEnabled) {
			// Use configured log level, default to 'info' if not specified
			clientOptions.logLevel = this.config.logLevel || "info";
			
			// Intercept console.log/warn/error to capture SDK logs
			this.interceptConsoleLogs();
		}

		this.client = new CopilotClient(clientOptions);
		
		try {
			await this.client.start();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			
			// Handle specific error types with user-friendly messages
			if (errorMessage.includes('ENOENT') || errorMessage.toLowerCase().includes('not found')) {
				this.client = null;
				throw new Error(
					'GitHub Copilot CLI not found. Please ensure it is installed and in your PATH. ' +
					'Run "npm install -g @github/copilot-cli" or specify the path in settings.'
				);
			}
			
			if (errorMessage.includes('ECONNREFUSED') || errorMessage.toLowerCase().includes('connection refused')) {
				this.client = null;
				throw new Error(
					'Could not connect to GitHub Copilot CLI server. ' +
					'Please ensure the CLI is running and accessible.'
				);
			}
			
			if (errorMessage.includes('EACCES') || errorMessage.toLowerCase().includes('permission')) {
				this.client = null;
				throw new Error(
					'Permission denied when starting GitHub Copilot CLI. ' +
					'Please check file permissions and try running with appropriate access.'
				);
			}
			
			// Log and rethrow unknown errors
			console.error('[Vault Copilot] Failed to start Copilot client:', error);
			this.client = null;
			throw error;
		}
	}

	/**
	 * Intercept console and process.stderr logs to capture SDK diagnostics
	 */
	private interceptConsoleLogs(): void {
		const tracingService = getTracingService();
		const processLike = (globalThis as any).process as { stderr?: { write?: (...args: any[]) => any } } | undefined;
		
		// Log that we're setting up interception
		console.log('[Vault Copilot] Setting up CLI log interception...');
		tracingService.addSdkLog('info', 'CLI log interception initialized', 'copilot-sdk');
		
		// Intercept process.stderr.write to capture CLI subprocess logs
		// The SDK writes logs with prefix "[CLI subprocess]" to stderr
		if (processLike?.stderr?.write) {
			const originalStderrWrite = processLike.stderr.write.bind(processLike.stderr);
			(processLike.stderr as any).write = (chunk: any, encoding?: any, callback?: any) => {
				const message = typeof chunk === 'string' ? chunk : chunk?.toString?.() || '';
				
				// Debug: Log all stderr writes to see what we're getting
				if (message.trim()) {
					console.log('[Vault Copilot DEBUG] stderr:', message.substring(0, 200));
				}
				
				// Capture all CLI subprocess logs (they have the [CLI subprocess] prefix)
				if (message.includes('[CLI subprocess]')) {
					// Extract the actual log content after the prefix
					const logContent = message.replace('[CLI subprocess]', '').trim();
					if (logContent) {
						// Parse log level from content if possible
						let level: 'info' | 'warning' | 'error' | 'debug' = 'info';
						if (message.toLowerCase().includes('error')) {
							level = 'error';
						} else if (message.toLowerCase().includes('warn')) {
							level = 'warning';
						} else if (message.toLowerCase().includes('debug')) {
							level = 'debug';
						}
						tracingService.addSdkLog(level, logContent, 'copilot-cli');
					}
				}
				
				// Handle the different overload signatures of write()
				if (typeof encoding === 'function') {
					return originalStderrWrite(chunk, encoding);
				}
				return originalStderrWrite(chunk, encoding, callback);
			};
			console.log('[Vault Copilot] stderr.write intercepted successfully');
		} else {
			console.warn('[Vault Copilot] process.stderr.write not available - CLI logs will not be captured');
			tracingService.addSdkLog('warning', 'process.stderr.write not available - CLI logs cannot be captured', 'copilot-sdk');
		}
		
		// Store original console methods
		const originalLog = console.log.bind(console);
		const originalWarn = console.warn.bind(console);
		const originalError = console.error.bind(console);
		
		// Intercept console.log
		console.log = (...args: unknown[]) => {
			originalLog(...args);
			const message = args.map(arg => 
				typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
			).join(' ');
			
			// Only capture copilot-related logs
			if (message.includes('[Copilot') || message.includes('copilot') || message.includes('[Vault Copilot]')) {
				tracingService.addSdkLog('info', message, 'copilot-sdk');
			}
		};
		
		// Intercept console.warn
		console.warn = (...args: unknown[]) => {
			originalWarn(...args);
			const message = args.map(arg => 
				typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
			).join(' ');
			
			if (message.includes('[Copilot') || message.includes('copilot') || message.includes('[Vault Copilot]')) {
				tracingService.addSdkLog('warning', message, 'copilot-sdk');
			}
		};
		
		// Intercept console.error
		console.error = (...args: unknown[]) => {
			originalError(...args);
			const message = args.map(arg => 
				typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
			).join(' ');
			
			if (message.includes('[Copilot') || message.includes('copilot') || message.includes('[Vault Copilot]')) {
				tracingService.addSdkLog('error', message, 'copilot-sdk');
			}
		};
	}

	/**
	 * Stop the Copilot client and clean up resources
	 * Uses timeout and force stop for graceful shutdown
	 */
	async stop(): Promise<void> {
		// Clean up MCP listener
		if (this.mcpEventUnsubscribe) {
			this.mcpEventUnsubscribe();
			this.mcpEventUnsubscribe = null;
		}
		
		if (this.session) {
			try {
				await this.session.destroy();
			} catch (error) {
				console.warn('[Vault Copilot] Error destroying session:', error);
			}
			this.session = null;
		}
		
		if (this.client) {
			const stopTimeout = this.config.stopTimeout ?? DEFAULT_STOP_TIMEOUT;
			
			try {
				// Try graceful stop with timeout
				const stopPromise = this.client.stop();
				const timeoutPromise = new Promise<never>((_, reject) => 
					setTimeout(() => reject(new Error('Stop timeout')), stopTimeout)
				);
				
				await Promise.race([stopPromise, timeoutPromise]);
			} catch (error) {
				console.warn('[Vault Copilot] Graceful stop timed out, forcing stop...');
				try {
					await this.client.forceStop();
				} catch (forceError) {
					console.error('[Vault Copilot] Force stop failed:', forceError);
				}
			}
			this.client = null;
		}
		this.messageHistory = [];
	}

	/**
	 * Set the question callback for asking the user questions via modal UI.
	 * 
	 * @param callback - Function that shows a QuestionModal and returns the user's response
	 * @since 0.0.17
	 */
	setQuestionCallback(callback: ((question: QuestionRequest) => Promise<QuestionResponse | null>) | null): void {
		this.questionCallback = callback;
	}

	/**
	 * Create a new chat session with Obsidian-specific tools
	 * @param sessionId Optional session ID for persistence. If provided, the session can be resumed later.
	 */
	async createSession(sessionId?: string): Promise<string> {
		// Auto-start client if not running
		if (!this.client) {
			await this.start();
		}

		if (this.session) {
			await this.session.destroy();
		}

		// Load instructions from configured directories
		if (this.config.instructionDirectories && this.config.instructionDirectories.length > 0) {
			this.loadedInstructions = await this.customizationLoader.loadInstructions(this.config.instructionDirectories);
			console.log('[Vault Copilot] Loaded instructions:', this.loadedInstructions.map(i => i.name));
		}

		// Combine built-in tools with registered plugin skills and MCP tools
		const builtInTools = this.createObsidianTools();
		const registeredTools = this.convertRegisteredSkillsToTools();
		const mcpTools = this.convertMcpToolsToSdkTools();
		const tools = [...builtInTools, ...registeredTools, ...mcpTools];
		
		if (mcpTools.length > 0) {
			console.log('[Vault Copilot] Registered MCP tools:', mcpTools.map(t => t.name));
		}

		// Build session config
		const sessionConfig: Record<string, unknown> = {
			model: this.config.model,
			streaming: this.config.streaming,
			tools,
			systemMessage: {
				content: this.getSystemPrompt(),
			},
		};

		// Add session ID for persistence if provided
		if (sessionId) {
			sessionConfig.sessionId = sessionId;
		}

		// Add tool filtering if configured (SDK availableTools/excludedTools)
		if (this.config.availableTools && this.config.availableTools.length > 0) {
			sessionConfig.availableTools = this.config.availableTools;
			console.log('[Vault Copilot] Available tools filter:', this.config.availableTools.length, 'tools');
		}

		// Add skill directories if configured
		if (this.config.skillDirectories && this.config.skillDirectories.length > 0) {
			sessionConfig.skillDirectories = this.config.skillDirectories;
			console.log('[Vault Copilot] Skill directories:', this.config.skillDirectories);
		}

		// Add custom agents from agent directories if configured
		if (this.config.agentDirectories && this.config.agentDirectories.length > 0) {
			sessionConfig.customAgents = this.buildCustomAgentsConfig();
			console.log('[Vault Copilot] Agent directories:', this.config.agentDirectories);
		}

		console.log('[Vault Copilot] Creating session with config:', JSON.stringify(sessionConfig, null, 2));

		this.session = await this.client!.createSession(sessionConfig as any);

		// Set up event handler
		this.session.on((event: SessionEvent) => {
			this.handleSessionEvent(event);
		});

		this.messageHistory = [];
		
		const actualSessionId = this.session.sessionId;
		console.log('[Vault Copilot] Session created with ID:', actualSessionId);
		return actualSessionId;
	}

	/**
	 * Resume an existing session by its ID (preserves AI conversation context)
	 * @param sessionId The session ID to resume
	 * @returns The session ID if successful
	 */
	async resumeSession(sessionId: string): Promise<string> {
		// Auto-start client if not running
		if (!this.client) {
			await this.start();
		}

		if (this.session) {
			await this.session.destroy();
		}

		// Load instructions from configured directories
		if (this.config.instructionDirectories && this.config.instructionDirectories.length > 0) {
			this.loadedInstructions = await this.customizationLoader.loadInstructions(this.config.instructionDirectories);
			console.log('[Vault Copilot] Loaded instructions:', this.loadedInstructions.map(i => i.name));
		}

		// Combine built-in tools with registered plugin skills and MCP tools
		const builtInTools = this.createObsidianTools();
		const registeredTools = this.convertRegisteredSkillsToTools();
		const mcpTools = this.convertMcpToolsToSdkTools();
		const tools = [...builtInTools, ...registeredTools, ...mcpTools];
		
		if (mcpTools.length > 0) {
			console.log('[Vault Copilot] Registered MCP tools for resumed session:', mcpTools.map(t => t.name));
		}

		console.log('[Vault Copilot] Resuming session:', sessionId);

		try {
			this.session = await this.client!.resumeSession(sessionId, {
				tools,
			});

			// Set up event handler
			this.session.on((event: SessionEvent) => {
				this.handleSessionEvent(event);
			});

			// Restore message history from the SDK session
			const events = await this.session.getMessages();
			this.messageHistory = this.convertEventsToMessageHistory(events);
			
			console.log('[Vault Copilot] Session resumed with', this.messageHistory.length, 'messages');
			return this.session.sessionId;
		} catch (error) {
			console.warn('[Vault Copilot] Failed to resume session, creating new one:', error);
			// Session doesn't exist anymore, create a new one
			return this.createSession(sessionId);
		}
	}

	/**
	 * Convert SDK session events to our message history format
	 */
	private convertEventsToMessageHistory(events: SessionEvent[]): ChatMessage[] {
		const messages: ChatMessage[] = [];
		
		for (const event of events) {
			if (event.type === 'user.message') {
				messages.push({
					role: 'user',
					content: (event.data as { content?: string })?.content || '',
					timestamp: new Date(),
				});
			} else if (event.type === 'assistant.message') {
				messages.push({
					role: 'assistant',
					content: (event.data as { content?: string })?.content || '',
					timestamp: new Date(),
				});
			}
		}
		
		return messages;
	}

	/**
	 * Get the current session ID
	 */
	getSessionId(): string | null {
		return this.session?.sessionId ?? null;
	}

	/**
	 * List all available sessions from the SDK
	 * Maps directly to client.listSessions()
	 * @returns Array of session metadata from the SDK
	 */
	async listSessions(): Promise<Array<{ sessionId: string; startTime?: Date; modifiedTime?: Date; summary?: string; isRemote?: boolean }>> {
		if (!this.client) {
			await this.start();
		}

		try {
			const sessions = await this.client!.listSessions();
			console.log('[Vault Copilot] SDK listSessions returned:', sessions.length, 'sessions');
			return sessions.map(s => ({
				sessionId: s.sessionId,
				startTime: s.startTime,
				modifiedTime: s.modifiedTime,
				summary: s.summary,
				isRemote: s.isRemote,
			}));
		} catch (error) {
			console.error('[Vault Copilot] Failed to list sessions:', error);
			return [];
		}
	}

	/**
	 * Delete a session from the SDK
	 * Maps directly to client.deleteSession()
	 * @param sessionId The session ID to delete
	 */
	async deleteSession(sessionId: string): Promise<void> {
		if (!this.client) {
			await this.start();
		}

		try {
			await this.client!.deleteSession(sessionId);
			console.log('[Vault Copilot] SDK session deleted:', sessionId);
			
			// If we deleted the current session, clear our local state
			if (this.session?.sessionId === sessionId) {
				this.session = null;
				this.messageHistory = [];
			}
		} catch (error) {
			console.error('[Vault Copilot] Failed to delete session:', error);
			throw error;
		}
	}

	/**
	 * List available models from the SDK
	 * Maps to client.listModels() and converts to our own primitive types
	 * @returns Array of model info with only our own primitives
	 */
	async listModels(): Promise<ModelInfoResult[]> {
		if (!this.client) {
			await this.start();
		}

		try {
			const models = await this.client!.listModels();
			console.log('[Vault Copilot] SDK listModels returned:', models.length, 'models');
			return models.map(m => ({
				id: m.id,
				name: m.name,
				capabilities: {
					supportsVision: m.capabilities?.supports?.vision,
					maxPromptTokens: m.capabilities?.limits?.max_prompt_tokens,
					maxContextWindowTokens: m.capabilities?.limits?.max_context_window_tokens,
					supportedMediaTypes: m.capabilities?.limits?.vision?.supported_media_types,
					maxPromptImages: m.capabilities?.limits?.vision?.max_prompt_images,
					maxPromptImageSize: m.capabilities?.limits?.vision?.max_prompt_image_size,
				},
				policy: m.policy ? {
					state: m.policy.state,
					terms: m.policy.terms,
				} : undefined,
				billingMultiplier: m.billing?.multiplier,
			}));
		} catch (error) {
			console.error('[Vault Copilot] Failed to list models:', error);
			return [];
		}
	}

	/**
	 * Convert registered skills from SkillRegistry to SDK-compatible tools
	 */
	private convertRegisteredSkillsToTools(): ReturnType<typeof defineTool>[] {
		if (!this.config.skillRegistry) {
			return [];
		}

		const tools: ReturnType<typeof defineTool>[] = [];
		
		// Get all skills that have handlers
		const registry = this.config.skillRegistry;
		for (const skillInfo of registry.listSkills()) {
			const skill = registry.getSkill(skillInfo.name);
			if (!skill) continue;

			// Convert VaultCopilotSkill to SDK tool using defineTool
			const tool = defineTool(skill.name, {
				description: skill.description,
				parameters: skill.parameters as any,
				handler: async (args: Record<string, unknown>) => {
					const result = await skill.handler(args);
					// Convert SkillResult to tool result format
					if (result.success) {
						return result.data ?? { success: true, message: "Skill executed successfully" };
					} else {
						return { success: false, error: result.error ?? "Skill execution failed" };
					}
				},
			});
			
			// Cast needed: defineTool returns Tool<T> with varying T per handler signature
			tools.push(tool as any);
		}

		return tools;
	}

	/**
	 * Convert MCP tools from connected servers to SDK-compatible tools
	 */
	private convertMcpToolsToSdkTools(): ReturnType<typeof defineTool>[] {
		if (!this.config.mcpManager) {
			return [];
		}

		const tools: ReturnType<typeof defineTool>[] = [];
		const mcpTools = this.config.mcpManager.getAllTools();

		for (const { serverId, serverName, tool } of mcpTools) {
			// Create a unique tool name that includes the server name to avoid collisions
			// Format: mcp_<serverName>_<toolName>
			const sanitizedServerName = serverName.replace(/[^a-zA-Z0-9_]/g, '_');
			const toolName = `mcp_${sanitizedServerName}_${tool.name}`;

			const sdkTool = defineTool(toolName, {
				description: `[MCP: ${serverName}] ${tool.description || tool.name}`,
				parameters: (tool.inputSchema || { type: "object", properties: {} }) as any,
				handler: async (args: Record<string, unknown>) => {
					try {
						const result = await this.config.mcpManager!.callTool(serverId, tool.name, args);
						return result;
					} catch (error) {
						return {
							success: false,
							error: error instanceof Error ? error.message : String(error),
						};
					}
				},
			});

			// Cast needed: defineTool returns Tool<T> with varying T per handler signature
			tools.push(sdkTool as any);
		}

		return tools;
	}

	/**
	 * Build custom agents configuration from agent directories
	 */
	private buildCustomAgentsConfig(): Array<{ name: string; slug: string; instructions: string }> {
		// For now, return empty array - agents will be loaded from directories by the SDK
		// The SDK's customAgents expects an array of agent configurations
		// When agentDirectories is set, the CLI will discover agents from those paths
		return [];
	}

	/**
	 * Send a message and wait for the complete response
	 * @param prompt The message to send
	 * @param timeout Optional timeout in milliseconds (uses config.requestTimeout if not specified)
	 */
	async sendMessage(prompt: string, timeout?: number): Promise<string> {
		if (!this.session) {
			await this.createSession();
		}

		// Log the prompt to tracing service
		const tracingService = getTracingService();
		tracingService.addSdkLog('info', `[User Prompt]\n${prompt}`, 'copilot-prompt');

		this.messageHistory.push({
			role: "user",
			content: prompt,
			timestamp: new Date(),
		});

		const requestTimeout = timeout ?? this.config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
		
		try {
			const response = await this.session!.sendAndWait({ prompt }, requestTimeout);
			
			const assistantContent = response?.data?.content || "";
			
			// Log the response to tracing service
			tracingService.addSdkLog('info', `[Assistant Response]\n${assistantContent.substring(0, 500)}${assistantContent.length > 500 ? '...' : ''}`, 'copilot-response');
			
			this.messageHistory.push({
				role: "assistant",
				content: assistantContent,
				timestamp: new Date(),
			});

			return assistantContent;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			tracingService.addSdkLog('error', `[Request Error] ${errorMessage}`, 'copilot-error');
			
			if (errorMessage.toLowerCase().includes('timeout')) {
				console.error('[Vault Copilot] Request timed out after', requestTimeout, 'ms');
				throw new Error(`Request timed out after ${requestTimeout / 1000} seconds`);
			}
			
			throw error;
		}
	}

	/**
	 * Send a message with streaming response
	 * @param prompt The message to send
	 * @param onDelta Callback for each delta chunk
	 * @param onComplete Optional callback when complete
	 * @param timeout Optional timeout in milliseconds (uses config.requestTimeout if not specified)
	 */
	async sendMessageStreaming(
		prompt: string, 
		onDelta: (delta: string) => void,
		onComplete?: (fullContent: string) => void,
		timeout?: number
	): Promise<void> {
		if (!this.session) {
			await this.createSession();
		}

		// Log the prompt to tracing service
		const tracingService = getTracingService();
		tracingService.addSdkLog('info', `[User Prompt (Streaming)]\n${prompt}`, 'copilot-prompt');

		this.messageHistory.push({
			role: "user",
			content: prompt,
			timestamp: new Date(),
		});

		let fullContent = "";
		const requestTimeout = timeout ?? this.config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;

		return new Promise<void>((resolve, reject) => {
			let timeoutId: NodeJS.Timeout | null = null;
			let hasCompleted = false;
			
			const cleanup = () => {
				hasCompleted = true;
				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = null;
				}
			};

			/**
			 * Reset the inactivity timeout.
			 * Called on every SDK event so that interactive tool calls (like ask_question,
			 * which block while waiting for user input) don't cause a spurious timeout.
			 */
			const resetTimeout = () => {
				if (hasCompleted) return;
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
				timeoutId = setTimeout(async () => {
					if (!hasCompleted) {
						cleanup();
						unsubscribe();
						
						// Try to abort the request
						try {
							await this.session?.abort();
						} catch (abortError) {
							console.warn('[Vault Copilot] Error aborting timed-out request:', abortError);
						}
						
						tracingService.addSdkLog('error', `[Streaming Timeout] Request timed out after ${requestTimeout / 1000} seconds of inactivity`, 'copilot-error');
						reject(new Error(`Streaming request timed out after ${requestTimeout / 1000} seconds of inactivity`));
					}
				}, requestTimeout);
			};
			
			// Start the initial timeout
			resetTimeout();
			
			const unsubscribe = this.session!.on((event: SessionEvent) => {
				if (hasCompleted) return;

				// Reset timeout on every event — keeps the clock alive during
				// interactive tool calls (e.g. ask_question waiting for user input)
				resetTimeout();
				
				// Log all events for debugging (except deltas which are too verbose)
				if (event.type !== "assistant.message_delta") {
					tracingService.addSdkLog('debug', `[SDK Event] ${event.type}: ${JSON.stringify(event.data).substring(0, 200)}`, 'copilot-event');
				}
				
				if (event.type === "assistant.message_delta") {
					const delta = (event.data as { deltaContent: string }).deltaContent;
					fullContent += delta;
					onDelta(delta);
				} else if (event.type === "assistant.message") {
					fullContent = (event.data as { content: string }).content;
				} else if (event.type === "session.idle") {
					cleanup();
					this.messageHistory.push({
						role: "assistant",
						content: fullContent,
						timestamp: new Date(),
					});
					
					// Log the response to tracing service
					tracingService.addSdkLog('info', `[Assistant Response (Streaming)]\n${fullContent.substring(0, 500)}${fullContent.length > 500 ? '...' : ''}`, 'copilot-response');
					
					if (onComplete) {
						onComplete(fullContent);
					}
					unsubscribe();
					resolve();
				} else if (event.type === "session.error") {
					cleanup();
					const errorData = event.data as { message?: string };
					tracingService.addSdkLog('error', `[Streaming Error] ${errorData.message || "Unknown error"}`, 'copilot-error');
					unsubscribe();
					reject(new Error(errorData.message || "Session error during streaming"));
				}
			});

			this.session!.send({ prompt }).catch((err) => {
				cleanup();
				unsubscribe();
				tracingService.addSdkLog('error', `[Send Error] ${err.message || err}`, 'copilot-error');
				reject(err);
			});
		});
	}

	/**
	 * Abort the current operation
	 * Call this to cancel an in-progress request
	 */
	async abort(): Promise<void> {
		if (this.session) {
			try {
				await this.session.abort();
				console.log('[Vault Copilot] Request aborted');
			} catch (error) {
				console.warn('[Vault Copilot] Error during abort:', error);
			}
		}
	}

	/**
	 * Get message history
	 */
	getMessageHistory(): ChatMessage[] {
		return [...this.messageHistory];
	}

	/**
	 * Clear message history and create a new session
	 */
	async clearHistory(): Promise<void> {
		this.messageHistory = [];
		await this.createSession();
	}

	/**
	 * Get current session state for persistence
	 */
	getSessionState(): { messages: ChatMessage[] } {
		return {
			messages: [...this.messageHistory],
		};
	}

	/**
	 * Load a previous session using SDK session persistence
	 * This resumes the actual AI conversation context from the SDK
	 * @param sessionId The session ID to load
	 * @param messages Optional fallback messages if session can't be resumed (for backward compatibility)
	 */
	async loadSession(sessionId: string, messages?: ChatMessage[]): Promise<void> {
		if (!this.client) {
			await this.start();
		}

		try {
			// Try to resume the session using SDK persistence
			await this.resumeSession(sessionId);
			console.log('[Vault Copilot] Session loaded via SDK persistence');
		} catch (error) {
			console.warn('[Vault Copilot] Could not resume session, creating new with fallback messages:', error);
			// Fallback: create a new session and restore message history manually
			await this.createSession(sessionId);
			
			if (messages) {
				this.messageHistory = messages.map(msg => ({
					...msg,
					timestamp: new Date(msg.timestamp),
				}));
			}
		}
	}

	/**
	 * Subscribe to session events
	 */
	onEvent(handler: (event: SessionEvent) => void): () => void {
		this.eventHandlers.push(handler);
		return () => {
			const index = this.eventHandlers.indexOf(handler);
			if (index > -1) {
				this.eventHandlers.splice(index, 1);
			}
		};
	}

	/**
	 * Check if the service is connected
	 */
	isConnected(): boolean {
		return this.client !== null;
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<GitHubCopilotCliConfig>): void {
		this.config = { ...this.config, ...config };
	}

	private handleSessionEvent(event: SessionEvent): void {
		// Log session event to TracingService for diagnostics
		this.logSessionEventToTracing(event);
		
		for (const handler of this.eventHandlers) {
			handler(event);
		}
	}

	/**
	 * Log session events to TracingService with appropriate categorization
	 * 
	 * SDK SessionEvent types:
	 * - Session lifecycle: session.start, session.resume, session.idle, session.error, session.info
	 * - Session state: session.model_change, session.handoff, session.truncation, session.snapshot_rewind,
	 *                  session.usage_info, session.compaction_start, session.compaction_complete
	 * - User events: user.message, pending_messages.modified
	 * - Assistant events: assistant.turn_start, assistant.intent, assistant.reasoning, assistant.reasoning_delta,
	 *                     assistant.message, assistant.message_delta, assistant.turn_end, assistant.usage
	 * - Tool events: tool.user_requested, tool.execution_start, tool.execution_partial_result, 
	 *                tool.execution_progress, tool.execution_complete
	 * - Subagent events: subagent.started, subagent.completed, subagent.failed, subagent.selected
	 * - Other: abort, hook.start, hook.end, system.message
	 */
	private logSessionEventToTracing(event: SessionEvent): void {
		const tracingService = getTracingService();
		const eventType = event.type;
		const eventData = 'data' in event ? event.data : {};
		
		// Determine log level and source based on event type
		let level: 'debug' | 'info' | 'warning' | 'error' = 'debug';
		let source = 'sdk-event';
		let message = '';
		
		switch (eventType) {
			// Session lifecycle events
			case 'session.start':
				level = 'info';
				source = 'session-lifecycle';
				message = `[Session Start] sessionId=${(eventData as { sessionId?: string }).sessionId || 'unknown'}`;
				break;
			case 'session.resume':
				level = 'info';
				source = 'session-lifecycle';
				message = `[Session Resume] eventCount=${(eventData as { eventCount?: number }).eventCount || 0}`;
				break;
			case 'session.idle':
				level = 'debug';
				source = 'session-lifecycle';
				message = '[Session Idle]';
				break;
			case 'session.error':
				level = 'error';
				source = 'session-lifecycle';
				message = `[Session Error] ${(eventData as { errorType?: string; message?: string }).errorType}: ${(eventData as { message?: string }).message || 'Unknown error'}`;
				break;
			case 'session.info':
				level = 'info';
				source = 'session-lifecycle';
				message = `[Session Info] ${(eventData as { infoType?: string; message?: string }).infoType}: ${(eventData as { message?: string }).message || ''}`;
				break;
			case 'session.model_change':
				level = 'info';
				source = 'session-state';
				message = `[Model Change] ${(eventData as { previousModel?: string }).previousModel || 'none'} → ${(eventData as { newModel?: string }).newModel || 'unknown'}`;
				break;
			case 'session.handoff':
				level = 'info';
				source = 'session-state';
				message = `[Session Handoff] sourceType=${(eventData as { sourceType?: string }).sourceType || 'unknown'}`;
				break;
			
			// User events
			case 'user.message':
				level = 'info';
				source = 'user-event';
				const userContent = (eventData as { content?: string }).content || '';
				message = `[User Message] ${userContent.substring(0, 100)}${userContent.length > 100 ? '...' : ''}`;
				break;
			
			// Assistant events
			case 'assistant.turn_start':
				level = 'debug';
				source = 'assistant-event';
				message = `[Turn Start] turnId=${(eventData as { turnId?: string }).turnId || 'unknown'}`;
				break;
			case 'assistant.message':
				level = 'info';
				source = 'assistant-event';
				const assistantContent = (eventData as { content?: string }).content || '';
				message = `[Assistant Message] ${assistantContent.substring(0, 200)}${assistantContent.length > 200 ? '...' : ''}`;
				break;
			case 'assistant.message_delta':
				level = 'debug';
				source = 'assistant-event';
				// Don't log full delta content to avoid noise
				message = `[Message Delta] messageId=${(eventData as { messageId?: string }).messageId || 'unknown'}`;
				break;
			case 'assistant.turn_end':
				level = 'debug';
				source = 'assistant-event';
				message = `[Turn End] turnId=${(eventData as { turnId?: string }).turnId || 'unknown'}`;
				break;
			case 'assistant.reasoning':
				level = 'debug';
				source = 'assistant-event';
				message = `[Reasoning] reasoningId=${(eventData as { reasoningId?: string }).reasoningId || 'unknown'}`;
				break;
			case 'assistant.usage':
				level = 'info';
				source = 'assistant-event';
				const usage = eventData as { inputTokens?: number; outputTokens?: number; model?: string };
				message = `[Usage] model=${usage.model || 'unknown'} input=${usage.inputTokens || 0} output=${usage.outputTokens || 0}`;
				break;
			
			// Tool events
			case 'tool.execution_start':
				level = 'info';
				source = 'tool-event';
				message = `[Tool Start] ${(eventData as { toolName?: string }).toolName || 'unknown'} (${(eventData as { toolCallId?: string }).toolCallId || 'unknown'})`;
				break;
			case 'tool.execution_complete':
				level = 'info';
				source = 'tool-event';
				const toolResult = eventData as { toolCallId?: string; success?: boolean };
				message = `[Tool Complete] ${toolResult.toolCallId || 'unknown'} success=${toolResult.success ?? 'unknown'}`;
				break;
			case 'tool.execution_progress':
				level = 'debug';
				source = 'tool-event';
				message = `[Tool Progress] ${(eventData as { progressMessage?: string }).progressMessage || ''}`;
				break;
			case 'tool.user_requested':
				level = 'info';
				source = 'tool-event';
				message = `[Tool Requested] ${(eventData as { toolName?: string }).toolName || 'unknown'}`;
				break;
			
			// Subagent events
			case 'subagent.started':
				level = 'info';
				source = 'subagent-event';
				message = `[Subagent Started] ${(eventData as { agentDisplayName?: string }).agentDisplayName || (eventData as { agentName?: string }).agentName || 'unknown'}`;
				break;
			case 'subagent.completed':
				level = 'info';
				source = 'subagent-event';
				message = `[Subagent Completed] ${(eventData as { agentName?: string }).agentName || 'unknown'}`;
				break;
			case 'subagent.failed':
				level = 'error';
				source = 'subagent-event';
				message = `[Subagent Failed] ${(eventData as { agentName?: string }).agentName || 'unknown'}: ${(eventData as { error?: string }).error || 'Unknown error'}`;
				break;
			case 'subagent.selected':
				level = 'debug';
				source = 'subagent-event';
				message = `[Subagent Selected] ${(eventData as { agentDisplayName?: string }).agentDisplayName || 'unknown'}`;
				break;
			
			// Abort event
			case 'abort':
				level = 'warning';
				source = 'session-lifecycle';
				message = `[Abort] reason=${(eventData as { reason?: string }).reason || 'unknown'}`;
				break;
			
			// Default for other events
			default:
				level = 'debug';
				source = 'sdk-event';
				message = `[${eventType}] ${JSON.stringify(eventData).substring(0, 200)}`;
		}
		
		tracingService.addSdkLog(level, message, source);
	}

	private getSystemPrompt(): string {
		return `You are a helpful AI assistant integrated into Obsidian, a powerful knowledge management application.

## Your Capabilities
- **Read notes**: Use read_note to get a single note, or batch_read_notes for multiple notes at once
- **Search**: Use search_notes to find notes by content or title
- **Create**: Use create_note to create new notes
- **Update**: Use update_note to replace entire note content, or append_to_note to add to the end
- **Patch**: Use patch_note to insert content at specific locations (after headings, block references, etc.)
- **Delete**: Use delete_note to remove notes (moves to system trash)
- **Rename/Move**: Use rename_note to move or rename notes
- **Recent changes**: Use get_recent_changes to see recently modified files
- **Daily notes**: Use get_daily_note to get today's or a specific date's daily note
- **Active note**: Use get_active_note to get the currently open note
- **List notes**: Use list_notes to browse notes and subfolders in a folder (non-recursive, shows file/folder types)
- **List all notes**: Use list_notes_recursively to get ALL notes from a folder and its subfolders

## Available Slash Commands
When the user asks about available commands, help, or what you can do, respond ONLY with this list of slash commands available in GitHub Copilot for Obsidian:

### Note Commands
| Command | Description |
|---------|-------------|
| \`/help\` | Show available slash commands |
| \`/read <path>\` | Read a note by path |
| \`/search <query>\` | Search for notes |
| \`/list [folder]\` | List notes in a folder |
| \`/create <path> [content]\` | Create a new note |
| \`/append <path> <content>\` | Append content to a note |
| \`/update <path> <content>\` | Update/replace entire note content |
| \`/delete <path>\` | Delete a note (moves to trash) |
| \`/rename <old> <new>\` | Rename or move a note |
| \`/recent [count]\` | Show recently modified notes |
| \`/daily [YYYY-MM-DD]\` | Get today's or a specific date's daily note |
| \`/active\` | Get the currently active note |
| \`/batch <path1> <path2>...\` | Read multiple notes at once |

### Session Commands
| Command | Description |
|---------|-------------|
| \`/sessions\` | List all chat sessions |
| \`/new [name]\` | Create a new chat session |
| \`/archive\` | Archive the current session |
| \`/clear\` | Clear chat history |

**Important**: Do NOT mention CLI commands, keyboard shortcuts, or any commands that are not in the list above. The user is asking about this Obsidian plugin's commands, not a terminal CLI.

## Public API for Other Plugins
When the user asks about the API, respond with the following information about this plugin's public API that other Obsidian plugins can use:

\`\`\`typescript
// Get the Vault Copilot API from another plugin
const vc = (app as any).plugins.plugins['obsidian-vault-copilot']?.api;

// Check connection status
vc.isConnected(): boolean

// Connection management
await vc.connect(): Promise<void>
await vc.disconnect(): Promise<void>

// Chat functionality
await vc.sendMessage(prompt: string): Promise<string>
await vc.sendMessageStreaming(prompt, onDelta, onComplete): Promise<void>
vc.getMessageHistory(): ChatMessage[]
await vc.clearHistory(): Promise<void>

// Session management
await vc.listSessions(): Promise<SessionInfo[]>
vc.getActiveSessionId(): string | null
await vc.createSession(name?): Promise<SessionInfo>
await vc.loadSession(sessionId): Promise<void>
await vc.archiveSession(sessionId): Promise<void>
await vc.unarchiveSession(sessionId): Promise<void>
await vc.deleteSession(sessionId): Promise<void>
await vc.renameSession(sessionId, newName): Promise<void>

// Model discovery
await vc.listModels(): Promise<ModelInfoResult[]>

// Note operations
await vc.readNote(path): Promise<{ success, content?, error? }>
await vc.searchNotes(query, limit?): Promise<{ results: Array<{ path, title, excerpt }> }>
await vc.createNote(path, content): Promise<{ success, path?, error? }>
await vc.updateNote(path, content): Promise<{ success, error? }>
await vc.deleteNote(path): Promise<{ success, error? }>
await vc.appendToNote(path, content): Promise<{ success, error? }>
await vc.batchReadNotes(paths, aiSummarize?, summaryPrompt?): Promise<{ results: Array<{ path, success, content?, summary?, error? }> }>
await vc.renameNote(oldPath, newPath): Promise<{ success, newPath?, error? }>

// Utility operations
await vc.getActiveNote(): Promise<{ hasActiveNote, path?, title?, content? }>
await vc.listNotes(folder?): Promise<{ notes: Array<{ path, title }> }>
await vc.getRecentChanges(limit?): Promise<{ files: Array<{ path, title, mtime, mtimeFormatted }> }>
await vc.getDailyNote(date?): Promise<{ success, path?, content?, exists, error? }>
\`\`\`

## Guidelines
- When the user asks about their notes, use the available tools to fetch the content
- Format your responses in Markdown, which Obsidian renders natively
- **Always use [[wikilinks]] when referencing files in the vault** so users can click to navigate (e.g., [[Daily Notes/2026-01-29]] or [[Projects/My Project.md]])
- Be concise but helpful
- If you're unsure about something, ask for clarification
- When reading 10+ files, use batch_read_notes with aiSummarize=true to get AI-generated summaries instead of full content

## Obsidian Bases (.base files)
When the user asks you to create a Base, just call create_base with the path (and optionally name, description, and filters). The tool will automatically:
1. Scan vault notes near the target path to discover frontmatter properties
2. Present an interactive checkbox question to the user asking which properties to include as columns
3. Ask the user to select a view type (table, card, list)
4. Create the Base with the user's selections

You do NOT need to scan notes yourself or present properties manually — the tool handles all of this via inline question UI. Just call create_base once.

IMPORTANT: Do NOT pass a "properties" array unless the user has explicitly told you the exact property names. If you pass properties, the interactive discovery will be skipped and the user won't get to choose.

### Bases filter syntax reference
- Frontmatter property comparison: \`status != "archived"\` or \`priority == "high"\`
- Folder scoping: \`file.inFolder("Projects/MBA")\`
- Tag filtering: \`file.hasTag("lesson")\`
- Operators: ==, !=, >, <, >=, <=
- String values must be in double quotes
- Filters go inside an \`and:\` or \`or:\` group

## Context
You are running inside Obsidian and have access to the user's vault through the provided tools.

## Customization Directories
The following directories are configured for extending your capabilities:

${this.getCustomizationDirectoriesInfo()}

${this.getLoadedInstructionsContent()}

## Subagent Delegation
You can delegate complex, multi-step tasks to subagents using the run_subagent tool.
- Use agentName to invoke a named agent (from .agent.md files) with specialized instructions and tools.
- Omit agentName for ad-hoc delegation with just a detailed prompt.
- Each subagent runs in an isolated context and returns a single summary.
- Subagents can nest up to 3 levels deep.
${this.getAvailableSubagentsPrompt()}
`;
	}

	/**
	 * Generate prompt text listing available subagents.
	 * @internal
	 */
	private getAvailableSubagentsPrompt(): string {
		const agentCache = this.config.agentCache;
		if (!agentCache || !agentCache.hasAgents()) return "";

		const agents = agentCache.getAgents()
			.filter(a => !a.disableModelInvocation);

		if (agents.length === 0) return "";

		const lines = agents.map(a => `- **${a.name}**: ${a.description}`);
		return `\nAvailable agents for delegation:\n${lines.join('\n')}`;
	}

	/**
	 * Generate information about configured customization directories
	 */
	private getCustomizationDirectoriesInfo(): string {
		const sections: string[] = [];

		const agentDirs = this.config.agentDirectories || [];
		if (agentDirs.length > 0) {
			sections.push(`### Agent Directories
Agents are custom personas with specific instructions and tool configurations.
Locations: ${agentDirs.map(d => `\`${d}\``).join(', ')}
File pattern: \`*.agent.md\``);
		}

		const skillDirs = this.config.skillDirectories || [];
		if (skillDirs.length > 0) {
			sections.push(`### Skill Directories
Skills define reusable capabilities and tool definitions. Each skill is a subfolder containing a SKILL.md file.
Locations: ${skillDirs.map(d => `\`${d}\``).join(', ')}
Structure: \`<skill-name>/SKILL.md\``);
		}

		const instructionDirs = this.config.instructionDirectories || [];
		if (instructionDirs.length > 0) {
			sections.push(`### Instruction Directories
Instructions provide additional context and guidelines for your responses.
Locations: ${instructionDirs.map(d => `\`${d}\``).join(', ')}
File pattern: \`*.instructions.md\`, \`copilot-instructions.md\`, \`AGENTS.md\``);
		}

		if (sections.length === 0) {
			return 'No customization directories are configured. Users can add agent, skill, and instruction directories in the plugin settings.';
		}

		return sections.join('\n\n');
	}

	/**
	 * Get the content of loaded instructions to include in the system prompt
	 */
	private getLoadedInstructionsContent(): string {
		if (this.loadedInstructions.length === 0) {
			return '';
		}

		const parts: string[] = ['## User-Defined Instructions\n\nThe following instructions have been loaded from the vault and should be followed:'];

		for (const instruction of this.loadedInstructions) {
			parts.push(`\n### ${instruction.name}${instruction.applyTo ? ` (applies to: ${instruction.applyTo})` : ''}\n\n${instruction.content}`);
		}

		return parts.join('\n');
	}

	/**
	 * Get the list of loaded instructions (for displaying in UI)
	 */
	getLoadedInstructions(): Array<{ name: string; path: string; applyTo?: string }> {
		return this.loadedInstructions.map(i => ({
			name: i.name,
			path: i.path,
			applyTo: i.applyTo
		}));
	}

	private createObsidianTools() {
		const tools = [
			defineTool(TOOL_NAMES.READ_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.READ_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.READ_NOTE],
				handler: async (args: { path: string }) => {
					return await VaultOps.readNote(this.app, args.path);
				},
			}),

			defineTool(TOOL_NAMES.SEARCH_NOTES, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.SEARCH_NOTES],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.SEARCH_NOTES],
				handler: async (args: { query: string; limit?: number }) => {
					return await VaultOps.searchNotes(this.app, args.query, args.limit ?? 10);
				},
			}),

			defineTool(TOOL_NAMES.CREATE_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.CREATE_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.CREATE_NOTE],
				handler: async (args: { path: string; content: string }) => {
					return await VaultOps.createNote(this.app, args.path, args.content);
				},
			}),

			defineTool(TOOL_NAMES.GET_ACTIVE_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_ACTIVE_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_ACTIVE_NOTE],
				handler: async () => {
					return await VaultOps.getActiveNote(this.app);
				},
			}),

			defineTool(TOOL_NAMES.LIST_NOTES, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_NOTES],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_NOTES],
				handler: async (args: { folder?: string }) => {
					return await VaultOps.listNotes(this.app, args.folder);
				},
			}),

			defineTool(TOOL_NAMES.LIST_NOTES_RECURSIVELY, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_NOTES_RECURSIVELY],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_NOTES_RECURSIVELY],
				handler: async (args: { folder?: string; limit?: number }) => {
					return await VaultOps.listNotesRecursively(this.app, args.folder, args.limit);
				},
			}),

			defineTool(TOOL_NAMES.APPEND_TO_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.APPEND_TO_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.APPEND_TO_NOTE],
				handler: async (args: { path: string; content: string }) => {
					return await VaultOps.appendToNote(this.app, args.path, args.content);
				},
			}),

			defineTool(TOOL_NAMES.BATCH_READ_NOTES, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.BATCH_READ_NOTES],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.BATCH_READ_NOTES],
				handler: async (args: { paths: string[]; aiSummarize?: boolean; summaryPrompt?: string }) => {
					return await this.batchReadNotes(args.paths, args.aiSummarize, args.summaryPrompt);
				},
			}),

			defineTool(TOOL_NAMES.UPDATE_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.UPDATE_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.UPDATE_NOTE],
				handler: async (args: { path: string; content: string }) => {
					return await VaultOps.updateNote(this.app, args.path, args.content);
				},
			}),

			defineTool(TOOL_NAMES.DELETE_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.DELETE_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.DELETE_NOTE],
				handler: async (args: { path: string }) => {
					return await VaultOps.deleteNote(this.app, args.path);
				},
			}),

			defineTool(TOOL_NAMES.GET_RECENT_CHANGES, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_RECENT_CHANGES],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_RECENT_CHANGES],
				handler: async (args: { limit?: number }) => {
					return await VaultOps.getRecentChanges(this.app, args.limit ?? 10);
				},
			}),

			defineTool(TOOL_NAMES.PATCH_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.PATCH_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.PATCH_NOTE],
				handler: async (args: { path: string; operation: string; target_type: string; target?: string; content: string }) => {
					return await VaultOps.patchNote(this.app, args.path, args.operation as VaultOps.PatchOperation, args.target_type as VaultOps.PatchTargetType, args.target, args.content);
				},
			}),

			defineTool(TOOL_NAMES.GET_DAILY_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_DAILY_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.GET_DAILY_NOTE],
				handler: async (args: { date?: string }) => {
					return await VaultOps.getDailyNote(this.app, args.date);
				},
			}),

			defineTool(TOOL_NAMES.RENAME_NOTE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.RENAME_NOTE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.RENAME_NOTE],
				handler: async (args: { oldPath: string; newPath: string }) => {
					return await VaultOps.renameNote(this.app, args.oldPath, args.newPath);
				},
			}),

			defineTool(TOOL_NAMES.FETCH_WEB_PAGE, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.FETCH_WEB_PAGE],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.FETCH_WEB_PAGE],
				handler: async (args: { url: string }) => {
					return await VaultOps.fetchWebPage(args.url);
				},
			}),

			// Bases AI tools
			defineTool(BASES_TOOL_NAMES.CREATE_BASE, {
				description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.CREATE_BASE],
				parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.CREATE_BASE],
				handler: async (args: CreateBaseParams) => {
					return await handleCreateBase(this.app, args, this.questionCallback);
				},
			}),

			defineTool(BASES_TOOL_NAMES.READ_BASE, {
				description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.READ_BASE],
				parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.READ_BASE],
				handler: async (args: ReadBaseParams) => {
					return await handleReadBase(this.app, args);
				},
			}),

			defineTool(BASES_TOOL_NAMES.QUERY_BASE, {
				description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.QUERY_BASE],
				parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.QUERY_BASE],
				handler: async (args: QueryBaseParams) => {
					return await handleQueryBase(this.app, args);
				},
			}),

			defineTool(BASES_TOOL_NAMES.ADD_BASE_RECORDS, {
				description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.ADD_BASE_RECORDS],
				parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.ADD_BASE_RECORDS],
				handler: async (args: AddBaseRecordsParams) => {
					return await handleAddBaseRecords(this.app, args);
				},
			}),

			defineTool(BASES_TOOL_NAMES.UPDATE_BASE_RECORDS, {
				description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.UPDATE_BASE_RECORDS],
				parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.UPDATE_BASE_RECORDS],
				handler: async (args: UpdateBaseRecordsParams) => {
					return await handleUpdateBaseRecords(this.app, args);
				},
			}),

			defineTool(BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA, {
				description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA],
				parameters: BASES_TOOL_JSON_SCHEMAS[BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA],
				handler: async (args: EvolveBaseSchemaParams) => {
					return await handleEvolveBaseSchema(this.app, args);
				},
			}),

			// Introspection tools
			defineTool(TOOL_NAMES.LIST_AVAILABLE_TOOLS, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_TOOLS],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_TOOLS],
				handler: async (args: { source?: string }) => {
					const source = args.source || "all";
					const catalog = new (await import("../tools/ToolCatalog")).ToolCatalog(
						this.config.skillRegistry,
						this.config.mcpManager
					);
					const allTools = catalog.getAllTools();
					const filtered = source === "all"
						? allTools
						: allTools.filter(t => t.source === source);
					return {
						count: filtered.length,
						source,
						tools: filtered.map(t => ({
							id: t.id,
							displayName: t.displayName,
							description: t.description,
							source: t.source,
							...(t.serverName ? { serverName: t.serverName } : {}),
						})),
					};
				},
			}),

			defineTool(TOOL_NAMES.LIST_AVAILABLE_SKILLS, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_SKILLS],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_SKILLS],
				handler: async (args: { source?: string }) => {
					const source = args.source || "all";
					const results: Array<{ name: string; description: string; source: string; path?: string }> = [];

					// File-based skills from CustomizationLoader
					if (source === "all" || source === "file") {
						const dirs = this.config.skillDirectories ?? [];
						const fileSkills = await this.customizationLoader.loadSkills(dirs);
						for (const skill of fileSkills) {
							results.push({
								name: skill.name,
								description: skill.description,
								source: "file",
								path: skill.path,
							});
						}
					}

					// Runtime skills from SkillRegistry
					if (source === "all" || source === "runtime") {
						if (this.config.skillRegistry) {
							for (const skill of this.config.skillRegistry.listSkills()) {
								results.push({
									name: skill.name,
									description: skill.description,
									source: "runtime",
								});
							}
						}
					}

					return { count: results.length, source, skills: results };
				},
			}),

			defineTool(TOOL_NAMES.LIST_AVAILABLE_AGENTS, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_AGENTS],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_AGENTS],
				handler: async (args: { name?: string; context?: string }) => {
					const dirs = this.config.agentDirectories ?? [];
					const agents = await this.customizationLoader.loadAgents(dirs);
					let filtered = args.name
						? agents.filter(a => a.name.toLowerCase().includes(args.name!.toLowerCase()))
						: agents;
					// Filter for subagent context: exclude agents with disableModelInvocation
					if (args.context === "subagent") {
						filtered = filtered.filter(a => !a.disableModelInvocation);
					}
					return {
						count: filtered.length,
						agents: filtered.map(a => ({
							name: a.name,
							description: a.description,
							tools: a.tools ?? [],
							path: a.path,
							...(a.disableModelInvocation ? { disableModelInvocation: true } : {}),
						})),
					};
				},
			}),

			defineTool(TOOL_NAMES.LIST_AVAILABLE_PROMPTS, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_PROMPTS],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_PROMPTS],
				handler: async (args: { name?: string }) => {
					const dirs = this.config.promptDirectories ?? [];
					const prompts = await this.customizationLoader.loadPrompts(dirs);
					const filtered = args.name
						? prompts.filter(p => p.name.toLowerCase().includes(args.name!.toLowerCase()))
						: prompts;
					return {
						count: filtered.length,
						prompts: filtered.map(p => ({
							name: p.name,
							description: p.description,
							tools: p.tools ?? [],
							model: p.model,
							agent: p.agent,
							path: p.path,
						})),
					};
				},
			}),

			defineTool(TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS],
				handler: async (args: { applyTo?: string }) => {
					const dirs = this.config.instructionDirectories ?? [];
					const instructions = await this.customizationLoader.loadInstructions(dirs);
					const filtered = args.applyTo
						? instructions.filter(i => i.applyTo?.toLowerCase().includes(args.applyTo!.toLowerCase()))
						: instructions;
					return {
						count: filtered.length,
						instructions: filtered.map(i => ({
							name: i.name,
							applyTo: i.applyTo,
							path: i.path,
						})),
					};
				},
			}),

			// Subagent tool
			defineTool(TOOL_NAMES.RUN_SUBAGENT, {
				description: TOOL_DESCRIPTIONS[TOOL_NAMES.RUN_SUBAGENT],
				parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.RUN_SUBAGENT],
				handler: async (args: { agentName?: string; prompt: string; timeout?: number }) => {
					return await this.executeSubagent(args.agentName, args.prompt, args.timeout);
				},
			}),
		];

		// Add ask_question tool if question callback is available
		if (this.questionCallback) {
			const callback = this.questionCallback;
			// Cast needed: defineTool returns Tool<T> with varying T per handler signature
			tools.push(
				defineTool(TOOL_NAMES.ASK_QUESTION, {
					description: TOOL_DESCRIPTIONS[TOOL_NAMES.ASK_QUESTION],
					parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.ASK_QUESTION],
					handler: async (args: {
						type: string;
						question: string;
						context?: string;
						options?: string[];
						allowMultiple?: boolean;
						placeholder?: string;
						textLabel?: string;
						defaultValue?: string;
						defaultSelected?: string[];
						multiline?: boolean;
						required?: boolean;
					}) => {
						const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

						// Build question request based on type
						const questionRequest: QuestionRequest = {
							id,
							type: args.type,
							question: args.question,
							context: args.context,
							required: args.required !== false,
						} as QuestionRequest;

						// Add type-specific properties
						if (args.type === "text") {
							(questionRequest as any).placeholder = args.placeholder;
							(questionRequest as any).defaultValue = args.defaultValue;
							(questionRequest as any).multiline = args.multiline || false;
						} else if (args.type === "multipleChoice") {
							if (!args.options || args.options.length === 0) {
								return { success: false, error: "multipleChoice type requires options array" };
							}
							(questionRequest as any).options = args.options;
							(questionRequest as any).allowMultiple = args.allowMultiple || false;
							(questionRequest as any).defaultSelected = args.defaultSelected;
						} else if (args.type === "radio") {
							if (!args.options || args.options.length === 0) {
								return { success: false, error: "radio type requires options array" };
							}
							(questionRequest as any).options = args.options;
							(questionRequest as any).defaultSelected = args.defaultSelected?.[0];
						} else if (args.type === "mixed") {
							if (!args.options || args.options.length === 0) {
								return { success: false, error: "mixed type requires options array" };
							}
							(questionRequest as any).options = args.options;
							(questionRequest as any).allowMultiple = args.allowMultiple || false;
							(questionRequest as any).defaultSelected = args.defaultSelected;
							(questionRequest as any).textPlaceholder = args.placeholder;
							(questionRequest as any).textLabel = args.textLabel;
						}

						try {
							const response = await callback(questionRequest);

							if (!response) {
								return { success: false, cancelled: true, message: "User cancelled the question" };
							}

							// Format response
							let formattedResponse: string;
							if (response.type === "text") {
								formattedResponse = response.text;
							} else if (response.type === "multipleChoice" || response.type === "radio") {
								formattedResponse = response.selected.join(", ");
							} else if (response.type === "mixed") {
								const parts = [];
								if (response.selected.length > 0) {
									parts.push(`Selected: ${response.selected.join(", ")}`);
								}
								if (response.text) {
									parts.push(`Additional input: ${response.text}`);
								}
								formattedResponse = parts.join("; ");
							} else {
								formattedResponse = JSON.stringify(response);
							}

							return {
								success: true,
								question: args.question,
								response: formattedResponse,
								responseData: response,
							};
						} catch (error) {
							return {
								success: false,
								error: error instanceof Error ? error.message : String(error),
							};
						}
					},
				}) as any
			);
		}

		return tools;
	}

	async batchReadNotes(paths: string[], aiSummarize?: boolean, summaryPrompt?: string): Promise<{ results: Array<{ path: string; success: boolean; content?: string; summary?: string; error?: string }> }> {
		const results = await Promise.all(
			paths.map(async (path) => {
				try {
					const normalizedPath = normalizeVaultPath(path);
					const file = this.app.vault.getAbstractFileByPath(normalizedPath);
					if (!file || !(file instanceof TFile)) {
						return { path, success: false, error: `Note not found: ${path}` };
					}
					const content = await this.app.vault.read(file);
					
					if (aiSummarize) {
						const summary = await this.generateAISummary(content, file.basename, summaryPrompt);
						return { path, success: true, summary };
					}
					return { path, success: true, content };
				} catch (error) {
					return { path, success: false, error: `Failed to read note: ${error}` };
				}
			})
		);
		return { results };
	}

	/**
	 * Generate an AI summary of note content using the Copilot CLI.
	 * Creates a temporary session for the summarization request.
	 */
	private async generateAISummary(content: string, title: string, customPrompt?: string): Promise<string> {
		try {
			if (!this.client) {
				throw new Error("Copilot client not initialized");
			}

			// Create a temporary session for this summarization task
		const tempSession = await this.client.createSession({
			model: this.config.model,
			streaming: false,
			tools: [], // No tools needed for summarization
			systemMessage: {
				content: "You are a helpful assistant that generates concise summaries of notes."
			}
		});

		const defaultPrompt = `Summarize the following note concisely. Extract key information including any frontmatter fields, main topics, and important details.\n\nTitle: ${title}\n\nContent:\n${content}`;
		
		const prompt = customPrompt 
			? `${customPrompt}\n\nTitle: ${title}\n\nContent:\n${content}`
			: defaultPrompt;

		// Make the request with a shorter timeout for summaries
		const response = await tempSession.sendAndWait({ prompt }, 30000); // 30 second timeout
		const summary = response?.data?.content || "Failed to generate summary";

		// Clean up the temporary session
		await tempSession.destroy();
			return summary;
		} catch (error) {
			console.error(`[GitHubCopilotCliService] Failed to generate AI summary for ${title}:`, error);
			return `Error generating summary: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	/**
	 * Execute a subagent with an isolated child session.
	 * Supports named agents (from .agent.md files) and ad-hoc subagents.
	 * 
	 * @param agentName - Optional agent name to look up from AgentCache
	 * @param prompt - The detailed task prompt
	 * @param timeout - Optional timeout in milliseconds (default: requestTimeout)
	 * @returns The subagent's summary response
	 * @internal
	 */
	private async executeSubagent(agentName: string | undefined, prompt: string, timeout?: number): Promise<{ success: boolean; agentName?: string; result: string }> {
		const MAX_DEPTH = 3;

		if (this.subagentDepth >= MAX_DEPTH) {
			return {
				success: false,
				agentName,
				result: `Maximum subagent recursion depth (${MAX_DEPTH}) reached. Cannot spawn another subagent.`,
			};
		}

		if (!this.client) {
			return { success: false, agentName, result: "Copilot client not initialized" };
		}

		// Resolve agent if named
		let agent: CustomAgent | undefined;
		if (agentName) {
			agent = await this.resolveAgent(agentName);
			if (!agent) {
				return {
					success: false,
					agentName,
					result: `Agent "${agentName}" not found. Use list_available_agents to see available agents.`,
				};
			}

			// Check if agent allows model invocation
			if (agent.disableModelInvocation) {
				// Check if the current parent agent has this agent in its allowlist
				const parentAllowsIt = this.currentParentAgent?.agents?.includes(agent.name);
				if (!parentAllowsIt) {
					return {
						success: false,
						agentName: agent.name,
						result: `Agent "${agent.name}" has disabled model invocation and is not in the parent agent's allowlist.`,
					};
				}
			}
		}

		const tracingService = getTracingService();
		const displayName = agent?.name || "ad-hoc";
		tracingService.addSdkLog('info', `[Subagent Started] ${displayName}`, 'subagent-event');

		try {
			this.subagentDepth++;

			// Build system message for the child session
			const systemContent = agent
				? `You are the "${agent.name}" agent. ${agent.description}\n\n${agent.instructions}`
				: "You are a helpful assistant performing a delegated task. Complete the task and return a concise summary of the result.";

			// Build tools for child session — reuse parent tools
			const childTools = this.createObsidianTools();

			// Create child session with optional model override
			const modelOverride = agent?.model
				? (Array.isArray(agent.model) ? agent.model[0] : agent.model)
				: this.config.model;

			const previousParent = this.currentParentAgent;
			if (agent) {
				this.currentParentAgent = agent;
			}

			const childSession = await this.client.createSession({
				model: modelOverride,
				streaming: false,
				tools: childTools,
				systemMessage: { content: systemContent },
			});

			const effectiveTimeout = timeout || this.config.requestTimeout || DEFAULT_REQUEST_TIMEOUT;
			const response = await childSession.sendAndWait({ prompt }, effectiveTimeout);
			const result = response?.data?.content || "Subagent completed but returned no content.";

			await childSession.destroy();

			this.currentParentAgent = previousParent;
			this.subagentDepth--;

			tracingService.addSdkLog('info', `[Subagent Completed] ${displayName}`, 'subagent-event');

			return { success: true, agentName: agent?.name, result };
		} catch (error) {
			this.subagentDepth--;
			const errorMsg = error instanceof Error ? error.message : String(error);
			tracingService.addSdkLog('error', `[Subagent Failed] ${displayName}: ${errorMsg}`, 'subagent-event');
			return { success: false, agentName: agent?.name, result: `Subagent error: ${errorMsg}` };
		}
	}

	/**
	 * Resolve an agent by name using fuzzy matching.
	 * Tries: exact match → case-insensitive → partial match.
	 * @internal
	 */
	private async resolveAgent(name: string): Promise<CustomAgent | undefined> {
		const agentCache = this.config.agentCache;
		if (!agentCache) {
			// Fall back to CustomizationLoader
			return await this.customizationLoader.getAgent(this.config.agentDirectories ?? [], name);
		}

		// Exact match
		const exact = agentCache.getAgentByName(name);
		if (exact) return await agentCache.getFullAgent(name);

		// Case-insensitive match
		const agents = agentCache.getAgents();
		const lowerName = name.toLowerCase();
		const caseMatch = agents.find(a => a.name.toLowerCase() === lowerName);
		if (caseMatch) return await agentCache.getFullAgent(caseMatch.name);

		// Partial match
		const partialMatch = agents.find(a => a.name.toLowerCase().includes(lowerName));
		if (partialMatch) return await agentCache.getFullAgent(partialMatch.name);

		return undefined;
	}
}
