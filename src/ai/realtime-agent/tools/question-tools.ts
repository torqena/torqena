/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module QuestionTools
 * @description Question tools for the Realtime Agent.
 * 
 * These tools allow the voice agent to ask questions to the user and receive
 * their responses, enabling interactive workflows that require user input
 * or clarification.
 * 
 * ## Supported Question Types
 * 
 * - **text**: Simple text input from the user
 * - **multipleChoice**: User selects one or more options
 * - **radio**: User selects exactly one option
 * - **mixed**: Options + optional text input
 * 
 * @example Text Question
 * ```typescript
 * const tools = createQuestionTools(
 *   async (question) => {
 *     // Show question UI and return response
 *     return { type: 'text', text: 'My answer' };
 *   },
 *   'VaultAssistant',
 *   new Set()
 * );
 * ```
 * 
 * @see {@link ToolDefinitions} for centralized tool metadata
 * @see {@link QuestionRequest} for question structure
 * @see {@link QuestionResponse} for response structure
 * 
 * @since 0.0.17
 */

import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import type { QuestionRequest, QuestionResponse } from "../../../types/questions";
import type { RealtimeToolName } from "../types";
import { TOOL_NAMES, TOOL_DESCRIPTIONS } from "../../tools/ToolDefinitions";

/**
 * Callback type for handling question requests from the agent
 */
export type QuestionCallback = (question: QuestionRequest) => Promise<QuestionResponse | null>;

/**
 * Create question tools for the realtime agent.
 * 
 * @param onQuestion - Callback for handling question requests
 * @param sourceAgent - Name of the agent creating the tools (for attribution)
 * @param requiresApproval - Set of tool names that require user approval
 * @returns Array of question tool instances
 * 
 * @example
 * ```typescript
 * const questionTools = createQuestionTools(
 *   async (question) => {
 *     return await showQuestionModal(question);
 *   },
 *   'VaultAssistant',
 *   new Set()
 * );
 * ```
 */
export function createQuestionTools(
	onQuestion: QuestionCallback | null,
	sourceAgent: string,
	requiresApproval: Set<RealtimeToolName> = new Set()
): ReturnType<typeof tool>[] {
	const tools: ReturnType<typeof tool>[] = [];

	// Ask question tool - presents questions to the user
	tools.push(
		tool({
			name: TOOL_NAMES.ASK_QUESTION,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.ASK_QUESTION],
			parameters: z.object({
				type: z
					.enum(["text", "multipleChoice", "radio", "mixed"])
					.describe(
						"Type of question: 'text' for text input, 'multipleChoice' for selecting options, 'radio' for single selection, 'mixed' for options + text input"
					),
				question: z
					.string()
					.describe("The question to ask the user"),
				context: z
					.string()
					.optional()
					.describe("Optional additional context or explanation for the question"),
				options: z
					.array(z.string())
					.optional()
					.describe("Available options (required for multipleChoice, radio, or mixed types)"),
				allowMultiple: z
					.boolean()
					.optional()
					.describe("Allow selecting multiple options (for multipleChoice or mixed, default: false)"),
				placeholder: z
					.string()
					.optional()
					.describe("Placeholder text for text input (for text or mixed types)"),
				textLabel: z
					.string()
					.optional()
					.describe("Label for the text input field (for mixed type)"),
				defaultValue: z
					.string()
					.optional()
					.describe("Default text value (for text type)"),
				defaultSelected: z
					.array(z.string())
					.optional()
					.describe("Pre-selected options (for multipleChoice, radio, or mixed types)"),
				multiline: z
					.boolean()
					.optional()
					.describe("Use a multiline textarea for text input (default: false)"),
				required: z
					.boolean()
					.optional()
					.describe("Whether this question is required (default: true)"),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.ASK_QUESTION),
			execute: async ({
				type,
				question,
				context,
				options,
				allowMultiple,
				placeholder,
				textLabel,
				defaultValue,
				defaultSelected,
				multiline,
				required,
			}) => {
				if (!onQuestion) {
					return JSON.stringify({
						success: false,
						error: "Question handler not available",
					});
				}

				// Generate unique ID for this question
				const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

				// Build question request based on type
				const questionRequest: QuestionRequest = {
					id,
					type,
					question,
					context,
					required: required !== false, // default to true
				} as QuestionRequest;

				// Add type-specific properties
				if (type === "text") {
					(questionRequest as any).placeholder = placeholder;
					(questionRequest as any).defaultValue = defaultValue;
					(questionRequest as any).multiline = multiline || false;
				} else if (type === "multipleChoice") {
					if (!options || options.length === 0) {
						return JSON.stringify({
							success: false,
							error: "multipleChoice type requires options array",
						});
					}
					(questionRequest as any).options = options;
					(questionRequest as any).allowMultiple = allowMultiple || false;
					(questionRequest as any).defaultSelected = defaultSelected;
				} else if (type === "radio") {
					if (!options || options.length === 0) {
						return JSON.stringify({
							success: false,
							error: "radio type requires options array",
						});
					}
					(questionRequest as any).options = options;
					(questionRequest as any).defaultSelected = defaultSelected?.[0];
				} else if (type === "mixed") {
					if (!options || options.length === 0) {
						return JSON.stringify({
							success: false,
							error: "mixed type requires options array",
						});
					}
					(questionRequest as any).options = options;
					(questionRequest as any).allowMultiple = allowMultiple || false;
					(questionRequest as any).defaultSelected = defaultSelected;
					(questionRequest as any).textPlaceholder = placeholder;
					(questionRequest as any).textLabel = textLabel;
				}

				try {
					// Ask the question and wait for response
					const response = await onQuestion(questionRequest);

					if (!response) {
						return JSON.stringify({
							success: false,
							cancelled: true,
							message: "User cancelled the question",
						});
					}

					// Format response based on type
					let formattedResponse: string;
					if (response.type === "text") {
						formattedResponse = response.text;
					} else if (response.type === "multipleChoice" || response.type === "radio") {
						formattedResponse = response.selected.join(", ");
					} else if (response.type === "mixed") {
						const parts = [];
						if (response.selected.length > 0) {
							parts.push(`Selected: ${response.selected.join(", ")}`);
						}
						if (response.text) {
							parts.push(`Additional input: ${response.text}`);
						}
						formattedResponse = parts.join("; ");
					} else {
						formattedResponse = JSON.stringify(response);
					}

					return JSON.stringify({
						success: true,
						question: question,
						response: formattedResponse,
						responseData: response,
					});
				} catch (error) {
					return JSON.stringify({
						success: false,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			},
		})
	);

	return tools;
}
