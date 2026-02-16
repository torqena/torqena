/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AIProviderProfilesSection
 * @description AI Provider Profiles management section for the settings tab.
 *
 * @since 0.0.15
 */

import { Setting } from "obsidian";
import type {
	OpenAIProviderProfile,
	AzureOpenAIProviderProfile,
	LocalProviderProfile,
} from "../types";
import { getProfileTypeDisplayName } from "../profiles";
import { AIProviderProfileModal } from "../modals";
import { createCollapsibleSection, type SettingSectionContext } from "./SectionHelpers";

/**
 * Render the AI Provider Profiles management section.
 *
 * @param container - Parent element
 * @param ctx - Shared settings context
 *
 * @internal
 */
export function renderAIProviderProfilesSection(container: HTMLElement, ctx: SettingSectionContext): void {
	const { content: section } = createCollapsibleSection(container, "AI Provider Profiles");

	section.createEl("p", {
		text: "Configure AI provider profiles for Chat and Voice services. GitHub Copilot CLI is built-in. Create additional profiles for OpenAI, Azure OpenAI, or local Whisper servers.",
		cls: "vc-status-desc"
	});

	const profileListContainer = section.createDiv({ cls: "vc-profile-list" });
	renderProfileList(profileListContainer, ctx);

	new Setting(section)
		.setName("Add Profile")
		.setDesc("Create a new AI provider profile")
		.addButton((button) => {
			button
				.setButtonText("Add Profile")
				.onClick(() => {
					const modal = new AIProviderProfileModal(ctx.app, null, async (profile) => {
						if (!ctx.plugin.settings.aiProviderProfiles) {
							ctx.plugin.settings.aiProviderProfiles = [];
						}
						ctx.plugin.settings.aiProviderProfiles.push(profile);
						await ctx.plugin.saveSettings();
						renderProfileList(profileListContainer, ctx);
						ctx.refreshDisplay();
						console.log(`Profile "${profile.name}" created`);
					});
					modal.open();
				});
		});
}

/** @internal */
function renderProfileList(container: HTMLElement, ctx: SettingSectionContext): void {
	container.empty();

	const profiles = ctx.plugin.settings.aiProviderProfiles || [];

	if (profiles.length === 0) {
		const emptyState = container.createDiv({ cls: "vc-profile-empty" });
		emptyState.createEl("p", { text: "No profiles configured yet." });
		emptyState.createEl("p", {
			text: "Click \"Add Profile\" to create your first AI provider profile.",
			cls: "vc-status-desc"
		});
		return;
	}

	const table = container.createEl("table", { cls: "vc-profiles-table" });

	const thead = table.createEl("thead");
	const headerRow = thead.createEl("tr");
	headerRow.createEl("th", { text: "Name" });
	headerRow.createEl("th", { text: "Type" });
	headerRow.createEl("th", { text: "Details" });
	headerRow.createEl("th", { text: "Actions" });

	const tbody = table.createEl("tbody");
	for (const profile of profiles) {
		const row = tbody.createEl("tr");

		row.createEl("td", { text: profile.name, cls: "vc-profile-name" });

		const typeCell = row.createEl("td");
		typeCell.createEl("span", {
			text: getProfileTypeDisplayName(profile.type),
			cls: `vc-profile-type-badge vc-profile-type-${profile.type}`
		});

		const detailsCell = row.createEl("td", { cls: "vc-profile-details" });
		if (profile.type === 'copilot') {
			detailsCell.createEl("span", { text: "Built-in GitHub Copilot CLI integration", cls: "vc-profile-detail" });
		} else if (profile.type === 'openai') {
			const openai = profile as OpenAIProviderProfile;
			detailsCell.createEl("span", { text: openai.baseURL || "api.openai.com", cls: "vc-profile-detail" });
		} else if (profile.type === 'azure-openai') {
			const azure = profile as AzureOpenAIProviderProfile;
			detailsCell.createEl("span", { text: azure.deploymentName || 'No deployment', cls: "vc-profile-detail" });
		} else if (profile.type === 'local') {
			const local = profile as LocalProviderProfile;
			detailsCell.createEl("span", { text: local.serverUrl, cls: "vc-profile-detail" });
		}

		const actionsCell = row.createEl("td", { cls: "vc-profile-actions" });

		if (profile.readonly) {
			actionsCell.createEl("span", { text: "Built-in", cls: "vc-readonly-badge" });
		} else {
			const editBtn = actionsCell.createEl("button", { text: "Edit", cls: "vc-btn-sm" });
			editBtn.addEventListener("click", () => {
				const modal = new AIProviderProfileModal(ctx.app, profile, async (updatedProfile) => {
					const index = ctx.plugin.settings.aiProviderProfiles!.findIndex(p => p.id === profile.id);
					if (index !== -1) {
						ctx.plugin.settings.aiProviderProfiles![index] = updatedProfile;
						await ctx.plugin.saveSettings();
						renderProfileList(container, ctx);
						ctx.refreshDisplay();
						console.log(`Profile "${updatedProfile.name}" updated`);
					}
				});
				modal.open();
			});

			const deleteBtn = actionsCell.createEl("button", { text: "Delete", cls: "vc-btn-sm vc-btn-danger" });
			deleteBtn.addEventListener("click", async () => {
				const inUseBy: string[] = [];
				if (ctx.plugin.settings.voiceInputProfileId === profile.id) inUseBy.push("Voice Input");
				if (ctx.plugin.settings.realtimeAgentProfileId === profile.id) inUseBy.push("Realtime Agent");
				if (ctx.plugin.settings.chatProviderProfileId === profile.id) inUseBy.push("Chat Preferences");

				let confirmMessage = `Are you sure you want to delete the profile "${profile.name}"?`;
				if (inUseBy.length > 0) {
					confirmMessage += `\n\nThis profile is currently used by: ${inUseBy.join(", ")}. These will be reset to "None".`;
				}

				if (confirm(confirmMessage)) {
					const index = ctx.plugin.settings.aiProviderProfiles!.findIndex(p => p.id === profile.id);
					if (index !== -1) {
						ctx.plugin.settings.aiProviderProfiles!.splice(index, 1);
					}
					if (ctx.plugin.settings.voiceInputProfileId === profile.id) ctx.plugin.settings.voiceInputProfileId = null;
					if (ctx.plugin.settings.realtimeAgentProfileId === profile.id) ctx.plugin.settings.realtimeAgentProfileId = null;
					if (ctx.plugin.settings.chatProviderProfileId === profile.id) ctx.plugin.settings.chatProviderProfileId = null;

					await ctx.plugin.saveSettings();
					renderProfileList(container, ctx);
					ctx.refreshDisplay();
					console.log(`Profile "${profile.name}" deleted`);
				}
			});
		}
	}
}
