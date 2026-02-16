/**
 * @module ToolDefinitions
 * @description Centralized Tool Definitions Registry for Vault Copilot.
 * 
 * This module provides a single source of truth for all tool metadata,
 * parameter types, and descriptions used across the plugin. It ensures
 * consistency between different AI provider implementations:
 * 
 * - **GitHubCopilotCliService**: Uses `defineTool` with JSON Schema
 * - **Realtime Agent**: Uses `tool()` from `@openai/agents/realtime` with Zod schemas
 * - **OpenAI/Azure Services**: Uses OpenAI function calling format
 * 
 * ## Architecture
 * 
 * ```
 * ToolDefinitions.ts (this file)
 *        │
 *        ├── TOOL_NAMES ─────────► Constant identifiers
 *        ├── TOOL_DESCRIPTIONS ──► Human-readable descriptions
 *        ├── TOOL_JSON_SCHEMAS ──► JSON Schema for Copilot SDK
 *        ├── Parameter Interfaces ► TypeScript types for handlers
 *        └── TOOL_CATEGORIES ────► UI organization
 * ```
 * 
 * ## Usage Examples
 * 
 * @example Using with GitHubCopilotCliService (JSON Schema)
 * ```typescript
 * import { TOOL_NAMES, TOOL_DESCRIPTIONS, TOOL_JSON_SCHEMAS } from './ToolDefinitions';
 * import { defineTool } from '@github/copilot-sdk';
 * 
 * defineTool(TOOL_NAMES.READ_NOTE, {
 *   description: TOOL_DESCRIPTIONS[TOOL_NAMES.READ_NOTE],
 *   parameters: TOOL_JSON_SCHEMAS[TOOL_NAMES.READ_NOTE],
 *   handler: async (args: ReadNoteParams) => {
 *     return await VaultOps.readNote(app, args.path);
 *   }
 * });
 * ```
 * 
 * @example Using with Realtime Agent (Zod)
 * ```typescript
 * import { TOOL_NAMES, TOOL_DESCRIPTIONS } from './ToolDefinitions';
 * import { tool } from '@openai/agents/realtime';
 * import { z } from 'zod';
 * 
 * tool({
 *   name: TOOL_NAMES.READ_NOTE,
 *   description: TOOL_DESCRIPTIONS[TOOL_NAMES.READ_NOTE],
 *   parameters: z.object({
 *     path: z.string().describe('Path to the note file')
 *   }),
 *   execute: async ({ path }) => { ... }
 * });
 * ```
 * 
 * @example Type-safe parameter handling
 * ```typescript
 * import type { ReadNoteParams, CreateNoteParams } from './ToolDefinitions';
 * 
 * async function handleReadNote(params: ReadNoteParams): Promise<NoteContent> {
 *   return await VaultOps.readNote(app, params.path);
 * }
 * ```
 * 
 * @see {@link TOOL_NAMES} for all available tool identifiers
 * @see {@link TOOL_CATEGORIES} for UI organization
 * @see {@link getToolDescription} for runtime description lookup
 * 
 * @since 0.0.14
 */

// ============================================================================
// Tool Names - Use these constants to ensure consistency
// ============================================================================

export const TOOL_NAMES = {
	// Vault read operations
	READ_NOTE: "read_note",
	SEARCH_NOTES: "search_notes",
	GET_ACTIVE_NOTE: "get_active_note",
	LIST_NOTES: "list_notes",
	LIST_NOTES_RECURSIVELY: "list_notes_recursively",
	BATCH_READ_NOTES: "batch_read_notes",
	GET_RECENT_CHANGES: "get_recent_changes",
	GET_DAILY_NOTE: "get_daily_note",

	// Vault write operations
	CREATE_NOTE: "create_note",
	APPEND_TO_NOTE: "append_to_note",
	UPDATE_NOTE: "update_note",
	REPLACE_NOTE: "replace_note",
	DELETE_NOTE: "delete_note",
	RENAME_NOTE: "rename_note",
	PATCH_NOTE: "patch_note",
	FIND_AND_REPLACE: "find_and_replace_in_note",

	// Navigation
	OPEN_NOTE: "open_note",
	
	// Periodic notes
	OPEN_DAILY_NOTE: "open_daily_note",
	OPEN_WEEKLY_NOTE: "open_weekly_note",
	OPEN_MONTHLY_NOTE: "open_monthly_note",
	OPEN_QUARTERLY_NOTE: "open_quarterly_note",
	OPEN_YEARLY_NOTE: "open_yearly_note",
	OPEN_PERIODIC_NOTE: "open_periodic_note",

	// Task operations
	GET_TASKS: "get_tasks",
	CREATE_TASK: "create_task",
	MARK_TASKS: "mark_tasks",
	LIST_TASKS: "list_tasks",
	/** @deprecated Use MARK_TASKS instead */
	MARK_TASKS_COMPLETE: "mark_tasks_complete",

	// Web operations
	FETCH_WEB_PAGE: "fetch_web_page",
	WEB_SEARCH: "web_search",

	// Output operations
	SEND_TO_CHAT: "send_to_chat",
	SHOW_MARKDOWN: "show_markdown",
	SPEAK: "speak",

	// Question operations
	ASK_QUESTION: "ask_question",

	// Introspection operations
	LIST_AVAILABLE_TOOLS: "list_available_tools",
	LIST_AVAILABLE_SKILLS: "list_available_skills",
	LIST_AVAILABLE_AGENTS: "list_available_agents",
	LIST_AVAILABLE_PROMPTS: "list_available_prompts",
	LIST_AVAILABLE_INSTRUCTIONS: "list_available_instructions",

	// Agent operations
	RUN_SUBAGENT: "run_subagent",
} as const;

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];

