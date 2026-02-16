/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module PeriodicNotesSection
 * @description Periodic notes configuration (daily, weekly, monthly, quarterly, yearly).
 *
 * @since 0.0.15
 */

import { Setting } from "obsidian";
import type { PeriodicNotesSettings } from "../types";
import { DEFAULT_PERIODIC_NOTES } from "../defaults";
import { periodicNoteIcons, wrapIcon } from "../../assets/periodicNotesIcons";
import { createCollapsibleSection, type SettingSectionContext } from "./SectionHelpers";

/**
 * Render the Periodic Notes settings section.
 *
 * @param container - Parent element
 * @param ctx - Shared settings context
 *
 * @internal
 */
export function renderPeriodicNotesSection(container: HTMLElement, ctx: SettingSectionContext): void {
	const { content: section } = createCollapsibleSection(container, "Periodic Notes");

	section.createEl("p", {
		text: "Configure periodic notes (daily, weekly, monthly, quarterly, yearly) with custom folders, date formats, and templates. These settings are used by the Note Manager voice agent.",
		cls: "vc-status-desc"
	});

	if (!ctx.plugin.settings.periodicNotes) {
		ctx.plugin.settings.periodicNotes = { ...DEFAULT_PERIODIC_NOTES };
	}

	const noteTypes: Array<{ key: keyof PeriodicNotesSettings; label: string; defaultFormat: string; formatHelp: string; icon: string }> = [
		{
			key: 'daily',
			label: 'Daily Notes',
			defaultFormat: 'YYYY-MM-DD',
			formatHelp: 'Common formats: YYYY-MM-DD, DD-MM-YYYY, MMMM D, YYYY',
			icon: periodicNoteIcons.daily
		},
		{
			key: 'weekly',
			label: 'Weekly Notes',
			defaultFormat: 'gggg-[W]ww',
			formatHelp: 'Common formats: gggg-[W]ww (2026-W05), YYYY-[Week]-ww',
			icon: periodicNoteIcons.weekly
		},
		{
			key: 'monthly',
			label: 'Monthly Notes',
			defaultFormat: 'YYYY-MM',
			formatHelp: 'Common formats: YYYY-MM, MMMM YYYY, MM-YYYY',
			icon: periodicNoteIcons.monthly
		},
		{
			key: 'quarterly',
			label: 'Quarterly Notes',
			defaultFormat: 'YYYY-[Q]Q',
			formatHelp: 'Common formats: YYYY-[Q]Q (2026-Q1), [Q]Q-YYYY',
			icon: periodicNoteIcons.quarterly
		},
		{
			key: 'yearly',
			label: 'Yearly Notes',
			defaultFormat: 'YYYY',
			formatHelp: 'Common formats: YYYY, [Year] YYYY',
			icon: periodicNoteIcons.yearly
		},
	];

	for (const noteType of noteTypes) {
		const config = ctx.plugin.settings.periodicNotes[noteType.key];

		const noteSection = section.createEl("details", { cls: "vc-periodic-note-section" });
		const summary = noteSection.createEl("summary", { cls: "vc-periodic-note-header" });

		const headerRow = summary.createDiv({ cls: "vc-periodic-header-row" });

		const iconEl = headerRow.createSpan({ cls: "vc-periodic-icon" });
		iconEl.innerHTML = wrapIcon(noteType.icon, 20);

		headerRow.createEl("span", { text: noteType.label, cls: "vc-periodic-label" });

		const statusBadge = headerRow.createEl("span", {
			text: config.enabled ? "Enabled" : "Disabled",
			cls: `vc-periodic-badge ${config.enabled ? "vc-badge-ok" : "vc-badge-disabled"}`
		});

		const content = noteSection.createDiv({ cls: "vc-periodic-content" });

		new Setting(content)
			.setName("Enabled")
			.setDesc(`Enable ${noteType.label.toLowerCase()} support`)
			.addToggle((toggle) => {
				toggle.setValue(config.enabled);
				toggle.onChange(async (value) => {
					ctx.plugin.settings.periodicNotes[noteType.key].enabled = value;
					statusBadge.setText(value ? "Enabled" : "Disabled");
					statusBadge.removeClass("vc-badge-ok", "vc-badge-disabled");
					statusBadge.addClass(value ? "vc-badge-ok" : "vc-badge-disabled");
					await ctx.plugin.saveSettings();
				});
			});

		new Setting(content)
			.setName("Folder")
			.setDesc("Folder where notes are stored (relative to vault root)")
			.addText((text) => {
				text.setPlaceholder(DEFAULT_PERIODIC_NOTES[noteType.key].folder);
				text.setValue(config.folder);
				text.onChange(async (value) => {
					ctx.plugin.settings.periodicNotes[noteType.key].folder = value || DEFAULT_PERIODIC_NOTES[noteType.key].folder;
					await ctx.plugin.saveSettings();
				});
			});

		new Setting(content)
			.setName("Date Format")
			.setDesc(noteType.formatHelp)
			.addText((text) => {
				text.setPlaceholder(noteType.defaultFormat);
				text.setValue(config.format);
				text.onChange(async (value) => {
					ctx.plugin.settings.periodicNotes[noteType.key].format = value || noteType.defaultFormat;
					await ctx.plugin.saveSettings();
				});
			});

		new Setting(content)
			.setName("Template")
			.setDesc("Path to template file (optional)")
			.addText((text) => {
				text.setPlaceholder("Templates/periodic-template.md");
				text.setValue(config.templatePath || "");
				text.onChange(async (value) => {
					ctx.plugin.settings.periodicNotes[noteType.key].templatePath = value || undefined;
					await ctx.plugin.saveSettings();
				});
			});
	}

	const helpEl = section.createDiv({ cls: "vc-periodic-help" });
	helpEl.innerHTML = `
		<details>
			<summary>Date Format Reference (moment.js)</summary>
			<table class="vc-format-table">
				<tr><td><code>YYYY</code></td><td>4-digit year (2026)</td></tr>
				<tr><td><code>YY</code></td><td>2-digit year (26)</td></tr>
				<tr><td><code>MM</code></td><td>Month as 2 digits (01-12)</td></tr>
				<tr><td><code>M</code></td><td>Month as number (1-12)</td></tr>
				<tr><td><code>MMMM</code></td><td>Month name (January)</td></tr>
				<tr><td><code>MMM</code></td><td>Short month (Jan)</td></tr>
				<tr><td><code>DD</code></td><td>Day as 2 digits (01-31)</td></tr>
				<tr><td><code>D</code></td><td>Day as number (1-31)</td></tr>
				<tr><td><code>ww</code></td><td>Week of year (01-53)</td></tr>
				<tr><td><code>gggg</code></td><td>ISO week year</td></tr>
				<tr><td><code>Q</code></td><td>Quarter (1-4)</td></tr>
				<tr><td><code>[text]</code></td><td>Literal text (escaped)</td></tr>
			</table>
		</details>
	`;
}
