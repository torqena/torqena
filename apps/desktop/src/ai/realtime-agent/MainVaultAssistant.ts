/**
 * MainVaultAssistant - Entry point voice agent for Obsidian vault
 * 
 * This is the primary agent that users interact with. It:
 * - Owns the RealtimeSession
 * - Loads voice agent definitions from markdown files
 * - Uses VoiceAgentRegistry to discover and instantiate specialist agents
 * - Registers and orchestrates handoffs to specialist agents
 * - Provides vault and web tools (excluding task-specific tools)
 */

import { App } from "obsidian";
import { RealtimeSession } from "@openai/agents/realtime";
import type { tool } from "@openai/agents/realtime";
import { BaseVoiceAgent } from "./BaseVoiceAgent";
import {
	MainVaultAssistantConfig,
	RealtimeToolConfig,
	DEFAULT_TOOL_CONFIG,
	REALTIME_MODEL,
	logger,
} from "./types";
import { createToolsForAgent, getToolNames } from "./tools/tool-manager";
import { CustomizationLoader, VoiceAgentDefinition } from "../customization/CustomizationLoader";
import { getVoiceAgentRegistry, VoiceAgentRegistration } from "./VoiceAgentRegistry";
import { TaskManagementAgent, NoteManagementAgent, WorkIQAgent } from "./agents";

/** Definition file name for MainVaultAssistant */
export const MAIN_ASSISTANT_DEFINITION_FILE = "main-vault-assistant.voice-agent.md";

/** Default instructions when no markdown file is loaded */
const DEFAULT_INSTRUCTIONS = `You are a helpful voice assistant coordinator for an Obsidian knowledge vault.

## LANGUAGE: ENGLISH ONLY
You MUST respond in English only. Do not use Spanish, French, German or any other language.
Regardless of the user's language, always respond in English.

## Your Role
You are the main coordinator that routes requests to specialist agents:

### Note Operations → Note Manager
For anything involving notes (reading, searching, creating, editing notes), hand off to the **Note Manager** specialist.
Trigger phrases: "switch to notes", "note manager", "help with notes", "open a note", "read a note", "find notes"

### Task Operations → Task Manager  
For task management (marking tasks complete, creating tasks, listing tasks), hand off to the **Task Manager** specialist.
Trigger phrases: "switch to tasks", "task manager", "help with tasks", "mark tasks", "complete tasks", "create a task"

### Microsoft 365 / Calendar / Email → WorkIQ
For anything involving Microsoft 365, calendar, meetings, emails, Teams, or Office documents, hand off to the **WorkIQ** specialist.
Trigger phrases: "check my calendar", "calendar", "meetings", "schedule", "emails", "mail", "Teams", "documents", "M365", "workiq"
Examples:
- "What's on my calendar tomorrow?" → WorkIQ
- "Check my meetings for this week" → WorkIQ
- "Read my recent emails" → WorkIQ
- "What did John say in Teams?" → WorkIQ

### Web Operations → You handle directly
You can directly help with:
- Fetching web pages
- Searching the web for information

### Returning from Specialists
When users say "switch to main", "main assistant", "general help", "go back", or "return to main", they want to return to you for general assistance.

## Asking Questions
When you need clarification or additional information from the user, use the **ask_question** tool to gather input:

- **Text questions**: For open-ended responses (e.g., "What should I name this note?")
- **Multiple choice**: When user should select one or more options (e.g., "Which tags should I add?")
- **Radio buttons**: When user should select exactly one option (e.g., "Which priority level?")
- **Mixed**: Combine options with a text field (e.g., select categories + add custom notes)

Use questions to:
- Clarify ambiguous requests
- Gather missing required information
- Offer choices when multiple options exist
- Get user preferences or decisions

Keep questions clear and concise. Present options in a logical order.

## Context Updates
When [INTERNAL CONTEXT UPDATE] messages arrive, note them silently - do not speak about them.

## Response Style
Be conversational and brief. Route requests efficiently to the right specialist.
When you hand off, briefly acknowledge: "Switching to Note Manager" or "Handing off to Task Manager" or "Handing off to WorkIQ".
`;

