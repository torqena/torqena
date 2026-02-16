/**
 * @module TaskTools
 * @description Realtime agent tool wrappers for task operations.
 * 
 * This module provides tool factory functions for creating task-related tools
 * using the OpenAI Realtime Agents SDK (`@openai/agents/realtime`).
 * 
 * ## Architecture
 * 
 * ```
 * TaskTools (this file)
 *      │
 *      ├── Uses: ToolDefinitions.ts → Tool names, descriptions
 *      ├── Uses: TaskOperations.ts  → Task parsing logic (re-exports)
 *      └── Uses: VaultOperations.ts → Vault read/write operations
 * ```
 * 
 * ## Available Tools
 * 
 * - `get_tasks` - Get all tasks with full metadata from a note
 * - `mark_tasks` - Mark tasks as complete or incomplete
 * - `create_task` - Create new tasks with Obsidian Tasks syntax
 * - `list_tasks` - Query and filter tasks with various criteria
 * 
 * @example Creating all task tools for realtime agent
 * ```typescript
 * import { createAllTaskTools } from './task-tools';
 * 
 * const tools = createAllTaskTools(
 *   app,
 *   (name, args, result) => console.log(`Tool ${name} executed`),
 *   new Set(['mark_tasks']) // require approval for mark_tasks
 * );
 * ```
 * 
 * @see {@link ToolDefinitions} for centralized tool metadata
 * @see {@link TaskOperations} for task parsing utilities
 * @see {@link VaultOperations} for vault operations
 * 
 * @since 0.0.14
 */

import { App } from "obsidian";
import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import type { ToolExecutionCallback, RealtimeToolName } from "../types";
import * as VaultOps from "../../tools/VaultOperations";
import { TOOL_NAMES, TOOL_DESCRIPTIONS, PARAM_DESCRIPTIONS } from "../../tools/ToolDefinitions";

// Re-export types from TaskOperations for backward compatibility
export {
	parseTaskLine,
	parseTasksFromContent,
	buildTaskLine,
	filterTasks,
	type ParsedTask,
	type TaskPriority,
	type TaskStatus,
	type TaskFilter,
	type TaskOperationResult,
	type CreateTaskOptions,
} from "../../tools/TaskOperations";

import type { TaskPriority } from "../../tools/TaskOperations";

// ============================================================================
// Tool Names Constant
// ============================================================================

/**
 * Task tool names for the realtime agent.
 * 
 * These correspond to the task-related entries in {@link TOOL_NAMES}.
 * 
 * @see {@link TOOL_NAMES} for the centralized tool name registry
 */
export const TASK_TOOL_NAMES = [
	TOOL_NAMES.GET_TASKS,
	TOOL_NAMES.MARK_TASKS,
	TOOL_NAMES.CREATE_TASK,
	TOOL_NAMES.LIST_TASKS,
] as const;

export type TaskToolName = (typeof TASK_TOOL_NAMES)[number];

// ============================================================================
// Tool Factory Functions
// ============================================================================

/**
 * Create the get_tasks tool for parsing all tasks with metadata.
 * 
 * Returns structured task data including priorities, dates, recurrence rules,
 * and tags for analysis or display.
 * 
 * @param app - Obsidian App instance for vault access
 * @param onToolExecution - Optional callback invoked after tool execution
 * @param needsApproval - Whether this tool requires user approval before execution
 * @returns Configured tool instance for the realtime agent
 * 
 * @example
 * ```typescript
 * const getTasks = createGetTasksTool(app, (name, args, result) => {
 *   console.log(`Found ${result.count} tasks`);
 * });
 * ```
 * 
 * @see {@link TOOL_NAMES.GET_TASKS} for the tool identifier
 * @see {@link VaultOps.getTasksFromNote} for the underlying implementation
 */
export function createGetTasksTool(
	app: App,
	onToolExecution: ToolExecutionCallback | null,
	needsApproval = false
): ReturnType<typeof tool> {
	return tool({
		name: TOOL_NAMES.GET_TASKS,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.GET_TASKS],
		parameters: z.object({
			path: z
				.string()
				.optional()
				.describe(PARAM_DESCRIPTIONS.pathOptional),
		}),
		needsApproval,
		execute: async ({ path }) => {
			const result = await VaultOps.getTasksFromNote(app, path);
			onToolExecution?.(TOOL_NAMES.GET_TASKS, { path }, {
				count: result.tasks?.length ?? 0,
				success: result.success,
			});
			return JSON.stringify(result);
		},
	});
}

