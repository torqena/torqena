/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ChatPreferencesSection
 * @description Chat preferences settings: provider, model, streaming, tracing, tools.
 *
 * @since 0.0.15
 */

import { Setting } from "obsidian";
import { CliStatus } from "../../../ai/providers/GitHubCopilotCliManager";
import { CopilotChatView, COPILOT_VIEW_TYPE } from "../../../chat";
import { isMobile, isProviderAvailable } from "../../../utils/platform";
import type {
	OpenAIProviderProfile,
	AzureOpenAIProviderProfile,
} from "../types";
import {
	ensureBuiltInProfiles,
	getProfileById,
	profileTypeToBackend,
	getOpenAIProfileApiKey,
	getAzureProfileApiKey,
} from "../profiles";
import { getModelDisplayName, getAvailableModels } from "../utils";
import { createCollapsibleSection, type SettingSectionContext } from "./SectionHelpers";

/**
 * State object returned by the chat preferences section.
 */
export interface ChatPreferencesState {
	mainSettingsContainer: HTMLElement;
	renderMainSettingsIfReady: (status: CliStatus) => void;
}

/**
 * Render the Chat Preferences section and return its state.
 *
 * @param parentContainer - Parent element
 * @param ctx - Shared settings context
 * @returns State for the main settings area
 *
 * @internal
 */
export function renderChatPreferencesSection(
	parentContainer: HTMLElement,
	ctx: SettingSectionContext
): ChatPreferencesState {
	const mainSettingsContainer = parentContainer.createDiv({ cls: "vc-main-settings" });
	let mainSettingsStatusKey: string | null = null;

	function renderMainSettingsIfReady(status: CliStatus): void {
		const statusKey = `${status.installed}-${status.version || ''}-${status.error || ''}`;
		if (mainSettingsStatusKey === statusKey && mainSettingsContainer.children.length > 0) {
			return;
		}
		mainSettingsStatusKey = statusKey;
		mainSettingsContainer.empty();

		const { content: section } = createCollapsibleSection(mainSettingsContainer, "Chat Preferences");

		ensureBuiltInProfiles(ctx.plugin.settings);

		const profiles = ctx.plugin.settings.aiProviderProfiles || [];
		const chatProfiles = profiles.filter(p => {
			if (p.type === 'local') return false;
			if (p.type === 'copilot' || p.type === 'openai' || p.type === 'azure-openai') {
				return isProviderAvailable(p.type);
			}
			return false;
		});

		if (isMobile && ctx.plugin.settings.aiProvider === 'copilot') {
			new Setting(section)
				.setName("⚠️ Provider Unavailable")
				.setDesc("GitHub Copilot CLI is not available on mobile. Please select an OpenAI or Azure OpenAI profile.")
				.setClass("vc-mobile-warning");
		}

		new Setting(section)
			.setName("Chat Provider")
			.setDesc(isMobile
				? "Select AI provider for chat (GitHub Copilot CLI unavailable on mobile)"
				: "Select AI provider for chat: GitHub Copilot CLI or an AI Profile (OpenAI/Azure OpenAI)")
			.addDropdown((dropdown) => {
				for (const profile of chatProfiles) {
					dropdown.addOption(profile.id, profile.name);
				}
				const currentProfileId = ctx.plugin.settings.chatProviderProfileId || 'builtin-copilot';
				dropdown.setValue(currentProfileId);
				dropdown.onChange(async (value) => {
					ctx.plugin.settings.chatProviderProfileId = value;
					const profile = getProfileById(ctx.plugin.settings, value);
					if (profile) {
						if (profile.type === 'copilot') {
							ctx.plugin.settings.aiProvider = 'copilot';
						} else if (profile.type === 'openai') {
							ctx.plugin.settings.aiProvider = 'openai';
						} else if (profile.type === 'azure-openai') {
							ctx.plugin.settings.aiProvider = 'azure-openai';
						}
					}
					await ctx.plugin.saveSettings();
					await ctx.plugin.disconnectCopilot();
					await ctx.plugin.connectCopilot();
					ctx.refreshDisplay();
				});
			});

		// Model selection
		if (ctx.plugin.settings.aiProvider === 'copilot') {
			renderCopilotModelSelection(section, ctx);
		} else {
			const profile = getProfileById(ctx.plugin.settings, ctx.plugin.settings.chatProviderProfileId);
			if (profile && (profile.type === 'openai' || profile.type === 'azure-openai')) {
				renderProfileModelSelection(section, ctx, profile);
			}
		}

		// Streaming toggle
		new Setting(section)
			.setName("Streaming")
			.setDesc("Streaming keeps the UI responsive and avoids waiting for the entire final result before updating the screen.")
			.addToggle((toggle) =>
				toggle
					.setValue(ctx.plugin.settings.streaming)
					.onChange(async (value) => {
						ctx.plugin.settings.streaming = value;
						await ctx.plugin.saveSettings();
					})
			);

		// Request timeout
		new Setting(section)
			.setName("Request Timeout")
			.setDesc("Maximum time to wait for AI responses (in seconds). Longer complex queries may need more time.")
			.addText((text) => {
				text
					.setPlaceholder("120")
					.setValue(String(ctx.plugin.settings.requestTimeout / 1000))
					.onChange(async (value) => {
						const seconds = parseInt(value, 10) || 120;
						ctx.plugin.settings.requestTimeout = Math.max(10, seconds) * 1000;
						await ctx.plugin.saveSettings();
					});
			});

		// Tracing toggle
		new Setting(section)
			.setName("Tracing")
			.setDesc("Enable tracing to capture detailed execution information including LLM generations, tool calls, and agent handoffs. View traces via the gear menu.")
			.addToggle((toggle) =>
				toggle
					.setValue(ctx.plugin.settings.tracingEnabled)
					.onChange(async (value) => {
						ctx.plugin.settings.tracingEnabled = value;
						await ctx.plugin.saveSettings();
					})
			);

		// Log level
		new Setting(section)
			.setName("Log Level")
			.setDesc("SDK logging level when tracing is enabled. 'debug' captures the most detail.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						'debug': 'Debug (verbose)',
						'info': 'Info (default)',
						'warn': 'Warning',
						'error': 'Error only'
					})
					.setValue(ctx.plugin.settings.logLevel || 'info')
					.onChange(async (value) => {
						ctx.plugin.settings.logLevel = value as 'debug' | 'info' | 'warn' | 'error';
						await ctx.plugin.saveSettings();
					})
			);

		// Status bar toggle
		new Setting(section)
			.setName("Status Bar Indicator")
			.setDesc("Show Copilot connection status in the status bar")
			.addToggle((toggle) =>
				toggle
					.setValue(ctx.plugin.settings.showInStatusBar)
					.onChange(async (value) => {
						ctx.plugin.settings.showInStatusBar = value;
						await ctx.plugin.saveSettings();
						ctx.plugin.updateStatusBar();
					})
			);

	}

	return { mainSettingsContainer, renderMainSettingsIfReady };
}

