// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module ToolCatalog
 * @description Centralized tool discovery and selection management for Vault Copilot.
 *
 * The ToolCatalog aggregates tools from multiple sources and provides a unified
 * interface for tool filtering, enabling/disabling, and UI display. It serves as
 * the single source of truth for what tools are available to AI providers.
 *
 * ## Tool Sources
 *
 * Tools are aggregated from:
 * - **Built-in**: Core vault operations (read, write, search, etc.)
 * - **MCP**: Tools from connected MCP servers
 * - **Plugin**: Skills registered via SkillRegistry
 *
 * ## Tool Filtering
 *
 * Tools can be enabled/disabled at multiple levels:
 * 1. **Default Settings**: `settings.defaultEnabledTools` / `defaultDisabledTools`
 * 2. **Per-Session**: `session.toolOverrides.enabled` / `disabled`
 *
 * ## Usage
 *
 * ```typescript
 * const catalog = new ToolCatalog(skillRegistry, mcpManager);
 * const enabled = catalog.getEnabledTools(settings, session);
 * ```
 *
 * @see {@link ToolInfo} for tool metadata structure
 * @see {@link ToolDefinitions} for tool schemas
 * @since 0.0.14
 */

import type { CopilotPluginSettings, CopilotSession } from "../../ui/settings";
import type { SkillRegistry } from "../customization/SkillRegistry";
import type { SkillCache } from "../customization/SkillCache";
import type { McpManager } from "../mcp/McpManager";
import { TOOL_DESCRIPTIONS, TOOL_NAMES, type ToolName } from "./ToolDefinitions";
import { BASES_TOOL_NAMES, BASES_TOOL_DESCRIPTIONS } from "../bases/BasesToolDefinitions";

/**
 * Tool metadata used for UI display and enablement logic.
 *
 * @since 0.0.14
 */
export interface ToolInfo {
	/** Unique identifier for the tool */
	id: string;
	/** Human-friendly display name */
	displayName: string;
	/** Description shown in UI */
	description: string;
	/** Source of the tool (builtin/plugin/mcp) */
	source: "builtin" | "plugin" | "mcp";
	/** Whether the tool is enabled by default */
	enabledByDefault: boolean;
	/** MCP server ID for MCP tools */
	serverId?: string;
	/** MCP server name for MCP tools */
	serverName?: string;
}

/**
 * Create a built-in tool entry with consistent descriptions.
 *
 * @param id - Tool identifier
 * @param displayName - Human-friendly label
 * @returns Tool metadata with default enablement
 *
 * @example
 * ```typescript
 * const tool = createBuiltinTool(TOOL_NAMES.READ_NOTE, "Read Note");
 * ```
 * @internal
 */
function createBuiltinTool(id: ToolName, displayName: string): ToolInfo {
	return {
		id,
		displayName,
		description: TOOL_DESCRIPTIONS[id],
		source: "builtin",
		enabledByDefault: true,
	};
}

/**
 * Built-in tool catalog used as the default tool set.
 */
