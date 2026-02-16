// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module RealtimeAgentTypes
 * @description Type definitions for the Realtime Agent Service.
 *
 * Consolidates realtime voice, tool, and connection state types used across the
 * realtime agent implementation.
 *
 * @since 0.0.14
 */

import { getTracingService } from "../TracingService";

/** Default model for OpenAI Realtime API */
export const REALTIME_MODEL = "gpt-4o-realtime-preview" as const;

/** Log levels for debug logging */
export type LogLevel = "debug" | "info" | "warn" | "error" | "none";

/** Available voice options for OpenAI Realtime */
export type RealtimeVoice =
	| "alloy"
	| "ash"
	| "ballad"
	| "coral"
	| "echo"
	| "fable"
	| "onyx"
	| "nova"
	| "sage"
	| "shimmer"
	| "verse";

/** Turn detection modes */
export type TurnDetectionMode = "semantic_vad" | "server_vad";

/** Realtime agent state */
export type RealtimeAgentState =
	| "idle"
	| "connecting"
	| "connected"
	| "speaking"
	| "listening"
	| "processing"
	| "error";

/** Tool names that can be conditionally enabled/disabled */
export type RealtimeToolName =
	| "read_note"
	| "search_notes"
	| "get_active_note"
	| "list_notes"
	| "list_notes_recursively"
	| "open_note"
	| "open_daily_note"
	| "open_weekly_note"
	| "open_monthly_note"
	| "open_quarterly_note"
	| "open_yearly_note"
	| "create_note"
	| "append_to_note"
	| "update_note"
	| "replace_note"
	| "mark_tasks_complete" // deprecated, kept for backward compatibility
	| "get_tasks"
	| "mark_tasks"
	| "create_task"
	| "list_tasks"
	| "fetch_web_page"
	| "web_search"
	| "send_to_chat"
	| "ask_question";

/** Configuration for which tools are enabled */
export interface RealtimeToolConfig {
	/** Enable/disable specific tools. If not specified, tool is enabled by default */
	enabled?: Partial<Record<RealtimeToolName, boolean>>;
	/** Enable all vault read tools (read_note, search_notes, get_active_note, list_notes) */
	vaultRead?: boolean;
	/** Enable all vault write tools (create_note, append_to_note, update_note, replace_note, mark_tasks_complete) */
	vaultWrite?: boolean;
	/** Enable web tools (fetch_web_page, web_search) */
	webAccess?: boolean;
	/** Enable MCP tools */
	mcpTools?: boolean;
	/** Tools that require user approval before execution */
	requiresApproval?: RealtimeToolName[];
}

/** Default tool configuration - all enabled */
export const DEFAULT_TOOL_CONFIG: RealtimeToolConfig = {
	vaultRead: true,
	vaultWrite: true,
	webAccess: true,
	mcpTools: true,
};

/** Base configuration shared by all voice agents */
export interface BaseVoiceAgentConfig {
	/** OpenAI API key */
	apiKey: string;
	/** Voice to use for responses */
	voice?: RealtimeVoice;
	/** Turn detection mode */
	turnDetection?: TurnDetectionMode;
	/** Language for speech recognition (e.g., 'en', 'es', 'fr'). Defaults to auto-detect. */
	language?: string;
	/** Tool configuration for conditional enabling */
	toolConfig?: RealtimeToolConfig;
	/** Optional MCP Manager for exposing MCP tools */
	mcpManager?: import("../mcp/McpManager").McpManager;
	/** Periodic notes settings for weekly/monthly/quarterly/yearly notes */
	periodicNotesSettings?: import("../../ui/settings").PeriodicNotesSettings;
	/** Preferred timezone (IANA identifier, e.g., 'America/New_York'). If empty, uses system default. */
	timezone?: string;
	/** First day of the week for calendar calculations */
	weekStartDay?: import("../../ui/settings").WeekStartDay;
}

/** Configuration for MainVaultAssistant (extends base config) */
export interface MainVaultAssistantConfig extends BaseVoiceAgentConfig {
	/** Directories to search for voice agent markdown files */
	voiceAgentDirectories?: string[];
	/** Per-agent definition file paths (takes precedence over directory scanning) */
	voiceAgentFiles?: {
		mainAssistant?: string;
		noteManager?: string;
		taskManager?: string;
		workiq?: string;
	};
	/** Instructions for the agent (optional, can be loaded from markdown) */
	instructions?: string;
}

/** @deprecated Use MainVaultAssistantConfig instead */
export interface RealtimeAgentConfig {
	/** OpenAI API key */
	apiKey: string;
	/** Voice to use for responses */
	voice?: RealtimeVoice;
	/** Turn detection mode */
	turnDetection?: TurnDetectionMode;
	/** Instructions for the agent */
	instructions?: string;
	/** Optional MCP Manager for exposing MCP tools */
	mcpManager?: import("../mcp/McpManager").McpManager;
	/** Tool configuration for conditional enabling */
	toolConfig?: RealtimeToolConfig;
	/** Language for speech recognition (e.g., 'en', 'es', 'fr'). Defaults to auto-detect. */
	language?: string;
}

