/**
 * @module tools
 * @description Tool factories for the Realtime Voice Agent.
 * 
 * This module provides tool creation functions for different capabilities:
 * - **vault-tools** - Vault read/write operations
 * - **task-tools** - Task management operations
 * - **web-tools** - Web fetch and search operations
 * - **output-tools** - Chat output tools
 * - **mcp-tools** - MCP server tool integration
 * - **tool-manager** - Central tool orchestration
 * 
 * @since 0.0.14
 */

// Vault tools
export { createVaultTools } from "./vault-tools";

// Web tools
export { createWebTools } from "./web-tools";

// MCP tools
export { createMcpTools } from "./mcp-tools";

// Output tools
export { createOutputTools } from "./output-tools";

// Tool manager
export { createAllTools, isToolEnabled, getToolNames, createToolsForAgent } from "./tool-manager";

// Task tools and utilities
export {
	// Task tool factories
	createAllTaskTools,
	createGetTasksTool,
	createMarkTasksTool,
	createCreateTaskTool,
	createListTasksTool,
	// Task parsing utilities
	parseTaskLine,
	parseTasksFromContent,
	buildTaskLine,
	filterTasks,
	// Task types
	type ParsedTask,
	type TaskPriority,
	type TaskStatus,
	type TaskFilter,
	type TaskOperationResult,
	type CreateTaskOptions,
	type TaskToolName,
	// Constants
	TASK_TOOL_NAMES,
} from "./task-tools";