// ============================================================================
// Tool Descriptions - Shared descriptions for consistency
// ============================================================================

export const TOOL_DESCRIPTIONS = {
	[TOOL_NAMES.READ_NOTE]: "Read the content of a note from the Obsidian vault by its path",
	[TOOL_NAMES.SEARCH_NOTES]: "Search for notes in the Obsidian vault by content or title",
	[TOOL_NAMES.GET_ACTIVE_NOTE]: "Get information about the currently active note in Obsidian",
	[TOOL_NAMES.LIST_NOTES]: "List notes and subfolders in a folder (non-recursive). Returns items with type indicator (file/folder).",
	[TOOL_NAMES.LIST_NOTES_RECURSIVELY]: "List ALL notes recursively from a folder path (includes all subfolders). Returns flat list of all note paths.",
	[TOOL_NAMES.BATCH_READ_NOTES]: "Read multiple notes at once. Use aiSummarize=true for many files (10+) to get AI-generated summaries.",
	[TOOL_NAMES.GET_RECENT_CHANGES]: "Get recently modified files in the vault",
	[TOOL_NAMES.GET_DAILY_NOTE]: "Get today's daily note or a daily note for a specific date",
	[TOOL_NAMES.CREATE_NOTE]: "Create a new note in the Obsidian vault",
	[TOOL_NAMES.APPEND_TO_NOTE]: "Append content to an existing note",
	[TOOL_NAMES.UPDATE_NOTE]: "Update/replace the entire content of an existing note",
	[TOOL_NAMES.REPLACE_NOTE]: "Replace the ENTIRE content of an existing note. Use only when you need to completely rewrite a note. For small changes, prefer update_note instead.",
	[TOOL_NAMES.DELETE_NOTE]: "Delete a note from the vault. Use with caution.",
	[TOOL_NAMES.RENAME_NOTE]: "Rename or move a note to a new path",
	[TOOL_NAMES.PATCH_NOTE]: "Insert content at a specific location in a note, relative to a heading, block reference, or frontmatter",
	[TOOL_NAMES.FIND_AND_REPLACE]: "Find and replace text within a specific note",
	[TOOL_NAMES.OPEN_NOTE]: "Open a note in the editor by its path. Use this when the user wants to navigate to or view a specific note.",
	[TOOL_NAMES.OPEN_DAILY_NOTE]: "Open the daily note for a specific date. Supports natural language dates like 'today', 'yesterday', 'last monday'. Creates the note if it doesn't exist.",
	[TOOL_NAMES.OPEN_WEEKLY_NOTE]: "Open the weekly note for a specific week. Supports expressions like 'this week', 'last week', 'W05'. Creates the note if it doesn't exist.",
	[TOOL_NAMES.OPEN_MONTHLY_NOTE]: "Open the monthly note for a specific month. Supports expressions like 'this month', 'last month', 'January 2026'. Creates the note if it doesn't exist.",
	[TOOL_NAMES.OPEN_QUARTERLY_NOTE]: "Open the quarterly note for a specific quarter. Supports expressions like 'this quarter', 'Q1 2026'. Creates the note if it doesn't exist.",
	[TOOL_NAMES.OPEN_YEARLY_NOTE]: "Open the yearly note for a specific year. Supports expressions like 'this year', 'last year', '2026'. Creates the note if it doesn't exist.",
	[TOOL_NAMES.OPEN_PERIODIC_NOTE]: "Open a periodic note (daily, weekly, monthly, etc.)",
	[TOOL_NAMES.GET_TASKS]: "Get tasks from a specific note or folder",
	[TOOL_NAMES.CREATE_TASK]: "Create a new task in a note",
	[TOOL_NAMES.MARK_TASKS]: "Mark one or more tasks as complete or incomplete",
	[TOOL_NAMES.LIST_TASKS]: "List tasks from notes in the vault",
	/** @deprecated Use MARK_TASKS description instead */
	[TOOL_NAMES.MARK_TASKS_COMPLETE]: "[DEPRECATED - use mark_tasks instead] Mark checkbox tasks as complete. Changes [ ] to [x] for specified tasks. For bidirectional marking (complete/uncomplete), use the mark_tasks tool.",
	[TOOL_NAMES.FETCH_WEB_PAGE]: "Fetch and extract content from a web page URL",
	[TOOL_NAMES.WEB_SEARCH]: "Search the web for information",
	[TOOL_NAMES.SEND_TO_CHAT]: "Display formatted content in the chat window instead of speaking it. Use for structured data like tables, lists, schedules, or content better read than spoken.",
	[TOOL_NAMES.SHOW_MARKDOWN]: "Display markdown content to the user in a modal",
	[TOOL_NAMES.SPEAK]: "Speak text to the user using text-to-speech",
	[TOOL_NAMES.ASK_QUESTION]: "Ask the user a question and get their response. Supports text input, multiple choice, radio buttons, and mixed (choice + text) questions. Use this when you need clarification, additional information, or user preferences to complete a task.",
	[TOOL_NAMES.LIST_AVAILABLE_TOOLS]: "List all available tools in the current environment. Returns tool names, descriptions, and sources (builtin, plugin, mcp). Use source parameter to filter by origin.",
	[TOOL_NAMES.LIST_AVAILABLE_SKILLS]: "List all available skills (both file-based SKILL.md and runtime-registered). Returns skill names, descriptions, and sources. Use source parameter to filter.",
	[TOOL_NAMES.LIST_AVAILABLE_AGENTS]: "List all available custom agents loaded from .agent.md files. Returns agent names, descriptions, configured tools, and file paths.",
	[TOOL_NAMES.LIST_AVAILABLE_PROMPTS]: "List all available prompt templates loaded from .prompt.md files. Returns prompt names, descriptions, configured tools, models, and file paths.",
	[TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS]: "List all available instruction files loaded from .instructions.md files. Returns instruction names, applyTo patterns, and file paths.",
	[TOOL_NAMES.RUN_SUBAGENT]: "Launch a subagent to handle a complex, multi-step task autonomously. The subagent runs in an isolated context with its own conversation history. When it completes, it returns a single summary message. Use this to delegate specialized work to a named agent or to run an ad-hoc task with a detailed prompt.",
} as const;

