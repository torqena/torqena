/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AutomationDetailsModal
 * @description Modal for displaying detailed information about an automation.
 * 
 * Shows triggers, actions, execution history, and configuration details.
 * 
 * @since 0.1.0
 */

import { App, Modal } from 'obsidian';
import type { AutomationEngine } from '../../../automation/AutomationEngine';
import type { AutomationInstance, AutomationHistoryEntry } from '../../../automation/types';

export class AutomationDetailsModal extends Modal {
	private automation: AutomationInstance;
	private engine: AutomationEngine | null;

	/**
	 * @param app - Obsidian app instance
	 * @param automation - The automation to display details for
	 * @param engine - Optional AutomationEngine for accessing full execution history
	 */
	constructor(app: App, automation: AutomationInstance, engine?: AutomationEngine | null) {
		super(app);
		this.automation = automation;
		this.engine = engine ?? null;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('vc-automation-details-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'vc-modal-header' });
		header.createEl('h2', { text: this.automation.name });
		
		const statusBadge = header.createEl('span', { 
			cls: `vc-status-badge ${this.automation.enabled ? 'vc-status-enabled' : 'vc-status-disabled'}`,
			text: this.automation.enabled ? 'Enabled' : 'Disabled'
		});

		// Overview section
		const overview = contentEl.createDiv({ cls: 'vc-automation-section' });
		overview.createEl('h3', { text: 'Overview' });
		
		const overviewGrid = overview.createDiv({ cls: 'vc-automation-grid' });
		
		this.addGridItem(overviewGrid, 'ID', this.automation.id);
		this.addGridItem(overviewGrid, 'Execution Count', String(this.automation.executionCount));
		
		if (this.automation.lastRun) {
			const date = new Date(this.automation.lastRun);
			this.addGridItem(overviewGrid, 'Last Run', date.toLocaleString());
		}
		
		if (this.automation.nextRun) {
			const date = new Date(this.automation.nextRun);
			this.addGridItem(overviewGrid, 'Next Run', date.toLocaleString());
		}

		// Triggers section
		const triggers = contentEl.createDiv({ cls: 'vc-automation-section' });
		triggers.createEl('h3', { text: 'Triggers' });
		
		const triggersList = triggers.createEl('ul', { cls: 'vc-automation-list' });
		for (const trigger of this.automation.config.triggers) {
			const li = triggersList.createEl('li');
			li.createEl('strong', { text: `${trigger.type}: ` });
			
			let details = '';
			if (trigger.type === 'schedule' && 'schedule' in trigger) {
				details = trigger.schedule;
			} else if ((trigger.type === 'file-created' || trigger.type === 'file-modified' || trigger.type === 'file-deleted') && 'pattern' in trigger) {
				details = `Pattern: ${trigger.pattern}`;
			} else if (trigger.type === 'tag-added' && 'tag' in trigger) {
				details = `Tag: ${trigger.tag}`;
			}
			
			if (details) {
				li.createEl('span', { text: details, cls: 'vc-trigger-details' });
			}
			
			if (trigger.delay && trigger.delay > 0) {
				li.createEl('span', { text: ` (delay: ${trigger.delay}ms)`, cls: 'vc-text-muted' });
			}
		}

		// Actions section
		const actions = contentEl.createDiv({ cls: 'vc-automation-section' });
		actions.createEl('h3', { text: 'Actions' });
		
		const actionsList = actions.createEl('ul', { cls: 'vc-automation-list' });
		for (const action of this.automation.config.actions) {
			const li = actionsList.createEl('li');
			li.createEl('strong', { text: `${action.type}: ` });
			
			let details = '';
			if (action.type === 'run-agent' && 'agentId' in action) {
				details = `Agent: ${action.agentId}`;
			} else if (action.type === 'run-prompt' && 'promptId' in action) {
				details = `Prompt: ${action.promptId}`;
			} else if (action.type === 'run-skill' && 'skillId' in action) {
				details = `Skill: ${action.skillId}`;
			} else if ((action.type === 'create-note' || action.type === 'update-note') && 'path' in action) {
				details = `Path: ${action.path}`;
			} else if (action.type === 'run-shell' && 'command' in action) {
				details = `Command: ${action.command}`;
			}
			
			if (details) {
				li.createEl('span', { text: details, cls: 'vc-action-details' });
			}
			
			if (action.input && Object.keys(action.input).length > 0) {
				li.createEl('span', { 
					text: ` (with ${Object.keys(action.input).length} parameter${Object.keys(action.input).length > 1 ? 's' : ''})`, 
					cls: 'vc-text-muted' 
				});
			}
		}

		// Last execution result (if available)
		if (this.automation.lastResult) {
			const result = contentEl.createDiv({ cls: 'vc-automation-section' });
			result.createEl('h3', { text: 'Last Execution Result' });
			
			const resultGrid = result.createDiv({ cls: 'vc-automation-grid' });
			
			this.addGridItem(resultGrid, 'Success', this.automation.lastResult.success ? 'Yes' : 'No');
			this.addGridItem(resultGrid, 'Timestamp', new Date(this.automation.lastResult.timestamp).toLocaleString());
			this.addGridItem(resultGrid, 'Trigger', this.automation.lastResult.trigger.type);
			
			if (this.automation.lastResult.error) {
				const errorDiv = result.createDiv({ cls: 'vc-automation-error' });
				errorDiv.createEl('strong', { text: 'Error: ' });
				errorDiv.createEl('span', { text: this.automation.lastResult.error });
			}
			
			// Action results
			if (this.automation.lastResult.actionResults.length > 0) {
				const actionResults = result.createDiv({ cls: 'vc-automation-action-results' });
				actionResults.createEl('h4', { text: 'Action Results' });
				
				const actionResultsList = actionResults.createEl('ul', { cls: 'vc-automation-list' });
				for (let i = 0; i < this.automation.lastResult.actionResults.length; i++) {
					const actionResult = this.automation.lastResult.actionResults[i];
					if (!actionResult) continue;
					const li = actionResultsList.createEl('li');
					
					const icon = actionResult.success ? '✓' : '✗';
					const statusClass = actionResult.success ? 'vc-result-success' : 'vc-result-failure';
					li.createEl('span', { text: `${icon} `, cls: statusClass });
					li.createEl('span', { text: `Action ${i + 1} (${actionResult.action.type}): ` });
					
					if (actionResult.error) {
						li.createEl('span', { text: actionResult.error, cls: 'vc-text-error' });
					} else {
						li.createEl('span', { text: `Completed in ${actionResult.duration}ms`, cls: 'vc-text-muted' });
					}
				}
			}
		}

		// Execution history section (if engine is available)
		if (this.engine) {
			const historyEntries = this.engine.getHistoryForAutomation(this.automation.id, 20);
			if (historyEntries.length > 0) {
				this.renderHistorySection(contentEl, historyEntries);
			}
		}

		// Close button
		const footer = contentEl.createDiv({ cls: 'vc-modal-footer' });
		const closeBtn = footer.createEl('button', { text: 'Close', cls: 'mod-cta' });
		closeBtn.onclick = () => this.close();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private addGridItem(container: HTMLElement, label: string, value: string): void {
		const item = container.createEl('div', { cls: 'vc-grid-item' });
		item.createEl('div', { text: label, cls: 'vc-grid-label' });
		item.createEl('div', { text: value, cls: 'vc-grid-value' });
	}

	/**
	 * Render the execution history section with expandable action outputs.
	 *
	 * @param container - Parent element to render into
	 * @param entries - History entries for this automation, most recent first
	 *
	 * @internal
	 */
	private renderHistorySection(container: HTMLElement, entries: AutomationHistoryEntry[]): void {
		const section = container.createDiv({ cls: 'vc-automation-section' });
		section.createEl('h3', { text: `Execution History (${entries.length})` });

		for (const entry of entries) {
			const date = new Date(entry.timestamp);
			const totalDuration = entry.result.actionResults.reduce((sum, r) => sum + r.duration, 0);
			const statusIcon = entry.result.success ? '✓' : '✗';
			const statusClass = entry.result.success ? 'vc-result-success' : 'vc-result-failure';

			const card = section.createDiv({ cls: 'vc-history-entry' });

			const header = card.createDiv({ cls: 'vc-history-entry-header' });
			header.createEl('span', { text: `${statusIcon} `, cls: statusClass });
			header.createEl('span', { text: date.toLocaleString() });
			header.createEl('span', { text: ` · ${entry.result.trigger.type} · ${totalDuration}ms`, cls: 'vc-text-muted' });

			if (entry.result.error) {
				card.createDiv({ cls: 'vc-automation-error', text: entry.result.error });
			}

			for (let i = 0; i < entry.result.actionResults.length; i++) {
				const ar = entry.result.actionResults[i];
				if (!ar) continue;

				const actionDiv = card.createDiv({ cls: 'vc-history-action' });
				const actionIcon = ar.success ? '✓' : '✗';
				const actionCls = ar.success ? 'vc-result-success' : 'vc-result-failure';

				const actionHeader = actionDiv.createDiv({ cls: 'vc-history-action-header' });
				actionHeader.createEl('span', { text: `${actionIcon} `, cls: actionCls });
				actionHeader.createEl('span', { text: `Action ${i + 1} (${ar.action.type})` });
				actionHeader.createEl('span', { text: ` — ${ar.duration}ms`, cls: 'vc-text-muted' });

				if (ar.error) {
					actionDiv.createDiv({ cls: 'vc-text-error', text: ar.error });
				}

				if (ar.result !== undefined && ar.result !== null) {
					const outputStr = typeof ar.result === 'string' ? ar.result : JSON.stringify(ar.result, null, 2);
					const toggle = actionDiv.createEl('button', { text: 'Show output', cls: 'vc-btn vc-btn-small vc-history-expand' });
					const outputEl = actionDiv.createDiv({ cls: 'vc-history-output' });
					outputEl.style.display = 'none';
					outputEl.createEl('pre', { text: outputStr });

					toggle.onclick = () => {
						const hidden = outputEl.style.display === 'none';
						outputEl.style.display = hidden ? 'block' : 'none';
						toggle.textContent = hidden ? 'Hide output' : 'Show output';
					};
				}
			}
		}
	}
}
