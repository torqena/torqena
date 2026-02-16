/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AutomationHistoryModal
 * @description Modal for browsing the full execution history of all automations.
 *
 * Displays a scrollable, filterable list of past automation runs with timestamps,
 * trigger info, success/failure status, and expandable full action outputs.
 *
 * @example
 * ```typescript
 * import { AutomationHistoryModal } from './modals';
 *
 * const modal = new AutomationHistoryModal(app, automationEngine);
 * modal.open();
 * ```
 *
 * @since 0.1.0
 */

import { App, Modal } from 'obsidian';
import type { AutomationEngine } from '../../../automation/AutomationEngine';
import type { AutomationHistoryEntry } from '../../../automation/types';

/**
 * Modal to browse all automation execution history.
 *
 * Provides filtering by automation, success/failure status, and shows
 * full action outputs for each execution.
 */
export class AutomationHistoryModal extends Modal {
	private engine: AutomationEngine;
	private filterAutomationId: string = '';
	private filterStatus: 'all' | 'success' | 'failure' = 'all';
	private bodyEl: HTMLElement | null = null;

	/**
	 * @param app - Obsidian app instance
	 * @param engine - AutomationEngine instance to read history from
	 */
	constructor(app: App, engine: AutomationEngine) {
		super(app);
		this.engine = engine;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('vc-automation-history-modal');

		// Header
		contentEl.createEl('h2', { text: 'Automation execution history' });

		// Filter bar
		this.renderFilterBar(contentEl);

		// Body container for the entries list
		this.bodyEl = contentEl.createDiv({ cls: 'vc-history-body' });
		this.renderEntries();

		// Footer
		const footer = contentEl.createDiv({ cls: 'vc-modal-footer' });

		const clearBtn = footer.createEl('button', { text: 'Clear history', cls: 'vc-btn vc-btn-danger' });
		clearBtn.onclick = async () => {
			await this.engine.clearHistory();
			this.renderEntries();
		};

		const closeBtn = footer.createEl('button', { text: 'Close', cls: 'mod-cta' });
		closeBtn.onclick = () => this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		this.bodyEl = null;
	}

	/**
	 * Render filter bar with automation and status dropdowns.
	 * @internal
	 */
	private renderFilterBar(container: HTMLElement): void {
		const bar = container.createDiv({ cls: 'vc-history-filter' });

		// Automation filter
		const automationLabel = bar.createEl('label', { text: 'Automation: ' });
		const automationSelect = automationLabel.createEl('select');
		automationSelect.createEl('option', { text: 'All', attr: { value: '' } });

		const automations = this.engine.getAllAutomations();
		for (const a of automations) {
			automationSelect.createEl('option', { text: a.name, attr: { value: a.id } });
		}
		automationSelect.value = this.filterAutomationId;
		automationSelect.onchange = () => {
			this.filterAutomationId = automationSelect.value;
			this.renderEntries();
		};

		// Status filter
		const statusLabel = bar.createEl('label', { text: 'Status: ' });
		const statusSelect = statusLabel.createEl('select');
		statusSelect.createEl('option', { text: 'All', attr: { value: 'all' } });
		statusSelect.createEl('option', { text: 'Success', attr: { value: 'success' } });
		statusSelect.createEl('option', { text: 'Failure', attr: { value: 'failure' } });
		statusSelect.value = this.filterStatus;
		statusSelect.onchange = () => {
			this.filterStatus = statusSelect.value as 'all' | 'success' | 'failure';
			this.renderEntries();
		};
	}

	/**
	 * Render the filtered history entries into the body container.
	 * @internal
	 */
	private renderEntries(): void {
		if (!this.bodyEl) return;
		this.bodyEl.empty();

		let entries: AutomationHistoryEntry[];
		if (this.filterAutomationId) {
			entries = this.engine.getHistoryForAutomation(this.filterAutomationId);
		} else {
			entries = this.engine.getHistory();
		}

		// Apply status filter
		if (this.filterStatus === 'success') {
			entries = entries.filter(e => e.result.success);
		} else if (this.filterStatus === 'failure') {
			entries = entries.filter(e => !e.result.success);
		}

		if (entries.length === 0) {
			this.bodyEl.createDiv({ cls: 'vc-empty-state', text: 'No history entries found.' });
			return;
		}

		for (const entry of entries) {
			this.renderEntry(this.bodyEl, entry);
		}
	}

	/**
	 * Render a single history entry card.
	 * @internal
	 */
	private renderEntry(container: HTMLElement, entry: AutomationHistoryEntry): void {
		const automation = this.engine.getAutomation(entry.automationId);
		const name = automation?.name ?? entry.automationId;
		const date = new Date(entry.timestamp);
		const totalDuration = entry.result.actionResults.reduce((sum, r) => sum + r.duration, 0);
		const statusIcon = entry.result.success ? '✓' : '✗';
		const statusClass = entry.result.success ? 'vc-result-success' : 'vc-result-failure';

		const card = container.createDiv({ cls: 'vc-history-entry' });

		// Header row
		const header = card.createDiv({ cls: 'vc-history-entry-header' });
		header.createEl('span', { text: name, cls: 'vc-history-entry-name' });
		header.createEl('span', { text: ` ${statusIcon}`, cls: statusClass });
		header.createEl('span', { text: ` — ${date.toLocaleString()}`, cls: 'vc-text-muted' });

		// Summary row
		const summary = card.createDiv({ cls: 'vc-history-entry-summary' });
		summary.createEl('span', { text: `Trigger: ${entry.result.trigger.type}` });
		summary.createEl('span', { text: ` · ${entry.result.actionResults.length} action${entry.result.actionResults.length !== 1 ? 's' : ''} · ${totalDuration}ms` });

		if (entry.result.error) {
			card.createDiv({ cls: 'vc-automation-error', text: entry.result.error });
		}

		// Action results (collapsible)
		for (let i = 0; i < entry.result.actionResults.length; i++) {
			const ar = entry.result.actionResults[i];
			if (!ar) continue;
			this.renderActionResult(card, ar, i);
		}
	}

	/**
	 * Render a single action result with expandable output.
	 * @internal
	 */
	private renderActionResult(container: HTMLElement, ar: import('../../../automation/types').ActionExecutionResult, index: number): void {
		const actionIcon = ar.success ? '✓' : '✗';
		const actionClass = ar.success ? 'vc-result-success' : 'vc-result-failure';
		const actionType = ar.action.type;

		let actionTarget = '';
		if ('agentId' in ar.action) actionTarget = ` — ${ar.action.agentId}`;
		else if ('promptId' in ar.action) actionTarget = ` — ${ar.action.promptId}`;
		else if ('skillId' in ar.action) actionTarget = ` — ${ar.action.skillId}`;
		else if ('path' in ar.action) actionTarget = ` — ${ar.action.path}`;
		else if ('command' in ar.action) actionTarget = ` — ${ar.action.command}`;

		const actionDiv = container.createDiv({ cls: 'vc-history-action' });
		const actionHeader = actionDiv.createDiv({ cls: 'vc-history-action-header' });
		actionHeader.createEl('span', { text: `${actionIcon} `, cls: actionClass });
		actionHeader.createEl('span', { text: `Action ${index + 1}: ${actionType}${actionTarget}` });
		actionHeader.createEl('span', { text: ` (${ar.duration}ms)`, cls: 'vc-text-muted' });

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