// ============================================================================
// Parameter Types - TypeScript interfaces for tool parameters
// ============================================================================

/** Parameters for read_note */
export interface ReadNoteParams {
	/** The path to the note file (e.g., 'folder/note.md' or 'note.md') */
	path: string;
}

/** Parameters for search_notes */
export interface SearchNotesParams {
	/** The search query */
	query: string;
	/** Maximum number of results to return (default: 10) */
	limit?: number;
}

/** Parameters for list_notes */
export interface ListNotesParams {
	/** Folder path to list (empty or '/' for vault root) */
	folder?: string;
}

/** Parameters for list_notes_recursively */
export interface ListNotesRecursivelyParams {
	/** Folder path to list recursively (empty or '/' for entire vault) */
	folder?: string;
	/** Maximum number of notes to return (default: 200) */
	limit?: number;
}

/** Parameters for batch_read_notes */
export interface BatchReadNotesParams {
	/** Array of note paths to read */
	paths: string[];
	/** If true, use AI to generate intelligent summaries of each file */
	aiSummarize?: boolean;
	/** Optional custom prompt for AI summarization */
	summaryPrompt?: string;
}

/** Parameters for get_recent_changes */
export interface GetRecentChangesParams {
	/** Maximum number of files to return (default: 10) */
	limit?: number;
}

/** Parameters for get_daily_note */
export interface GetDailyNoteParams {
	/** Optional date in YYYY-MM-DD format. Defaults to today. */
	date?: string;
}

/** Parameters for create_note */
export interface CreateNoteParams {
	/** The path for the new note (e.g., 'folder/note.md') */
	path: string;
	/** The content of the note in Markdown format */
	content: string;
}

/** Parameters for append_to_note */
export interface AppendToNoteParams {
	/** The path to the note file */
	path: string;
	/** The content to append */
	content: string;
}

/** Parameters for update_note */
export interface UpdateNoteParams {
	/** The path to the note file */
	path: string;
	/** The new content to replace the existing content */
	content: string;
}

