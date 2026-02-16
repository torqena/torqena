/**
 * MCP (Model Context Protocol) tools integration for the Realtime Agent
 *
 * Uses shared McpOperations for the actual implementation.
 */

import { tool } from "@openai/agents/realtime";
import type { McpManager } from "../../mcp/McpManager";
import type { ToolExecutionCallback } from "../types";
import { logger } from "../types";
import * as McpOps from "../../mcp/McpOperations";

/**
 * Create MCP tools from connected MCP servers
 * @param mcpManager - MCP Manager instance
 * @param onToolExecution - Callback for tool execution
 * @param requiresApproval - Whether MCP tools require approval (default: true for security)
 */
export function createMcpTools(
	mcpManager: McpManager | undefined,
	onToolExecution: ToolExecutionCallback | null,
	requiresApproval: boolean = false
): ReturnType<typeof tool>[] {
	if (!mcpManager) return [];

	const mcpToolDefs = McpOps.getMcpToolDefinitions(mcpManager);
	const tools: ReturnType<typeof tool>[] = [];

	for (const def of mcpToolDefs) {
		try {
			const inputSchema = def.parameters as Record<string, unknown>;
			const zodSchema = McpOps.jsonSchemaToZodObject(inputSchema);

			const serverId = def.serverId;
			const originalToolName = McpOps.extractOriginalToolName(def.name);

			const mcpTool = tool({
				name: def.name,
				description: def.description,
				parameters: zodSchema,
				needsApproval: requiresApproval,
				execute: async (args) => {
					const result = await McpOps.callMcpTool(
						mcpManager,
						serverId,
						originalToolName,
						args as Record<string, unknown>
					);
					onToolExecution?.(def.name, args, result.data ?? result);
					return McpOps.formatMcpToolResult(result);
				},
			});

			tools.push(mcpTool);
			logger.debug(`Added MCP tool: ${def.name}`);
		} catch (error) {
			logger.warn(
				`Failed to create MCP tool ${def.name}:`,
				error
			);
		}
	}

	return tools;
}
