/**
 * @module WebTools
 * @description Web-related tools for the Realtime Agent.
 *
 * Uses shared VaultOperations for the actual implementation and
 * centralized ToolDefinitions for consistent naming and descriptions.
 * 
 * @see {@link ToolDefinitions} for centralized tool metadata
 * @see {@link VaultOperations} for web operations implementation
 * 
 * @since 0.0.14
 */

import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import type { ToolExecutionCallback, RealtimeToolName } from "../types";
import * as VaultOps from "../../tools/VaultOperations";
import { TOOL_NAMES, TOOL_DESCRIPTIONS, PARAM_DESCRIPTIONS } from "../../tools/ToolDefinitions";

/**
 * Create web access tools for the realtime agent.
 * 
 * @param onToolExecution - Callback for tool execution
 * @param requiresApproval - Set of tool names that require user approval
 * @returns Array of web tool instances
 * 
 * @example
 * ```typescript
 * const webTools = createWebTools(
 *   (name, args, result) => console.log(`${name} executed`),
 *   new Set()
 * );
 * ```
 */
export function createWebTools(
	onToolExecution: ToolExecutionCallback | null,
	requiresApproval: Set<RealtimeToolName> = new Set()
): ReturnType<typeof tool>[] {
	const tools: ReturnType<typeof tool>[] = [];

	// Fetch web page tool
	tools.push(
		tool({
			name: TOOL_NAMES.FETCH_WEB_PAGE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.FETCH_WEB_PAGE],
			parameters: z.object({
				url: z.string().describe(PARAM_DESCRIPTIONS.url),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.FETCH_WEB_PAGE),
			execute: async ({ url }) => {
				const result = await VaultOps.fetchWebPage(url);
				if (result.success) {
					onToolExecution?.(
						TOOL_NAMES.FETCH_WEB_PAGE,
						{ url },
						{ title: result.title, length: result.content?.length || 0 }
					);
				}
				return JSON.stringify(result);
			},
		})
	);

	// Web search tool - performs a search query using DuckDuckGo
	tools.push(
		tool({
			name: TOOL_NAMES.WEB_SEARCH,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.WEB_SEARCH],
			parameters: z.object({
				query: z.string().describe(PARAM_DESCRIPTIONS.query),
				limit: z
					.number()
					.optional()
					.describe(PARAM_DESCRIPTIONS.limit),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.WEB_SEARCH),
			execute: async ({ query, limit = 5 }) => {
				const result = await VaultOps.webSearch(query, limit);
				onToolExecution?.(
					TOOL_NAMES.WEB_SEARCH,
					{ query, limit },
					{ resultCount: result.results.length }
				);
				return JSON.stringify({
					...result,
					resultCount: result.results.length,
				});
			},
		})
	);

	return tools;
}
