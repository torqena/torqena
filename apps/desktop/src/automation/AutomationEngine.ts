/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AutomationEngine
 * @description Core automation engine for managing scheduled and event-triggered workflows.
 * 
 * The AutomationEngine handles:
 * - Registration and unregistration of automations
 * - Schedule-based triggers using cron expressions
 * - Event-based triggers (file events, vault events, tag events)
 * - Action execution (agents, prompts, skills, note operations)
 * - State persistence and history tracking
 * - Error handling and retry logic
 * 
 * @example
 * ```typescript
 * const engine = new AutomationEngine(app, plugin);
 * await engine.initialize();
 * 
 * // Register an automation
 * await engine.registerAutomation({
 *   id: 'daily-note',
 *   name: 'Daily Note Creator',
 *   config: {
 *     triggers: [{ type: 'schedule', schedule: '0 9 * * *' }],
 *     actions: [{ type: 'run-agent', agentId: 'daily-journal' }]
 *   },
 *   enabled: true,
 *   executionCount: 0
 * });
 * ```
 * 
 * @since 0.1.0
 */

import { App, TFile, Notice } from 'obsidian';
import { CronExpressionParser } from 'cron-parser';
import type { AIServiceManager as VaultCopilotPlugin } from '../app/AIServiceManager';
import {
	AutomationInstance,
	AutomationEngineState,
	AutomationTrigger,
	AutomationAction,
	AutomationExecutionContext,
	AutomationExecutionResult,
	ActionExecutionResult,
	AutomationHistoryEntry,
	ScheduleTrigger,
	FileTrigger,
} from './types';

/**
 * Core automation engine singleton
 */
export class AutomationEngine {
	private app: App;
	private plugin: VaultCopilotPlugin;
	private state: AutomationEngineState;
	private scheduledTimers: Map<string, NodeJS.Timeout> = new Map();
	private eventRegistrations: Map<string, () => void> = new Map();
	private maxHistoryEntries = 100;
	private stateFilePath = '.torqena/automations.json';
	private auditLogPath = '.obsidian/plugins/torqena/automation-audit.md';

	constructor(app: App, plugin: VaultCopilotPlugin) {
		this.app = app;
		this.plugin = plugin;
		this.state = {
			automations: {},
			history: [],
		};
	}

	/**
	 * Initialize the automation engine
	 * Loads state and sets up event listeners
	 */
	async initialize(): Promise<void> {
		console.log('AutomationEngine: Initializing...');
		await this.loadState();
		this.setupVaultListeners();
		this.startScheduledAutomations();
		this.runStartupAutomations();
		console.log(`AutomationEngine: Initialized with ${Object.keys(this.state.automations).length} automations`);
	}

	/**
	 * Shutdown the automation engine
	 * Stops all timers and saves state
	 */
	async shutdown(): Promise<void> {
		console.log('AutomationEngine: Shutting down...');
		this.stopAllScheduledAutomations();
		this.cleanupEventListeners();
		await this.saveState();
		console.log('AutomationEngine: Shutdown complete');
	}

	/**
	 * Register a new automation
	 * 
	 * @param automation - Automation instance to register
	 * @throws {Error} If automation with same ID already exists
	 */
	async registerAutomation(automation: AutomationInstance): Promise<void> {
		if (this.state.automations[automation.id]) {
			throw new Error(`Automation with ID ${automation.id} already exists`);
		}

		console.log(`AutomationEngine: Registering automation '${automation.name}' (${automation.id})`);
		this.state.automations[automation.id] = automation;

		if (automation.enabled) {
			await this.activateAutomation(automation.id);
		}

		await this.saveState();
		new Notice(`Automation '${automation.name}' registered`);
	}

