/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module RealtimeAgentSection
 * @description Realtime Voice Agent settings (model, voice, turn detection, tools, agent files).
 *
 * @since 0.0.15
 */

import { Setting } from "obsidian";
import type { OpenAIProviderProfile } from "../types";
import { getProfileById, getOpenAIProfiles, getOpenAIProfileApiKey } from "../profiles";
import { RealtimeVoice, TurnDetectionMode, DEFAULT_TOOL_CONFIG } from "../../../ai/voice-chat";
import { FileSuggest } from "../../FileSuggest";
import { createCollapsibleSection, type SettingSectionContext } from "./SectionHelpers";

/**
 * Render the Realtime Voice Agent section.
 *
 * @param container - Parent element
 * @param ctx - Shared settings context
 *
 * @internal
 */
export function renderRealtimeAgentSection(container: HTMLElement, ctx: SettingSectionContext): void {
	const { content: section } = createCollapsibleSection(container, "Realtime Voice Agent (Experimental)");

	section.createEl("p", {
		text: "Enable two-way voice conversations with an AI agent that can access your notes.",
		cls: "vc-status-desc"
	});

	const realtimeConditionalContainer = section.createDiv({ cls: "vc-realtime-conditional" });

	new Setting(section)
		.setName("Enable Realtime Agent")
		.setDesc("Show the agent button next to the microphone for two-way voice conversations")
		.addToggle((toggle) => {
			toggle.setValue(ctx.plugin.settings.voice!.realtimeAgentEnabled || false);
			toggle.onChange(async (value) => {
				ctx.plugin.settings.voice!.realtimeAgentEnabled = value;
				await ctx.plugin.saveSettings();
				renderRealtimeConditionalSettings(realtimeConditionalContainer, ctx);
			});
		});

	section.appendChild(realtimeConditionalContainer);
	renderRealtimeConditionalSettings(realtimeConditionalContainer, ctx);
}

