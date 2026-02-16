/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AutomationTypes
 * @description Type definitions for automation extensions and automation engine.
 * 
 * Automations allow users to create scheduled or event-triggered workflows that
 * automatically execute agents, prompts, skills, or vault operations.
 * 
 * @example
 * ```typescript
 * import { AutomationManifest, AutomationTrigger, AutomationAction } from './automation/types';
 * 
 * const automation: AutomationManifest = {
 *   id: 'daily-note-automation',
 *   type: 'automation',
 *   triggers: [{ type: 'schedule', schedule: '0 6 * * *' }],
 *   actions: [{ type: 'run-agent', agentId: 'daily-journal' }]
 * };
 * ```
 * 
 * @since 0.1.0
 */

/**
 * Types of triggers that can activate an automation
 */
export type AutomationTriggerType =
	| 'schedule'        // Time-based trigger using cron expressions
	| 'file-created'    // When a file is created matching a pattern
	| 'file-modified'   // When a file is modified matching a pattern
	| 'file-deleted'    // When a file is deleted matching a pattern
	| 'vault-opened'    // When the vault is opened
	| 'tag-added'       // When a specific tag is added to a note
	| 'startup';        // When the plugin starts

/**
 * Types of actions that can be executed by an automation
 */
export type AutomationActionType =
	| 'run-agent'       // Execute an AI agent
	| 'run-prompt'      // Execute a prompt
	| 'run-skill'       // Execute a skill
	| 'create-note'     // Create a new note
	| 'update-note'     // Update an existing note
	| 'run-shell';      // Execute a shell command (desktop only)

/**
 * Base interface for all automation triggers
 */
export interface AutomationTriggerBase {
	/** Type of trigger */
	type: AutomationTriggerType;
	/** Delay in milliseconds before executing actions after trigger fires */
	delay?: number;
}

/**
 * Schedule-based trigger using cron expressions
 * 
 * @example
 * ```typescript
 * // Daily at 9am
 * { type: 'schedule', schedule: '0 9 * * *' }
 * 
 * // Every 2 hours
 * { type: 'schedule', schedule: '0 *\/2 * * *' }
 * 
 * // Every Monday at midnight
 * { type: 'schedule', schedule: '0 0 * * 1' }
 * ```
 */
export interface ScheduleTrigger extends AutomationTriggerBase {
	type: 'schedule';
	/** Cron expression (minute hour day month weekday) */
	schedule: string;
}

/**
 * File-based trigger (created, modified, or deleted)
 * 
 * @example
 * ```typescript
 * // Trigger on any markdown file in Daily Notes folder
 * { type: 'file-created', pattern: 'Daily Notes/*.md' }
 * 
 * // Trigger on any file in Projects
 * { type: 'file-modified', pattern: 'Projects/**\/*' }
 * ```
 */
export interface FileTrigger extends AutomationTriggerBase {
	type: 'file-created' | 'file-modified' | 'file-deleted';
	/** File path pattern with wildcards (* and **) */
	pattern: string;
}

/**
 * Vault-opened trigger (fires when vault opens)
 */
export interface VaultOpenedTrigger extends AutomationTriggerBase {
	type: 'vault-opened';
}

/**
 * Tag-added trigger (fires when a tag is added to a note)
 * 
 * @example
 * ```typescript
 * { type: 'tag-added', tag: '#review' }
 * ```
 */
export interface TagAddedTrigger extends AutomationTriggerBase {
	type: 'tag-added';
	/** Tag name (with or without #) */
	tag: string;
}

/**
 * Startup trigger (fires when plugin loads)
 */
export interface StartupTrigger extends AutomationTriggerBase {
	type: 'startup';
}

/**
 * Union type for all trigger types
 */
export type AutomationTrigger =
	| ScheduleTrigger
	| FileTrigger
	| VaultOpenedTrigger
	| TagAddedTrigger
	| StartupTrigger;

/**
 * Base interface for all automation actions
 */
export interface AutomationActionBase {
	/** Type of action */
	type: AutomationActionType;
	/** Input parameters to pass to the action */
	input?: Record<string, unknown>;
}

/**
 * Run an AI agent action
 */