	/**
	 * Unregister an automation
	 * 
	 * @param automationId - ID of automation to unregister
	 */
	async unregisterAutomation(automationId: string): Promise<void> {
		const automation = this.state.automations[automationId];
		if (!automation) {
			console.warn(`AutomationEngine: Automation ${automationId} not found`);
			return;
		}

		console.log(`AutomationEngine: Unregistering automation '${automation.name}' (${automationId})`);
		await this.deactivateAutomation(automationId);
		delete this.state.automations[automationId];
		await this.saveState();
		new Notice(`Automation '${automation.name}' unregistered`);
	}

	/**
	 * Enable an automation
	 * 
	 * @param automationId - ID of automation to enable
	 */
	async enableAutomation(automationId: string): Promise<void> {
		const automation = this.state.automations[automationId];
		if (!automation) {
			throw new Error(`Automation ${automationId} not found`);
		}

		if (!automation.enabled) {
			automation.enabled = true;
			await this.activateAutomation(automationId);
			await this.saveState();
			new Notice(`Automation '${automation.name}' enabled`);
		}
	}

	/**
	 * Disable an automation
	 * 
	 * @param automationId - ID of automation to disable
	 */
	async disableAutomation(automationId: string): Promise<void> {
		const automation = this.state.automations[automationId];
		if (!automation) {
			throw new Error(`Automation ${automationId} not found`);
		}

		if (automation.enabled) {
			automation.enabled = false;
			await this.deactivateAutomation(automationId);
			await this.saveState();
			new Notice(`Automation '${automation.name}' disabled`);
		}
	}

	/**
	 * Manually run an automation
	 * 
	 * @param automationId - ID of automation to run
	 * @param trigger - Optional trigger to use (defaults to manual trigger)
	 */
	async runAutomation(automationId: string, trigger?: AutomationTrigger): Promise<AutomationExecutionResult> {
		const automation = this.state.automations[automationId];
		if (!automation) {
			throw new Error(`Automation ${automationId} not found`);
		}

		// Use first trigger if not specified
		const executionTrigger = trigger || automation.config.triggers[0];
		if (!executionTrigger) {
			throw new Error(`Automation ${automationId} has no triggers defined`);
		}

		return await this.executeAutomation(automation, executionTrigger);
	}

	/**
	 * Get all registered automations
	 */
	getAllAutomations(): AutomationInstance[] {
		return Object.values(this.state.automations);
	}

	/**
	 * Update an existing automation's configuration
	 * 
	 * Re-schedules timers if the automation is enabled and triggers changed.
	 * 
	 * @param automationId - ID of automation to update
	 * @param updates - Partial automation instance fields to merge
	 * @throws {Error} If automation not found
	 */
	async updateAutomation(automationId: string, updates: Partial<Pick<AutomationInstance, 'name' | 'config' | 'enabled'>>): Promise<void> {
		const automation = this.state.automations[automationId];
		if (!automation) {
			throw new Error(`Automation ${automationId} not found`);
		}

		// Deactivate before updating so timers/listeners are refreshed
		await this.deactivateAutomation(automationId);

		if (updates.name !== undefined) {
			automation.name = updates.name;
		}
		if (updates.config !== undefined) {
			automation.config = updates.config;
		}
		if (updates.enabled !== undefined) {
			automation.enabled = updates.enabled;
		}

		// Re-activate if enabled
		if (automation.enabled) {
			await this.activateAutomation(automationId);
		}

		await this.saveState();
		new Notice(`Automation '${automation.name}' updated`);
	}

	/**
	 * Get automation by ID
	 */
	getAutomation(automationId: string): AutomationInstance | undefined {
		return this.state.automations[automationId];
	}

	/**
	 * Get execution history
	 */
	getHistory(limit?: number): AutomationHistoryEntry[] {
		const history = [...this.state.history].reverse(); // Most recent first
		return limit ? history.slice(0, limit) : history;
	}

