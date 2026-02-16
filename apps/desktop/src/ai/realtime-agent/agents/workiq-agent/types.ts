/**
 * Types for WorkIQAgent
 */

import type { BaseVoiceAgentConfig } from "../../types";

/**
 * Configuration for WorkIQAgent
 */
export interface WorkIQAgentConfig extends BaseVoiceAgentConfig {
	/** Pattern to match WorkIQ MCP tools (default: "mcp_workiq_" or "mcp_copilot_cli_workiq_") */
	mcpToolPattern?: string;
}
