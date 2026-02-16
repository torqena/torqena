/**
 * WorkIQAgent - Specialist agent for WorkIQ integration
 *
 * This agent works with the WorkIQ MCP server to provide access to Microsoft 365 data:
 * - Emails: "What did John say about the proposal?"
 * - Meetings: "What's on my calendar tomorrow?"
 * - Documents: "Find my recent PowerPoint presentations"
 * - Teams: "Summarize today's messages in the Engineering channel"
 * - People: "Who is working on Project Alpha?"
 *
 * The agent dynamically discovers available WorkIQ tools from the MCP server.
 *
 * Note: WorkIQ requires EULA acceptance on first use (`workiq accept-eula`)
 * and admin consent for Microsoft 365 permissions.
 */

import { App } from "obsidian";
import type { tool } from "@openai/agents/realtime";
import { BaseVoiceAgent } from "../../BaseVoiceAgent";
import {
	RealtimeToolConfig,
	DEFAULT_TOOL_CONFIG,
	logger,
} from "../../types";
import { createMcpTools } from "../../tools/mcp-tools";
import { createOutputTools } from "../../tools/output-tools";
import { createQuestionTools } from "../../tools/question-tools";
import type { VoiceAgentDefinition } from "../../../customization/CustomizationLoader";
import {
	getVoiceAgentRegistry,
	VoiceAgentRegistration,
} from "../../VoiceAgentRegistry";
import type { WorkIQAgentConfig } from "./types";

/** Agent ID constant */
export const WORKIQ_AGENT_ID = "workiq";

/** Definition file name for this agent */
export const WORKIQ_AGENT_DEFINITION_FILE = "workiq.voice-agent.md";

/** Pattern to match WorkIQ MCP tools */
const WORKIQ_TOOL_PATTERNS = [
	/^mcp_workiq_/i,
	/^mcp_copilot[-_]cli[-_]workiq_/i,
	/workiq/i,
];

/** Default instructions for WorkIQ integration */
const DEFAULT_WORKIQ_INSTRUCTIONS = `You are a WorkIQ specialist for querying Microsoft 365 data.

## Your Expertise
You connect to Microsoft 365 through the WorkIQ MCP server. You can help with:

### Emails
- "What did John say about the proposal?"
- "Show my recent emails from Sarah"
- "Summarize emails about the budget"

### Meetings
- "What's on my calendar tomorrow?"
- "What meetings do I have this week?"
- "Who's invited to the project sync?"

### Documents
- "Find my recent PowerPoint presentations"
- "Show documents I worked on yesterday"
- "Find files about Q4 planning"

### Teams Messages
- "Summarize today's messages in the Engineering channel"
- "What did the team discuss about the release?"
- "Show recent chat messages"

### People
- "Who is working on Project Alpha?"
- "Find experts in data science"
- "Who reports to Sarah?"

## Authentication

WorkIQ uses Microsoft Entra ID (Azure AD) authentication.
On first use, a browser window will open for sign-in.
If the user encounters permission issues:
1. They may need admin consent for their Microsoft 365 tenant
2. Direct them to contact their IT administrator if access is denied

## How to Handle Requests

### When querying M365 data:
1. Use the appropriate WorkIQ tool for the data type
2. Summarize results conversationally
3. Offer to provide more details if needed

### When authentication issues occur:
1. Explain that a browser window should open for Microsoft sign-in
2. Admin consent may be required for M365 API access
3. Suggest contacting their IT administrator if permission denied

## Response Style
Be efficient and helpful. Summarize data naturally:
- "You have 3 meetings tomorrow, starting with..."
- "John mentioned the proposal deadline is Friday"
- "Found 5 documents about the project"

## Context Updates
When [INTERNAL CONTEXT UPDATE] messages arrive, note them silently - do not speak about them.

## Handoffs
If the user asks about:
- **Notes in Obsidian** (reading, creating, editing notes): Hand off to Note Manager
- **Tasks/checklists in notes** (markdown tasks, completing items): Hand off to Task Manager
`;

/**
 * WorkIQAgent - Specialist for WorkIQ MCP integration
 */
export class WorkIQAgent extends BaseVoiceAgent {
	private toolConfig: RealtimeToolConfig;
	private voiceAgentDefinition: VoiceAgentDefinition | null = null;
	private mcpToolPattern: RegExp[];

