/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AutomationScheduleModal
 * @description Modal for creating or editing an automation's schedule.
 *
 * Provides friendly frequency / day / time dropdowns that map to cron expressions,
 * plus an action-type selector when creating a new automation.
 *
 * @since 0.1.0
 */

import { App, Modal, Setting } from 'obsidian';
import type { AutomationInstance, AutomationConfig, ScheduleTrigger, AutomationAction } from '../../../automation/types';
import type { AIServiceManager as CopilotPlugin } from '../../../app/AIServiceManager';

/** Frequency presets exposed in the UI */
type Frequency = 'hour' | 'day' | 'week' | 'month';

/** Parsed friendly-schedule representation */
interface ScheduleFields {
	frequency: Frequency;
	dayOfWeek: number;   // 0-6 (Sun-Sat), used for "week"
	dayOfMonth: number;  // 1-31, used for "month"
	hour: number;        // 0-23
	minute: number;      // 0-59
}

/** State for a single pipeline step */
interface StepState {
	actionType: AutomationAction['type'];
	actionValue: string;
	inputText: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TIME_OPTIONS: { label: string; hour: number; minute: number }[] = (() => {
	const opts: { label: string; hour: number; minute: number }[] = [];
	for (let h = 0; h < 24; h++) {
		for (const m of [0, 30]) {
			const suffix = h < 12 ? 'AM' : 'PM';
			const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
			const minStr = m === 0 ? '00' : String(m);
			opts.push({ label: `${display}:${minStr} ${suffix}`, hour: h, minute: m });
		}
	}
	return opts;
})();

const MINUTE_OPTIONS = [0, 15, 30, 45];

/**
 * Modal for creating a new automation or editing the schedule of an existing one.
 *
 * @example
 * ```typescript
 * // Edit mode
 * const modal = new AutomationScheduleModal(app, existingAutomation, (id, config) => { ... });
 * modal.open();
 *
 * // Create mode
 * const modal = new AutomationScheduleModal(app, null, (id, config) => { ... });
 * modal.open();
 * ```
 */
export class AutomationScheduleModal extends Modal {
	private plugin: CopilotPlugin;
	private existingAutomation: AutomationInstance | null;
	private onSave: (id: string | null, name: string, config: AutomationConfig) => void;

	// Form state
	private name = '';
	private steps: StepState[] = [{ actionType: 'run-agent', actionValue: '', inputText: '' }];
	private schedule: ScheduleFields = {
		frequency: 'week',
		dayOfWeek: 1,
		dayOfMonth: 1,
		hour: 9,
		minute: 0,
	};

	private conditionalContainer: HTMLElement | null = null;
	private stepsContainer: HTMLElement | null = null;

