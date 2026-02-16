/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AutomationsSection
 * @description Automations management section for the settings tab.
 *
 * Lets users view, toggle, run, schedule, and inspect automations registered
 * with the AutomationEngine.
 *
 * @since 0.0.15
 */

import { Setting } from "obsidian";
import type { AutomationInstance } from "../../../automation/types";
import { EXTENSION_BROWSER_VIEW_TYPE } from "../../extensions/ExtensionBrowserView";
import { AutomationScheduleModal, AutomationHistoryModal } from "../modals";
import { AutomationDetailsModal } from "../modals/AutomationDetailsModal";
import { createCollapsibleSection, type SettingSectionContext } from "./SectionHelpers";

/**
 * Render the Automations section.
 *
 * @param containerEl - Parent element
 * @param ctx - Shared settings context
 *
 * @internal
 */
export function renderAutomationsSection(containerEl: HTMLElement, ctx: SettingSectionContext): void {
	const { content: section } = createCollapsibleSection(containerEl, "Automations", "vc-automations-section");

	section.createEl("p", {
		text: "Manage scheduled and event-triggered workflows. Automations can execute agents, prompts, skills, or vault operations automatically.",
		cls: "vc-status-desc"
	});

	// Get automations from engine
	const automations = ctx.plugin.automationEngine?.getAllAutomations() || [];

	// Add "Create Automation" button (always visible)
	new Setting(section)
		.addButton(button => button
			.setButtonText("Create Automation")
			.onClick(() => openScheduleModal(null, ctx)))
		.addButton(button => button
			.setButtonText("Browse Automations")
			.onClick(async () => {
				const viewState = {
					type: EXTENSION_BROWSER_VIEW_TYPE,
					active: true,
					state: { filterByKind: "automation" },
				};
				const leaves = ctx.app.workspace.getLeavesOfType(EXTENSION_BROWSER_VIEW_TYPE);
				if (leaves.length > 0 && leaves[0]) {
					await leaves[0].setViewState(viewState);
					ctx.app.workspace.revealLeaf(leaves[0]);
				} else {
					await ctx.app.workspace.getLeaf(true).setViewState(viewState);
				}
		}))
		.addButton(button => button
			.setButtonText("View History")
			.onClick(() => {
				const engine = ctx.plugin.automationEngine;
				if (engine) {
					new AutomationHistoryModal(ctx.app, engine).open();
				}
			}));

	if (automations.length === 0) {
		const emptyState = section.createDiv({ cls: "vc-empty-state" });
		emptyState.createEl("p", { text: "No automations installed yet." });
		emptyState.createEl("p", {
			text: "Install automation extensions from the Extension Browser or create one manually.",
			cls: "vc-status-desc"
		});
		return;
	}

	renderAutomationsTable(section, automations, ctx);
}

