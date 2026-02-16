/**
 * TaskManagementAgent - Specialist agent for task and checklist management
 * 
 * Handles:
 * - Getting tasks from notes
 * - Marking tasks complete/incomplete
 * - Creating new tasks
 * - Listing and filtering tasks
 */

import { App } from "obsidian";
import type { tool } from "@openai/agents/realtime";
import { BaseVoiceAgent } from "../../BaseVoiceAgent";
import {
	BaseVoiceAgentConfig,
	RealtimeToolConfig,
	DEFAULT_TOOL_CONFIG,
	logger,
} from "../../types";
import { createToolsForAgent } from "../../tools/tool-manager";
import type { VoiceAgentDefinition } from "../../../customization/CustomizationLoader";
import { getVoiceAgentRegistry, VoiceAgentRegistration } from "../../VoiceAgentRegistry";

/** Agent ID constant */
export const TASK_AGENT_ID = "task-manager";

/** Definition file name for this agent */
export const TASK_AGENT_DEFINITION_FILE = "task-manager.voice-agent.md";

/** Default instructions for task management */
const DEFAULT_TASK_INSTRUCTIONS = `You are a task management specialist for an Obsidian vault.

## Your Expertise
You specialize in managing tasks, checklists, and to-do items within notes. You have access to tools for:
- Getting all tasks from a note with full metadata (priorities, dates, tags)
- Marking tasks as complete or incomplete
- Creating new tasks with Obsidian Tasks syntax
- Listing and filtering tasks by various criteria

## How to Handle Requests

### When asked to mark tasks complete:
- Use the mark_tasks tool with the task text strings
- You can mark multiple tasks at once
- Confirm when done with a brief acknowledgment

### When asked to create tasks:
- Use the create_task tool
- You can add priorities, due dates, scheduled dates, recurrence, and tags
- Confirm the task was created

### When asked about tasks:
- Use get_tasks to read all tasks from a note
- Use list_tasks to filter tasks by criteria (completed, priority, due date, tags)

## Switching to Other Agents
If the user asks for something outside your expertise, tell them to ask for that specifically. For example:
- For note operations (reading, searching, creating, editing notes): Say "I can help with tasks. For note operations, just say 'switch to notes' or 'I need help with notes'."
- For web searches or general questions: Say "For that, just say 'switch to main' or 'I need general help'."

Keywords that signal the user wants to switch agents:
- "switch to notes", "note manager", "help with notes"
- "switch to main", "main assistant", "general help"
- "go back", "return to main"

When you hear these phrases, acknowledge and let the system handle the handoff.

## Response Style
Be brief and efficient. After completing an action, confirm with a short response like "Done" or "Tasks marked complete."

## Context Updates
When [INTERNAL CONTEXT UPDATE] messages arrive, note them silently - do not speak about them.
`;

/** Default task tools */
const DEFAULT_TASK_TOOLS = [
	"get_tasks",
	"mark_tasks",
	"create_task",
	"list_tasks",
];

/**
 * TaskManagementAgent - Specialist for task operations
 */
export class TaskManagementAgent extends BaseVoiceAgent {
	private toolConfig: RealtimeToolConfig;
	private voiceAgentDefinition: VoiceAgentDefinition | null = null;

	constructor(
		app: App,
		config: BaseVoiceAgentConfig,
		definition?: VoiceAgentDefinition
	) {
		super("Task Manager", app, config);
		this.toolConfig = { ...DEFAULT_TOOL_CONFIG, ...config.toolConfig };
		this.voiceAgentDefinition = definition || null;
	}

	// =========================================================================
	// Abstract Method Implementations
	// =========================================================================

	getInstructions(): string {
		// Use loaded markdown instructions if available
		if (this.voiceAgentDefinition?.instructions) {
			return this.voiceAgentDefinition.instructions;
		}
		return DEFAULT_TASK_INSTRUCTIONS;
	}

	getHandoffDescription(): string {
		// Use loaded definition if available
		if (this.voiceAgentDefinition?.handoffDescription) {
			return this.voiceAgentDefinition.handoffDescription;
		}
		return "Specialist agent for managing tasks, checklists, and to-do items in notes. Hand off to this agent when the user wants to mark tasks complete, create tasks, or query task status.";
	}

	getTools(): ReturnType<typeof tool>[] {
		// Get tool names from definition or use defaults (task tools only)
		const allowedTools = this.voiceAgentDefinition?.tools || DEFAULT_TASK_TOOLS;

		logger.info(`[${this.name}] Creating tools: ${allowedTools.join(", ")}`);

		return createToolsForAgent(
			allowedTools,
			this.app,
			this.toolConfig,
			this.config.mcpManager,
			this.onToolExecution,
			this.config.periodicNotesSettings,
			this.getChatOutputCallback(),
			this.getQuestionCallback(),
			this.name
		);
	}

	// =========================================================================
	// Static Registration
	// =========================================================================

	/**
	 * Get the registration metadata for this agent type
	 */
	static getRegistration(): VoiceAgentRegistration {
		return {
			id: TASK_AGENT_ID,
			name: "Task Manager",
			description: "Specialist agent for task and checklist management in notes",
			definitionFileName: TASK_AGENT_DEFINITION_FILE,
			factory: (app, config, definition) => new TaskManagementAgent(app, config, definition),
			isBuiltIn: true,
			priority: 100,
		};
	}

	/**
	 * Register this agent type with the global registry
	 */
	static register(): void {
		getVoiceAgentRegistry().register(TaskManagementAgent.getRegistration());
	}

	/**
	 * Unregister this agent type from the global registry
	 */
	static unregister(): void {
		getVoiceAgentRegistry().unregister(TASK_AGENT_ID);
	}
}
