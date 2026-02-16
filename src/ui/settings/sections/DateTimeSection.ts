/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module DateTimeSection
 * @description Date & Time preferences section (timezone, week start day).
 *
 * @since 0.0.15
 */

import { Setting } from "obsidian";
import type { WeekStartDay } from "../types";
import { createCollapsibleSection, type SettingSectionContext } from "./SectionHelpers";

/**
 * Render the Date & Time settings section.
 *
 * @param container - Parent element
 * @param ctx - Shared settings context
 *
 * @internal
 */
export function renderDateTimeSection(container: HTMLElement, ctx: SettingSectionContext): void {
	const { content: section } = createCollapsibleSection(container, "Date & Time");

	section.createEl("p", {
		text: "Configure your preferred timezone and week start day. These settings are used throughout Torqena for date calculations and AI context.",
		cls: "vc-status-desc"
	});

	const timezones = [
		{ value: "", name: "System Default" },
		{ value: "America/New_York", name: "Eastern Time (US & Canada)" },
		{ value: "America/Chicago", name: "Central Time (US & Canada)" },
		{ value: "America/Denver", name: "Mountain Time (US & Canada)" },
		{ value: "America/Los_Angeles", name: "Pacific Time (US & Canada)" },
		{ value: "America/Anchorage", name: "Alaska" },
		{ value: "Pacific/Honolulu", name: "Hawaii" },
		{ value: "America/Toronto", name: "Eastern Time (Canada)" },
		{ value: "America/Vancouver", name: "Pacific Time (Canada)" },
		{ value: "America/Sao_Paulo", name: "Brasilia Time" },
		{ value: "America/Mexico_City", name: "Mexico City" },
		{ value: "Europe/London", name: "London (GMT/BST)" },
		{ value: "Europe/Paris", name: "Paris (CET)" },
		{ value: "Europe/Berlin", name: "Berlin (CET)" },
		{ value: "Europe/Madrid", name: "Madrid (CET)" },
		{ value: "Europe/Rome", name: "Rome (CET)" },
		{ value: "Europe/Amsterdam", name: "Amsterdam (CET)" },
		{ value: "Europe/Moscow", name: "Moscow" },
		{ value: "Asia/Tokyo", name: "Tokyo (JST)" },
		{ value: "Asia/Hong_Kong", name: "Hong Kong (HKT)" },
		{ value: "Asia/Shanghai", name: "China Standard Time" },
		{ value: "Asia/Singapore", name: "Singapore (SGT)" },
		{ value: "Asia/Seoul", name: "Seoul (KST)" },
		{ value: "Asia/Kolkata", name: "India Standard Time" },
		{ value: "Asia/Dubai", name: "Dubai (GST)" },
		{ value: "Australia/Sydney", name: "Sydney (AEST)" },
		{ value: "Australia/Melbourne", name: "Melbourne (AEST)" },
		{ value: "Australia/Perth", name: "Perth (AWST)" },
		{ value: "Pacific/Auckland", name: "Auckland (NZST)" },
		{ value: "UTC", name: "Coordinated Universal Time (UTC)" },
	];

	new Setting(section)
		.setName("Timezone")
		.setDesc("Your preferred timezone for date/time display. Used by voice agents and AI assistants.")
		.addDropdown((dropdown) => {
			for (const tz of timezones) {
				dropdown.addOption(tz.value, tz.name);
			}
			dropdown.setValue(ctx.plugin.settings.timezone || "");
			dropdown.onChange(async (value) => {
				ctx.plugin.settings.timezone = value;
				await ctx.plugin.saveSettings();
			});
		});

	new Setting(section)
		.setName("Week Starts On")
		.setDesc("The first day of the week for calendar calculations (affects weekly notes and date context)")
		.addDropdown((dropdown) => {
			dropdown.addOption("sunday", "Sunday");
			dropdown.addOption("monday", "Monday");
			dropdown.addOption("saturday", "Saturday");
			dropdown.setValue(ctx.plugin.settings.weekStartDay || "sunday");
			dropdown.onChange(async (value) => {
				ctx.plugin.settings.weekStartDay = value as WeekStartDay;
				await ctx.plugin.saveSettings();
			});
		});

	const previewContainer = section.createDiv({ cls: "vc-datetime-preview" });
	updateDateTimePreview(previewContainer, ctx);
}

/** @internal */
function updateDateTimePreview(container: HTMLElement, ctx: SettingSectionContext): void {
	container.empty();
	const now = new Date();
	const timezone = ctx.plugin.settings.timezone || undefined;
	const weekStartDay = ctx.plugin.settings.weekStartDay || "sunday";

	try {
		const options: Intl.DateTimeFormatOptions = {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZoneName: 'short',
			...(timezone ? { timeZone: timezone } : {})
		};

		const formattedDate = now.toLocaleDateString('en-US', options);

		const previewText = container.createDiv({ cls: "vc-datetime-preview-text" });
		previewText.createEl("span", { text: "Current time in this timezone: ", cls: "vc-preview-label" });
		previewText.createEl("strong", { text: formattedDate });

		const weekInfo = container.createDiv({ cls: "vc-datetime-preview-week" });
		weekInfo.createEl("span", { text: `Week starts on: ${weekStartDay.charAt(0).toUpperCase() + weekStartDay.slice(1)}` });
	} catch (e) {
		container.createEl("span", {
			text: "Invalid timezone selection",
			cls: "vc-datetime-preview-error"
		});
	}
}