	/**
	 * Get execution history for a specific automation
	 *
	 * @param automationId - ID of the automation to filter by
	 * @param limit - Maximum number of entries to return
	 * @returns History entries for the specified automation, most recent first
	 */
	getHistoryForAutomation(automationId: string, limit?: number): AutomationHistoryEntry[] {
		const filtered = [...this.state.history]
			.filter(entry => entry.automationId === automationId)
			.reverse();
		return limit ? filtered.slice(0, limit) : filtered;
	}

	/**
	 * Clear execution history
	 */
	async clearHistory(): Promise<void> {
		this.state.history = [];
		await this.saveState();
	}

	// =========================================================================
	// Private Methods
	// =========================================================================

	/**
	 * Activate an automation (set up timers and listeners)
	 */
	private async activateAutomation(automationId: string): Promise<void> {
		const automation = this.state.automations[automationId];
		if (!automation) return;

		console.log(`AutomationEngine: Activating automation '${automation.name}'`);

		for (const trigger of automation.config.triggers) {
			if (trigger.type === 'schedule') {
				this.scheduleAutomation(automationId, trigger);
			}
			// Event-based triggers are handled globally via vault listeners
		}
	}

	/**
	 * Deactivate an automation (clear timers and listeners)
	 */
	private async deactivateAutomation(automationId: string): Promise<void> {
		const automation = this.state.automations[automationId];
		if (!automation) return;

		console.log(`AutomationEngine: Deactivating automation '${automation.name}'`);

		// Clear scheduled timers
		const timerKey = this.getTimerKey(automationId);
		const timer = this.scheduledTimers.get(timerKey);
		if (timer) {
			clearTimeout(timer);
			this.scheduledTimers.delete(timerKey);
		}
	}

	/**
	 * Schedule an automation with a cron expression
	 */
	private scheduleAutomation(automationId: string, trigger: ScheduleTrigger): void {
		try {
			const interval = CronExpressionParser.parse(trigger.schedule);
			const nextRun = interval.next().toDate();
			const automation = this.state.automations[automationId];
			
			if (automation) {
				automation.nextRun = nextRun.getTime();
			}

			const delay = nextRun.getTime() - Date.now();
			console.log(`AutomationEngine: Scheduling '${automation?.name}' to run at ${nextRun.toISOString()}`);

			const timerKey = this.getTimerKey(automationId);
			const timer = setTimeout(async () => {
				await this.executeAutomation(automation!, trigger);
				// Reschedule for next occurrence
				this.scheduleAutomation(automationId, trigger);
			}, delay);

			this.scheduledTimers.set(timerKey, timer);
		} catch (error) {
			console.error(`AutomationEngine: Failed to schedule automation ${automationId}:`, error);
			new Notice(`Failed to schedule automation: Invalid cron expression`);
		}
	}