	constructor(
		app: App,
		config: WorkIQAgentConfig,
		definition?: VoiceAgentDefinition
	) {
		super("WorkIQ", app, config);
		this.toolConfig = { ...DEFAULT_TOOL_CONFIG, ...config.toolConfig };
		this.voiceAgentDefinition = definition || null;

		// Set up tool matching patterns
		this.mcpToolPattern = WORKIQ_TOOL_PATTERNS;
	}

	// =========================================================================
	// Abstract Method Implementations
	// =========================================================================

	getInstructions(): string {
		// Use loaded markdown instructions if available
		if (this.voiceAgentDefinition?.instructions) {
			return this.voiceAgentDefinition.instructions;
		}
		return DEFAULT_WORKIQ_INSTRUCTIONS;
	}

	getHandoffDescription(): string {
		// Use loaded definition if available
		if (this.voiceAgentDefinition?.handoffDescription) {
			return this.voiceAgentDefinition.handoffDescription;
		}
		return "Specialist agent for Microsoft 365 data via WorkIQ. Hand off when the user wants to query emails, meetings, calendar, documents, Teams messages, or people in their M365 environment.";
	}

	getTools(): ReturnType<typeof tool>[] {
		const tools: ReturnType<typeof tool>[] = [];

		// Add output tools (send_to_chat) for displaying content in ChatView
		const outputTools = createOutputTools(
			this.getChatOutputCallback(),
			this.name,
			new Set() // No approval needed for output tools
		);
		tools.push(...outputTools);

		// Add question tools for asking user for input
		const questionTools = createQuestionTools(
			this.getQuestionCallback(),
			this.name,
			new Set() // No approval needed for question tools
		);
		tools.push(...questionTools);

		// Get tools from definition if specified
		const definedTools = this.voiceAgentDefinition?.tools || [];

		if (definedTools.length > 0) {
			// Definition specifies exact tools - filter MCP tools to match
			const mcpTools = createMcpTools(
				this.config.mcpManager,
				this.onToolExecution,
				false // No approval needed
			);

			for (const mcpTool of mcpTools) {
				const toolName = (mcpTool as { name?: string }).name || "";
				if (definedTools.includes(toolName)) {
					tools.push(mcpTool);
				}
			}
		} else {
			// No specific tools defined - discover WorkIQ tools by pattern
			const mcpTools = createMcpTools(
				this.config.mcpManager,
				this.onToolExecution,
				false
			);

			for (const mcpTool of mcpTools) {
				const toolName = (mcpTool as { name?: string }).name || "";
				if (this.isWorkIQTool(toolName)) {
					tools.push(mcpTool);
					logger.debug(`[${this.name}] Added WorkIQ tool: ${toolName}`);
				}
			}
		}

		logger.info(
			`[${this.name}] Created ${tools.length} WorkIQ tools`
		);
		return tools;
	}

	/**
	 * Check if a tool name matches WorkIQ patterns
	 */
	private isWorkIQTool(toolName: string): boolean {
		return this.mcpToolPattern.some((pattern) => pattern.test(toolName));
	}

	// =========================================================================
	// Static Registration
	// =========================================================================

	/**
	 * Get the registration metadata for this agent type
	 */
	static getRegistration(): VoiceAgentRegistration {
		return {
			id: WORKIQ_AGENT_ID,
			name: "WorkIQ",
			description:
				"Specialist agent for Microsoft 365 data via WorkIQ MCP - emails, meetings, documents, Teams, people",
			definitionFileName: WORKIQ_AGENT_DEFINITION_FILE,
			factory: (app, config, definition) =>
				new WorkIQAgent(app, config as WorkIQAgentConfig, definition),
			isBuiltIn: true,
			priority: 90, // Lower than Note/Task managers
		};
	}

	/**
	 * Register this agent type with the global registry
	 */
	static register(): void {
		getVoiceAgentRegistry().register(WorkIQAgent.getRegistration());
	}

	/**
	 * Unregister this agent type from the global registry
	 */
	static unregister(): void {
		getVoiceAgentRegistry().unregister(WORKIQ_AGENT_ID);
	}
}
