/**
 * Type definitions for the Task Management Agent
 */

import type { RealtimeVoice, TurnDetectionMode, RealtimeToolConfig } from "../../types";
import type { McpManager } from "../../../mcp/McpManager";

/**
 * Configuration for TaskManagementAgent
 */
export interface TaskManagementAgentConfig {
	/** OpenAI API key */
	apiKey: string;
	/** Voice to use for responses */
	voice?: RealtimeVoice;
	/** Turn detection mode */
	turnDetection?: TurnDetectionMode;
	/** Language for speech recognition */
	language?: string;
	/** Tool configuration */
	toolConfig?: RealtimeToolConfig;
	/** Optional MCP Manager */
	mcpManager?: McpManager;
}