/**
 * MainVaultAssistant - The primary entry point for voice interactions
 */
export class MainVaultAssistant extends BaseVoiceAgent {
	private static activeSessionOwner: MainVaultAssistant | null = null;

	private static async releaseActiveSession(requester: MainVaultAssistant): Promise<void> {
		const activeOwner = MainVaultAssistant.activeSessionOwner;
		if (activeOwner && activeOwner !== requester && activeOwner.isConnected()) {
			logger.info(`[${requester.name}] Releasing active voice session from ${activeOwner.name}`);
			await activeOwner.disconnect();
		}
	}

	private toolConfig: RealtimeToolConfig;
	private customizationLoader: CustomizationLoader;
	private voiceAgentDefinition: VoiceAgentDefinition | null = null;

	constructor(app: App, config: MainVaultAssistantConfig) {
		super("Main Vault Assistant", app, config);
		this.toolConfig = { ...DEFAULT_TOOL_CONFIG, ...config.toolConfig };
		this.customizationLoader = new CustomizationLoader(app);
	}

	// =========================================================================
	// Abstract Method Implementations
	// =========================================================================

	getInstructions(): string {
		// Use loaded markdown instructions if available
		if (this.voiceAgentDefinition?.instructions) {
			return this.voiceAgentDefinition.instructions;
		}
		
		// Use config instructions if provided
		const configInstructions = (this.config as MainVaultAssistantConfig).instructions;
		if (configInstructions) {
			return configInstructions;
		}

		// Fall back to default
		return DEFAULT_INSTRUCTIONS;
	}

	getHandoffDescription(): string {
		// Main agent doesn't need a handoff description (it's the entry point)
		return this.voiceAgentDefinition?.handoffDescription || "";
	}

	getTools(): ReturnType<typeof tool>[] {
		// Get tool names from definition or use defaults (web tools only - note/task tools handled by specialists)
		const allowedTools = this.voiceAgentDefinition?.tools || [
			"fetch_web_page",
			"web_search",
		];

		return createToolsForAgent(
			allowedTools,
			this.app,
			this.toolConfig,
			(this.config as MainVaultAssistantConfig).mcpManager,
			this.onToolExecution,
			(this.config as MainVaultAssistantConfig).periodicNotesSettings,
			this.getChatOutputCallback(),
			this.getQuestionCallback(),
			this.name
		);
	}

	// =========================================================================
	// Configuration
	// =========================================================================

	/**
	 * Update tool configuration at runtime
	 */
	updateToolConfig(config: Partial<RealtimeToolConfig>): void {
		this.toolConfig = { ...this.toolConfig, ...config };
		logger.info(`[${this.name}] Tool config updated`);
	}

	// =========================================================================
	// Connection Lifecycle
	// =========================================================================

