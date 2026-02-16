/**
 * @module OpenAIService
 * @description OpenAI API provider implementation for Vault Copilot.
 *
 * This module provides direct integration with the OpenAI API, supporting:
 * - Chat completions with streaming and non-streaming modes
 * - Tool/function calling for vault operations and MCP tools
 * - Configurable models, temperature, and token limits
 *
 * ## Configuration
 *
 * The service can be configured via:
 * 1. AI Provider Profile settings (recommended)
 * 2. `OPENAI_API_KEY` environment variable (desktop only)
 *
 * ## Usage
 *
 * ```typescript
 * const service = new OpenAIService(app, {
 *   provider: 'openai',
 *   model: 'gpt-4o',
 *   streaming: true,
 *   apiKey: 'sk-...',
 * });
 *
 * await service.initialize();
 * await service.sendMessageStreaming('Hello!', {
 *   onDelta: (chunk) => console.log(chunk),
 * });
 * ```
 *
 * @see {@link AIProvider} for the base class interface
 * @see {@link OpenAIProviderConfig} for configuration options
 * @since 0.0.1
 */

import OpenAI from "openai";
import { App } from "obsidian";
import { ChatMessage } from "./GitHubCopilotCliService";
import {
	AIProvider,
	OpenAIProviderConfig,
	StreamingCallbacks,
	ToolDefinition,
} from "./AIProvider";

interface OpenAITool {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

type OpenAIMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type OpenAIToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

/**
 * OpenAI provider implementation
 */
export class OpenAIService extends AIProvider {
	private client: OpenAI | null = null;
	private abortController: AbortController | null = null;
	private isInitialized: boolean = false;
	declare protected config: OpenAIProviderConfig;

	constructor(app: App, config: OpenAIProviderConfig) {
		super(app, config);
	}

	/**
	 * Initialize the OpenAI client
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized && this.client) {
			return;
		}

		const apiKey = this.resolveApiKey();
		if (!apiKey) {
			const isDesktop = typeof process !== "undefined" && process.env;
			const message = isDesktop
				? "OpenAI API key not configured. Set it in Settings → Vault Copilot → AI Provider Profiles or via OPENAI_API_KEY environment variable."
				: "OpenAI API key not configured. Please set it in Settings → Vault Copilot → AI Provider Profiles.";
			throw new Error(message);
		}

		const clientConfig: ConstructorParameters<typeof OpenAI>[0] = {
			apiKey,
			dangerouslyAllowBrowser: true, // Required for Obsidian (Electron browser context)
		};

		if (this.config.baseURL) {
			clientConfig.baseURL = this.config.baseURL;
		}

		if (this.config.organization) {
			clientConfig.organization = this.config.organization;
		}

		this.client = new OpenAI(clientConfig);
		this.isInitialized = true;
		console.log("[OpenAIService] Initialized with model:", this.config.model);
	}

	/**
	 * Send a message and wait for complete response
	 */
	async sendMessage(prompt: string): Promise<string> {
		if (!this.client) {
			await this.initialize();
		}

		this.addToHistory("user", prompt);

		const messages = this.buildMessages();
		const tools = this.buildTools();

		try {
			let response = await this.client!.chat.completions.create({
				model: this.config.model,
				messages,
				tools: tools.length > 0 ? tools : undefined,
				max_tokens: this.config.maxTokens,
				temperature: this.config.temperature,
			});

			// Handle tool calls in a loop
			let assistantMessage = response.choices[0]?.message;
			while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
				// Execute tool calls
				const toolResults = await this.executeToolCalls(assistantMessage.tool_calls);

				// Add assistant message with tool calls to messages
				messages.push(assistantMessage);

				// Add tool results
				for (const result of toolResults) {
					messages.push({
						role: "tool",
						tool_call_id: result.tool_call_id,
						content: JSON.stringify(result.result),
					});
				}

				// Get next response
				response = await this.client!.chat.completions.create({
					model: this.config.model,
					messages,
					tools: tools.length > 0 ? tools : undefined,
					max_tokens: this.config.maxTokens,
					temperature: this.config.temperature,
				});

				assistantMessage = response.choices[0]?.message;
			}

			const content = assistantMessage?.content || "";
			this.addToHistory("assistant", content);
			return content;
		} catch (error) {
			console.error("[OpenAIService] Error sending message:", error);
			throw error;
		}
	}