	/**
	 * @param app - Obsidian app
	 * @param plugin - Plugin instance for accessing agent/prompt/skill registries
	 * @param automation - Existing automation to edit (null = create mode)
	 * @param onSave - Callback with (existingId | null, name, config)
	 */
	constructor(
		app: App,
		plugin: CopilotPlugin,
		automation: AutomationInstance | null,
		onSave: (id: string | null, name: string, config: AutomationConfig) => void,
	) {
		super(app);
		this.plugin = plugin;
		this.existingAutomation = automation;
		this.onSave = onSave;

		if (automation) {
			this.name = automation.name;
			this.schedule = this.parseCronToFields(automation.config);
			// Load all actions as steps
			if (automation.config.actions.length > 0) {
				this.steps = automation.config.actions.map(action => ({
					actionType: action.type,
					actionValue: this.getActionValue(action),
					inputText: action.input
						? (typeof action.input === 'string' ? action.input : JSON.stringify(action.input))
						: '',
				}));
			}
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('vc-schedule-modal');

		// Refresh caches so dropdowns reflect current directory settings
		this.plugin.agentCache?.refreshCache();
		this.plugin.promptCache?.refreshCache();
		this.plugin.skillCache?.refreshCache();

		const isEdit = !!this.existingAutomation;
		contentEl.createEl('h2', { text: isEdit ? 'Edit schedule' : 'Create automation' });

		// ── Name ──
		if (!isEdit) {
			new Setting(contentEl)
				.setName('Name')
				.setDesc('A short name for this automation')
				.addText(text => {
					text.setPlaceholder('e.g. Weekly review')
						.setValue(this.name)
						.onChange(v => { this.name = v; });
				});
		}

		// ── Frequency ──
		contentEl.createEl('h3', { text: 'Frequency', cls: 'vc-schedule-section-heading' });
		contentEl.createEl('p', { text: 'How often should this automation run?', cls: 'vc-schedule-desc' });

		new Setting(contentEl)
			.setName('Every')
			.addDropdown(dropdown => {
				dropdown.addOption('hour', 'Hour');
				dropdown.addOption('day', 'Day');
				dropdown.addOption('week', 'Week');
				dropdown.addOption('month', 'Month');
				dropdown.setValue(this.schedule.frequency);
				dropdown.onChange((v) => {
					this.schedule.frequency = v as Frequency;
					this.renderConditionalFields();
				});
			});

		// Container for fields that change based on frequency
		this.conditionalContainer = contentEl.createDiv({ cls: 'vc-schedule-conditional' });
		this.renderConditionalFields();

		// ── Steps ──
		contentEl.createEl('h3', { text: 'Steps', cls: 'vc-schedule-section-heading' });
		contentEl.createEl('p', {
			text: 'Define one or more steps. Each step can use the previous step\'s output as its input.',
			cls: 'vc-schedule-desc',
		});

		this.stepsContainer = contentEl.createDiv({ cls: 'vc-pipeline-steps' });
		this.renderAllSteps();

		// "Add Step" button
		new Setting(contentEl)
			.addButton(button => button
				.setButtonText('+ Add step')
				.onClick(() => {
					this.steps.push({ actionType: 'run-agent', actionValue: '', inputText: '' });
					this.renderAllSteps();
				}));

		// ── Buttons ──
		const buttonRow = contentEl.createDiv({ cls: 'vc-modal-buttons' });
		const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonRow.createEl('button', { text: isEdit ? 'Save' : 'Create', cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => this.submit());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ─── Conditional fields ──────────────────────────────────────────────

	/**
	 * Re-render the day-of-week / day-of-month / time fields based on the
	 * currently selected frequency.
	 *
	 * @internal
	 */
	private renderConditionalFields(): void {
		if (!this.conditionalContainer) return;
		this.conditionalContainer.empty();

		const freq = this.schedule.frequency;

		// Day of week (weekly)
		if (freq === 'week') {
			new Setting(this.conditionalContainer)
				.setName('On')
				.setDesc('Day of the week')
				.addDropdown(dropdown => {
					DAY_NAMES.forEach((name, i) => dropdown.addOption(String(i), name));
					dropdown.setValue(String(this.schedule.dayOfWeek));
					dropdown.onChange(v => { this.schedule.dayOfWeek = Number(v); });
				});
		}

		// Day of month (monthly)
		if (freq === 'month') {
			new Setting(this.conditionalContainer)
				.setName('On day')
				.setDesc('Day of the month')
				.addDropdown(dropdown => {
					for (let d = 1; d <= 31; d++) {
						dropdown.addOption(String(d), String(d));
					}
					dropdown.setValue(String(this.schedule.dayOfMonth));
					dropdown.onChange(v => { this.schedule.dayOfMonth = Number(v); });
				});
		}

		// Time (not shown for "hour")
		if (freq !== 'hour') {
			new Setting(this.conditionalContainer)
				.setName('At')
				.setDesc('Time of day')
				.addDropdown(dropdown => {
					for (const opt of TIME_OPTIONS) {
						dropdown.addOption(`${opt.hour}:${opt.minute}`, opt.label);
					}
					dropdown.setValue(`${this.schedule.hour}:${this.schedule.minute}`);
					dropdown.onChange(v => {
						const [h, m] = v.split(':').map(Number);
						this.schedule.hour = h ?? 9;
						this.schedule.minute = m ?? 0;
					});
				});
		}

		// Minute selector (hourly only)
		if (freq === 'hour') {
			new Setting(this.conditionalContainer)
				.setName('At minute')
				.setDesc('Minute past the hour')
				.addDropdown(dropdown => {
					for (const m of MINUTE_OPTIONS) {
						dropdown.addOption(String(m), `:${String(m).padStart(2, '0')}`);
					}
					dropdown.setValue(String(this.schedule.minute));
					dropdown.onChange(v => { this.schedule.minute = Number(v); });
				});
		}
	}

	// ─── Steps rendering ─────────────────────────────────────────────────

	/**
	 * Render all pipeline steps into the steps container.
	 *
	 * @internal
	 */
	private renderAllSteps(): void {
		if (!this.stepsContainer) return;
		this.stepsContainer.empty();

		for (let i = 0; i < this.steps.length; i++) {
			this.renderStep(this.stepsContainer, i);
		}
	}

	/**
	 * Render a single pipeline step card.
	 *
	 * @param container - Parent element
	 * @param index - Step index (0-based)
	 *
	 * @internal
	 */
	private renderStep(container: HTMLElement, index: number): void {
		const step = this.steps[index];
		if (!step) return;

		const card = container.createDiv({ cls: 'vc-pipeline-step' });

		// Step header with label and remove button
		const header = card.createDiv({ cls: 'vc-pipeline-step-header' });
		header.createEl('span', { text: `Step ${index + 1}`, cls: 'vc-pipeline-step-label' });

		if (this.steps.length > 1) {
			const removeBtn = header.createEl('button', {
				text: '✕',
				cls: 'vc-btn vc-btn-small vc-btn-danger',
				attr: { 'aria-label': `Remove step ${index + 1}` },
			});
			removeBtn.addEventListener('click', () => {
				this.steps.splice(index, 1);
				this.renderAllSteps();
			});
		}

		// Action type dropdown
		new Setting(card)
			.setName('Action type')
			.addDropdown(dropdown => {
				dropdown.addOption('run-agent', 'Run agent');
				dropdown.addOption('run-prompt', 'Run prompt');
				dropdown.addOption('run-skill', 'Run skill');
				dropdown.addOption('create-note', 'Create note');
				dropdown.addOption('update-note', 'Update note');
				dropdown.addOption('run-shell', 'Run shell command');
				dropdown.setValue(step.actionType);
				dropdown.onChange(v => {
					step.actionType = v as AutomationAction['type'];
					step.actionValue = '';
					this.renderAllSteps();
				});
			});

		// Action value (dropdown for agents/prompts/skills, text for note paths)
		const actionContainer = card.createDiv({ cls: 'vc-schedule-conditional' });
		this.renderStepActionValue(actionContainer, step);

		// Input textarea
		const inputDesc = index > 0
			? 'Text passed to the action. Leave empty to use the previous step\'s output.'
			: 'Text passed to the action at execution time';

		new Setting(card)
			.setName('Input')
			.setDesc(inputDesc)
			.addTextArea(text => {
				text.setPlaceholder(
					index > 0
						? 'Leave empty to use previous step\'s output'
						: 'e.g. Summarize my daily notes',
				)
					.setValue(step.inputText)
					.onChange(v => { step.inputText = v; });
				text.inputEl.style.width = '100%';
				text.inputEl.rows = 3;
			});
	}

	/**
	 * Render the action value selector for a single step.
	 *
	 * @internal
	 */
	private renderStepActionValue(container: HTMLElement, step: StepState): void {
		switch (step.actionType) {
			case 'run-agent': {
				const agents = this.plugin.agentCache?.getAgents() ?? [];
				new Setting(container)
					.setName('Agent')
					.setDesc(agents.length ? 'Select which agent to run' : 'No agents found — add .agent.md files to your agent directories')
					.addDropdown(dropdown => {
						if (agents.length === 0) {
							dropdown.addOption('', '(none available)');
						}
						for (const a of agents) {
							dropdown.addOption(a.name, a.name);
						}
						if (step.actionValue && agents.some(a => a.name === step.actionValue)) {
							dropdown.setValue(step.actionValue);
						} else if (agents.length > 0 && agents[0]) {
							step.actionValue = agents[0].name;
							dropdown.setValue(step.actionValue);
						}
						dropdown.onChange(v => { step.actionValue = v; });
					});
				break;
			}

			case 'run-prompt': {
				const prompts = this.plugin.promptCache?.getPrompts() ?? [];
				new Setting(container)
					.setName('Prompt')
					.setDesc(prompts.length ? 'Select which prompt to run' : 'No prompts found — add .prompt.md files to your prompt directories')
					.addDropdown(dropdown => {
						if (prompts.length === 0) {
							dropdown.addOption('', '(none available)');
						}
						for (const p of prompts) {
							dropdown.addOption(p.name, p.name);
						}
						if (step.actionValue && prompts.some(p => p.name === step.actionValue)) {
							dropdown.setValue(step.actionValue);
						} else if (prompts.length > 0 && prompts[0]) {
							step.actionValue = prompts[0].name;
							dropdown.setValue(step.actionValue);
						}
						dropdown.onChange(v => { step.actionValue = v; });
					});
				break;
			}

			case 'run-skill': {
				// Merge runtime-registered skills with file-based skills from cache
				const runtimeSkills = this.plugin.skillRegistry?.listSkills() ?? [];
				const cachedSkills = this.plugin.skillCache?.getSkills() ?? [];
				const allSkillNames = new Map<string, string>();
				for (const s of runtimeSkills) allSkillNames.set(s.name, s.description);
				for (const s of cachedSkills) {
					if (!allSkillNames.has(s.name)) allSkillNames.set(s.name, s.description);
				}
				const skills = Array.from(allSkillNames.entries()).map(([name, description]) => ({ name, description }));
				new Setting(container)
					.setName('Skill')
					.setDesc(skills.length ? 'Select which skill to run' : 'No skills available')
					.addDropdown(dropdown => {
						if (skills.length === 0) {
							dropdown.addOption('', '(none available)');
						}
						for (const s of skills) {
							dropdown.addOption(s.name, s.name);
						}
						if (step.actionValue && skills.some(s => s.name === step.actionValue)) {
							dropdown.setValue(step.actionValue);
						} else if (skills.length > 0 && skills[0]) {
							step.actionValue = skills[0].name;
							dropdown.setValue(step.actionValue);
						}
						dropdown.onChange(v => { step.actionValue = v; });
					});
				break;
			}

			case 'create-note':
			case 'update-note':
				new Setting(container)
					.setName('Note path')
					.setDesc('Path to the note (e.g. Daily Notes/{{date}}.md)')
					.addText(text => {
						text.setPlaceholder('e.g. Daily Notes/{{date}}.md')
							.setValue(step.actionValue)
							.onChange(v => { step.actionValue = v; });
					});
				break;

			case 'run-shell':
				new Setting(container)
					.setName('Shell command')
					.setDesc('Command to execute (runs in vault root, desktop only). Use $PREVIOUS_OUTPUT and $USER_INPUT env vars.')
					.addText(text => {
						text.setPlaceholder('e.g. python scripts/summarize.py')
							.setValue(step.actionValue)
							.onChange(v => { step.actionValue = v; });
					});
				break;
		}
	}

	// ─── Submit ──────────────────────────────────────────────────────────

	/**
	 * Validate input and invoke the onSave callback.
	 *
	 * @internal
	 */
	private submit(): void {
		const isEdit = !!this.existingAutomation;

		if (!isEdit && !this.name.trim()) {
			this.showError('Please enter a name.');
			return;
		}

		// Validate all steps have an action value
		for (let i = 0; i < this.steps.length; i++) {
			const step = this.steps[i];
			if (!step || !step.actionValue.trim()) {
				this.showError(`Please select an action for step ${i + 1}.`);
				return;
			}
		}

		const cron = this.fieldsToCron(this.schedule);
		const trigger: ScheduleTrigger = { type: 'schedule', schedule: cron };
		const actions = this.buildActions();

		let config: AutomationConfig;
		if (isEdit && this.existingAutomation) {
			const otherTriggers = this.existingAutomation.config.triggers.filter(t => t.type !== 'schedule');
			config = {
				...this.existingAutomation.config,
				triggers: [...otherTriggers, trigger],
				actions,
			};
		} else {
			config = {
				triggers: [trigger],
				actions,
				enabled: true,
			};
		}

		this.onSave(
			isEdit ? this.existingAutomation!.id : null,
			isEdit ? this.existingAutomation!.name : this.name.trim(),
			config,
		);
		this.close();
	}

	/**
	 * Show an error message in the modal.
	 *
	 * @internal
	 */
	private showError(message: string): void {
		const existing = this.contentEl.querySelector('.vc-schedule-error');
		if (existing) existing.remove();
		const err = this.contentEl.createDiv({ cls: 'vc-schedule-error' });
		err.setText(message);
	}

	// ─── Helpers ─────────────────────────────────────────────────────────

	/**
	 * Build an array of `AutomationAction` from the pipeline steps.
	 *
	 * @internal
	 */
	private buildActions(): AutomationAction[] {
		return this.steps.map(step => this.buildStepAction(step));
	}

	/**
	 * Build a single `AutomationAction` from a step's state.
	 *
	 * @internal
	 */
	private buildStepAction(step: StepState): AutomationAction {
		const val = step.actionValue.trim();
		const trimmed = step.inputText.trim();
		let input: Record<string, unknown> | undefined;
		if (trimmed) {
			try {
				input = JSON.parse(trimmed);
			} catch {
				input = { userInput: trimmed };
			}
		}
		const hasInput = !!input;

		switch (step.actionType) {
			case 'run-agent':
				return { type: 'run-agent', agentId: val, ...(hasInput && { input }) };
			case 'run-prompt':
				return { type: 'run-prompt', promptId: val, ...(hasInput && { input }) };
			case 'run-skill':
				return { type: 'run-skill', skillId: val, ...(hasInput && { input }) };
			case 'create-note':
				return { type: 'create-note', path: val, ...(hasInput && { input }) };
			case 'update-note':
				return { type: 'update-note', path: val, ...(hasInput && { input }) };
			case 'run-shell':
				return { type: 'run-shell', command: val, ...(hasInput && { input }) };
			default:
				return { type: 'run-agent', agentId: val, ...(hasInput && { input }) };
		}
	}

	/**
	 * Convert friendly schedule fields to a 5-field cron expression.
	 *
	 * @param fields - Schedule fields
	 * @returns Cron string (minute hour day month weekday)
	 *
	 * @internal
	 */
	private fieldsToCron(fields: ScheduleFields): string {
		switch (fields.frequency) {
			case 'hour':
				return `${fields.minute} * * * *`;
			case 'day':
				return `${fields.minute} ${fields.hour} * * *`;
			case 'week':
				return `${fields.minute} ${fields.hour} * * ${fields.dayOfWeek}`;
			case 'month':
				return `${fields.minute} ${fields.hour} ${fields.dayOfMonth} * *`;
		}
	}

	/**
	 * Reverse-parse an automation's schedule trigger into friendly fields.
	 *
	 * Falls back to sensible defaults if the cron cannot be mapped to one of
	 * the four preset frequencies.
	 *
	 * @param config - Automation config to parse
	 * @returns Parsed schedule fields
	 *
	 * @internal
	 */
	private parseCronToFields(config: AutomationConfig): ScheduleFields {
		const defaults: ScheduleFields = { frequency: 'week', dayOfWeek: 1, dayOfMonth: 1, hour: 9, minute: 0 };
		const scheduleTrigger = config.triggers.find(t => t.type === 'schedule') as ScheduleTrigger | undefined;
		if (!scheduleTrigger) return defaults;

		const parts = scheduleTrigger.schedule.trim().split(/\s+/);
		if (parts.length < 5) return defaults;

		const [minStr, hourStr, dayStr, , dowStr] = parts;
		const minute = this.parseField(minStr, 0);
		const hour   = this.parseField(hourStr, 9);
		const day    = this.parseField(dayStr, 1);
		const dow    = this.parseField(dowStr, 1);

		// Determine frequency from cron shape
		if (hourStr === '*') return { frequency: 'hour', dayOfWeek: 1, dayOfMonth: 1, hour: 0, minute };
		if (dayStr !== '*' && dowStr === '*') return { frequency: 'month', dayOfWeek: 1, dayOfMonth: day, hour, minute };
		if (dowStr !== '*') return { frequency: 'week', dayOfWeek: dow, dayOfMonth: 1, hour, minute };
		return { frequency: 'day', dayOfWeek: 1, dayOfMonth: 1, hour, minute };
	}

	/**
	 * Parse a single cron field. Returns `fallback` for wildcards or non-numeric values.
	 *
	 * @internal
	 */
	private parseField(value: string | undefined, fallback: number): number {
		if (!value || value === '*') return fallback;
		const n = Number(value);
		return Number.isNaN(n) ? fallback : n;
	}

	/**
	 * Extract the primary value string from an action for display.
	 *
	 * @internal
	 */
	private getActionValue(action: AutomationAction): string {
		switch (action.type) {
			case 'run-agent': return action.agentId;
			case 'run-prompt': return action.promptId;
			case 'run-skill': return action.skillId;
			case 'create-note':
			case 'update-note': return action.path;
			case 'run-shell': return action.command;
			default: return '';
		}
	}
}