/** History item from conversation */
export interface RealtimeHistoryItem {
	type: "message" | "function_call" | "function_call_output";
	role?: "user" | "assistant" | "system";
	content?: string;
	transcript?: string;
	name?: string;
	arguments?: string;
	output?: string;
	/** Name of the agent that produced this history item */
	agentName?: string;
}

/** Tool approval request from the agent */
export interface ToolApprovalRequest {
	/** Unique ID for this approval request */
	id: string;
	/** Name of the tool requesting approval */
	toolName: string;
	/** Arguments the tool will be called with */
	args: unknown;
	/** The raw approval item from the SDK (for approve/reject calls) */
	approvalItem: unknown;
	/** The raw item from the SDK (for reject calls) */
	rawItem: unknown;
}

/** Event types emitted by voice agents */
export interface RealtimeAgentEvents {
	stateChange: (state: RealtimeAgentState) => void;
	transcript: (item: RealtimeHistoryItem) => void;
	historyUpdated: (history: RealtimeHistoryItem[]) => void;
	user_transcription: (item: RealtimeHistoryItem) => void;
	toolExecution: (toolName: string, args: unknown, result: unknown, agentName: string) => void;
	toolApprovalRequested: (request: ToolApprovalRequest) => void;
	/** Emitted when a handoff occurs between agents */
	handoff: (sourceAgentName: string, targetAgentName: string) => void;
	/** Emitted when the agent wants to display content in the ChatView */
	chatOutput: (content: string, sourceAgent: string) => void;
	error: (error: Error) => void;
	interrupted: () => void;
	/** Emitted when the mute state changes */
	muteChange: (isMuted: boolean) => void;
}

/** Callback type for tool execution */
export type ToolExecutionCallback = (
	toolName: string,
	args: unknown,
	result: unknown
) => void;

/** Callback type for chat output - displays content in the ChatView */
export type ChatOutputCallback = (
	content: string,
	sourceAgent: string
) => void;

/** Callback type for question handling - asks user for input and returns response */
export type QuestionCallback = (
	question: import("../../types/questions").QuestionRequest
) => Promise<import("../../types/questions").QuestionResponse | null>;

/** Tool category definitions for tool enablement checking */
export const VAULT_READ_TOOLS: RealtimeToolName[] = [
	"read_note",
	"search_notes",
	"get_active_note",
	"list_notes",
	"list_notes_recursively",
	"open_note",
	"open_daily_note",
	"open_weekly_note",
	"open_monthly_note",
	"open_quarterly_note",
	"open_yearly_note",
];

export const VAULT_WRITE_TOOLS: RealtimeToolName[] = [
	"create_note",
	"append_to_note",
	"update_note",
	"replace_note",
	"mark_tasks_complete", // deprecated
	"mark_tasks",
	"create_task",
];

/** Task-specific tool names */
export const TASK_TOOLS: RealtimeToolName[] = [
	"get_tasks",
	"mark_tasks",
	"create_task",
	"list_tasks",
];

export const WEB_TOOLS: RealtimeToolName[] = ["fetch_web_page", "web_search"];

/** Output tools for displaying content in the ChatView */
export const OUTPUT_TOOLS: RealtimeToolName[] = ["send_to_chat", "ask_question"];

/** Logger configuration */
let currentLogLevel: LogLevel = "info";

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	none: 4,
};

/**
 * Set the log level for realtime agent logging
 */
export function setLogLevel(level: LogLevel): void {
	currentLogLevel = level;
}

/**
 * Get the current log level
 */
export function getLogLevel(): LogLevel {
	return currentLogLevel;
}

/**
 * Logger utility for realtime agent
 * 
 * Logs to console and also sends to TracingService for SDK log capture.
 * Messages typically already include agent names (e.g., "[Main Vault Assistant] ...")
 * so we don't add an additional prefix here.
 */
export const logger = {
	debug: (message: string, ...args: unknown[]): void => {
		if (LOG_LEVELS[currentLogLevel] <= LOG_LEVELS.debug) {
			console.log(message, ...args);
			// Send to TracingService as SDK log
			const fullMessage = args.length > 0 
				? `${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`
				: message;
			getTracingService().addSdkLog('debug', fullMessage, 'realtime-agent');
		}
	},
	info: (message: string, ...args: unknown[]): void => {
		if (LOG_LEVELS[currentLogLevel] <= LOG_LEVELS.info) {
			console.log(message, ...args);
			// Send to TracingService as SDK log
			const fullMessage = args.length > 0 
				? `${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`
				: message;
			getTracingService().addSdkLog('info', fullMessage, 'realtime-agent');
		}
	},
	warn: (message: string, ...args: unknown[]): void => {
		if (LOG_LEVELS[currentLogLevel] <= LOG_LEVELS.warn) {
			console.warn(message, ...args);
			// Send to TracingService as SDK log
			const fullMessage = args.length > 0 
				? `${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`
				: message;
			getTracingService().addSdkLog('warning', fullMessage, 'realtime-agent');
		}
	},
	error: (message: string, ...args: unknown[]): void => {
		if (LOG_LEVELS[currentLogLevel] <= LOG_LEVELS.error) {
			console.error(message, ...args);
			// Send to TracingService as SDK log
			const fullMessage = args.length > 0 
				? `${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`
				: message;
			getTracingService().addSdkLog('error', fullMessage, 'realtime-agent');
		}
	},
};
