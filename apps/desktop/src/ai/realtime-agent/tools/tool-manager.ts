// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module RealtimeToolManager
 * @description Tool enablement utilities for the Realtime Agent.
 *
 * Evaluates per-tool and category-level configuration to decide which realtime tools are
 * available, and wires tool creation helpers for vault, web, MCP, task, and output tools.
 *
 * @since 0.0.14
 */

import type { App } from "obsidian";
import type { tool } from "@openai/agents/realtime";
import type { McpManager } from "../../mcp/McpManager";
import type { PeriodicNotesSettings } from "../../../ui/settings";
import {
	RealtimeToolConfig,
	RealtimeToolName,
	ToolExecutionCallback,
	ChatOutputCallback,
	QuestionCallback,
	VAULT_READ_TOOLS,
	VAULT_WRITE_TOOLS,
	WEB_TOOLS,
	TASK_TOOLS,
	OUTPUT_TOOLS,
	logger,
} from "../types";
import { createVaultTools } from "./vault-tools";
import { createWebTools } from "./web-tools";
import { createMcpTools } from "./mcp-tools";
import { createAllTaskTools, TASK_TOOL_NAMES } from "./task-tools";
import { createOutputTools } from "./output-tools";
import { createQuestionTools } from "./question-tools";

/**
 * Check if a specific tool is enabled based on configuration
 */
export function isToolEnabled(
	toolName: RealtimeToolName,
	config: RealtimeToolConfig
): boolean {
	// Check explicit enable/disable first
	if (config.enabled?.[toolName] !== undefined) {
		return config.enabled[toolName]!;
	}

	// Check category-level settings
	if (VAULT_READ_TOOLS.includes(toolName) && config.vaultRead !== undefined) {
		return config.vaultRead;
	}
	if (
		VAULT_WRITE_TOOLS.includes(toolName) &&
		config.vaultWrite !== undefined
	) {
		return config.vaultWrite;
	}
	if (WEB_TOOLS.includes(toolName) && config.webAccess !== undefined) {
		return config.webAccess;
	}
	// Task tools follow vaultWrite setting since most modify tasks
	if (TASK_TOOLS.includes(toolName) && config.vaultWrite !== undefined) {
		// get_tasks and list_tasks are read-only, respect vaultRead
		if (toolName === "get_tasks" || toolName === "list_tasks") {
			return config.vaultRead !== false;
		}
		return config.vaultWrite;
	}
	// Output tools are always enabled by default (they just display in chat)
	if (OUTPUT_TOOLS.includes(toolName)) {
		return true;
	}

	// Default to enabled
	return true;
}

/**
 * Get set of tools that require approval
 */
export function getToolsRequiringApproval(
	config: RealtimeToolConfig
): Set<RealtimeToolName> {
	const requiresApproval = new Set<RealtimeToolName>();
	
	if (config.requiresApproval) {
		for (const toolName of config.requiresApproval) {
			requiresApproval.add(toolName);
		}
	}
	
	return requiresApproval;
}

/**
 * Create all tools for the realtime agent based on configuration
 */
export function createAllTools(
	app: App,
	toolConfig: RealtimeToolConfig,
	mcpManager: McpManager | undefined,
	onToolExecution: ToolExecutionCallback | null,
	periodicNotesSettings?: PeriodicNotesSettings,
	onChatOutput?: ChatOutputCallback | null,
	onQuestion?: QuestionCallback | null,
	sourceAgent?: string
): ReturnType<typeof tool>[] {
	const tools: ReturnType<typeof tool>[] = [];
	const requiresApproval = getToolsRequiringApproval(toolConfig);

	// Add MCP tools if McpManager is available and mcpTools is enabled
	if (toolConfig.mcpTools !== false && mcpManager?.hasConnectedServers()) {
		// MCP tools require approval if mcpTools approval is in the list or if there are any approval requirements
		const mcpNeedsApproval = requiresApproval.size > 0;
		const mcpTools = createMcpTools(mcpManager, onToolExecution, mcpNeedsApproval);
		if (mcpTools.length > 0) {
			logger.info(
				`Added ${mcpTools.length} MCP tools to voice agent`
			);
			tools.push(...mcpTools);
		}
	}

	// Create all vault and web tools
	const vaultTools = createVaultTools(app, onToolExecution, requiresApproval, periodicNotesSettings);
	const webTools = createWebTools(onToolExecution, requiresApproval);
	const taskTools = createAllTaskTools(app, onToolExecution, requiresApproval);
	const outputTools = createOutputTools(onChatOutput ?? null, sourceAgent ?? "assistant", requiresApproval);
	const questionTools = createQuestionTools(onQuestion ?? null, sourceAgent ?? "assistant", requiresApproval);

	// Build a map of tool name to tool for filtering
	const toolMap: Array<{
		name: RealtimeToolName;
		tool: ReturnType<typeof tool>;
	}> = [];

	// Map vault tools
	for (const t of vaultTools) {
		toolMap.push({ name: t.name as RealtimeToolName, tool: t });
	}

	// Map web tools
	for (const t of webTools) {
		toolMap.push({ name: t.name as RealtimeToolName, tool: t });
	}

	// Map task tools
	for (const t of taskTools) {
		toolMap.push({ name: t.name as RealtimeToolName, tool: t });
	}

	// Map output tools
	for (const t of outputTools) {
		toolMap.push({ name: t.name as RealtimeToolName, tool: t });
	}

	// Map question tools
	for (const t of questionTools) {
		toolMap.push({ name: t.name as RealtimeToolName, tool: t });
	}

	// Filter tools based on configuration
	for (const { name, tool: t } of toolMap) {
		if (isToolEnabled(name, toolConfig)) {
			tools.push(t);
		}
	}

	logger.info(`Enabled ${tools.length} built-in tools`);

	return tools;
}