const BUILTIN_TOOLS: ToolInfo[] = [
	createBuiltinTool(TOOL_NAMES.READ_NOTE, "Read Note"),
	createBuiltinTool(TOOL_NAMES.SEARCH_NOTES, "Search Notes"),
	createBuiltinTool(TOOL_NAMES.GET_ACTIVE_NOTE, "Get Active Note"),
	createBuiltinTool(TOOL_NAMES.LIST_NOTES, "List Notes"),
	createBuiltinTool(TOOL_NAMES.LIST_NOTES_RECURSIVELY, "List Notes Recursively"),
	createBuiltinTool(TOOL_NAMES.BATCH_READ_NOTES, "Batch Read Notes"),
	createBuiltinTool(TOOL_NAMES.GET_RECENT_CHANGES, "Get Recent Changes"),
	createBuiltinTool(TOOL_NAMES.GET_DAILY_NOTE, "Get Daily Note"),
	createBuiltinTool(TOOL_NAMES.CREATE_NOTE, "Create Note"),
	createBuiltinTool(TOOL_NAMES.APPEND_TO_NOTE, "Append To Note"),
	createBuiltinTool(TOOL_NAMES.UPDATE_NOTE, "Update Note"),
	createBuiltinTool(TOOL_NAMES.REPLACE_NOTE, "Replace Note"),
	createBuiltinTool(TOOL_NAMES.DELETE_NOTE, "Delete Note"),
	createBuiltinTool(TOOL_NAMES.RENAME_NOTE, "Rename Note"),
	createBuiltinTool(TOOL_NAMES.PATCH_NOTE, "Patch Note"),
	createBuiltinTool(TOOL_NAMES.FIND_AND_REPLACE, "Find And Replace"),
	createBuiltinTool(TOOL_NAMES.OPEN_NOTE, "Open Note"),
	createBuiltinTool(TOOL_NAMES.OPEN_DAILY_NOTE, "Open Daily Note"),
	createBuiltinTool(TOOL_NAMES.OPEN_WEEKLY_NOTE, "Open Weekly Note"),
	createBuiltinTool(TOOL_NAMES.OPEN_MONTHLY_NOTE, "Open Monthly Note"),
	createBuiltinTool(TOOL_NAMES.OPEN_QUARTERLY_NOTE, "Open Quarterly Note"),
	createBuiltinTool(TOOL_NAMES.OPEN_YEARLY_NOTE, "Open Yearly Note"),
	createBuiltinTool(TOOL_NAMES.OPEN_PERIODIC_NOTE, "Open Periodic Note"),
	createBuiltinTool(TOOL_NAMES.GET_TASKS, "Get Tasks"),
	createBuiltinTool(TOOL_NAMES.CREATE_TASK, "Create Task"),
	createBuiltinTool(TOOL_NAMES.MARK_TASKS, "Mark Tasks"),
	createBuiltinTool(TOOL_NAMES.LIST_TASKS, "List Tasks"),
	createBuiltinTool(TOOL_NAMES.MARK_TASKS_COMPLETE, "Mark Tasks Complete"),
	createBuiltinTool(TOOL_NAMES.FETCH_WEB_PAGE, "Fetch Web Page"),
	createBuiltinTool(TOOL_NAMES.WEB_SEARCH, "Web Search"),
	createBuiltinTool(TOOL_NAMES.SEND_TO_CHAT, "Send To Chat"),
	createBuiltinTool(TOOL_NAMES.SHOW_MARKDOWN, "Show Markdown"),
	createBuiltinTool(TOOL_NAMES.SPEAK, "Speak"),
	createBuiltinTool(TOOL_NAMES.ASK_QUESTION, "Ask Question"),

	// Introspection tools
	createBuiltinTool(TOOL_NAMES.LIST_AVAILABLE_TOOLS, "List Available Tools"),
	createBuiltinTool(TOOL_NAMES.LIST_AVAILABLE_SKILLS, "List Available Skills"),
	createBuiltinTool(TOOL_NAMES.LIST_AVAILABLE_AGENTS, "List Available Agents"),
	createBuiltinTool(TOOL_NAMES.LIST_AVAILABLE_PROMPTS, "List Available Prompts"),
	createBuiltinTool(TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS, "List Available Instructions"),
	
	// Bases AI tools
	{
		id: BASES_TOOL_NAMES.CREATE_BASE,
		displayName: "Create Base",
		description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.CREATE_BASE],
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: BASES_TOOL_NAMES.READ_BASE,
		displayName: "Read Base",
		description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.READ_BASE],
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: BASES_TOOL_NAMES.QUERY_BASE,
		displayName: "Query Base",
		description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.QUERY_BASE],
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: BASES_TOOL_NAMES.ADD_BASE_RECORDS,
		displayName: "Add Base Records",
		description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.ADD_BASE_RECORDS],
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: BASES_TOOL_NAMES.UPDATE_BASE_RECORDS,
		displayName: "Update Base Records",
		description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.UPDATE_BASE_RECORDS],
		source: "builtin",
		enabledByDefault: true,
	},
	{
		id: BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA,
		displayName: "Evolve Base Schema",
		description: BASES_TOOL_DESCRIPTIONS[BASES_TOOL_NAMES.EVOLVE_BASE_SCHEMA],
		source: "builtin",
		enabledByDefault: true,
	},
];

/**
 * ToolCatalog class for managing tool discovery and selection across sources.
 *
 * @example
 * ```typescript
 * const catalog = new ToolCatalog(skillRegistry, mcpManager);
 * const enabledTools = catalog.getEnabledTools(settings, session);
 * ```
 */
export class ToolCatalog {
	private skillRegistry: SkillRegistry | null = null;
	private skillCache: SkillCache | null = null;
	private mcpManager: McpManager | null = null;

	/**
	 * Create a new tool catalog.
	 *
	 * @param skillRegistry - Optional registry for plugin-registered skills
	 * @param mcpManager - Optional MCP manager for server tools
	 * @param skillCache - Optional cache for file-based skills
	 */
	constructor(skillRegistry?: SkillRegistry, mcpManager?: McpManager, skillCache?: SkillCache) {
		this.skillRegistry = skillRegistry ?? null;
		this.mcpManager = mcpManager ?? null;
		this.skillCache = skillCache ?? null;
	}