/** @internal */
function renderAutomationsTable(container: HTMLElement, automations: AutomationInstance[], ctx: SettingSectionContext): void {
	const table = container.createEl("table", { cls: "vc-automations-table" });

	const thead = table.createEl("thead");
	const headerRow = thead.createEl("tr");
	headerRow.createEl("th", { text: "Name" });
	headerRow.createEl("th", { text: "Steps" });
	headerRow.createEl("th", { text: "Triggers" });
	headerRow.createEl("th", { text: "Status" });
	headerRow.createEl("th", { text: "Last Run" });
	headerRow.createEl("th", { text: "Actions" });

	const tbody = table.createEl("tbody");
	for (const automation of automations) {
		const row = tbody.createEl("tr");

		row.createEl("td", { text: automation.name, cls: "vc-automation-name" });

		// Steps column — show pipeline of action types
		const stepsCell = row.createEl("td", { cls: "vc-automation-steps" });
		const actionTypes = automation.config.actions.map(a => {
			switch (a.type) {
				case 'run-agent': return 'Agent';
				case 'run-prompt': return 'Prompt';
				case 'run-skill': return 'Skill';
				case 'create-note': return 'Create note';
				case 'update-note': return 'Update note';
				case 'run-shell': return 'Shell';
				default: return (a as any).type;
			}
		});
		stepsCell.createEl("span", { text: actionTypes.join(' → ') });

		const triggersCell = row.createEl("td", { cls: "vc-automation-triggers" });
		const triggerTypes = automation.config.triggers.map(t => t.type).join(", ");
		triggersCell.createEl("span", { text: triggerTypes });

		const statusCell = row.createEl("td", { cls: "vc-automation-status" });
		statusCell.createEl("span", {
			cls: `vc-status-badge ${automation.enabled ? "vc-status-enabled" : "vc-status-disabled"}`,
			text: automation.enabled ? "Enabled" : "Disabled"
		});

		const lastRunCell = row.createEl("td", { cls: "vc-automation-lastrun" });
		if (automation.lastRun) {
			const date = new Date(automation.lastRun);
			lastRunCell.createEl("span", { text: formatTimeAgo(date) });
			if (automation.lastResult) {
				const resultIcon = automation.lastResult.success ? "✓" : "✗";
				const resultClass = automation.lastResult.success ? "vc-result-success" : "vc-result-failure";
				lastRunCell.createEl("span", {
					text: ` ${resultIcon}`,
					cls: resultClass
				});
			}
		} else {
			lastRunCell.createEl("span", { text: "Never", cls: "vc-text-muted" });
		}

		const actionsCell = row.createEl("td", { cls: "vc-automation-actions" });

		const toggleBtn = actionsCell.createEl("button", {
			cls: "vc-btn vc-btn-small",
			text: automation.enabled ? "Disable" : "Enable"
		});
		toggleBtn.onclick = async () => {
			if (automation.enabled) {
				await ctx.plugin.automationEngine?.disableAutomation(automation.id);
			} else {
				await ctx.plugin.automationEngine?.enableAutomation(automation.id);
			}
			ctx.refreshDisplay();
		};

		const runBtn = actionsCell.createEl("button", {
			cls: "vc-btn vc-btn-small",
			text: "Run Now"
		});
		runBtn.onclick = async () => {
			try {
				await ctx.plugin.automationEngine?.runAutomation(automation.id);
				ctx.refreshDisplay();
			} catch (error) {
				console.error("Failed to run automation:", error);
			}
		};

		const scheduleBtn = actionsCell.createEl("button", {
			cls: "vc-btn vc-btn-small",
			text: "Schedule"
		});
		scheduleBtn.onclick = () => {
			openScheduleModal(automation, ctx);
		};

		const detailsBtn = actionsCell.createEl("button", {
			cls: "vc-btn vc-btn-small",
			text: "Details"
		});
		detailsBtn.onclick = () => {
			showAutomationDetails(automation, ctx);
		};

		const deleteBtn = actionsCell.createEl("button", {
			cls: "vc-btn vc-btn-small vc-btn-danger",
			text: "Delete"
		});
		deleteBtn.onclick = async () => {
			await ctx.plugin.automationEngine?.unregisterAutomation(automation.id);
			ctx.refreshDisplay();
		};
	}

	const summary = container.createDiv({ cls: "vc-table-summary" });
	const enabledCount = automations.filter(a => a.enabled).length;
	summary.createEl("span", {
		text: `${automations.length} automation${automations.length !== 1 ? "s" : ""} (${enabledCount} enabled)`
	});
}

/** @internal */
function formatTimeAgo(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

	if (seconds < 60) return "Just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;

	return date.toLocaleDateString();
}

/** @internal */
function showAutomationDetails(automation: AutomationInstance, ctx: SettingSectionContext): void {
	const modal = new AutomationDetailsModal(ctx.app, automation, ctx.plugin.automationEngine);
	modal.open();
}

/**
 * Open the schedule modal in create or edit mode.
 *
 * @param automation - existing automation to edit, or null to create
 * @param ctx - Shared settings context
 *
 * @internal
 */
function openScheduleModal(automation: AutomationInstance | null, ctx: SettingSectionContext): void {
	const modal = new AutomationScheduleModal(
		ctx.app,
		ctx.plugin,
		automation,
		async (existingId, name, config) => {
			const engine = ctx.plugin.automationEngine;
			if (!engine) return;

			if (existingId) {
				await engine.updateAutomation(existingId, { config });
			} else {
				const id = `user-${Date.now()}`;
				await engine.registerAutomation({
					id,
					name,
					config,
					enabled: true,
					executionCount: 0,
				});
			}

			ctx.refreshDisplay();
		},
	);
	modal.open();
}