/** Parameters for delete_note */
export interface DeleteNoteParams {
	/** The path to the note file to delete */
	path: string;
}

/** Parameters for rename_note */
export interface RenameNoteParams {
	/** The current path of the note */
	oldPath: string;
	/** The new path for the note */
	newPath: string;
}

/** Patch operation type */
export type PatchOperation = "append" | "prepend" | "replace";
/** Patch target type */
export type PatchTargetType = "heading" | "block" | "frontmatter" | "end";

/** Parameters for patch_note */
export interface PatchNoteParams {
	/** The path to the note file */
	path: string;
	/** The operation to perform: append, prepend, or replace */
	operation: PatchOperation;
	/** Type of target: heading, block, frontmatter, or end */
	target_type: PatchTargetType;
	/** The target identifier (heading text, block ID, or empty for frontmatter/end) */
	target?: string;
	/** The content to insert */
	content: string;
}

/** Parameters for find_and_replace_in_note */
export interface FindAndReplaceParams {
	/** The path to the note file */
	path: string;
	/** The text to find */
	find: string;
	/** The text to replace with */
	replace: string;
	/** Replace all occurrences (default: false) */
	replaceAll?: boolean;
}

/** Periodic note type */
export type PeriodicNoteType = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

/** Parameters for open_periodic_note */
export interface OpenPeriodicNoteParams {
	/** Type of periodic note to open */
	type: PeriodicNoteType;
	/** Offset from current period (e.g., -1 for previous, 1 for next) */
	offset?: number;
}

/** Parameters for fetch_web_page */
export interface FetchWebPageParams {
	/** The URL of the web page to fetch */
	url: string;
}

/** Parameters for web_search */
export interface WebSearchParams {
	/** The search query */
	query: string;
	/** Maximum number of results (default: 5) */
	limit?: number;
}

/** Parameters for show_markdown */
export interface ShowMarkdownParams {
	/** The markdown content to display */
	content: string;
	/** Optional title for the modal */
	title?: string;
}

/** Parameters for speak */
export interface SpeakParams {
	/** The text to speak */
	text: string;
}

/** Parameters for list_available_tools */
export interface ListAvailableToolsParams {
	/** Filter by source: 'builtin', 'plugin', 'mcp', or 'all' (default: 'all') */
	source?: string;
}

/** Parameters for list_available_skills */
export interface ListAvailableSkillsParams {
	/** Filter by source: 'file' (SKILL.md), 'runtime' (SkillRegistry), or 'all' (default: 'all') */
	source?: string;
}

/** Parameters for list_available_agents */
export interface ListAvailableAgentsParams {
	/** Optional name filter (substring match) */
	name?: string;
	/** Context: 'subagent' to show only model-invokable agents, 'all' (default) to show all */
	context?: string;
}

/** Parameters for run_subagent */
export interface RunSubagentParams {
	/** Optional name of a specific agent (.agent.md) to invoke. If omitted, runs as ad-hoc subagent with no agent instructions. */
	agentName?: string;
	/** A detailed prompt describing the task for the subagent to perform autonomously. */
	prompt: string;
	/** Optional timeout in milliseconds (default: 120000 - 2 minutes). */
	timeout?: number;
}

/** Parameters for list_available_prompts */
export interface ListAvailablePromptsParams {
	/** Optional name filter (substring match) */
	name?: string;
}

/** Parameters for list_available_instructions */
export interface ListAvailableInstructionsParams {
	/** Optional applyTo pattern filter */
	applyTo?: string;
}

// ============================================================================
// JSON Schema Definitions - For use with defineTool (Copilot SDK)
// ============================================================================

export interface JsonSchemaProperty {
	type: string;
	description?: string;
	enum?: string[];
	items?: { type: string; [key: string]: unknown };
	[key: string]: unknown;  // Allow additional properties for SDK compatibility
}

export interface JsonSchemaObject {
	type: "object";
	properties: Record<string, JsonSchemaProperty>;
	required: string[];
	[key: string]: unknown;  // Allow additional properties for Record<string, unknown> compatibility
}