	/**
	 * Send a message with streaming response
	 */
	async sendMessageStreaming(
		prompt: string,
		callbacks: StreamingCallbacks
	): Promise<void> {
		if (!this.client) {
			await this.initialize();
		}

		this.addToHistory("user", prompt);
		this.abortController = new AbortController();

		const messages = this.buildMessages();
		const tools = this.buildTools();
		let fullContent = "";

		try {
			// Loop to handle multiple rounds of tool calls (e.g. sequential ask_question calls)
			let continueLoop = true;
			let isFirstStream = true;

			while (continueLoop) {
				const stream = await this.client!.chat.completions.create({
					model: this.config.model,
					messages,
					tools: tools.length > 0 ? tools : undefined,
					max_tokens: this.config.maxTokens,
					temperature: this.config.temperature,
					stream: true,
				}, {
					signal: this.abortController.signal,
				});

				let currentToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
				let hasToolCalls = false;

				for await (const chunk of stream) {
					const delta = chunk.choices[0]?.delta;

					// Handle content delta
					if (delta?.content) {
						fullContent += delta.content;
						callbacks.onDelta(delta.content);
					}

					// Handle tool calls
					if (delta?.tool_calls) {
						hasToolCalls = true;
						for (const toolCall of delta.tool_calls) {
							const index = toolCall.index;
							if (!currentToolCalls.has(index)) {
								currentToolCalls.set(index, {
									id: toolCall.id || "",
									name: toolCall.function?.name || "",
									arguments: "",
								});
							}
							const tc = currentToolCalls.get(index)!;
							if (toolCall.id) tc.id = toolCall.id;
							if (toolCall.function?.name) tc.name = toolCall.function.name;
							if (toolCall.function?.arguments) tc.arguments += toolCall.function.arguments;
						}
					}
				}

				if (hasToolCalls && currentToolCalls.size > 0) {
					const toolCalls: OpenAIToolCall[] = Array.from(currentToolCalls.values()).map(tc => ({
						id: tc.id,
						type: "function" as const,
						function: {
							name: tc.name,
							arguments: tc.arguments,
						},
					}));

					// Execute tool calls
					const toolResults = await this.executeToolCalls(toolCalls);

					// Add assistant message with tool calls
					messages.push({
						role: "assistant",
						content: fullContent || null,
						tool_calls: toolCalls,
					});

					// Reset fullContent for next round (content before tool calls was already streamed)
					if (!isFirstStream) {
						// Content was already accumulated; don't double-count
					}

					// Add tool results
					for (const result of toolResults) {
						messages.push({
							role: "tool",
							tool_call_id: result.tool_call_id,
							content: JSON.stringify(result.result),
						});
					}

					// Continue the loop with the updated messages (tool results appended)
					isFirstStream = false;
				} else {
					// No more tool calls — we're done
					continueLoop = false;
				}
			}

			this.addToHistory("assistant", fullContent);
			callbacks.onComplete?.(fullContent);
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				callbacks.onComplete?.(fullContent);
				return;
			}
			console.error("[OpenAIService] Streaming error:", error);
			callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
			throw error;
		} finally {
			this.abortController = null;
		}
	}

	/**
	 * Abort the current operation
	 */
	async abort(): Promise<void> {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
	}

	/**
	 * Check if the provider is ready
	 */
	isReady(): boolean {
		return this.isInitialized && this.client !== null;
	}

	/**
	 * Clean up resources
	 */
	async destroy(): Promise<void> {
		await this.abort();
		this.client = null;
		this.isInitialized = false;
		this.messageHistory = [];
	}

	private resolveApiKey(): string | undefined {
		if (this.config.apiKey) {
			return this.config.apiKey;
		}
		if (typeof process !== "undefined" && process.env?.OPENAI_API_KEY) {
			return process.env.OPENAI_API_KEY;
		}
		return undefined;
	}

	/**
	 * Build messages array for API call
	 */
	private buildMessages(): OpenAIMessage[] {
		const messages: OpenAIMessage[] = [];

		// Add system message
		if (this.systemPrompt) {
			messages.push({
				role: "system",
				content: this.systemPrompt,
			});
		}

		// Add conversation history
		for (const msg of this.messageHistory) {
			messages.push({
				role: msg.role,
				content: msg.content,
			});
		}

		return messages;
	}

	/**
	 * Build tools array for API call
	 * Includes manually set tools, MCP tools, and ask_question tool
	 */
	private buildTools(): OpenAITool[] {
		// Combine manually set tools with MCP tools
		const allTools = [...this.tools, ...this.convertMcpToolsToToolDefinitions()];

		// Add ask_question tool if question callback is available
		const askQuestionTool = this.createAskQuestionToolDefinition();
		if (askQuestionTool) {
			allTools.push(askQuestionTool);
		}

		// Add run_subagent tool if agent infrastructure is available
		const subagentTool = this.createRunSubagentToolDefinition();
		if (subagentTool) {
			allTools.push(subagentTool);
		}
		
		return allTools.map((tool) => ({
			type: "function" as const,
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
			},
		}));
	}

	/**
	 * Execute tool calls and return results
	 */
	private async executeToolCalls(
		toolCalls: OpenAIToolCall[]
	): Promise<Array<{ tool_call_id: string; result: unknown }>> {
		// Build complete tool list for lookup (same sources as buildTools)
		const allTools = [...this.tools, ...this.convertMcpToolsToToolDefinitions()];
		const askQuestionTool = this.createAskQuestionToolDefinition();
		if (askQuestionTool) {
			allTools.push(askQuestionTool);
		}
		const subagentTool = this.createRunSubagentToolDefinition();
		if (subagentTool) {
			allTools.push(subagentTool);
		}

		const results = await Promise.all(
			toolCalls.map(async (toolCall) => {
				const toolName = toolCall.function.name;
				const tool = allTools.find((t) => t.name === toolName);

				if (!tool) {
					return {
						tool_call_id: toolCall.id,
						result: { error: `Unknown tool: ${toolName}` },
					};
				}

				try {
					let args: Record<string, unknown> = {};
					try {
						args = JSON.parse(toolCall.function.arguments || "{}");
					} catch {
						// If parsing fails, use empty args
					}

					console.log(`[OpenAIService] Executing tool: ${toolName}`, args);
					const result = await tool.handler(args);
					return {
						tool_call_id: toolCall.id,
						result,
					};
				} catch (error) {
					console.error(`[OpenAIService] Tool execution error (${toolName}):`, error);
					return {
						tool_call_id: toolCall.id,
						result: { error: error instanceof Error ? error.message : String(error) },
					};
				}
			})
		);

		return results;
	}

	/**
	 * Test the connection to OpenAI
	 */
	async testConnection(): Promise<{ success: boolean; error?: string }> {
		try {
			if (!this.client) {
				await this.initialize();
			}

			// Make a simple API call to test connection
			const response = await this.client!.models.list();
			const models = response.data.map((m) => m.id);
			console.log("[OpenAIService] Available models:", models.slice(0, 5));
			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	}

	/**
	 * List available models for chat (excludes realtime and audio models)
	 * Filters to only include models that support chat completions with function calling
	 */
	async listModels(): Promise<string[]> {
		if (!this.client) {
			await this.initialize();
		}

		try {
			const response = await this.client!.models.list();
			return response.data
				.filter((m) => {
					const id = m.id.toLowerCase();
					// Exclude codex models
					if (id.includes("codex")) {
						return false;
					}
					// Exclude realtime and audio models (for voice services)
					if (id.includes("realtime") || id.includes("audio")) {
						return false;
					}
					// Only include GPT models and reasoning models (o1, o3) that support chat
					// These models support chat completions with function calling (tools)
					return (
						id.startsWith("gpt-4") ||
						id.startsWith("gpt-3.5") ||
						id.startsWith("gpt-5") ||
						id.startsWith("o1") ||
						id.startsWith("o3")
					);
				})
				.map((m) => m.id)
				.sort();
		} catch (error) {
			console.error("[OpenAIService] Error listing models:", error);
			return [];
		}
	}

	/**
	 * List available realtime models for voice agent
	 */
	async listRealtimeModels(): Promise<string[]> {
		if (!this.client) {
			await this.initialize();
		}

		try {
			const response = await this.client!.models.list();
			return response.data
				.filter((m) => m.id.includes("realtime"))
				.map((m) => m.id)
				.sort();
		} catch (error) {
			console.error("[OpenAIService] Error listing realtime models:", error);
			// Return default realtime models
			return ["gpt-realtime", "gpt-realtime-mini"];
		}
	}

	/**
	 * List available audio models for voice input
	 */
	async listAudioModels(): Promise<string[]> {
		if (!this.client) {
			await this.initialize();
		}

		try {
			const response = await this.client!.models.list();
			return response.data
				.filter((m) => m.id.includes("audio") && !m.id.includes("realtime"))
				.map((m) => m.id)
				.sort();
		} catch (error) {
			console.error("[OpenAIService] Error listing audio models:", error);
			// Return default audio models
			return ["gpt-audio", "gpt-audio-mini"];
		}
	}
}