	/**
	 * Connect to the realtime session
	 */
	async connect(): Promise<void> {
		if (this.state !== "idle") {
			throw new Error(`Cannot connect: agent is in ${this.state} state`);
		}

		try {
			await MainVaultAssistant.releaseActiveSession(this);

			this.setState("connecting");

			// Start trace for this voice session
			this.startTrace({
				voice: this.config.voice,
				language: this.config.language,
			});

			// Load voice agent definitions
			await this.loadVoiceAgentDefinitions();

			// Create and register handoff agents
			await this.setupHandoffAgents();

			// Build the main agent with handoffs
			this.buildAgent();

			// Log tools being registered
			const tools = this.getTools();
			const toolNames = getToolNames(tools);
			logger.info(`[${this.name}] Created with ${tools.length} tools: ${toolNames.join(", ")}`);
			logger.info(`[${this.name}] Registered ${this.handoffAgents.size} handoff agents`);

			// Create session with configuration
			// Note: server_vad is more reliable for automatic response triggering
			// semantic_vad may not properly trigger responses in all cases
			const turnDetectionType = this.config.turnDetection || "server_vad";
			const turnDetectionConfig: Record<string, unknown> = {
				type: turnDetectionType,
			};
			// Add parameters based on VAD type
			if (turnDetectionType === "server_vad") {
				turnDetectionConfig.threshold = 0.5;
				turnDetectionConfig.prefix_padding_ms = 300;
				turnDetectionConfig.silence_duration_ms = 500;
				turnDetectionConfig.create_response = true;
			}
			// semantic_vad uses different parameters and auto-triggers responses
			// No additional config needed for semantic_vad
			
			const sessionConfig = {
				model: REALTIME_MODEL,
				config: {
					toolChoice: "auto",
					voice: this.config.voice || "alloy",
					inputAudioTranscription: {
						model: "whisper-1",
						...(this.config.language ? { language: this.config.language } : {}),
					},
					turnDetection: turnDetectionConfig,
				},
			};
			logger.info(`[${this.name}] Creating session with config:`, JSON.stringify(sessionConfig.config, null, 2));
			this.session = new RealtimeSession(this.agent!, sessionConfig);

			// Set up event handlers
			this.setupEventHandlers();
			
			// Add debug listener for ALL transport events to diagnose audio issues
			this.session.on("transport_event", (event) => {
				const eventType = (event as Record<string, unknown>).type as string;
				
				// Handle state transitions for thinking indicator
				if (eventType === "input_audio_buffer.speech_started") {
					logger.info(`[${this.name}] [STATE] speech_started - current: ${this.state}`);
					if (this.state === "connected" || this.state === "processing") {
						this.setState("listening");
					}
				} else if (eventType === "input_audio_buffer.speech_stopped") {
					logger.info(`[${this.name}] [STATE] speech_stopped - current: ${this.state}`);
					// Don't transition yet - wait for transcription.completed
				} else if (eventType === "conversation.item.input_audio_transcription.completed") {
					// User's speech has been transcribed - AI is now processing
					// Only transition from valid source states (whitelist approach for safety)
					// Transcription can arrive AFTER audio starts, so we must not transition from speaking
					const currentState = this.state;
					if (currentState === "listening" || currentState === "connected") {
						logger.info(`[${this.name}] [STATE] transcription.completed - current: ${currentState} -> processing`);
						this.setState("processing");
					} else {
						logger.info(`[${this.name}] [STATE] transcription.completed - ignoring (state is ${currentState})`);
					}
				} else if (eventType === "response.audio.delta" || eventType === "response.audio_transcript.delta" || eventType === "output_audio_buffer.started") {
					// AI has started responding with audio - hide thinking
					if (this.state === "processing" || this.state === "listening") {
						logger.info(`[${this.name}] [STATE] audio response started - current: ${this.state} -> speaking`);
						this.setState("speaking");
					}
				} else if (eventType === "output_audio_buffer.stopped") {
					// AI finished speaking - return to connected
					if (this.state === "speaking") {
						logger.info(`[${this.name}] [STATE] audio stopped - current: ${this.state} -> connected`);
						this.setState("connected");
					}
				}
				
				// Log ALL events during debug (except noisy delta events)
				const isDelta = eventType?.includes(".delta");
				if (!isDelta) {
					logger.info(`[${this.name}] Transport event:`, eventType);
					// Log full event for audio/input/speech related
					if (eventType?.includes("audio") || eventType?.includes("input") || eventType?.includes("speech") || eventType?.includes("session")) {
						logger.info(`[${this.name}] Transport event detail:`, JSON.stringify(event, null, 2));
					}
				}
			});

			// Get ephemeral key and connect
			const ephemeralKey = await this.getEphemeralKey();
			logger.info(`[${this.name}] Got ephemeral key, connecting...`);
			await this.session.connect({ apiKey: ephemeralKey });
			logger.info(`[${this.name}] WebRTC connection established`);

			this.setState("connected");
			MainVaultAssistant.activeSessionOwner = this;
			logger.info(`[${this.name}] Connected successfully`);
		} catch (error) {
			this.setState("error");
			this.emit("error", error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	/**
	 * Disconnect from the session
	 */
	async disconnect(): Promise<void> {
		try {
			logger.info(`[${this.name}] Disconnecting...`);
			
			// End trace
			this.endTrace();

			// Close session
			if (this.session) {
				this.session.close();
				this.session = null;
			}

			// Clean up
			this.agent = null;
			this.activeAgent = this;
			this.sessionApprovedTools.clear();
			this.handoffAgents.clear();
			this.voiceAgentDefinition = null;

			this.setState("idle");
			if (MainVaultAssistant.activeSessionOwner === this) {
				MainVaultAssistant.activeSessionOwner = null;
			}
			logger.info(`[${this.name}] Disconnected`);
		} catch (error) {
			logger.error(`[${this.name}] Error disconnecting:`, error);
			this.setState("idle");
		}
	}

	// =========================================================================
	// Voice Agent Loading
	// =========================================================================

	/** Loaded voice agent definitions (cached for handoff setup) */
	private loadedDefinitions: VoiceAgentDefinition[] = [];

	/**
	 * Load voice agent definitions from explicit file paths or directories.
	 * Explicit file paths (voiceAgentFiles) take precedence over directory scanning.
	 */
	private async loadVoiceAgentDefinitions(): Promise<void> {
		const config = this.config as MainVaultAssistantConfig;
		const explicitFiles = config.voiceAgentFiles;
		const directories = config.voiceAgentDirectories;

		try {
			// Strategy 1: Load from explicit file paths (preferred)
			if (explicitFiles) {
				const fileMap: Record<string, string | undefined> = {
					mainAssistant: explicitFiles.mainAssistant,
					noteManager: explicitFiles.noteManager,
					taskManager: explicitFiles.taskManager,
					workiq: explicitFiles.workiq,
				};

				for (const [agentKey, filePath] of Object.entries(fileMap)) {
					if (filePath) {
						const definition = await this.customizationLoader.loadVoiceAgentFromFile(filePath);
						if (definition) {
							this.loadedDefinitions.push(definition);
							logger.info(`[${this.name}] Loaded ${agentKey} definition from: ${filePath}`);
						} else {
							logger.debug(`[${this.name}] Could not load ${agentKey} from: ${filePath}`);
						}
					}
				}
			}

			// Strategy 2: Fall back to directory scanning if no explicit files or to supplement
			if (directories && directories.length > 0 && this.loadedDefinitions.length === 0) {
				const dirDefinitions = await this.customizationLoader.loadVoiceAgents(directories);
				// Only add definitions not already loaded
				for (const def of dirDefinitions) {
					if (!this.loadedDefinitions.some(d => d.path === def.path || d.name === def.name)) {
						this.loadedDefinitions.push(def);
					}
				}
				logger.info(`[${this.name}] Loaded ${dirDefinitions.length} definitions from directories`);
			}

			logger.info(`[${this.name}] Total voice agent definitions loaded: ${this.loadedDefinitions.length}`);

			// Find the main vault assistant definition
			this.voiceAgentDefinition = this.loadedDefinitions.find(
				(a) => 
					a.path?.endsWith(MAIN_ASSISTANT_DEFINITION_FILE) ||
					a.name === "Main Vault Assistant" || 
					a.name === this.name
			) || null;

			if (this.voiceAgentDefinition) {
				logger.info(`[${this.name}] Using voice agent definition from: ${this.voiceAgentDefinition.path}`);
			}

			// Log which registered agents have definitions available
			const registry = getVoiceAgentRegistry();
			for (const registration of registry.getAll()) {
				const def = this.loadedDefinitions.find(d => 
					d.path?.endsWith(registration.definitionFileName) ||
					d.name === registration.name
				);
				if (def) {
					logger.info(`[${this.name}] Found definition for ${registration.name}: ${def.path}`);
				} else {
					logger.debug(`[${this.name}] No definition found for ${registration.name}, will use defaults`);
				}
			}
		} catch (error) {
			logger.warn(`[${this.name}] Failed to load voice agent definitions:`, error);
		}
	}

	/**
	 * Set up handoff agents based on VoiceAgentRegistry
	 * Creates instances of all registered agents and registers them for handoffs.
	 * Also wires up cross-handoffs between specialist agents based on their definitions.
	 */
	private async setupHandoffAgents(): Promise<void> {
		const registry = getVoiceAgentRegistry();
		const registrations = registry.getAll();

		logger.info(`[${this.name}] Setting up ${registrations.length} registered handoff agents`);

		// Map to track created agents by name for cross-handoff wiring
		const createdAgents = new Map<string, { agent: BaseVoiceAgent; definition?: VoiceAgentDefinition }>();

		// Phase 1: Create all agents
		for (const registration of registrations) {
			// Find matching definition by file name or agent name
			const definition = this.loadedDefinitions.find(d => 
				d.path?.endsWith(registration.definitionFileName) ||
				d.name === registration.name
			);

			if (definition) {
				logger.info(`[${this.name}] Creating ${registration.name} with definition from ${definition.path}`);
			} else {
				logger.info(`[${this.name}] Creating ${registration.name} with default configuration`);
			}

			// Use the factory to create the agent instance
			const agent = registry.create(
				registration.id,
				this.app,
				this.config,
				definition
			);

			if (agent) {
				this.registerHandoff(agent);
				createdAgents.set(agent.name, { agent, definition });

				// Forward chatOutput events from handoff agents to this (MainVaultAssistant)
				// so the ChatView can receive them
				agent.on("chatOutput", (content: string, sourceAgent: string) => {
					logger.debug(`[${this.name}] Forwarding chatOutput from ${sourceAgent}`);
					this.emit("chatOutput", content, sourceAgent);
				});
			}
		}

		// Phase 2: Wire up cross-handoffs between specialist agents from definitions
		for (const [agentName, { agent, definition }] of createdAgents) {
			const handoffNames = definition?.handoffs || [];
			
			for (const handoffName of handoffNames) {
				const targetEntry = createdAgents.get(handoffName);
				if (targetEntry) {
					agent.registerHandoff(targetEntry.agent);
					logger.info(`[${this.name}] Wired cross-handoff: ${agentName} → ${handoffName}`);
				} else {
					logger.warn(`[${this.name}] Handoff target not found: ${agentName} → ${handoffName}`);
				}
			}
		}

		// Phase 3: Wire up default cross-handoffs between all specialists
		// This allows specialists to hand off to each other even without explicit definition
		for (const [agentName, { agent }] of createdAgents) {
			// Register Main Vault Assistant as handoff target (so specialists can return)
			agent.registerHandoff(this);
			logger.info(`[${this.name}] Wired return handoff: ${agentName} → ${this.name}`);

			// Register all other specialists as handoff targets
			for (const [otherName, { agent: otherAgent }] of createdAgents) {
				if (agentName !== otherName) {
					agent.registerHandoff(otherAgent);
					logger.info(`[${this.name}] Wired default cross-handoff: ${agentName} → ${otherName}`);
				}
			}
		}
	}

	// =========================================================================
	// Static Methods - Built-in Agent Registration
	// =========================================================================

	/**
	 * Register all built-in voice agents with the global registry.
	 * Call this once during plugin initialization.
	 */
	static registerBuiltInAgents(): void {
		logger.info("[MainVaultAssistant] Registering built-in voice agents");
		
		// Register NoteManagementAgent
		NoteManagementAgent.register();
		
		// Register TaskManagementAgent
		TaskManagementAgent.register();
		
		// Register WorkIQAgent
		WorkIQAgent.register();
	}

	/**
	 * Unregister all built-in voice agents.
	 * Call this during plugin cleanup.
	 */
	static unregisterBuiltInAgents(): void {
		logger.info("[MainVaultAssistant] Unregistering built-in voice agents");
		
		// Unregister NoteManagementAgent
		NoteManagementAgent.unregister();
		
		// Unregister TaskManagementAgent
		TaskManagementAgent.unregister();
		
		// Unregister WorkIQAgent
		WorkIQAgent.unregister();
	}

	/**
	 * Get the voice agent registry for external plugins to register agents
	 */
	static getRegistry(): ReturnType<typeof getVoiceAgentRegistry> {
		return getVoiceAgentRegistry();
	}
}
