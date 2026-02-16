/**
 * @module OutputTools
 * @description Output tools for the Realtime Agent.
 * 
 * These tools allow the voice agent to output content to the ChatView,
 * which is useful for displaying structured data, tables, lists, etc.
 * that are better read than spoken.
 * 
 * @see {@link ToolDefinitions} for centralized tool metadata
 * 
 * @since 0.0.14
 */

import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import type { ChatOutputCallback, RealtimeToolName } from "../types";
import { TOOL_NAMES, TOOL_DESCRIPTIONS, PARAM_DESCRIPTIONS } from "../../tools/ToolDefinitions";

/**
 * Create output tools for the realtime agent.
 * 
 * @param onChatOutput - Callback for outputting content to the ChatView
 * @param sourceAgent - Name of the agent creating the tools (for attribution)
 * @param requiresApproval - Set of tool names that require user approval
 * @returns Array of output tool instances
 * 
 * @example
 * ```typescript
 * const outputTools = createOutputTools(
 *   (content, agent) => view.addMessage(content, agent),
 *   'VaultAssistant',
 *   new Set()
 * );
 * ```
 */
export function createOutputTools(
	onChatOutput: ChatOutputCallback | null,
	sourceAgent: string,
	requiresApproval: Set<RealtimeToolName> = new Set()
): ReturnType<typeof tool>[] {
	const tools: ReturnType<typeof tool>[] = [];

	// Send to chat tool - outputs formatted content to the ChatView
	tools.push(
		tool({
			name: TOOL_NAMES.SEND_TO_CHAT,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.SEND_TO_CHAT],
			parameters: z.object({
				content: z
					.string()
					.describe(PARAM_DESCRIPTIONS.content),
				title: z
					.string()
					.optional()
					.describe(PARAM_DESCRIPTIONS.title),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.SEND_TO_CHAT),
			execute: async ({ content, title }) => {
				if (!onChatOutput) {
					return JSON.stringify({
						success: false,
						error: "Chat output not available",
					});
				}

				// Format content with optional title
				const formattedContent = title 
					? `## ${title}\n\n${content}`
					: content;

				// Send to chat via callback
				onChatOutput(formattedContent, sourceAgent);

				return JSON.stringify({
					success: true,
					message: "Content displayed in chat",
					contentLength: formattedContent.length,
				});
			},
		})
	);

	return tools;
}
