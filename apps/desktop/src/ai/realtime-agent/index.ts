/**
 * @module realtime-agent
 * @description Realtime Agent Service - OpenAI Realtime Voice Agent integration
 * 
 * This module provides real-time voice conversation capabilities using OpenAI's Realtime API
 * with support for tools, interruptions, and live transcription.
 * 
 * ## Submodules
 * - **tools/** - Tool factories (vault, task, web, output, mcp)
 * - **agents/** - Specialist voice agents (task, note, workiq)
 * 
 * ## Primary Exports
 * - MainVaultAssistant: Entry point voice agent with handoff support
 * - BaseVoiceAgent: Abstract base class for custom voice agents
 * - VoiceAgentRegistry: Central registry for voice agent discovery and registration
 * 
 * @since 0.0.14
 */

// Primary voice agents
export { BaseVoiceAgent } from "./BaseVoiceAgent";
export { MainVaultAssistant, MAIN_ASSISTANT_DEFINITION_FILE } from "./MainVaultAssistant";

// Voice agent registry for third-party agent registration
export {
	VoiceAgentRegistry,
	getVoiceAgentRegistry,
	type VoiceAgentFactory,
	type VoiceAgentRegistration,
	type VoiceAgentRegistryEvents,
} from "./VoiceAgentRegistry";

export {
	// Types
	type RealtimeVoice,
	type TurnDetectionMode,
	type RealtimeAgentState,
	type RealtimeToolName,
	type RealtimeToolConfig,
	type BaseVoiceAgentConfig,
	type MainVaultAssistantConfig,
	type RealtimeAgentConfig,
	type RealtimeHistoryItem,
	type RealtimeAgentEvents,
	type ToolExecutionCallback,
	type ToolApprovalRequest,
	type ChatOutputCallback,
	type LogLevel,
	// Constants
	DEFAULT_TOOL_CONFIG,
	VAULT_READ_TOOLS,
	VAULT_WRITE_TOOLS,
	WEB_TOOLS,
	TASK_TOOLS,
	OUTPUT_TOOLS,
	REALTIME_MODEL,
	// Logger utilities
	logger,
	setLogLevel,
	getLogLevel,
} from "./types";

// Re-export all tools from tools subfolder
export * from "./tools";

// Re-export all specialist agents from agents subfolder
export * from "./agents";