/** @internal */
function renderCopilotModelSelection(section: HTMLElement, ctx: SettingSectionContext): void {
	let modelDropdown: any;
	new Setting(section)
		.setName("Default Model")
		.setDesc("Select the AI model for conversations")
		.addDropdown((dropdown) => {
			modelDropdown = dropdown;
			populateModelDropdown(dropdown, ctx);
			dropdown.setValue(ctx.plugin.settings.model);
			dropdown.onChange(async (value) => {
				ctx.plugin.settings.model = value;
				await ctx.plugin.saveSettings();
			});
		})
		.addExtraButton((button) => {
			button
				.setIcon("refresh-cw")
				.setTooltip("Refresh available models from CLI")
				.onClick(async () => {
					button.setDisabled(true);
					const result = await ctx.cliManager.fetchAvailableModels();
					if (result.models.length > 0) {
						const filteredModels = result.models.filter(m => !m.toLowerCase().includes('codex'));
						ctx.plugin.settings.availableModels = filteredModels;
						const firstModel = filteredModels[0];
						if (firstModel && !filteredModels.includes(ctx.plugin.settings.model)) {
							ctx.plugin.settings.model = firstModel;
						}
						await ctx.plugin.saveSettings();
						if (modelDropdown) {
							populateModelDropdown(modelDropdown, ctx);
							modelDropdown.setValue(ctx.plugin.settings.model);
						}
						const chatLeaves = ctx.app.workspace.getLeavesOfType(COPILOT_VIEW_TYPE);
						for (const leaf of chatLeaves) {
							const view = leaf.view as CopilotChatView;
							if (view?.refreshFromSettings) {
								view.refreshFromSettings();
							}
						}
					}
					button.setDisabled(false);
				});
		});
}