	/**
	 * Execute an automation
	 */
	private async executeAutomation(
		automation: AutomationInstance,
		trigger: AutomationTrigger
	): Promise<AutomationExecutionResult> {
		console.log(`AutomationEngine: Executing automation '${automation.name}' (trigger: ${trigger.type})`);

		const context: AutomationExecutionContext = {
			automation,
			trigger,
			startTime: Date.now(),
			previousResults: [],
		};

		const actionResults: ActionExecutionResult[] = [];
		let overallSuccess = true;
		let overallError: string | undefined;

		// Apply trigger delay if specified
		if (trigger.delay && trigger.delay > 0) {
			await this.sleep(trigger.delay);
		}

		// Execute each action in sequence, piping output forward
		for (const action of automation.config.actions) {
			try {
				const enrichedAction = this.enrichActionInput(action, context.previousResults);
				const result = await this.executeAction(enrichedAction, context);
				actionResults.push(result);
				context.previousResults.push(result);
				if (!result.success) {
					overallSuccess = false;
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				console.error(`AutomationEngine: Action execution failed:`, error);
				actionResults.push({
					action,
					success: false,
					error: errorMsg,
					duration: 0,
				});
				overallSuccess = false;
				overallError = errorMsg;
				break; // Stop on first failure
			}
		}

		const result: AutomationExecutionResult = {
			success: overallSuccess,
			timestamp: Date.now(),
			trigger,
			actionResults,
			error: overallError,
		};

		// Update automation state
		automation.lastRun = result.timestamp;
		automation.lastResult = result;
		automation.executionCount++;

		// Add to history
		this.addToHistory({
			automationId: automation.id,
			result,
			timestamp: result.timestamp,
		});

		await this.saveState();

		// Append to persistent audit log
		await this.appendAuditLog(automation, result);

		const totalDuration = actionResults.reduce((sum, r) => sum + r.duration, 0);
		if (overallSuccess) {
			new Notice(
				`Automation '${automation.name}' completed successfully (${actionResults.length} action${actionResults.length !== 1 ? 's' : ''}, ${totalDuration}ms)`,
				8000
			);
		} else {
			new Notice(`Automation '${automation.name}' failed: ${overallError}`, 8000);
		}

		return result;
	}

	/**
	 * Execute a single action
	 */
	private async executeAction(
		action: AutomationAction,
		context: AutomationExecutionContext
	): Promise<ActionExecutionResult> {
		const startTime = Date.now();

		try {
			let result: unknown;

			switch (action.type) {
				case 'run-agent':
					result = await this.executeRunAgent(action, context);
					break;
				case 'run-prompt':
					result = await this.executeRunPrompt(action, context);
					break;
				case 'run-skill':
					result = await this.executeRunSkill(action, context);
					break;
				case 'create-note':
					result = await this.executeCreateNote(action, context);
					break;
				case 'update-note':
					result = await this.executeUpdateNote(action, context);
					break;
				case 'run-shell':
					result = await this.executeRunShell(action, context);
					break;
				default:
					throw new Error(`Unknown action type: ${(action as AutomationAction).type}`);
			}

			return {
				action,
				success: true,
				result,
				duration: Date.now() - startTime,
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			return {
				action,
				success: false,
				error: errorMsg,
				duration: Date.now() - startTime,
			};
		}
	}

	/**
	 * Enrich an action's input with the output from the previous step in the pipeline.
	 *
	 * If there are previous results, the last result's output is added as `previousOutput`
	 * in the action's input. If the action already has input, the previous output is merged
	 * alongside it. If the action has no input, a new input object is created.
	 *
	 * @param action - The action to enrich
	 * @param previousResults - Results from earlier steps
	 * @returns The action with enriched input (or original if first step)
	 *
	 * @internal
	 */
	private enrichActionInput(action: AutomationAction, previousResults: ActionExecutionResult[]): AutomationAction {
		if (previousResults.length === 0) return action;

		const lastResult = previousResults[previousResults.length - 1];
		if (!lastResult || !lastResult.success || lastResult.result === undefined) return action;

		const previousOutput = typeof lastResult.result === 'string'
			? lastResult.result
			: JSON.stringify(lastResult.result);

		return {
			...action,
			input: {
				...(action.input || {}),
				previousOutput,
			},
		} as AutomationAction;
	}

	/**
	 * Check if a value is a plain object (not null, not array)
	 */
	private isPlainObject(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	/**
	 * Send a message to the active AI provider, connecting if necessary
	 */
	private async sendToAIProvider(message: string): Promise<string> {
		// connectCopilot() intelligently routes to the correct provider based on settings
		if (this.plugin.settings.aiProvider === 'copilot') {
			const service = this.plugin.githubCopilotCliService;
			if (!service) {
				throw new Error('GitHub Copilot CLI service not available');
			}
			if (!service.isConnected()) {
				await this.plugin.connectCopilot();
			}
			return await service.sendMessage(message);
		} else {
			const service = this.plugin.openaiService || this.plugin.azureOpenaiService;
			if (!service) {
				throw new Error('No AI provider available');
			}
			if (!service.isReady()) {
				await this.plugin.connectCopilot();
			}
			return await service.sendMessage(message);
		}
	}

	/**
	 * Execute run-agent action
	 */
	private async executeRunAgent(action: Extract<AutomationAction, { type: 'run-agent' }>, context: AutomationExecutionContext): Promise<unknown> {
		const { agentId, input } = action;
		console.log(`AutomationEngine: Running agent '${agentId}' with input:`, input);
		
		// Get the agent from cache
		const agent = this.plugin.agentCache.getAgentByName(agentId);
		if (!agent) {
			throw new Error(`Agent '${agentId}' not found`);
		}
		
		// Load full agent details
		const fullAgent = await this.plugin.agentCache.getFullAgent(agentId);
		if (!fullAgent) {
			throw new Error(`Failed to load agent '${agentId}'`);
		}
		
		// Prepare the prompt with agent instructions
		let prompt = fullAgent.instructions || '';
		
		// Add previous step output if present
		if (input && typeof input === 'object' && 'previousOutput' in input && input.previousOutput) {
			prompt += `\n\nContext from previous step:\n${String(input.previousOutput)}`;
		}
		
		// Add user input if provided
		if (input) {
			const { previousOutput, ...rest } = input as Record<string, unknown>;
			const hasRest = Object.keys(rest).length > 0;
			if (hasRest) {
				const inputStr = rest.userInput ? String(rest.userInput) : JSON.stringify(rest);
				prompt += `\n\nInput: ${inputStr}`;
			}
		}
		
		return await this.sendToAIProvider(prompt);
	}

	/**
	 * Execute run-prompt action
	 */
	private async executeRunPrompt(action: Extract<AutomationAction, { type: 'run-prompt' }>, context: AutomationExecutionContext): Promise<unknown> {
		const { promptId, input } = action;
		console.log(`AutomationEngine: Running prompt '${promptId}' with input:`, input);
		
		// Get the prompt from cache
		const prompt = await this.plugin.promptCache.getFullPrompt(promptId);
		if (!prompt) {
			throw new Error(`Prompt '${promptId}' not found`);
		}
		
		// Replace variables in the prompt content
		let content = prompt.content;
		
		// Inject previous step output as a variable
		if (input && typeof input === 'object' && 'previousOutput' in input && input.previousOutput) {
			const prevStr = String(input.previousOutput);
			content = content.replace(/\$\{previousOutput\}/g, prevStr);
			content = content.replace(/\{previousOutput\}/g, prevStr);
			// If no placeholder was found, append it
			if (!content.includes(prevStr)) {
				content += `\n\nContext from previous step:\n${prevStr}`;
			}
		}
		
		// Replace input variables if provided
		if (input) {
			if (typeof input === 'string') {
				// String input is treated as userInput
				content = content.replace(/\{userInput\}/g, input);
				content = content.replace(/\$\{userInput\}/g, input);
			} else {
				const { previousOutput, ...rest } = input as Record<string, unknown>;
				if (this.isPlainObject(rest) && Object.keys(rest).length > 0) {
					for (const [key, value] of Object.entries(rest)) {
						const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
						content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), valueStr);
						content = content.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), valueStr);
					}
				}
			}
		}
		
