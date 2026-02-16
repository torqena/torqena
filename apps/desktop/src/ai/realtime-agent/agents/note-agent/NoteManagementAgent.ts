/**
 * NoteManagementAgent - Specialist agent for note operations
 * 
 * Handles:
 * - Reading notes
 * - Searching notes
 * - Creating notes
 * - Editing notes (append, update, replace)
 * - Listing notes
 * - Getting active note
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
export const NOTE_AGENT_ID = "note-manager";

/** Definition file name for this agent */
export const NOTE_AGENT_DEFINITION_FILE = "note-manager.voice-agent.md";

/** Default instructions for note management */
const DEFAULT_NOTE_INSTRUCTIONS = `You are a note management specialist for an Obsidian vault.

## Your Expertise
You specialize in reading, creating, searching, and editing notes within the vault. You have access to tools for:
- Reading note content by path
- Searching notes by keywords and content
- Getting the currently active/open note
- Listing notes in folders
- Creating new notes
- Appending content to existing notes
- Updating note content (find and replace)
- Replacing entire note content

## How to Handle Requests

### When asked to read a note:
- Use read_note with the note path
- Summarize key points rather than reading everything verbatim
- If the note is long, ask if they want specific sections

### When asked to find notes:
- Use search_notes with relevant keywords
- Present results concisely with paths and brief descriptions

### When asked about "this note" or "current note":
- ALWAYS use get_active_note first to see what's open
- Then proceed with the requested operation

### When asked to create a note:
- Use create_note with the path and content
- Confirm the path/location before creating if ambiguous

### When asked to edit a note:
- Use append_to_note to add content at the end
- Use update_note for find/replace operations
- Use replace_note to completely replace content
- Confirm what changes were made

## Switching to Other Agents
If the user asks for something outside your expertise, tell them to ask for that specifically. For example:
- For task operations (marking complete, creating tasks, listing tasks): Say "I can help with notes. For task management, just say 'switch to tasks' or 'I need help with tasks'."
- For web searches or general questions: Say "For that, just say 'switch to main' or 'I need general help'."

Keywords that signal the user wants to switch agents:
- "switch to tasks", "task manager", "help with tasks"
- "switch to main", "main assistant", "general help"
- "go back", "return to main"

When you hear these phrases, acknowledge and let the system handle the handoff.

## Response Style
Be brief and efficient. After completing an action, confirm with a short response like "Done" or "Note created."

## Context Updates
When [INTERNAL CONTEXT UPDATE] messages arrive, note them silently - do not speak about them.
`;

/** Default note tools */
const DEFAULT_NOTE_TOOLS = [
	"read_note",
	"search_notes",
	"get_active_note",
	"list_notes",
	"create_note",
	"append_to_note",
	"update_note",
	"replace_note",
];

/**
 * NoteManagementAgent - Specialist for note operations
 */
export class NoteManagementAgent extends BaseVoiceAgent {
	private toolConfig: RealtimeToolConfig;
	private voiceAgentDefinition: VoiceAgentDefinition | null = null;

	constructor(
		app: App,
		config: BaseVoiceAgentConfig,
		definition?: VoiceAgentDefinition
	) {
		super("Note Manager", app, config);
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
		return DEFAULT_NOTE_INSTRUCTIONS;
	}

	getHandoffDescription(): string {
		// Use loaded definition if available
		if (this.voiceAgentDefinition?.handoffDescription) {
			return this.voiceAgentDefinition.handoffDescription;
		}
		return "Specialist agent for note operations. Hand off when the user wants to read, search, create, or edit notes in their vault.";
	}

	getTools(): ReturnType<typeof tool>[] {
		// Get tool names from definition or use defaults (note tools only)
		const allowedTools = this.voiceAgentDefinition?.tools || DEFAULT_NOTE_TOOLS;

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
			id: NOTE_AGENT_ID,
			name: "Note Manager",
			description: "Specialist agent for note operations (read, search, create, edit)",
			definitionFileName: NOTE_AGENT_DEFINITION_FILE,
			factory: (app, config, definition) => new NoteManagementAgent(app, config, definition),
			isBuiltIn: true,
			priority: 100,
		};
	}

	/**
	 * Register this agent type with the global registry
	 */
	static register(): void {
		getVoiceAgentRegistry().register(NoteManagementAgent.getRegistration());
	}

	/**
	 * Unregister this agent type from the global registry
	 */
	static unregister(): void {
		getVoiceAgentRegistry().unregister(NOTE_AGENT_ID);
	}
}
