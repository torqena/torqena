/**
 * @module voice-chat
 * @description Voice chat and transcription services for Vault Copilot.
 * 
 * This module provides:
 * - **Whisper transcription** - Multiple backends (local, OpenAI, Azure)
 * - **Voice chat service** - Recording and transcription coordination
 * - **Voice agents** - Re-exports from realtime-agent, task-agent, note-agent, workiq-agent
 * 
 * @since 0.0.14
 */

// Whisper transcription services
export * from './whisper';

// Voice chat service
export { VoiceChatService, type VoiceChatServiceConfig, type VoiceBackend } from './VoiceChatService';

// Re-export from refactored realtime-agent module
// Primary voice agents
export {
	BaseVoiceAgent,
	MainVaultAssistant,
	MAIN_ASSISTANT_DEFINITION_FILE,
	// Voice agent registry
	VoiceAgentRegistry,
	getVoiceAgentRegistry,
	type VoiceAgentFactory,
	type VoiceAgentRegistration,
	type VoiceAgentRegistryEvents,
	// Types
	type BaseVoiceAgentConfig,
	type MainVaultAssistantConfig,
	type RealtimeAgentConfig,
	type RealtimeAgentState,
	type RealtimeAgentEvents,
	type RealtimeHistoryItem,
	type RealtimeVoice,
	type TurnDetectionMode,
	type RealtimeToolConfig,
	type RealtimeToolName,
	type ToolExecutionCallback,
	type ToolApprovalRequest,
	DEFAULT_TOOL_CONFIG,
} from '../realtime-agent';

// Re-export all agents from agents subfolder
export {
	TaskManagementAgent,
	TASK_AGENT_ID,
	TASK_AGENT_DEFINITION_FILE,
	type TaskManagementAgentConfig,
	NoteManagementAgent,
	NOTE_AGENT_ID,
	NOTE_AGENT_DEFINITION_FILE,
	type NoteManagementAgentConfig,
	WorkIQAgent,
	WORKIQ_AGENT_ID,
	WORKIQ_AGENT_DEFINITION_FILE,
	type WorkIQAgentConfig,
} from '../realtime-agent/agents';

export type {
	RecordingState,
	TranscriptionSegment,
	TranscriptionResult,
	TranscriptionSegmentCallback,
	IVoiceChatService,
	VoiceChatEvents,
} from './types';