/**
 * Create the mark_tasks tool for marking tasks complete or incomplete.
 * 
 * Supports batch operations to check/uncheck multiple tasks at once,
 * with optional exceptions for specific tasks.
 * 
 * @param app - Obsidian App instance for vault access
 * @param onToolExecution - Optional callback invoked after tool execution
 * @param needsApproval - Whether this tool requires user approval before execution
 * @returns Configured tool instance for the realtime agent
 * 
 * @example
 * ```typescript
 * const markTasks = createMarkTasksTool(app, null, true); // requires approval
 * ```
 * 
 * @see {@link TOOL_NAMES.MARK_TASKS} for the tool identifier
 * @see {@link VaultOps.updateTaskStatus} for the underlying implementation
 */
export function createMarkTasksTool(
	app: App,
	onToolExecution: ToolExecutionCallback | null,
	needsApproval = false
): ReturnType<typeof tool> {
	return tool({
		name: TOOL_NAMES.MARK_TASKS,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.MARK_TASKS],
		parameters: z.object({
			tasks: z
				.array(z.string())
				.describe(PARAM_DESCRIPTIONS.tasks),
			complete: z
				.boolean()
				.default(true)
				.describe(PARAM_DESCRIPTIONS.complete),
			exceptions: z
				.array(z.string())
				.optional()
				.describe(PARAM_DESCRIPTIONS.exceptions),
			path: z
				.string()
				.optional()
				.describe(PARAM_DESCRIPTIONS.pathOptional),
		}),
		needsApproval,
		execute: async ({ tasks, complete, exceptions = [], path }) => {
			const result = await VaultOps.updateTaskStatus(
				app,
				tasks,
				complete,
				exceptions,
				path
			);
			onToolExecution?.(TOOL_NAMES.MARK_TASKS, { tasks, complete, exceptions, path }, result);
			return JSON.stringify(result);
		},
	});
}

/**
 * Create the create_task tool for creating new tasks with full syntax support.
 * 
 * Supports the complete Obsidian Tasks emoji format including priorities,
 * multiple date types, recurrence rules, and tags.
 * 
 * @param app - Obsidian App instance for vault access
 * @param onToolExecution - Optional callback invoked after tool execution
 * @param needsApproval - Whether this tool requires user approval before execution
 * @returns Configured tool instance for the realtime agent
 * 
 * @example
 * ```typescript
 * const createTask = createCreateTaskTool(app, (name, args, result) => {
 *   if (result.success) {
 *     console.log(`Task created at line ${result.lineNumber}`);
 *   }
 * });
 * ```
 * 
 * @see {@link TOOL_NAMES.CREATE_TASK} for the tool identifier
 * @see {@link VaultOps.createTask} for the underlying implementation
 * @see {@link TaskOperations.buildTaskLine} for task line formatting
 */
export function createCreateTaskTool(
	app: App,
	onToolExecution: ToolExecutionCallback | null,
	needsApproval = false
): ReturnType<typeof tool> {
	return tool({
		name: TOOL_NAMES.CREATE_TASK,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.CREATE_TASK],
		parameters: z.object({
			path: z
				.string()
				.describe(PARAM_DESCRIPTIONS.path),
			description: z.string().describe(PARAM_DESCRIPTIONS.taskDescription),
			priority: z
				.enum(["highest", "high", "medium", "low", "lowest", "none"])
				.optional()
				.describe(PARAM_DESCRIPTIONS.priority),
			dueDate: z
				.string()
				.optional()
				.describe(PARAM_DESCRIPTIONS.dueDate),
			scheduledDate: z
				.string()
				.optional()
				.describe(PARAM_DESCRIPTIONS.scheduledDate),
			startDate: z
				.string()
				.optional()
				.describe(PARAM_DESCRIPTIONS.startDate),
			recurrence: z
				.string()
				.optional()
				.describe(PARAM_DESCRIPTIONS.recurrence),
			tags: z
				.array(z.string())
				.optional()
				.describe(PARAM_DESCRIPTIONS.tags),
		}),
		needsApproval,
		execute: async ({
			path,
			description,
			priority,
			dueDate,
			scheduledDate,
			startDate,
			recurrence,
			tags,
		}) => {
			const result = await VaultOps.createTask(app, {
				path,
				description,
				priority: priority as TaskPriority | undefined,
				dueDate,
				scheduledDate,
				startDate,
				recurrence,
				tags,
			});
			onToolExecution?.(
				TOOL_NAMES.CREATE_TASK,
				{ path, description, priority, dueDate, tags },
				result
			);
			return JSON.stringify(result);
		},
	});
}