/** JSON Schema definitions for tools - ready to use with defineTool */
export const TOOL_JSON_SCHEMAS: Record<string, JsonSchemaObject> = {
	[TOOL_NAMES.READ_NOTE]: {
		type: "object",
		properties: {
			path: { type: "string", description: "The path to the note file (e.g., 'folder/note.md' or 'note.md')" }
		},
		required: ["path"]
	},

	[TOOL_NAMES.SEARCH_NOTES]: {
		type: "object",
		properties: {
			query: { type: "string", description: "The search query" },
			limit: { type: "number", description: "Maximum number of results to return (default: 10)" }
		},
		required: ["query"]
	},

	[TOOL_NAMES.GET_ACTIVE_NOTE]: {
		type: "object",
		properties: {},
		required: []
	},

	[TOOL_NAMES.LIST_NOTES]: {
		type: "object",
		properties: {
			folder: { type: "string", description: "Folder path to list (empty or '/' for vault root)" }
		},
		required: []
	},

	[TOOL_NAMES.LIST_NOTES_RECURSIVELY]: {
		type: "object",
		properties: {
			folder: { type: "string", description: "Folder path to list recursively (empty or '/' for entire vault)" },
			limit: { type: "number", description: "Maximum number of notes to return (default: 200)" }
		},
		required: []
	},

	[TOOL_NAMES.BATCH_READ_NOTES]: {
		type: "object",
		properties: {
			paths: { 
				type: "array", 
				items: { type: "string" },
				description: "Array of note paths to read" 
			},
			aiSummarize: {
				type: "boolean",
				description: "If true, use AI to generate intelligent summaries of each file"
			},
			summaryPrompt: {
				type: "string",
				description: "Optional custom prompt for AI summarization"
			}
		},
		required: ["paths"]
	},

	[TOOL_NAMES.GET_RECENT_CHANGES]: {
		type: "object",
		properties: {
			limit: { type: "number", description: "Maximum number of files to return (default: 10)" }
		},
		required: []
	},

	[TOOL_NAMES.GET_DAILY_NOTE]: {
		type: "object",
		properties: {
			date: { type: "string", description: "Optional date in YYYY-MM-DD format. Defaults to today." }
		},
		required: []
	},

	[TOOL_NAMES.CREATE_NOTE]: {
		type: "object",
		properties: {
			path: { type: "string", description: "The path for the new note (e.g., 'folder/note.md')" },
			content: { type: "string", description: "The content of the note in Markdown format" }
		},
		required: ["path", "content"]
	},

	[TOOL_NAMES.APPEND_TO_NOTE]: {
		type: "object",
		properties: {
			path: { type: "string", description: "The path to the note file" },
			content: { type: "string", description: "The content to append" }
		},
		required: ["path", "content"]
	},

	[TOOL_NAMES.UPDATE_NOTE]: {
		type: "object",
		properties: {
			path: { type: "string", description: "The path to the note file" },
			content: { type: "string", description: "The new content to replace the existing content" }
		},
		required: ["path", "content"]
	},

	[TOOL_NAMES.DELETE_NOTE]: {
		type: "object",
		properties: {
			path: { type: "string", description: "The path to the note file to delete" }
		},
		required: ["path"]
	},

	[TOOL_NAMES.RENAME_NOTE]: {
		type: "object",
		properties: {
			oldPath: { type: "string", description: "The current path of the note" },
			newPath: { type: "string", description: "The new path for the note" }
		},
		required: ["oldPath", "newPath"]
	},

	[TOOL_NAMES.PATCH_NOTE]: {
		type: "object",
		properties: {
			path: { type: "string", description: "The path to the note file" },
			operation: { 
				type: "string", 
				enum: ["append", "prepend", "replace"],
				description: "The operation to perform" 
			},
			target_type: { 
				type: "string", 
				enum: ["heading", "block", "frontmatter", "end"],
				description: "Type of target location" 
			},
			target: { type: "string", description: "The target identifier (heading text, block ID)" },
			content: { type: "string", description: "The content to insert" }
		},
		required: ["path", "operation", "target_type", "content"]
	},

	[TOOL_NAMES.FIND_AND_REPLACE]: {
		type: "object",
		properties: {
			path: { type: "string", description: "The path to the note file" },
			find: { type: "string", description: "The text to find" },
			replace: { type: "string", description: "The text to replace with" },
			replaceAll: { type: "boolean", description: "Replace all occurrences (default: false)" }
		},
		required: ["path", "find", "replace"]
	},

	[TOOL_NAMES.OPEN_DAILY_NOTE]: {
		type: "object",
		properties: {},
		required: []
	},

	[TOOL_NAMES.OPEN_PERIODIC_NOTE]: {
		type: "object",
		properties: {
			type: { 
				type: "string", 
				enum: ["daily", "weekly", "monthly", "quarterly", "yearly"],
				description: "Type of periodic note to open" 
			},
			offset: { type: "number", description: "Offset from current period" }
		},
		required: ["type"]
	},

	[TOOL_NAMES.FETCH_WEB_PAGE]: {
		type: "object",
		properties: {
			url: { type: "string", description: "The URL of the web page to fetch" }
		},
		required: ["url"]
	},

	[TOOL_NAMES.WEB_SEARCH]: {
		type: "object",
		properties: {
			query: { type: "string", description: "The search query" },
			limit: { type: "number", description: "Maximum number of results (default: 5)" }
		},
		required: ["query"]
	},

	[TOOL_NAMES.SHOW_MARKDOWN]: {
		type: "object",
		properties: {
			content: { type: "string", description: "The markdown content to display" },
			title: { type: "string", description: "Optional title for the modal" }
		},
		required: ["content"]
	},

	[TOOL_NAMES.SPEAK]: {
		type: "object",
		properties: {
			text: { type: "string", description: "The text to speak" }
		},
		required: ["text"]
	},

	[TOOL_NAMES.ASK_QUESTION]: {
		type: "object",
		properties: {
			type: { 
				type: "string", 
				enum: ["text", "multipleChoice", "radio", "mixed"],
				description: "Type of question: 'text' for text input, 'multipleChoice' for selecting options, 'radio' for single selection, 'mixed' for options + text input" 
			},
			question: { type: "string", description: "The question to ask the user" },
			context: { type: "string", description: "Optional additional context or explanation for the question" },
			options: { 
				type: "array", 
				items: { type: "string" },
				description: "Available options (for multipleChoice, radio, or mixed types)" 
			},
			allowMultiple: { 
				type: "boolean", 
				description: "Allow selecting multiple options (for multipleChoice or mixed, default: false)" 
			},
			placeholder: { 
				type: "string", 
				description: "Placeholder text for text input (for text or mixed types)" 
			},
			textLabel: { 
				type: "string", 
				description: "Label for the text input field (for mixed type)" 
			},
			defaultValue: { 
				type: "string", 
				description: "Default text value (for text type)" 
			},
			defaultSelected: { 
				type: "array", 
				items: { type: "string" },
				description: "Pre-selected options (for multipleChoice, radio, or mixed types)" 
			},
			multiline: { 
				type: "boolean", 
				description: "Use a multiline textarea for text input (default: false)" 
			},
			required: { 
				type: "boolean", 
				description: "Whether this question is required (default: true)" 
			}
		},
		required: ["type", "question"]
	},

	[TOOL_NAMES.LIST_AVAILABLE_TOOLS]: {
		type: "object",
		properties: {
			source: {
				type: "string",
				enum: ["all", "builtin", "plugin", "mcp"],
				description: "Filter tools by source (default: 'all')"
			}
		},
		required: []
	},

	[TOOL_NAMES.LIST_AVAILABLE_SKILLS]: {
		type: "object",
		properties: {
			source: {
				type: "string",
				enum: ["all", "file", "runtime"],
				description: "Filter skills by source: 'file' for SKILL.md files, 'runtime' for SkillRegistry, 'all' for both (default: 'all')"
			}
		},
		required: []
	},

	[TOOL_NAMES.LIST_AVAILABLE_AGENTS]: {
		type: "object",
		properties: {
			name: {
				type: "string",
				description: "Optional name filter (case-insensitive substring match)"
			},
			context: {
				type: "string",
				enum: ["all", "subagent"],
				description: "Context for listing: 'subagent' to show only agents invokable by run_subagent, 'all' for everything (default: 'all')"
			}
		},
		required: []
	},

	[TOOL_NAMES.LIST_AVAILABLE_PROMPTS]: {
		type: "object",
		properties: {
			name: {
				type: "string",
				description: "Optional name filter (case-insensitive substring match)"
			}
		},
		required: []
	},

	[TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS]: {
		type: "object",
		properties: {
			applyTo: {
				type: "string",
				description: "Optional applyTo pattern filter (substring match)"
			}
		},
		required: []
	},

	[TOOL_NAMES.RUN_SUBAGENT]: {
		type: "object",
		properties: {
			agentName: {
				type: "string",
				description: "Optional name of a specific agent (.agent.md) to invoke. If omitted, runs as ad-hoc subagent."
			},
			prompt: {
				type: "string",
				description: "A detailed prompt describing the task for the subagent to perform autonomously."
			},
			timeout: {
				type: "number",
				description: "Optional timeout in milliseconds (default: 120000 - 2 minutes)."
			}
		},
		required: ["prompt"]
	},
} as const;