/** @internal */
function renderRealtimeConditionalSettings(container: HTMLElement, ctx: SettingSectionContext): void {
	container.empty();

	if (!ctx.plugin.settings.voice?.realtimeAgentEnabled) {
		return;
	}

	const realtimeSection = container.createDiv({ cls: "vc-realtime-settings" });

	const openaiProfiles = getOpenAIProfiles(ctx.plugin.settings);
	const selectedProfileId = ctx.plugin.settings.realtimeAgentProfileId;
	const selectedProfile = getProfileById(ctx.plugin.settings, selectedProfileId);

	new Setting(realtimeSection)
		.setName("AI Provider Profile")
		.setDesc("Select the OpenAI profile to use for the Realtime Agent (Azure not supported)")
		.addDropdown((dropdown) => {
			dropdown.addOption('', 'None');
			for (const profile of openaiProfiles) {
				dropdown.addOption(profile.id, `${profile.name}`);
			}
			dropdown.setValue(selectedProfileId || '');
			dropdown.onChange(async (value) => {
				ctx.plugin.settings.realtimeAgentProfileId = value || null;
				await ctx.plugin.saveSettings();
				renderRealtimeConditionalSettings(container, ctx);
			});
		});

	if (!selectedProfile) {
		const warningEl = realtimeSection.createDiv({ cls: "vc-profile-warning" });
		if (openaiProfiles.length === 0) {
			warningEl.innerHTML = `
				<span class="vc-status-warning">⚠</span>
				<span>No OpenAI profiles available. <a href="#" class="vc-profile-link">Add an OpenAI profile</a> in the AI Provider Profiles section above.</span>
			`;
		} else {
			warningEl.innerHTML = `
				<span class="vc-status-warning">⚠</span>
				<span>No profile selected. Select an OpenAI profile to enable the Realtime Agent.</span>
			`;
		}
		const link = warningEl.querySelector('.vc-profile-link');
		if (link) {
			link.addEventListener('click', (e) => {
				e.preventDefault();
				const profilesSection = container.closest('.vc-main-settings')?.querySelector('.vc-profile-list');
				profilesSection?.scrollIntoView({ behavior: 'smooth' });
			});
		}
	}

	if (selectedProfile) {
		renderRealtimeModelSelection(realtimeSection, ctx, selectedProfile as OpenAIProviderProfile);
	}

	// Voice selection
	new Setting(realtimeSection)
		.setName("Voice")
		.setDesc("Select the voice for the realtime agent")
		.addDropdown((dropdown) => {
			const voices = [
				{ value: 'alloy', name: 'Alloy' }, { value: 'ash', name: 'Ash' },
				{ value: 'ballad', name: 'Ballad' }, { value: 'coral', name: 'Coral' },
				{ value: 'echo', name: 'Echo' }, { value: 'fable', name: 'Fable' },
				{ value: 'onyx', name: 'Onyx' }, { value: 'nova', name: 'Nova' },
				{ value: 'sage', name: 'Sage' }, { value: 'shimmer', name: 'Shimmer' },
				{ value: 'verse', name: 'Verse' },
			];
			for (const voice of voices) dropdown.addOption(voice.value, voice.name);
			dropdown.setValue(ctx.plugin.settings.voice!.realtimeVoice || 'alloy');
			dropdown.onChange(async (value) => {
				ctx.plugin.settings.voice!.realtimeVoice = value as RealtimeVoice;
				await ctx.plugin.saveSettings();
			});
		});

	// Turn detection mode
	new Setting(realtimeSection)
		.setName("Turn Detection")
		.setDesc("How the agent detects when you've finished speaking")
		.addDropdown((dropdown) => {
			dropdown.addOption('server_vad', 'Server VAD (Voice Activity Detection)');
			dropdown.addOption('semantic_vad', 'Semantic VAD (Smarter, context-aware)');
			dropdown.setValue(ctx.plugin.settings.voice!.realtimeTurnDetection || 'server_vad');
			dropdown.onChange(async (value) => {
				ctx.plugin.settings.voice!.realtimeTurnDetection = value as TurnDetectionMode;
				await ctx.plugin.saveSettings();
			});
		});

	// Language
	new Setting(realtimeSection)
		.setName("Language")
		.setDesc("Language for speech recognition (improves accuracy)")
		.addDropdown((dropdown) => {
			const langs = [
				{ v: '', n: 'Auto-detect' }, { v: 'en', n: 'English' }, { v: 'es', n: 'Spanish' },
				{ v: 'fr', n: 'French' }, { v: 'de', n: 'German' }, { v: 'it', n: 'Italian' },
				{ v: 'pt', n: 'Portuguese' }, { v: 'nl', n: 'Dutch' }, { v: 'ja', n: 'Japanese' },
				{ v: 'ko', n: 'Korean' }, { v: 'zh', n: 'Chinese' }, { v: 'ru', n: 'Russian' },
				{ v: 'ar', n: 'Arabic' }, { v: 'hi', n: 'Hindi' },
			];
			for (const l of langs) dropdown.addOption(l.v, l.n);
			dropdown.setValue(ctx.plugin.settings.voice!.realtimeLanguage || 'en');
			dropdown.onChange(async (value) => {
				ctx.plugin.settings.voice!.realtimeLanguage = value;
				await ctx.plugin.saveSettings();
			});
		});

	// Tool Configuration
	renderToolCapabilities(realtimeSection, ctx);

	// Voice Agent Definition Files
	renderVoiceAgentFiles(realtimeSection, ctx);
}

/** @internal */
function renderRealtimeModelSelection(section: HTMLElement, ctx: SettingSectionContext, profile: OpenAIProviderProfile): void {
	const modelSetting = new Setting(section)
		.setName("Realtime Model")
		.setDesc("Select the realtime model for voice conversations");

	let modelDropdown: any = null;

	modelSetting.addDropdown((dropdown) => {
		modelDropdown = dropdown;
		const currentModel = ctx.plugin.settings.realtimeAgentModel;
		dropdown.addOption('', 'Default');
		dropdown.addOption('gpt-4o-realtime-preview', 'gpt-4o-realtime-preview');
		dropdown.addOption('gpt-4o-mini-realtime-preview', 'gpt-4o-mini-realtime-preview');
		if (currentModel && currentModel !== 'gpt-4o-realtime-preview' && currentModel !== 'gpt-4o-mini-realtime-preview') {
			dropdown.addOption(currentModel, currentModel);
		}
		dropdown.setValue(currentModel || '');
		dropdown.onChange(async (value) => {
			ctx.plugin.settings.realtimeAgentModel = value || undefined;
			await ctx.plugin.saveSettings();
		});
	});

	modelSetting.addButton((button) => {
		button
			.setButtonText("↻")
			.setTooltip("Refresh models")
			.onClick(async () => {
				button.setDisabled(true);
				console.log("Loading realtime models...");
				try {
					const OpenAIServiceModule = await import('../../../ai/providers/OpenAIService');
					const apiKey = getOpenAIProfileApiKey(ctx.app, profile);
					const service = new OpenAIServiceModule.OpenAIService(ctx.app, {
						provider: 'openai', model: 'gpt-4o', streaming: false, apiKey,
						baseURL: (profile as any).baseURL,
					});
					await service.initialize();
					const models = await service.listRealtimeModels();
					if (models.length > 0 && modelDropdown) {
						modelDropdown.selectEl.empty();
						modelDropdown.addOption('', 'Default');
						for (const model of models) modelDropdown.addOption(model, model);
						modelDropdown.setValue(ctx.plugin.settings.realtimeAgentModel || '');
						console.log(`Loaded ${models.length} realtime models`);
					} else {
						console.log("No realtime models found");
					}
				} catch (error) {
					console.error("Failed to load realtime models:", error);
				} finally {
					button.setDisabled(false);
				}
			});
	});
}

