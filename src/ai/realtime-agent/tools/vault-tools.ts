// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module VaultTools
 * @description Vault-related tools for the Realtime Agent.
 *
 * Uses shared VaultOperations for the actual implementation and
 * centralized ToolDefinitions for consistent naming and descriptions.
 * 
 * @see {@link ToolDefinitions} for centralized tool metadata
 * @see {@link VaultOperations} for vault operations implementation
 * 
 * @since 0.0.14
 */

import { App } from "obsidian";
import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import type { ToolExecutionCallback, RealtimeToolName } from "../types";
import * as VaultOps from "../../tools/VaultOperations";
import { TOOL_NAMES, TOOL_DESCRIPTIONS, PARAM_DESCRIPTIONS } from "../../tools/ToolDefinitions";
import type { PeriodicNotesSettings } from "../../../ui/settings";

/**
 * Create vault read/write tools for the realtime agent
 * @param app - Obsidian App instance
 * @param onToolExecution - Callback for tool execution
 * @param requiresApproval - Set of tool names that require user approval
 * @param periodicNotesSettings - Optional periodic notes settings for weekly/monthly/quarterly/yearly notes
 */
export function createVaultTools(
	app: App,
	onToolExecution: ToolExecutionCallback | null,
	requiresApproval: Set<RealtimeToolName> = new Set(),
	periodicNotesSettings?: PeriodicNotesSettings
): ReturnType<typeof tool>[] {
	const tools: ReturnType<typeof tool>[] = [];

	// Read note tool
	tools.push(
		tool({
			name: TOOL_NAMES.READ_NOTE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.READ_NOTE],
			parameters: z.object({
				path: z
					.string()
					.describe(PARAM_DESCRIPTIONS.path),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.READ_NOTE),
			execute: async ({ path }) => {
				const result = await VaultOps.readNote(app, path);
				onToolExecution?.(TOOL_NAMES.READ_NOTE, { path }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Search notes tool
	tools.push(
		tool({
			name: TOOL_NAMES.SEARCH_NOTES,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.SEARCH_NOTES],
			parameters: z.object({
				query: z
					.string()
					.describe(PARAM_DESCRIPTIONS.query),
				limit: z
					.number()
					.optional()
					.describe(PARAM_DESCRIPTIONS.limit),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.SEARCH_NOTES),
			execute: async ({ query, limit = 5 }) => {
				const result = await VaultOps.searchNotes(app, query, limit);
				onToolExecution?.(TOOL_NAMES.SEARCH_NOTES, { query, limit }, { count: result.results.length });
				return JSON.stringify(result);
			},
		})
	);

	// Get active note tool
	tools.push(
		tool({
			name: TOOL_NAMES.GET_ACTIVE_NOTE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_ACTIVE_NOTE],
			parameters: z.object({}),
			needsApproval: requiresApproval.has(TOOL_NAMES.GET_ACTIVE_NOTE),
			execute: async () => {
				const result = await VaultOps.getActiveNote(app);
				onToolExecution?.(TOOL_NAMES.GET_ACTIVE_NOTE, {}, { path: result.path });
				return JSON.stringify(result);
			},
		})
	);

	// List notes tool
	tools.push(
		tool({
			name: TOOL_NAMES.LIST_NOTES,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_NOTES],
			parameters: z.object({
				folder: z
					.string()
					.optional()
					.describe(PARAM_DESCRIPTIONS.folder),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.LIST_NOTES),
			execute: async ({ folder }) => {
				const result = await VaultOps.listNotes(app, folder);
				onToolExecution?.(TOOL_NAMES.LIST_NOTES, { folder }, { count: result.items.length });
				return JSON.stringify(result);
			},
		})
	);

	// List notes recursively tool
	tools.push(
		tool({
			name: TOOL_NAMES.LIST_NOTES_RECURSIVELY,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_NOTES_RECURSIVELY],
			parameters: z.object({
				folder: z
					.string()
					.optional()
					.describe(PARAM_DESCRIPTIONS.folderRecursive),
				limit: z
					.number()
					.optional()
					.describe(PARAM_DESCRIPTIONS.limit),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.LIST_NOTES_RECURSIVELY),
			execute: async ({ folder, limit = 200 }) => {
				const result = await VaultOps.listNotesRecursively(app, folder, limit);
				onToolExecution?.(TOOL_NAMES.LIST_NOTES_RECURSIVELY, { folder, limit }, { count: result.notes.length, total: result.total });
				return JSON.stringify(result);
			},
		})
	);

	// Open note tool - navigate to a specific note
	tools.push(
		tool({
			name: TOOL_NAMES.OPEN_NOTE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.OPEN_NOTE],
			parameters: z.object({
				path: z
					.string()
					.describe(PARAM_DESCRIPTIONS.path),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.OPEN_NOTE),
			execute: async ({ path }) => {
				const result = await VaultOps.openNote(app, path);
				onToolExecution?.(TOOL_NAMES.OPEN_NOTE, { path }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Open daily note tool - navigate to a daily note by date
	tools.push(
		tool({
			name: TOOL_NAMES.OPEN_DAILY_NOTE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.OPEN_DAILY_NOTE],
			parameters: z.object({
				date: z
					.string()
					.describe(PARAM_DESCRIPTIONS.date),
				createIfMissing: z
					.boolean()
					.optional()
					.describe(PARAM_DESCRIPTIONS.createIfMissing),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.OPEN_DAILY_NOTE),
			execute: async ({ date, createIfMissing = true }) => {
				const result = await VaultOps.openDailyNote(app, date, createIfMissing);
				onToolExecution?.(TOOL_NAMES.OPEN_DAILY_NOTE, { date, createIfMissing }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Open weekly note tool
	tools.push(
		tool({
			name: TOOL_NAMES.OPEN_WEEKLY_NOTE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.OPEN_WEEKLY_NOTE],
			parameters: z.object({
				period: z
					.string()
					.describe(PARAM_DESCRIPTIONS.period),
				createIfMissing: z
					.boolean()
					.optional()
					.describe(PARAM_DESCRIPTIONS.createIfMissing),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.OPEN_WEEKLY_NOTE),
			execute: async ({ period, createIfMissing = true }) => {
				const result = await VaultOps.openPeriodicNote(app, period, 'weekly', periodicNotesSettings, createIfMissing);
				onToolExecution?.(TOOL_NAMES.OPEN_WEEKLY_NOTE, { period, createIfMissing }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Open monthly note tool
	tools.push(
		tool({
			name: TOOL_NAMES.OPEN_MONTHLY_NOTE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.OPEN_MONTHLY_NOTE],
			parameters: z.object({
				period: z
					.string()
					.describe(PARAM_DESCRIPTIONS.period),
				createIfMissing: z
					.boolean()
					.optional()
					.describe(PARAM_DESCRIPTIONS.createIfMissing),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.OPEN_MONTHLY_NOTE),
			execute: async ({ period, createIfMissing = true }) => {
				const result = await VaultOps.openPeriodicNote(app, period, 'monthly', periodicNotesSettings, createIfMissing);
				onToolExecution?.(TOOL_NAMES.OPEN_MONTHLY_NOTE, { period, createIfMissing }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Open quarterly note tool
	tools.push(
		tool({
			name: TOOL_NAMES.OPEN_QUARTERLY_NOTE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.OPEN_QUARTERLY_NOTE],
			parameters: z.object({
				period: z
					.string()
					.describe(PARAM_DESCRIPTIONS.period),
				createIfMissing: z
					.boolean()
					.optional()
					.describe(PARAM_DESCRIPTIONS.createIfMissing),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.OPEN_QUARTERLY_NOTE),
			execute: async ({ period, createIfMissing = true }) => {
				const result = await VaultOps.openPeriodicNote(app, period, 'quarterly', periodicNotesSettings, createIfMissing);
				onToolExecution?.(TOOL_NAMES.OPEN_QUARTERLY_NOTE, { period, createIfMissing }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Open yearly note tool
	tools.push(
		tool({
			name: TOOL_NAMES.OPEN_YEARLY_NOTE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.OPEN_YEARLY_NOTE],
			parameters: z.object({
				period: z
					.string()
					.describe(PARAM_DESCRIPTIONS.period),
				createIfMissing: z
					.boolean()
					.optional()
					.describe(PARAM_DESCRIPTIONS.createIfMissing),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.OPEN_YEARLY_NOTE),
			execute: async ({ period, createIfMissing = true }) => {
				const result = await VaultOps.openPeriodicNote(app, period, 'yearly', periodicNotesSettings, createIfMissing);
				onToolExecution?.(TOOL_NAMES.OPEN_YEARLY_NOTE, { period, createIfMissing }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Create note tool
	tools.push(
		tool({
			name: TOOL_NAMES.CREATE_NOTE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.CREATE_NOTE],
			parameters: z.object({
				path: z
					.string()
					.describe(PARAM_DESCRIPTIONS.pathCreate),
				content: z
					.string()
					.describe(PARAM_DESCRIPTIONS.content),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.CREATE_NOTE),
			execute: async ({ path, content }) => {
				const result = await VaultOps.createNote(app, path, content);
				onToolExecution?.(TOOL_NAMES.CREATE_NOTE, { path }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Append to note tool
	tools.push(
		tool({
			name: TOOL_NAMES.APPEND_TO_NOTE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.APPEND_TO_NOTE],
			parameters: z.object({
				path: z
					.string()
					.describe(PARAM_DESCRIPTIONS.path),
				content: z.string().describe(PARAM_DESCRIPTIONS.contentAppend),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.APPEND_TO_NOTE),
			execute: async ({ path, content }) => {
				const result = await VaultOps.appendToNote(app, path, content);
				onToolExecution?.(TOOL_NAMES.APPEND_TO_NOTE, { path }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Update note tool - find and replace text in a note
	tools.push(
		tool({
			name: TOOL_NAMES.UPDATE_NOTE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.UPDATE_NOTE],
			parameters: z.object({
				path: z
					.string()
					.describe(PARAM_DESCRIPTIONS.path),
				find: z.string().describe(PARAM_DESCRIPTIONS.find),
				replace: z.string().describe(PARAM_DESCRIPTIONS.replace),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.UPDATE_NOTE),
			execute: async ({ path, find, replace }) => {
				const result = await VaultOps.findAndReplaceInNote(app, path, find, replace);
				onToolExecution?.(TOOL_NAMES.UPDATE_NOTE, { path, find, replace }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Replace note content tool - replaces entire note content
	tools.push(
		tool({
			name: TOOL_NAMES.REPLACE_NOTE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.REPLACE_NOTE],
			parameters: z.object({
				path: z
					.string()
					.describe(PARAM_DESCRIPTIONS.path),
				content: z
					.string()
					.describe(PARAM_DESCRIPTIONS.content),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.REPLACE_NOTE),
			execute: async ({ path, content }) => {
				const result = await VaultOps.updateNote(app, path, content);
				onToolExecution?.(TOOL_NAMES.REPLACE_NOTE, { path }, result);
				return JSON.stringify(result);
			},
		})
	);

	// Mark tasks complete tool - specifically for marking checkbox tasks as done
	// DEPRECATED: Use mark_tasks from task-tools.ts instead, which supports bidirectional marking
	tools.push(
		tool({
			name: TOOL_NAMES.MARK_TASKS_COMPLETE,
			description: TOOL_DESCRIPTIONS[TOOL_NAMES.MARK_TASKS_COMPLETE],
			parameters: z.object({
				task_list: z
					.array(z.string())
					.describe(PARAM_DESCRIPTIONS.tasks),
				exceptions: z
					.array(z.string())
					.optional()
					.describe(PARAM_DESCRIPTIONS.exceptions),
			}),
			needsApproval: requiresApproval.has(TOOL_NAMES.MARK_TASKS_COMPLETE),
			execute: async ({ task_list, exceptions = [] }) => {
				const result = await VaultOps.markTasksComplete(app, task_list, exceptions);
				onToolExecution?.(TOOL_NAMES.MARK_TASKS_COMPLETE, { task_list, exceptions }, result);
				return JSON.stringify(result);
			},
		})
	);

	return tools;
}