	/**
	 * Get all available tools from built-in sources, plugin skills, and MCP servers.
	 *
	 * @returns Aggregated tool metadata
	 */
	getAllTools(): ToolInfo[] {
		const tools: ToolInfo[] = [];

		// Add built-in tools
		tools.push(...BUILTIN_TOOLS);

		// Add plugin-registered skills
		const seenSkillNames = new Set<string>();
		if (this.skillRegistry) {
			for (const skill of this.skillRegistry.listSkills()) {
				seenSkillNames.add(skill.name);
				tools.push({
					id: skill.name,
					displayName: skill.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
					description: skill.description,
					source: "plugin",
					enabledByDefault: true,
				});
			}
		}

		// Add file-based skills from cache (deduplicate against plugin skills)
		if (this.skillCache) {
			for (const skill of this.skillCache.getSkills()) {
				if (seenSkillNames.has(skill.name)) continue;
				seenSkillNames.add(skill.name);
				tools.push({
					id: skill.name,
					displayName: skill.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
					description: skill.description,
					source: "plugin",
					enabledByDefault: true,
				});
			}
		}

		// Add MCP server tools
		if (this.mcpManager) {
			const mcpTools = this.mcpManager.getAllTools();
			for (const { serverId, serverName, tool } of mcpTools) {
				const sanitizedServerName = serverName.replace(/[^a-zA-Z0-9_]/g, "_");
				const toolId = `mcp_${sanitizedServerName}_${tool.name}`;

				tools.push({
					id: toolId,
					displayName: tool.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
					description: tool.description || tool.name,
					source: "mcp",
					serverId,
					serverName,
					enabledByDefault: false,
				});
			}
		}

		return tools;
	}

	/**
	 * Get tools grouped by source for UI display.
	 *
	 * @returns Map keyed by source or `mcp:<server>` with the associated tools
	 */
	getToolsBySource(): Record<string, ToolInfo[]> {
		const tools = this.getAllTools();
		const grouped: Record<string, ToolInfo[]> = {
			builtin: [],
			plugin: [],
		};

		const mcpByServer = new Map<string, ToolInfo[]>();

		for (const tool of tools) {
			if (tool.source === "builtin") {
				grouped.builtin!.push(tool);
			} else if (tool.source === "plugin") {
				grouped.plugin!.push(tool);
			} else if (tool.source === "mcp" && tool.serverName) {
				if (!mcpByServer.has(tool.serverName)) {
					mcpByServer.set(tool.serverName, []);
				}
				mcpByServer.get(tool.serverName)!.push(tool);
			}
		}

		for (const [serverName, serverTools] of mcpByServer) {
			grouped[`mcp:${serverName}`] = serverTools;
		}

		return grouped;
	}

	/**
	 * Get enabled tool IDs, honoring defaults and session overrides.
	 *
	 * @param settings - Plugin settings containing default enablement
	 * @param session - Optional session overrides
	 * @returns Array of enabled tool IDs that exist in the catalog
	 */
	getEnabledTools(settings: CopilotPluginSettings, session?: CopilotSession): string[] {
		const allTools = this.getAllTools();
		const allToolIds = new Set(allTools.map(t => t.id));
		const enabledSet = new Set<string>();

		if (settings.defaultEnabledTools && settings.defaultEnabledTools.length > 0) {
			for (const toolId of settings.defaultEnabledTools) {
				enabledSet.add(toolId);
			}
		} else {
			for (const tool of allTools) {
				if (tool.enabledByDefault) {
					enabledSet.add(tool.id);
				}
			}
		}

		if (settings.defaultDisabledTools) {
			for (const toolId of settings.defaultDisabledTools) {
				enabledSet.delete(toolId);
			}
		}

		if (session?.toolOverrides) {
			if (session.toolOverrides.enabled) {
				enabledSet.clear();
				for (const toolId of session.toolOverrides.enabled) {
					enabledSet.add(toolId);
				}
			}
			if (session.toolOverrides.disabled) {
				for (const toolId of session.toolOverrides.disabled) {
					enabledSet.delete(toolId);
				}
			}
		}

		return Array.from(enabledSet).filter(id => allToolIds.has(id));
	}

	/**
	 * Check if a specific tool is enabled.
	 *
	 * @param toolId - Tool identifier to check
	 * @param settings - Plugin settings containing defaults
	 * @param session - Optional session overrides
	 * @returns True if the tool is enabled
	 */
	isToolEnabled(toolId: string, settings: CopilotPluginSettings, session?: CopilotSession): boolean {
		const enabledTools = this.getEnabledTools(settings, session);
		return enabledTools.includes(toolId);
	}

	/**
	 * Get a summary of enabled tools for display.
	 *
	 * @param settings - Plugin settings
	 * @param session - Optional session overrides
	 * @returns Counts for enabled tools by source
	 */
	getToolsSummary(
		settings: CopilotPluginSettings,
		session?: CopilotSession
	): { enabled: number; total: number; builtin: number; plugin: number; mcp: number } {
		const allTools = this.getAllTools();
		const enabledTools = this.getEnabledTools(settings, session);

		let builtin = 0;
		let plugin = 0;
		let mcp = 0;
		for (const tool of allTools) {
			if (tool.source === "builtin") builtin++;
			else if (tool.source === "plugin") plugin++;
			else if (tool.source === "mcp") mcp++;
		}

		return {
			enabled: enabledTools.length,
			total: allTools.length,
			builtin,
			plugin,
			mcp,
		};
	}

	/**
	 * Get a count of available tools grouped by source.
	 *
	 * @returns Record keyed by source name with tool counts
	 */
	getToolCountsBySource(): Record<string, number> {
		const grouped = this.getToolsBySource();
		const counts: Record<string, number> = {};
		for (const [source, tools] of Object.entries(grouped)) {
			counts[source] = tools.length;
		}
		return counts;
	}
}
