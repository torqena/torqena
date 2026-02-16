/**
 * RealtimeAgentService - OpenAI Realtime Voice Agent integration
 *
 * Provides real-time voice conversation capabilities using OpenAI's Realtime API
 * with support for tools, interruptions, and live transcription.
 */

import { App } from "obsidian";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import {
	RealtimeAgentConfig,
	RealtimeAgentEvents,
	RealtimeAgentState,
	RealtimeHistoryItem,
	RealtimeToolConfig,
	ToolExecutionCallback,
	ToolApprovalRequest,
	DEFAULT_TOOL_CONFIG,
	REALTIME_MODEL,
	logger,
} from "./types";
import { createAllTools, getToolNames } from "./tools/tool-manager";
import { handlePossibleJsonToolCall, mightBeJsonToolCall } from "./workarounds";
import { getTracingService } from "../TracingService";

export class RealtimeAgentService {
	private app: App;
	private config: RealtimeAgentConfig;
	private agent: RealtimeAgent | null = null;
	private session: RealtimeSession | null = null;
	private state: RealtimeAgentState = "idle";
	private listeners: Map<
		keyof RealtimeAgentEvents,
		Set<(...args: unknown[]) => void>
	> = new Map();
	private onToolExecution: ToolExecutionCallback | null = null;
	private toolConfig: RealtimeToolConfig;
	private currentTraceId: string = "";
	/** Tools approved for the entire session (user clicked "Allow for session") */
	private sessionApprovedTools: Set<string> = new Set();
	/** Counter for generating unique approval request IDs */
	private approvalRequestCounter: number = 0;

	constructor(app: App, config: RealtimeAgentConfig) {
		this.app = app;
		this.config = config;
		this.toolConfig = { ...DEFAULT_TOOL_CONFIG, ...config.toolConfig };
	}

	/**
	 * Get current state
	 */
	getState(): RealtimeAgentState {
		return this.state;
	}

	/**
	 * Subscribe to events
	 */
	on<K extends keyof RealtimeAgentEvents>(
		event: K,
		callback: RealtimeAgentEvents[K]
	): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		const callbacks = this.listeners.get(event)!;
		callbacks.add(callback as (...args: unknown[]) => void);