// ============================================================================
// Parameter Descriptions - Shared descriptions for tool parameters
// ============================================================================

/**
 * Centralized parameter descriptions for tool parameters.
 * 
 * These descriptions are used by both JSON Schema (defineTool) and Zod schemas (tool()).
 * Using consistent descriptions ensures AI models receive the same guidance regardless
 * of which provider is being used.
 * 
 * @example
 * ```typescript
 * // With Zod (realtime agent)
 * z.string().describe(PARAM_DESCRIPTIONS.path)
 * 
 * // With JSON Schema (Copilot SDK) - already embedded in TOOL_JSON_SCHEMAS
 * properties: { path: { type: "string", description: PARAM_DESCRIPTIONS.path } }
 * ```
 */
export const PARAM_DESCRIPTIONS = {
	// === Common Parameters ===
	/** Note path parameter - used by most vault operations */
	path: "The path to the note file (e.g., 'folder/note.md' or 'note.md')",
	/** Optional path with fallback to active note */
	pathOptional: "Path to the note. If not provided, uses the active note.",
	/** Path for creating a note - includes example */
	pathCreate: "The path for the new note (e.g., 'folder/note.md'). Include .md extension.",
	/** Folder path for listing */
	folder: "Folder path to list (empty or '/' for vault root)",
	/** Folder path for recursive listing */
	folderRecursive: "Folder path to list recursively (empty or '/' for entire vault)",
	/** Content parameter for notes */
	content: "The content in Markdown format",
	/** Content to append */
	contentAppend: "The content to append to the note",
	/** Limit for result counts */
	limit: "Maximum number of results to return",
	/** Query for search operations */
	query: "The search query",
	/** Text to find for replace operations */
	find: "The exact text string to find",
	/** Replacement text */
	replace: "The text to replace the found text with",
	
	// === Task Parameters ===
	/** Task description text */
	taskDescription: "The task description text",
	/** Array of task text strings */
	tasks: "Array of task description text strings to modify (text after the checkbox)",
	/** Task completion flag */
	complete: "true to mark tasks complete ([x]), false to mark incomplete ([ ]). Default: true",
	/** Task exceptions */
	exceptions: "Task text strings to exclude from the operation",
	/** Filter by completion status */
	completed: "Filter by completion status (true=completed, false=pending)",
	/** Task priority */
	priority: "Priority level (highest, high, medium, low, lowest, none)",
	/** Due date */
	dueDate: "Due date in YYYY-MM-DD format (📅)",
	/** Scheduled date */
	scheduledDate: "Scheduled date in YYYY-MM-DD format (⏳)",
	/** Start date */
	startDate: "Start date in YYYY-MM-DD format (🛫)",
	/** Due before date for filtering */
	dueBefore: "Filter tasks due before this date (YYYY-MM-DD, inclusive)",
	/** Due after date for filtering */
	dueAfter: "Filter tasks due after this date (YYYY-MM-DD, inclusive)",
	/** Due on date for filtering */
	dueOn: "Filter tasks due on this exact date (YYYY-MM-DD)",
	/** Recurrence rule */
	recurrence: "Recurrence rule (e.g., 'every day', 'every week', 'every month on the 1st')",
	/** Tags array */
	tags: "Tags to add or filter by (without # prefix)",
	
	// === Date/Period Parameters ===
	/** Date for daily notes */
	date: "Date in YYYY-MM-DD format, or natural language like 'today', 'yesterday', 'last monday'",
	/** Period for periodic notes */
	period: "The period expression (e.g., 'this week', 'last month', 'Q1 2026')",
	/** Create if missing flag */
	createIfMissing: "Whether to create the note if it doesn't exist (default: true)",
	
	// === Patch Operation Parameters ===
	/** Patch operation type */
	operation: "The operation to perform: append (after target), prepend (before target), or replace",
	/** Patch target type */
	targetType: "Type of target: heading (by heading text), block (by block ID), frontmatter, or end",
	/** Patch target identifier */
	target: "The target identifier (heading text, block ID, or empty for frontmatter/end)",
	
	// === Web Parameters ===
	/** URL for web operations */
	url: "The URL of the web page to fetch",
	
	// === Output Parameters ===
	/** Title for display */
	title: "Optional title to display",
	/** Text to speak */
	text: "The text to speak",
	
	// === AI Parameters ===
	/** AI summarize flag */
	aiSummarize: "If true, use AI to generate intelligent summaries of each file",
	/** Custom summary prompt */
	summaryPrompt: "Optional custom prompt for AI summarization",
	/** Replace all flag */
	replaceAll: "Replace all occurrences (default: false)",
} as const;