		return await this.sendToAIProvider(content);
	}

	/**
	 * Execute run-skill action
	 */
	private async executeRunSkill(action: Extract<AutomationAction, { type: 'run-skill' }>, context: AutomationExecutionContext): Promise<unknown> {
		const { skillId, input } = action;
		console.log(`AutomationEngine: Running skill '${skillId}' with input:`, input);
		
		// Prepare arguments for the skill
		const args = this.isPlainObject(input) ? input : {};
		
		// Execute the skill
		const result = await this.plugin.skillRegistry.executeSkill(skillId, args);
		
		if (!result.success) {
			throw new Error(result.error || `Skill '${skillId}' execution failed`);
		}
		
		return result.data;
	}

	/**
	 * Execute create-note action
	 */
	private async executeCreateNote(action: Extract<AutomationAction, { type: 'create-note' }>, context: AutomationExecutionContext): Promise<string> {
		const { path, template } = action;
		console.log(`AutomationEngine: Creating note at '${path}'`);
		
		// Check if file already exists
		const existingFile = this.app.vault.getAbstractFileByPath(path);
		if (existingFile) {
			throw new Error(`Note already exists at ${path}`);
		}

		// Create the note
		const content = template || '';
		const file = await this.app.vault.create(path, content);
		
		return file.path;
	}

	/**
	 * Execute update-note action
	 */
	private async executeUpdateNote(action: Extract<AutomationAction, { type: 'update-note' }>, context: AutomationExecutionContext): Promise<string> {
		const { path, template } = action;
		console.log(`AutomationEngine: Updating note at '${path}'`);
		
		// Get the file
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) {
			throw new Error(`Note not found at ${path}`);
		}

		// Update the note
		if (template) {
			await this.app.vault.modify(file, template);
		}
		
		return file.path;
	}

	/**
	 * Execute run-shell action (desktop only)
	 *
	 * Spawns the shell command via Node.js child_process.
	 * Returns stdout on success.
	 */
	private async executeRunShell(action: Extract<AutomationAction, { type: 'run-shell' }>, context: AutomationExecutionContext): Promise<string> {
		const { command, input } = action;
		console.log(`AutomationEngine: Running shell command '${command}'`);

		// Desktop-only guard
		if (!(this.app as any).vault.adapter.basePath) {
			throw new Error('Shell commands are only available on desktop');
		}

		const { exec } = require('child_process') as typeof import('child_process');

		// Build the final command — append previousOutput from input if present
		let finalCommand = command;
		if (input && typeof input === 'object' && 'previousOutput' in input && input.previousOutput) {
			// Make previous output available as env var
			finalCommand = command;
		}

		return new Promise<string>((resolve, reject) => {
			const cwd = (this.app.vault.adapter as any).basePath as string;
			const env = { ...process.env };
			if (input && typeof input === 'object' && 'previousOutput' in input) {
				env.PREVIOUS_OUTPUT = String(input.previousOutput);
			}
			if (input && typeof input === 'object' && 'userInput' in input) {
				env.USER_INPUT = String(input.userInput);
			}

			exec(finalCommand, { cwd, env, timeout: 30000 }, (error, stdout, stderr) => {
				if (error) {
					reject(new Error(`Shell command failed: ${stderr || error.message}`));
				} else {
					resolve(stdout.trim());
				}
			});
		});
	}

	/**
	 * Set up vault event listeners for file-based and tag-based triggers
	 */
	private setupVaultListeners(): void {
		// File created
		this.plugin.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile) {
					this.handleFileEvent('file-created', file.path);
				}
			})
		);

		// File modified
		this.plugin.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					this.handleFileEvent('file-modified', file.path);
				}
			})
		);

		// File deleted
		this.plugin.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.handleFileEvent('file-deleted', file.path);
				}
			})
		);

		// Vault opened (use app ready event)
		this.app.workspace.onLayoutReady(() => {
			this.handleVaultOpened();
		});
	}

	/**
	 * Handle file events and trigger matching automations
	 */
	private handleFileEvent(eventType: 'file-created' | 'file-modified' | 'file-deleted', filePath: string): void {
		for (const automation of Object.values(this.state.automations)) {
			if (!automation.enabled) continue;

			for (const trigger of automation.config.triggers) {
				if (trigger.type === eventType) {
					const fileTrigger = trigger as FileTrigger;
					if (this.matchesPattern(filePath, fileTrigger.pattern)) {
						console.log(`AutomationEngine: File event ${eventType} matched automation '${automation.name}'`);
						this.executeAutomation(automation, trigger).catch((error) => {
							console.error(`AutomationEngine: Failed to execute automation:`, error);
						});
					}
				}
			}
		}
	}

	/**
	 * Handle vault opened event
	 */
	private handleVaultOpened(): void {
		for (const automation of Object.values(this.state.automations)) {
			if (!automation.enabled) continue;

			for (const trigger of automation.config.triggers) {
				if (trigger.type === 'vault-opened') {
					console.log(`AutomationEngine: Vault opened, triggering automation '${automation.name}'`);
					this.executeAutomation(automation, trigger).catch((error) => {
						console.error(`AutomationEngine: Failed to execute automation:`, error);
					});
				}
			}
		}
	}

	/**
	 * Run startup automations
	 */
	private runStartupAutomations(): void {
		for (const automation of Object.values(this.state.automations)) {
			if (!automation.enabled) continue;

			for (const trigger of automation.config.triggers) {
				if (trigger.type === 'startup') {
					console.log(`AutomationEngine: Plugin startup, triggering automation '${automation.name}'`);
					this.executeAutomation(automation, trigger).catch((error) => {
						console.error(`AutomationEngine: Failed to execute automation:`, error);
					});
				}
			}
		}
	}

	/**
	 * Start all scheduled automations
	 */
	private startScheduledAutomations(): void {
		for (const automation of Object.values(this.state.automations)) {
			if (!automation.enabled) continue;

			for (const trigger of automation.config.triggers) {
				if (trigger.type === 'schedule') {
					this.scheduleAutomation(automation.id, trigger as ScheduleTrigger);
				}
			}
		}
	}

	/**
	 * Stop all scheduled automations
	 */
	private stopAllScheduledAutomations(): void {
		for (const timer of this.scheduledTimers.values()) {
			clearTimeout(timer);
		}
		this.scheduledTimers.clear();
	}

	/**
	 * Cleanup event listeners
	 */
	private cleanupEventListeners(): void {
		for (const cleanup of this.eventRegistrations.values()) {
			cleanup();
		}
		this.eventRegistrations.clear();
	}

	/**
	 * Check if a file path matches a pattern
	 */
	private matchesPattern(filePath: string, pattern: string): boolean {
		// Convert glob pattern to regex
		const regexPattern = pattern
			.replace(/\*\*/g, '.*')  // ** matches any number of directories
			.replace(/\*/g, '[^/]*')  // * matches anything except /
			.replace(/\?/g, '.');     // ? matches single character
		
		const regex = new RegExp(`^${regexPattern}$`);
		return regex.test(filePath);
	}

	/**
	 * Add entry to history
	 */
	private addToHistory(entry: AutomationHistoryEntry): void {
		this.state.history.push(entry);
		
		// Limit history size
		if (this.state.history.length > this.maxHistoryEntries) {
			this.state.history = this.state.history.slice(-this.maxHistoryEntries);
		}
	}

	/**
	 * Get timer key for an automation
	 */
	private getTimerKey(automationId: string): string {
		return `automation-${automationId}`;
	}

	/**
	 * Sleep utility
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Append an execution result to the persistent markdown audit log.
	 *
	 * Creates the log file if it doesn't exist. Each entry is formatted as a
	 * human-readable markdown section with action outputs.
	 *
	 * @param automation - The automation that was executed
	 * @param result - The execution result to log
	 *
	 * @internal
	 */
	private async appendAuditLog(automation: AutomationInstance, result: AutomationExecutionResult): Promise<void> {
		try {
			const date = new Date(result.timestamp);
			const dateStr = date.toLocaleString();
			const statusIcon = result.success ? '✓' : '✗';
			const statusText = result.success ? 'Success' : 'Failed';
			const totalDuration = result.actionResults.reduce((sum, r) => sum + r.duration, 0);

			let entry = `\n## ${automation.name} — ${dateStr}\n\n`;
			entry += `- **Status**: ${statusIcon} ${statusText}\n`;
			entry += `- **Trigger**: ${result.trigger.type}`;
			if (result.trigger.type === 'schedule' && 'schedule' in result.trigger) {
				entry += ` (${result.trigger.schedule})`;
			}
			entry += `\n`;
			entry += `- **Duration**: ${totalDuration}ms\n`;

			if (result.error) {
				entry += `- **Error**: ${result.error}\n`;
			}

			for (let i = 0; i < result.actionResults.length; i++) {
				const ar = result.actionResults[i];
				if (!ar) continue;
				const actionIcon = ar.success ? '✓' : '✗';
				const actionLabel = ar.action.type;
				let actionTarget = '';
				if ('agentId' in ar.action) actionTarget = ` (${ar.action.agentId})`;
				else if ('promptId' in ar.action) actionTarget = ` (${ar.action.promptId})`;
				else if ('skillId' in ar.action) actionTarget = ` (${ar.action.skillId})`;
				else if ('path' in ar.action) actionTarget = ` (${ar.action.path})`;
				else if ('command' in ar.action) actionTarget = ` (${ar.action.command})`;

				entry += `\n### Action ${i + 1}: ${actionLabel}${actionTarget}\n`;
				entry += `- **Status**: ${actionIcon} ${ar.success ? 'Success' : 'Failed'} (${ar.duration}ms)\n`;

				if (ar.error) {
					entry += `- **Error**: ${ar.error}\n`;
				}

				if (ar.result !== undefined && ar.result !== null) {
					const outputStr = typeof ar.result === 'string' ? ar.result : JSON.stringify(ar.result, null, 2);
					const blockquoted = outputStr.split('\n').map(line => `> ${line}`).join('\n');
					entry += `- **Output**:\n${blockquoted}\n`;
				}
			}

			entry += `\n---\n`;

			const exists = await this.app.vault.adapter.exists(this.auditLogPath);
			if (!exists) {
				await this.app.vault.adapter.write(this.auditLogPath, `# Automation Audit Log\n${entry}`);
			} else {
				const existing = await this.app.vault.adapter.read(this.auditLogPath);
				await this.app.vault.adapter.write(this.auditLogPath, existing + entry);
			}
		} catch (error) {
			console.error('AutomationEngine: Failed to write audit log:', error);
		}
	}

	/**
	 * Load state from disk
	 */
	private async loadState(): Promise<void> {
		try {
			const data = await this.app.vault.adapter.read(this.stateFilePath);
			this.state = JSON.parse(data);
			console.log(`AutomationEngine: Loaded state with ${Object.keys(this.state.automations).length} automations`);
		} catch (error) {
			// File doesn't exist or is invalid, use default state
			console.log('AutomationEngine: No existing state found, using defaults');
		}
	}

	/**
	 * Save state to disk
	 */
	private async saveState(): Promise<void> {
		try {
			const data = JSON.stringify(this.state, null, 2);
			await this.app.vault.adapter.write(this.stateFilePath, data);
		} catch (error) {
			console.error('AutomationEngine: Failed to save state:', error);
		}
	}
}

/**
 * Global automation engine instance
 */
let automationEngineInstance: AutomationEngine | null = null;

/**
 * Get the global automation engine instance
 * 
 * @param app - Obsidian app instance
 * @param plugin - Plugin instance
 * @returns Automation engine instance
 */
export function getAutomationEngine(app?: App, plugin?: VaultCopilotPlugin): AutomationEngine {
	if (!automationEngineInstance && app && plugin) {
		automationEngineInstance = new AutomationEngine(app, plugin);
	}
	if (!automationEngineInstance) {
		throw new Error('AutomationEngine not initialized');
	}
	return automationEngineInstance;
}

/**
 * Reset the global automation engine instance (for testing)
 */
export function resetAutomationEngine(): void {
	automationEngineInstance = null;
}