		return () => {
			callbacks.delete(callback as (...args: unknown[]) => void);
		};
	}

	/**
	 * Emit an event
	 */
	private emit<K extends keyof RealtimeAgentEvents>(
		event: K,
		...args: Parameters<RealtimeAgentEvents[K]>
	): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			callbacks.forEach((cb) => {
				try {
					cb(...args);
				} catch (e) {
					console.error(`[RealtimeAgent] Error in ${event} callback:`, e);
				}
			});
		}
	}

	/**
	 * Update state and emit change event
	 */
	private setState(newState: RealtimeAgentState): void {
		if (this.state !== newState) {
			logger.info(`[STATE CHANGE] ${this.state} -> ${newState}`);
			this.state = newState;
			this.emit("stateChange", newState);
		}
	}

	/**
	 * Update tool configuration at runtime
	 */
	updateToolConfig(config: Partial<RealtimeToolConfig>): void {
		this.toolConfig = { ...this.toolConfig, ...config };
		logger.info("Tool config updated:", this.toolConfig);
	}

	/**
	 * Generate an ephemeral key for WebRTC connection
	 */
	private async getEphemeralKey(): Promise<string> {
		const response = await fetch(
			"https://api.openai.com/v1/realtime/client_secrets",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					session: {
						type: "realtime",
						model: REALTIME_MODEL,
					},
				}),
			}
		);

		if (!response.ok) {
			const error = await response.text();
			throw new Error(
				`Failed to get ephemeral key: ${response.status} ${error}`
			);
		}

		const data = await response.json();
		return data.client_secret?.value || data.value;
	}

	/**
	 * Connect to the realtime session
	 */
	async connect(): Promise<void> {
		if (this.state !== "idle") {
			throw new Error(`Cannot connect: agent is in ${this.state} state`);
		}

		try {
			this.setState("connecting");

			// Start a trace for this voice session
			const tracingService = getTracingService();
			this.currentTraceId = tracingService.startTrace("Voice Conversation", {
				voice: this.config.voice,
				language: this.config.language,
			});

			// Create all tools for the agent
			const allTools = createAllTools(
				this.app,
				this.toolConfig,
				this.config.mcpManager,
				this.onToolExecution
			);

			// Log tools being registered for debugging
			const toolNames = getToolNames(allTools);
			logger.info(
				`Creating agent with ${allTools.length} tools:`,
				toolNames
			);

			// Create the agent with instructions including tool names
			const toolNamesStr = toolNames.join(", ");

			this.agent = new RealtimeAgent({
				name: "Vault Assistant",
				instructions:
					this.config.instructions ||
					`You are a helpful voice assistant for an Obsidian knowledge vault.

## LANGUAGE: ENGLISH ONLY
You MUST respond in English only. Do not use Spanish, French, German or any other language.
Regardless of the user's language, always respond in English.

YOUR AVAILABLE TOOLS:
${toolNamesStr}

## CRITICAL: YOU MUST CALL TOOLS - NEVER DESCRIBE ACTIONS

When users ask you to do something, you MUST use the appropriate tool. NEVER respond with text that describes what you would do.

### Task Completion
When asked to mark tasks complete:
- CALL: mark_tasks_complete with task_list array
- WRONG: "Mark the following tasks as completed..." (this is just text, not a tool call)
- WRONG: Outputting JSON or code syntax

### Note Modifications  
When asked to update, edit, or change note content:
- CALL: update_note (find/replace) or replace_note (full rewrite) or append_to_note
- WRONG: Describing changes in text

### Examples
User: "Check off all my tasks except the weekly review"
YOU MUST: Call mark_tasks_complete tool with the task text strings
NEVER: Say "I'll mark these tasks..." and list them

User: "Add a note about my meeting"
YOU MUST: Call append_to_note or create_note tool
NEVER: Say "Here's what I would add..."

## Context Updates
When [INTERNAL CONTEXT UPDATE] messages arrive, note them silently - do not speak about them.

## Response Style
Be conversational and brief. After using a tool successfully, confirm with a short acknowledgment like "Done" or "Got it, marked those complete."

Remember: If you find yourself typing out instructions or code instead of calling a tool, STOP and call the tool instead.`,
				tools: allTools,
				voice: this.config.voice || "alloy",
			});

			// Create session with configuration
			this.session = new RealtimeSession(this.agent, {
				model: REALTIME_MODEL,
				config: {
					toolChoice: "auto",
					voice: this.config.voice || "alloy",
					inputAudioTranscription: {
						model: "whisper-1",
						...(this.config.language
							? { language: this.config.language }
							: {}),
					},
					turnDetection: {
						type: this.config.turnDetection || "server_vad",
						threshold: 0.5,
						prefix_padding_ms: 300,
						silence_duration_ms: 500,
						create_response: true,
					},
				},
			});

			// Debug: Log the session config that will be sent
			const sessionConfig = await this.session.getInitialSessionConfig();
			logger.debug(
				"Session config tools count:",
				sessionConfig.tools?.length || 0
			);
			logger.debug(
				"Session config toolChoice:",
				sessionConfig.toolChoice
			);

			// Set up event handlers
			this.setupEventHandlers();

			// Get ephemeral key and connect
			const ephemeralKey = await this.getEphemeralKey();
			await this.session.connect({ apiKey: ephemeralKey });

			this.setState("connected");
		} catch (error) {
			this.setState("error");
			this.emit(
				"error",
				error instanceof Error ? error : new Error(String(error))
			);
			throw error;
		}
	}

	/**
	 * Set up event handlers for the session
	 */
	private setupEventHandlers(): void {
		if (!this.session) return;

		// Handle history updates (transcripts)
		this.session.on("history_updated", (history) => {
			// Debug: Log all history items to understand the structure
			logger.debug("History updated with", history.length, "items");
			
			// Debug: Check for function_call items in history
			const functionCalls = history.filter(
				(item) => item.type === "function_call"
			);
			if (functionCalls.length > 0) {
				logger.debug(
					"Function calls in history:",
					functionCalls
				);
			}

			// Convert to our format and emit
			const items: RealtimeHistoryItem[] = history.map((item) => {
				const result: RealtimeHistoryItem = {
					type: item.type as RealtimeHistoryItem["type"],
				};

				if ("role" in item) {
					result.role = item.role as RealtimeHistoryItem["role"];
				}

				if ("content" in item && Array.isArray(item.content)) {
					for (const contentItem of item.content) {
						if ("text" in contentItem && contentItem.text) {
							result.content = contentItem.text;
						}
						if ("transcript" in contentItem && contentItem.transcript) {
							result.transcript = contentItem.transcript;
						}
					}
				}

				// Handle user audio input items specifically
				if (item.type === "message" && item.role === "user") {
					// User audio input comes through with audio content type
					if ("content" in item && Array.isArray(item.content)) {
						for (const contentItem of item.content) {
							// Audio items may have transcript at the content item level
							if ("transcript" in contentItem) {
								result.transcript = contentItem.transcript as string;
							}
							// Or check for input_audio type
							if (contentItem.type === "input_audio" && "transcript" in contentItem) {
								result.transcript = contentItem.transcript as string;
							}
						}
					}
					logger.debug("User message found:", result);
				}

				if (item.type === "function_call") {
					if ("name" in item) result.name = item.name as string;
					if ("arguments" in item)
						result.arguments = item.arguments as string;
					if ("output" in item)
						result.output = item.output as string | undefined;
				}

				return result;
			});
			this.emit("historyUpdated", items);

			// Emit individual transcript items for messages with content
			const lastItem = items[items.length - 1];
			logger.info("[WORKAROUND-DEBUG] History lastItem:", JSON.stringify({
				type: lastItem?.type,
				role: lastItem?.role,
				hasContent: !!lastItem?.content,
				contentPreview: lastItem?.content?.substring(0, 50),
				hasTranscript: !!lastItem?.transcript
			}));
			if (lastItem && (lastItem.content || lastItem.transcript)) {
				this.emit("transcript", lastItem);

				// WORKAROUND: Detect structured output that looks like a tool call
				const shouldTriggerWorkaround = mightBeJsonToolCall(lastItem);
				logger.info("[WORKAROUND-DEBUG] mightBeJsonToolCall result:", shouldTriggerWorkaround);
				if (shouldTriggerWorkaround) {
					const content =
						lastItem.content || lastItem.transcript || "";
					logger.info("[WORKAROUND-DEBUG] Invoking workaround handler:", content.substring(0, 100));
					handlePossibleJsonToolCall(
						this.app,
						content,
						this.onToolExecution
					).catch((err) => {
						logger.warn("Error in workaround handler:", err);
					});
				}
			}
		});

		// Handle user input audio transcription completed
		// Note: Use type assertion as this event may not be in the SDK's typed events
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this.session as any).on("input_audio_transcription_completed", (event: unknown) => {
			logger.debug("User audio transcription completed:", event);
			
			// Capture user transcription and emit to history
			// The event contains the transcribed text from user speech
			if (event && typeof event === 'object') {
				const eventObj = event as Record<string, unknown>;
				const transcript = typeof eventObj.transcript === 'string' ? eventObj.transcript : '';
				if (transcript && transcript.trim()) {
					const userItem: RealtimeHistoryItem = {
						type: 'message',
						role: 'user',
						content: transcript,
						transcript: transcript
					};
					logger.debug("Emitting user transcript to history:", userItem);
					// Emit as a transcript event for immediate UI updates
					this.emit("transcript", userItem);
					// Also emit a user_transcription event to update conversation history
					this.emit("user_transcription", userItem);
				}
			}
		});

		// Handle audio interruption
		this.session.on("audio_interrupted", () => {
			this.emit("interrupted");
		});

		// Handle agent audio start (speaking)
		this.session.on("audio_start", () => {
			this.setState("speaking");
		});

		// Handle agent audio stop
		this.session.on("audio_stopped", () => {
			if (this.state === "speaking") {
				this.setState("connected");
			}
		});

		// Handle user started speaking (listening state)
		// Use type assertion as this event may not be in the SDK's typed events
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this.session as any).on("input_audio_buffer_speech_started", () => {
			logger.debug("User started speaking");
			if (this.state === "connected") {
				this.setState("listening");
			}
		});

		// Handle user stopped speaking
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this.session as any).on("input_audio_buffer_speech_stopped", () => {
			logger.debug("User stopped speaking");
			if (this.state === "listening") {
				this.setState("connected");
			}
		});

		// Handle agent tool calls
		this.session.on(
			"agent_tool_start",
			(_context, _agent, tool, details) => {
				logger.debug(
					"Tool call STARTED:",
					tool.name,
					details.toolCall
				);
				// Add a span for this tool call
				if (this.currentTraceId) {
					const tracingService = getTracingService();
					const spanId = tracingService.addSpan(
						this.currentTraceId,
						tool.name,
						"tool_call",
						{ arguments: details.toolCall }
					);
					// Store spanId on details for completion
					(details as Record<string, unknown>)._spanId = spanId;
				}
			}
		);

		this.session.on(
			"agent_tool_end",
			(_context, agent, tool, result, details) => {
				logger.debug(
					"Tool call COMPLETED:",
					tool.name,
					"result:",
					result?.substring(0, 200)
				);
				// Complete the span
				const spanId = (details as Record<string, unknown>)._spanId as string;
				if (spanId) {
					const tracingService = getTracingService();
					tracingService.completeSpan(spanId);
				}
				const agentName = (agent as { name?: string })?.name || "RealtimeAgent";
				this.emit("toolExecution", tool.name, details.toolCall, result, agentName);
			}
		);

		// Debug: Try to capture all possible listening/audio events from WebRTC
		const audioEventNames = [
			"input_audio_buffer_speech_started",
			"input_audio_buffer_speech_stopped",
			"input_audio_buffer_committed",
			"input_audio_buffer_cleared",
			"input_audio_buffer_statistics_updated",
			"response_created",
			"response_done",
			"content_block_start",
			"content_block_delta",
			"conversation_item_input_audio_transcription_started",
			"conversation_item_input_audio_transcription_completed",
		];

		audioEventNames.forEach(eventName => {
			try {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const session = this.session as any;
				if (session.on) {
					session.on(eventName, (...args: unknown[]) => {
						logger.info(`[AUDIO EVENT] ${eventName}`, { args });
					});
				}
			} catch (e) {
				// Event not supported, ignore
			}
		});

		// Handle transport events for state changes (speech detection)
		this.session.on("transport_event", (event) => {
			const eventType = (event as Record<string, unknown>).type as string;
			
			// Skip noisy delta events for logging
			const isDelta = eventType?.includes(".delta");
			
			// Handle user speech events for state transitions
			if (eventType === "input_audio_buffer.speech_started") {
				logger.info(`[STATE] speech_started - current: ${this.state}`);
				if (this.state === "connected" || this.state === "processing") {
					this.setState("listening");
				}
			} else if (eventType === "input_audio_buffer.speech_stopped") {
				logger.info(`[STATE] speech_stopped - current: ${this.state}`);
				// Don't transition yet - wait for transcription.completed for more reliable timing
			} else if (eventType === "conversation.item.input_audio_transcription.completed") {
				// User's speech has been transcribed - AI is now processing
				// Only transition from valid source states (whitelist approach for safety)
				// Transcription can arrive AFTER audio starts, so we must not transition from speaking
				const currentState = this.state;
				if (currentState === "listening" || currentState === "connected") {
					logger.info(`[STATE] transcription.completed - current: ${currentState} -> processing`);
					this.setState("processing");
				} else {
					logger.info(`[STATE] transcription.completed - ignoring (state is ${currentState})`);
				}
			} else if (eventType === "response.audio.delta" || eventType === "response.audio_transcript.delta") {
				// AI has started responding with audio - hide thinking (only log first time)
				if (this.state === "processing" || this.state === "connected" || this.state === "listening") {
					logger.info(`[STATE] audio response started - current: ${this.state} -> speaking`);
					this.setState("speaking");
				}
			}
			
			// Debug logging for relevant events (skip delta events)
			if (!isDelta && (eventType?.includes("function") || eventType?.includes("tool") || eventType?.includes("input") || eventType?.includes("audio") || eventType?.includes("response") || eventType?.includes("transcription"))) {
				logger.info(`[TRANSPORT] ${eventType}`);
			}
		});

		// Handle tool approval requests
		this.session.on("tool_approval_requested", (_context, _agent, request) => {
			// Handle both RealtimeToolApprovalRequest and RealtimeMcpApprovalRequest
			let toolName: string;
			let args: unknown = {};
			
			if (request.type === 'function_approval') {
				// Regular function tool
				toolName = request.tool?.name || "unknown";
				// Args are in the approvalItem's rawItem
				const rawItem = request.approvalItem?.rawItem as Record<string, unknown>;
				args = rawItem?.arguments || rawItem?.call_id || {};
			} else {
				// MCP tool approval
				toolName = request.approvalItem?.toolName || "mcp_tool";
				const rawItem = request.approvalItem?.rawItem as Record<string, unknown>;
				args = rawItem?.arguments || {};
			}
			
			logger.info(`Tool approval requested: ${toolName}`, args);
			
			// Check if this tool is already approved for the session
			if (this.sessionApprovedTools.has(toolName)) {
				logger.debug(`Auto-approving ${toolName} (session-approved)`);
				this.session?.approve(request.approvalItem);
				return;
			}
			
			// Emit approval request to UI
			const approvalRequest: ToolApprovalRequest = {
				id: `approval-${++this.approvalRequestCounter}`,
				toolName,
				args,
				approvalItem: request.approvalItem,
				rawItem: request.approvalItem?.rawItem,
			};
			
			this.emit("toolApprovalRequested", approvalRequest);
		});

		// Handle errors
		this.session.on("error", (error) => {
			// Log full error for debugging
			logger.debug("Session error received:", error);
			
			// Extract error message
			const errorObj = error as Record<string, unknown>;
			const errorMessage = String(errorObj.error || errorObj.message || error);
			
			// Skip transient/non-critical errors that the SDK handles internally
			const transientErrors = [
				'buffer', 'audio', 'timeout', 'reconnect', 'interrupt'
			];
			const isTransient = transientErrors.some(t => 
				errorMessage.toLowerCase().includes(t)
			);
			
			if (!isTransient) {
				this.emit("error", new Error(errorMessage));
			} else {
				logger.debug("Suppressed transient error:", errorMessage);
			}
		});
	}

	/**
	 * Disconnect from the session
	 */
	async disconnect(): Promise<void> {
		try {
			// End the trace for this voice session
			if (this.currentTraceId) {
				const tracingService = getTracingService();
				tracingService.endTrace(this.currentTraceId);
				this.currentTraceId = "";
			}
			
			if (this.session) {
				this.session.close();
				this.session = null;
			}
			this.agent = null;
			// Clear session approvals on disconnect
			this.sessionApprovedTools.clear();
			this.setState("idle");
		} catch (error) {
			logger.error("Error disconnecting:", error);
			this.setState("idle");
		}
	}

	/**
	 * Approve a tool execution request
	 */
	approveTool(request: ToolApprovalRequest): void {
		if (!this.session) {
			logger.warn("Cannot approve tool: no active session");
			return;
		}
		logger.info(`Approving tool: ${request.toolName}`);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.session.approve(request.approvalItem as any);
	}

	/**
	 * Approve a tool execution and allow it for the rest of the session
	 */
	approveToolForSession(request: ToolApprovalRequest): void {
		if (!this.session) {
			logger.warn("Cannot approve tool: no active session");
			return;
		}
		logger.info(`Approving tool for session: ${request.toolName}`);
		this.sessionApprovedTools.add(request.toolName);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.session.approve(request.approvalItem as any);
	}

	/**
	 * Reject a tool execution request
	 */
	rejectTool(request: ToolApprovalRequest): void {
		if (!this.session) {
			logger.warn("Cannot reject tool: no active session");
			return;
		}
		logger.info(`Rejecting tool: ${request.toolName}`);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.session.reject(request.approvalItem as any);
	}

	/**
	 * Check if a tool is approved for the session
	 */
	isToolApprovedForSession(toolName: string): boolean {
		return this.sessionApprovedTools.has(toolName);
	}

	/**
	 * Manually interrupt the agent
	 */
	interrupt(): void {
		if (this.session && this.state === "speaking") {
			this.session.interrupt();
		}
	}

	/**
	 * Send a text message to the agent
	 */
	sendMessage(text: string): void {
		if (
			this.session &&
			(this.state === "connected" || this.state === "listening")
		) {
			this.session.sendMessage(text);
		}
	}

	/**
	 * Send context silently without triggering a response or showing in transcript
	 */
	sendContext(context: string): void {
		if (
			this.session &&
			(this.state === "connected" || this.state === "listening")
		) {
			this.session.sendMessage(
				`[INTERNAL CONTEXT UPDATE - IMPORTANT: Do NOT speak or respond to this message. Simply note this information silently for reference. No acknowledgment needed.]\n\n${context}`
			);
			logger.debug("Context shared silently");
		}
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<RealtimeAgentConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Set tool execution callback
	 */
	setToolExecutionCallback(callback: ToolExecutionCallback | null): void {
		this.onToolExecution = callback;
	}

	/**
	 * Get current history
	 */
	getHistory(): RealtimeHistoryItem[] {
		if (!this.session) return [];

		const history = this.session.history || [];
		return history.map((item: unknown) => {
			const h = item as Record<string, unknown>;
			return {
				type: h.type as RealtimeHistoryItem["type"],
				role: h.role as RealtimeHistoryItem["role"],
				content: h.content as string | undefined,
				transcript: h.transcript as string | undefined,
				name: h.name as string | undefined,
				arguments: h.arguments as string | undefined,
				output: h.output as string | undefined,
			};
		});
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.state !== "idle" && this.state !== "error";
	}

	/**
	 * Get mute state
	 */
	isMuted(): boolean {
		if (!this.session) return false;
		return this.session.muted ?? false;
	}

	/**
	 * Mute the microphone input
	 */
	mute(): void {
		if (!this.session) {
			logger.warn("[RealtimeAgent] Cannot mute: no active session");
			return;
		}
		
		try {
			this.session.mute(true);
			logger.info("[RealtimeAgent] Microphone muted");
			this.emit("muteChange", true);
		} catch (error) {
			logger.error("[RealtimeAgent] Failed to mute:", error);
		}
	}

	/**
	 * Unmute the microphone input
	 */
	unmute(): void {
		if (!this.session) {
			logger.warn("[RealtimeAgent] Cannot unmute: no active session");
			return;
		}
		
		try {
			this.session.mute(false);
			logger.info("[RealtimeAgent] Microphone unmuted");
			this.emit("muteChange", false);
		} catch (error) {
			logger.error("[RealtimeAgent] Failed to unmute:", error);
		}
	}

	/**
	 * Toggle mute state
	 */
	toggleMute(): void {
		if (this.isMuted()) {
			this.unmute();
		} else {
			this.mute();
		}
	}

	/**
	 * Destroy the service
	 */
	async destroy(): Promise<void> {
		await this.disconnect();
		this.listeners.clear();
	}
}