/** Type for parameter description keys */
export type ParamDescriptionKey = keyof typeof PARAM_DESCRIPTIONS;

/**
 * Get a parameter description by key.
 * 
 * @param key - The parameter description key
 * @returns The parameter description string
 * 
 * @example
 * ```typescript
 * z.string().describe(getParamDescription('path'))
 * ```
 */
export function getParamDescription(key: ParamDescriptionKey): string {
	return PARAM_DESCRIPTIONS[key];
}

// ============================================================================
// Tool Categories - For organizing tools in UI
// ============================================================================

export const TOOL_CATEGORIES = {
	READ: [
		TOOL_NAMES.READ_NOTE,
		TOOL_NAMES.SEARCH_NOTES,
		TOOL_NAMES.GET_ACTIVE_NOTE,
		TOOL_NAMES.LIST_NOTES,
		TOOL_NAMES.LIST_NOTES_RECURSIVELY,
		TOOL_NAMES.BATCH_READ_NOTES,
		TOOL_NAMES.GET_RECENT_CHANGES,
		TOOL_NAMES.GET_DAILY_NOTE,
	],
	WRITE: [
		TOOL_NAMES.CREATE_NOTE,
		TOOL_NAMES.APPEND_TO_NOTE,
		TOOL_NAMES.UPDATE_NOTE,
		TOOL_NAMES.REPLACE_NOTE,
		TOOL_NAMES.DELETE_NOTE,
		TOOL_NAMES.RENAME_NOTE,
		TOOL_NAMES.PATCH_NOTE,
		TOOL_NAMES.FIND_AND_REPLACE,
	],
	NAVIGATION: [
		TOOL_NAMES.OPEN_NOTE,
	],
	PERIODIC: [
		TOOL_NAMES.OPEN_DAILY_NOTE,
		TOOL_NAMES.OPEN_WEEKLY_NOTE,
		TOOL_NAMES.OPEN_MONTHLY_NOTE,
		TOOL_NAMES.OPEN_QUARTERLY_NOTE,
		TOOL_NAMES.OPEN_YEARLY_NOTE,
		TOOL_NAMES.OPEN_PERIODIC_NOTE,
	],
	TASKS: [
		TOOL_NAMES.GET_TASKS,
		TOOL_NAMES.CREATE_TASK,
		TOOL_NAMES.MARK_TASKS,
		TOOL_NAMES.LIST_TASKS,
		TOOL_NAMES.MARK_TASKS_COMPLETE, // deprecated
	],
	WEB: [
		TOOL_NAMES.FETCH_WEB_PAGE,
		TOOL_NAMES.WEB_SEARCH,
	],
	OUTPUT: [
		TOOL_NAMES.SEND_TO_CHAT,
		TOOL_NAMES.SHOW_MARKDOWN,
		TOOL_NAMES.SPEAK,
		TOOL_NAMES.ASK_QUESTION,
	],
	INTROSPECTION: [
		TOOL_NAMES.LIST_AVAILABLE_TOOLS,
		TOOL_NAMES.LIST_AVAILABLE_SKILLS,
		TOOL_NAMES.LIST_AVAILABLE_AGENTS,
		TOOL_NAMES.LIST_AVAILABLE_PROMPTS,
		TOOL_NAMES.LIST_AVAILABLE_INSTRUCTIONS,
	],
	AGENTS: [
		TOOL_NAMES.RUN_SUBAGENT,
	],
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the description for a tool by name.
 * 
 * Provides a safe lookup that returns a fallback description
 * for unknown tool names.
 * 
 * @param name - The tool name to look up
 * @returns The tool description, or a generic fallback for unknown tools
 * 
 * @example
 * ```typescript
 * getToolDescription('read_note');     // 'Read the content of a note...'
 * getToolDescription('unknown_tool');  // 'Tool: unknown_tool'
 * ```
 */
export function getToolDescription(name: string): string {
	return TOOL_DESCRIPTIONS[name as ToolName] ?? `Tool: ${name}`;
}

/**
 * Get the JSON schema for a tool by name.
 * 
 * Returns the JSON Schema object suitable for use with `defineTool`
 * from the Copilot SDK.
 * 
 * @param name - The tool name to look up
 * @returns The JSON Schema object, or undefined for unknown tools
 * 
 * @example
 * ```typescript
 * const schema = getToolJsonSchema('read_note');
 * if (schema) {
 *   console.log(schema.properties.path.type);  // 'string'
 *   console.log(schema.required);               // ['path']
 * }
 * ```
 */
export function getToolJsonSchema(name: string): JsonSchemaObject | undefined {
	return TOOL_JSON_SCHEMAS[name];
}

/**
 * Check if a tool name is valid.
 * 
 * Type guard function that narrows a string to the ToolName type
 * if it matches a known tool.
 * 
 * @param name - The string to check
 * @returns True if the name is a valid tool name, false otherwise
 * 
 * @example
 * ```typescript
 * if (isValidToolName(userInput)) {
 *   // userInput is now typed as ToolName
 *   const desc = TOOL_DESCRIPTIONS[userInput];
 * }
 * ```
 */
export function isValidToolName(name: string): name is ToolName {
	return Object.values(TOOL_NAMES).includes(name as ToolName);
}