/** @internal */
function renderToolCapabilities(section: HTMLElement, ctx: SettingSectionContext): void {
	section.createEl("h4", { text: "Tool Capabilities", cls: "setting-item-heading" });

	const toolItems: Array<{ name: string; desc: string; key: keyof typeof DEFAULT_TOOL_CONFIG }> = [
		{ name: "Vault Read Access", desc: "Allow reading notes, searching, and listing files", key: "vaultRead" },
		{ name: "Vault Write Access", desc: "Allow creating and modifying notes", key: "vaultWrite" },
		{ name: "Web Access", desc: "Allow searching the web and fetching web pages", key: "webAccess" },
		{ name: "MCP Tools", desc: "Allow using tools from connected MCP servers", key: "mcpTools" },
	];

	for (const item of toolItems) {
		new Setting(section)
			.setName(item.name)
			.setDesc(item.desc)
			.addToggle((toggle) => {
				const config = ctx.plugin.settings.voice?.realtimeToolConfig || DEFAULT_TOOL_CONFIG;
				toggle.setValue((config as any)[item.key] ?? true);
				toggle.onChange(async (value) => {
					if (!ctx.plugin.settings.voice) return;
					ctx.plugin.settings.voice.realtimeToolConfig = {
						...ctx.plugin.settings.voice.realtimeToolConfig,
						[item.key]: value,
					};
					await ctx.plugin.saveSettings();
				});
			});
	}
}

/** @internal */
function renderVoiceAgentFiles(section: HTMLElement, ctx: SettingSectionContext): void {
	section.createEl("h4", { text: "Voice Agent Definition Files", cls: "setting-item-heading" });
	section.createEl("p", {
		text: "Configure the instruction/prompt files for each voice agent. Start typing to see suggestions, or type a path manually.",
		cls: "vc-status-desc"
	});

	const agentFileItems: Array<{ name: string; desc: string; key: keyof NonNullable<NonNullable<typeof ctx.plugin.settings.voice>['voiceAgentFiles']>; placeholder: string }> = [
		{ name: "Main Vault Assistant", desc: "Orchestrator agent that routes requests to specialists", key: "mainAssistant", placeholder: "Reference/Agents/main-vault-assistant.voice-agent.md" },
		{ name: "Note Manager", desc: "Specialist for reading, searching, and editing notes", key: "noteManager", placeholder: "Reference/Agents/note-manager.voice-agent.md" },
		{ name: "Task Manager", desc: "Specialist for managing tasks (create, complete, list)", key: "taskManager", placeholder: "Reference/Agents/task-manager.voice-agent.md" },
		{ name: "WorkIQ", desc: "Microsoft 365 integration agent", key: "workiq", placeholder: "Reference/Agents/workiq.voice-agent.md" },
	];

	for (const item of agentFileItems) {
		new Setting(section)
			.setName(item.name)
			.setDesc(item.desc)
			.addText((text) => {
				text.setPlaceholder(item.placeholder);
				text.setValue(ctx.plugin.settings.voice?.voiceAgentFiles?.[item.key] || "");
				text.onChange(async (value) => {
					if (!ctx.plugin.settings.voice) return;
					if (!ctx.plugin.settings.voice.voiceAgentFiles) {
						ctx.plugin.settings.voice.voiceAgentFiles = {};
					}
					ctx.plugin.settings.voice.voiceAgentFiles[item.key] = value || undefined;
					await ctx.plugin.saveSettings();
				});
				new FileSuggest(ctx.app, text.inputEl, { suffix: ".voice-agent.md" });
			});
	}
}