/** @internal */
function renderProfileModelSelection(section: HTMLElement, ctx: SettingSectionContext, profile: import("../types").AIProviderProfile): void {
	let modelDropdown: any;
	new Setting(section)
		.setName("Model")
		.setDesc(`Select model for ${profile.name}`)
		.addDropdown((dropdown) => {
			modelDropdown = dropdown;
			let currentModel = '';
			if (profile.type === 'openai') {
				currentModel = (profile as OpenAIProviderProfile).model || 'gpt-4o';
			} else if (profile.type === 'azure-openai') {
				currentModel = (profile as AzureOpenAIProviderProfile).model || (profile as AzureOpenAIProviderProfile).deploymentName;
			}

			if (profile.type === 'openai') {
				for (const model of ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o1-preview', 'o3-mini']) {
					dropdown.addOption(model, model);
				}
			} else if (profile.type === 'azure-openai') {
				for (const model of ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-4-32k', 'gpt-35-turbo', 'gpt-35-turbo-16k', 'o1', 'o1-mini', 'o1-preview', 'o3-mini']) {
					dropdown.addOption(model, model);
				}
			}

			dropdown.setValue(currentModel);
			dropdown.onChange(async (value) => {
				if (profile.type === 'openai') {
					(profile as OpenAIProviderProfile).model = value;
				} else if (profile.type === 'azure-openai') {
					(profile as AzureOpenAIProviderProfile).model = value;
				}
				const profileIndex = ctx.plugin.settings.aiProviderProfiles!.findIndex(p => p.id === profile.id);
				if (profileIndex !== -1) {
					ctx.plugin.settings.aiProviderProfiles![profileIndex] = profile;
					await ctx.plugin.saveSettings();
				}
			});
		})
		.addExtraButton((button) => {
			button
				.setIcon("refresh-cw")
				.setTooltip("Refresh available models from API")
				.onClick(async () => {
					button.setDisabled(true);
					console.log("Discovering models...");
					try {
						let models: string[] = [];
						if (profile.type === 'openai') {
							const apiKey = getOpenAIProfileApiKey(ctx.app, profile as OpenAIProviderProfile);
							const service = ctx.plugin.openaiService || new (await import('../../../ai/providers/OpenAIService')).OpenAIService(ctx.app, {
								provider: 'openai',
								model: 'gpt-4o',
								streaming: false,
								apiKey,
								baseURL: (profile as OpenAIProviderProfile).baseURL,
							});
							await service.initialize();
							models = await service.listModels();
						} else if (profile.type === 'azure-openai') {
							const apiKey = getAzureProfileApiKey(ctx.app, profile as AzureOpenAIProviderProfile);
							const service = new (await import('../../../ai/providers/AzureOpenAIService')).AzureOpenAIService(ctx.app, {
								provider: 'azure-openai',
								model: 'gpt-4o',
								streaming: false,
								apiKey: apiKey || '',
								endpoint: (profile as AzureOpenAIProviderProfile).endpoint,
								deploymentName: (profile as AzureOpenAIProviderProfile).deploymentName,
								apiVersion: (profile as AzureOpenAIProviderProfile).apiVersion,
							});
							await service.initialize();
							models = await service.listModels();
						}
						if (models.length > 0 && modelDropdown) {
							modelDropdown.selectEl.empty();
							for (const model of models) {
								modelDropdown.addOption(model, model);
							}
							let currentModel = '';
							if (profile.type === 'openai') {
								currentModel = (profile as OpenAIProviderProfile).model || '';
							} else if (profile.type === 'azure-openai') {
								currentModel = (profile as AzureOpenAIProviderProfile).model || '';
							}
							if (currentModel && models.includes(currentModel)) {
								modelDropdown.setValue(currentModel);
							} else if (models.length > 0) {
								modelDropdown.setValue(models[0]);
								if (profile.type === 'openai') {
									(profile as OpenAIProviderProfile).model = models[0];
								} else if (profile.type === 'azure-openai') {
									(profile as AzureOpenAIProviderProfile).model = models[0];
								}
								const profileIndex = ctx.plugin.settings.aiProviderProfiles!.findIndex(p => p.id === profile.id);
								if (profileIndex !== -1) {
									ctx.plugin.settings.aiProviderProfiles![profileIndex] = profile;
									await ctx.plugin.saveSettings();
								}
							}
							console.log(`Found ${models.length} models`);
						} else {
							console.log("No models found");
						}
					} catch (error) {
						console.error(`Error discovering models: ${error}`);
					}
					button.setDisabled(false);
				});
		});
}

/** @internal */
function populateModelDropdown(dropdown: any, ctx: SettingSectionContext): void {
	dropdown.selectEl.empty();
	const models = getAvailableModels(ctx.plugin.settings);
	for (const modelId of models) {
		dropdown.addOption(modelId, getModelDisplayName(modelId));
	}
}