/**
 * Create the list_tasks tool for filtered task queries.
 * 
 * Supports comprehensive filtering by completion status, priority levels,
 * date ranges, tags, and text search.
 * 
 * @param app - Obsidian App instance for vault access
 * @param onToolExecution - Optional callback invoked after tool execution
 * @param needsApproval - Whether this tool requires user approval before execution
 * @returns Configured tool instance for the realtime agent
 * 
 * @example
 * ```typescript
 * const listTasks = createListTasksTool(app, null);
 * // Tool can filter: completed, priority, dueBefore, dueAfter, tags, query
 * ```
 * 
 * @see {@link TOOL_NAMES.LIST_TASKS} for the tool identifier
 * @see {@link VaultOps.listTasks} for the underlying implementation
 * @see {@link TaskOperations.filterTasks} for task filtering logic
 */
export function createListTasksTool(
	app: App,
	onToolExecution: ToolExecutionCallback | null,
	needsApproval = false
): ReturnType<typeof tool> {
	return tool({
		name: TOOL_NAMES.LIST_TASKS,
		description: TOOL_DESCRIPTIONS[TOOL_NAMES.LIST_TASKS],
		parameters: z.object({
			path: z
				.string()
				.optional()
				.describe(PARAM_DESCRIPTIONS.pathOptional),
			completed: z
				.boolean()
				.optional()
				.describe(PARAM_DESCRIPTIONS.completed),
			priority: z
				.enum(["highest", "high", "medium", "low", "lowest", "none"])
				.optional()
				.describe(PARAM_DESCRIPTIONS.priority),
			dueBefore: z
				.string()
				.optional()
				.describe(PARAM_DESCRIPTIONS.dueBefore),
			dueAfter: z
				.string()
				.optional()
				.describe(PARAM_DESCRIPTIONS.dueAfter),
			dueOn: z
				.string()
				.optional()
				.describe(PARAM_DESCRIPTIONS.dueOn),
			tags: z
				.array(z.string())
				.optional()
				.describe(PARAM_DESCRIPTIONS.tags),
			query: z
				.string()
				.optional()
				.describe(PARAM_DESCRIPTIONS.query),
			limit: z
				.number()
				.optional()
				.describe(PARAM_DESCRIPTIONS.limit),
		}),
		needsApproval,
		execute: async ({
			path,
			completed,
			priority,
			dueBefore,
			dueAfter,
			dueOn,
			tags,
			query,
			limit,
		}) => {
			const result = await VaultOps.listTasks(app, {
				path,
				completed,
				priority: priority as TaskPriority | undefined,
				dueBefore,
				dueAfter,
				dueOn,
				tags,
				query,
				limit: limit ?? 50,
			});
			onToolExecution?.(
				TOOL_NAMES.LIST_TASKS,
				{ path, completed, priority, dueBefore, dueAfter, tags, query, limit },
				{ count: result.tasks?.length ?? 0, success: result.success }
			);
			return JSON.stringify(result);
		},
	});
}

/**
 * Create all task tools as a bundle.
 * 
 * Convenience function that creates and returns all four task tools
 * configured with the same callbacks and approval settings.
 * 
 * @param app - Obsidian App instance for vault access
 * @param onToolExecution - Optional callback invoked after each tool execution
 * @param requiresApproval - Set of tool names that require user approval
 * @returns Array of all task tool instances
 * 
 * @example
 * ```typescript
 * import { createAllTaskTools } from './task-tools';
 * 
 * // Create all tools with mark_tasks requiring approval
 * const taskTools = createAllTaskTools(
 *   app,
 *   (name, args, result) => console.log(`${name} executed`),
 *   new Set(['mark_tasks', 'create_task'])
 * );
 * 
 * // Add to realtime agent tools array
 * const allTools = [...vaultTools, ...taskTools, ...webTools];
 * ```
 * 
 * @see {@link createGetTasksTool}
 * @see {@link createMarkTasksTool}
 * @see {@link createCreateTaskTool}
 * @see {@link createListTasksTool}
 */
export function createAllTaskTools(
	app: App,
	onToolExecution: ToolExecutionCallback | null,
	requiresApproval: Set<RealtimeToolName> = new Set()
): ReturnType<typeof tool>[] {
	return [
		createGetTasksTool(
			app,
			onToolExecution,
			requiresApproval.has("get_tasks" as RealtimeToolName)
		),
		createMarkTasksTool(
			app,
			onToolExecution,
			requiresApproval.has("mark_tasks" as RealtimeToolName)
		),
		createCreateTaskTool(
			app,
			onToolExecution,
			requiresApproval.has("create_task" as RealtimeToolName)
		),
		createListTasksTool(
			app,
			onToolExecution,
			requiresApproval.has("list_tasks" as RealtimeToolName)
		),
	];
}
