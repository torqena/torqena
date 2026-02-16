/**
 * @module copilot
 * @description Torqena core module exports.
 * 
 * This is the main entry point for the copilot module, providing re-exports
 * from all submodules for backward compatibility and convenience.
 * 
 * ## Submodules
 * 
 * - **providers/** - AI Provider implementations (OpenAI, Azure, GitHub Copilot)
 * - **mcp/** - Model Context Protocol client and server integration
 * - **tools/** - Tool definitions and vault/task operations
 * - **customization/** - User prompt, skill, and agent customizations
 * - **realtime-agent/** - Voice agents and realtime API integration
 * - **voice-chat/** - Voice chat and whisper transcription services
 * 
 * ## Direct Imports (Recommended)
 * 
 * For better tree-shaking and clarity, import directly from submodules:
 * 
 * ```typescript
 * import { AIProvider } from "../ai/providers";
 * import { McpManager } from "../ai/mcp";
 * import { TOOL_NAMES, VaultOperations } from "../ai/tools";
 * import { CustomizationLoader } from "../ai/customization";
 * import { MainVaultAssistant } from "../ai/realtime-agent";
 * import { VoiceChatService } from "../ai/voice-chat";
 * ```
 * 
 * ## Legacy Imports (Backward Compatible)
 * 
 * The following legacy import patterns still work:
 * 
 * ```typescript
 * import { AIProvider } from "./copilot";
 * import type { McpManager } from "./copilot";
 * ```
 * 
 * @since 0.0.14
 */

// Re-export all submodules for backward compatibility
export * from "./providers";
export * from "./mcp";
export * from "./tools";
// Exclude McpServerConfig from customization that conflicts with mcp
export { 
	AgentCache, 
	CustomizationLoader,
	PromptCache,
	SkillRegistry,
	getSkillRegistry,
	resetSkillRegistry,
} from "./customization";
export type {
	CachedAgentInfo,
	VoiceAgentDefinition,
	CachedPromptInfo,
	SkillParameterSchema,
	SkillResult,
	VaultCopilotSkill,
	SkillInfo,
	SkillRegistryEvent,
	// McpServerConfig excluded - use the one from ./mcp
} from "./customization";

// Re-export standalone files
export * from "./TracingService";
// WhisperCppManager moved to voice-chat module
// pathUtils moved to utils module