/**
 * Get tool names from a list of tools
 */
export function getToolNames(tools: ReturnType<typeof tool>[]): string[] {
	return tools.map((t) => t.name);
}

/**
 * Create tools for a specific agent based on an allowlist of tool names
 * 
 * @param allowedToolNames - Array of tool names this agent is allowed to use
 * @param app - Obsidian App instance
 * @param toolConfig - Tool configuration for approvals, etc.
 * @param mcpManager - Optional MCP manager for MCP tools
 * @param onToolExecution - Optional callback for tool execution events
 * @param periodicNotesSettings - Optional periodic notes settings for weekly/monthly/quarterly/yearly notes
 * @param onChatOutput - Optional callback for outputting content to the ChatView
 * @param onQuestion - Optional callback for asking questions to the user
 * @param sourceAgent - Name of the agent creating the tools (for attribution)
 * @returns Array of tools filtered to the allowlist
 */
export function createToolsForAgent(
	allowedToolNames: string[],
	app: App,
	toolConfig: RealtimeToolConfig,
	mcpManager: McpManager | undefined,
	onToolExecution: ToolExecutionCallback | null,
	periodicNotesSettings?: PeriodicNotesSettings,
	onChatOutput?: ChatOutputCallback | null,
	onQuestion?: QuestionCallback | null,
	sourceAgent?: string
): ReturnType<typeof tool>[] {
	const tools: ReturnType<typeof tool>[] = [];
	const requiresApproval = getToolsRequiringApproval(toolConfig);
	const allowedSet = new Set(allowedToolNames);

	// Create all available tools
	const vaultTools = createVaultTools(app, onToolExecution, requiresApproval, periodicNotesSettings);
	const webTools = createWebTools(onToolExecution, requiresApproval);
	const taskTools = createAllTaskTools(app, onToolExecution, requiresApproval);
	const outputTools = createOutputTools(onChatOutput ?? null, sourceAgent ?? "assistant", requiresApproval);
	const questionTools = createQuestionTools(onQuestion ?? null, sourceAgent ?? "assistant", requiresApproval);

	// Combine all tools
	const allTools = [...vaultTools, ...webTools, ...taskTools, ...outputTools, ...questionTools];

	// Filter to only allowed tools
	for (const t of allTools) {
		if (allowedSet.has(t.name)) {
			tools.push(t);
		}
	}

	// Add MCP tools if enabled and tool names are in the allowlist
	// MCP tools are filtered by the allowlist like other tools
	if (toolConfig.mcpTools !== false && mcpManager?.hasConnectedServers()) {
		const mcpNeedsApproval = requiresApproval.size > 0;
		const mcpTools = createMcpTools(mcpManager, onToolExecution, mcpNeedsApproval);
		
		// Filter MCP tools by allowlist too
		let addedCount = 0;
		for (const mcpTool of mcpTools) {
			const toolName = (mcpTool as { name?: string }).name || "";
			if (allowedSet.has(toolName)) {
				tools.push(mcpTool);
				addedCount++;
			}
		}
		if (addedCount > 0) {
			logger.info(`Added ${addedCount} MCP tools to agent (filtered by allowlist)`);
		}
	}

	logger.info(`Created ${tools.length} tools for agent (allowed: ${allowedToolNames.length})`);
	return tools;
}