export interface RunAgentAction extends AutomationActionBase {
	type: 'run-agent';
	/** ID of the agent to run */
	agentId: string;
}

/**
 * Run a prompt action
 */
export interface RunPromptAction extends AutomationActionBase {
	type: 'run-prompt';
	/** ID of the prompt to run */
	promptId: string;
}

/**
 * Run a skill action
 */
export interface RunSkillAction extends AutomationActionBase {
	type: 'run-skill';
	/** ID of the skill to run */
	skillId: string;
}

/**
 * Create a note action
 */
export interface CreateNoteAction extends AutomationActionBase {
	type: 'create-note';
	/** Target path for the new note */
	path: string;
	/** Template content or path to template file */
	template?: string;
}

/**
 * Update a note action
 */
export interface UpdateNoteAction extends AutomationActionBase {
	type: 'update-note';
	/** Path to the note to update */
	path: string;
	/** Template content for update */
	template?: string;
}

/**
 * Run a shell command action (desktop only)
 */
export interface RunShellAction extends AutomationActionBase {
	type: 'run-shell';
	/** Shell command to execute */
	command: string;
}

/**
 * Union type for all action types
 */
export type AutomationAction =
	| RunAgentAction
	| RunPromptAction
	| RunSkillAction
	| CreateNoteAction
	| UpdateNoteAction
	| RunShellAction;

/**
 * Automation configuration within an extension manifest
 */
export interface AutomationConfig {
	/** List of triggers that activate this automation */
	triggers: AutomationTrigger[];
	/** List of actions to execute when triggered */
	actions: AutomationAction[];
	/** Whether the automation is enabled by default after installation */
	enabled?: boolean;
	/** Whether to run the automation immediately upon installation */
	runOnInstall?: boolean;
}

/**
 * Runtime state of an automation instance
 */
export interface AutomationInstance {
	/** Unique ID of the automation (from manifest) */
	id: string;
	/** Display name of the automation */
	name: string;
	/** Automation configuration */
	config: AutomationConfig;
	/** Whether the automation is currently enabled */
	enabled: boolean;
	/** Last execution timestamp */
	lastRun?: number;
	/** Next scheduled execution timestamp (for schedule triggers) */
	nextRun?: number;
	/** Execution count */
	executionCount: number;
	/** Last execution result */
	lastResult?: AutomationExecutionResult;
}

/**
 * Result of an automation execution
 */
export interface AutomationExecutionResult {
	/** Whether the execution was successful */
	success: boolean;
	/** Timestamp of execution */
	timestamp: number;
	/** Trigger that activated this execution */
	trigger: AutomationTrigger;
	/** Results from each action */
	actionResults: ActionExecutionResult[];
	/** Error message if execution failed */
	error?: string;
}

/**
 * Result of a single action execution
 */
export interface ActionExecutionResult {
	/** The action that was executed */
	action: AutomationAction;
	/** Whether the action was successful */
	success: boolean;
	/** Result data from the action */
	result?: unknown;
	/** Error message if action failed */
	error?: string;
	/** Execution duration in milliseconds */
	duration: number;
}

/**
 * Automation execution context passed to actions
 */
export interface AutomationExecutionContext {
	/** The automation being executed */
	automation: AutomationInstance;
	/** The trigger that activated this execution */
	trigger: AutomationTrigger;
	/** Trigger-specific data (e.g., file path for file triggers) */
	triggerData?: {
		filePath?: string;
		tag?: string;
	};
	/** Timestamp when execution started */
	startTime: number;
	/** Results from previously executed actions in this pipeline */
	previousResults: ActionExecutionResult[];
}

/**
 * Automation history entry for logging/debugging
 */
export interface AutomationHistoryEntry {
	/** Automation ID */
	automationId: string;
	/** Execution result */
	result: AutomationExecutionResult;
	/** Timestamp */
	timestamp: number;
}

/**
 * Persistent state for automation engine
 */
export interface AutomationEngineState {
	/** Map of automation ID to instance */
	automations: Record<string, AutomationInstance>;
	/** Execution history (limited to recent entries) */
	history: AutomationHistoryEntry[];
	/** Last cleanup timestamp */
	lastCleanup?: number;
}
