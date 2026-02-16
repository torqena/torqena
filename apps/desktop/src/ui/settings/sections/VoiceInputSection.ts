/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module VoiceInputSection
 * @description Voice input settings (provider, model, microphone, language, auto-synth).
 *
 * @since 0.0.15
 */

import { Setting } from "obsidian";
import type { OpenAIProviderProfile, AzureOpenAIProviderProfile } from "../types";
import {
	getProfileById,
	getProfileTypeDisplayName,
	profileTypeToBackend,
	getOpenAIProfileApiKey,
	getAzureProfileApiKey,
} from "../profiles";
import { createCollapsibleSection, type SettingSectionContext } from "./SectionHelpers";

/**
 * Render the Voice Input settings section.
 *
 * @param container - Parent element
 * @param ctx - Shared settings context
 *
 * @internal
 */
export function renderVoiceInputSection(container: HTMLElement, ctx: SettingSectionContext): void {
	// Ensure voice settings exist
	if (!ctx.plugin.settings.voice) {
		ctx.plugin.settings.voice = {
			voiceInputEnabled: false,
			backend: 'openai-whisper',
			whisperServerUrl: 'http://127.0.0.1:8080',
			language: 'auto',
			audioDeviceId: undefined,
			autoSynthesize: 'off',
			speechTimeout: 0,
		};
	}

	const { content: voiceSection } = createCollapsibleSection(container, "Voice Input");

	voiceSection.createEl("p", {
		text: "Configure voice-to-text for hands-free chat input.",
		cls: "vc-status-desc"
	});

	const voiceInputConditionalContainer = voiceSection.createDiv({ cls: "vc-voice-input-conditional" });

	new Setting(voiceSection)
		.setName("Enable Voice Input")
		.setDesc("Show the microphone button in the chat view for voice-to-text input")
		.addToggle((toggle) => {
			toggle.setValue(ctx.plugin.settings.voice!.voiceInputEnabled || false);
			toggle.onChange(async (value) => {
				ctx.plugin.settings.voice!.voiceInputEnabled = value;
				await ctx.plugin.saveSettings();
				renderVoiceInputConditionalSettings(voiceInputConditionalContainer, ctx);
			});
		});

	voiceSection.appendChild(voiceInputConditionalContainer);
	renderVoiceInputConditionalSettings(voiceInputConditionalContainer, ctx);
}

/** @internal */
function renderVoiceInputConditionalSettings(container: HTMLElement, ctx: SettingSectionContext): void {
	container.empty();

	if (!ctx.plugin.settings.voice?.voiceInputEnabled) {
		return;
	}

	const profiles = ctx.plugin.settings.aiProviderProfiles || [];
	const voiceProfiles = profiles.filter(p => p.type !== 'copilot');
	const selectedProfileId = ctx.plugin.settings.voiceInputProfileId;
	const selectedProfile = getProfileById(ctx.plugin.settings, selectedProfileId);

	new Setting(container)
		.setName("AI Provider Profile")
		.setDesc("Select the AI provider profile to use for speech-to-text (OpenAI, Azure OpenAI, or Local Whisper)")
		.addDropdown((dropdown) => {
			dropdown.addOption('', 'None');
			for (const profile of voiceProfiles) {
				dropdown.addOption(profile.id, `${profile.name} (${getProfileTypeDisplayName(profile.type)})`);
			}
			dropdown.setValue(selectedProfileId || '');
			dropdown.onChange(async (value) => {
				ctx.plugin.settings.voiceInputProfileId = value || null;
				const profile = getProfileById(ctx.plugin.settings, value);
				if (profile) {
					ctx.plugin.settings.voice!.backend = profileTypeToBackend(profile.type);
				}
				await ctx.plugin.saveSettings();
				renderVoiceInputConditionalSettings(container, ctx);
			});
		});

	if (!selectedProfile) {
		const warningEl = container.createDiv({ cls: "vc-profile-warning" });
		warningEl.innerHTML = `
			<span class="vc-status-warning">⚠</span>
			<span>No AI provider profile selected. <a href="#" class="vc-profile-link">Add a profile</a> in the AI Provider Profiles section above.</span>
		`;
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
		const modelSetting = new Setting(container)
			.setName("Audio Model")
			.setDesc("Select the audio model for speech-to-text transcription");

		let modelDropdown: any = null;

		modelSetting.addDropdown((dropdown) => {
			modelDropdown = dropdown;
			const currentModel = ctx.plugin.settings.voice!.audioModel;
			dropdown.addOption('', 'Default');
			dropdown.addOption('whisper-1', 'whisper-1');
			if (currentModel && currentModel !== 'whisper-1') {
				dropdown.addOption(currentModel, currentModel);
			}
			dropdown.setValue(currentModel || '');
			dropdown.onChange(async (value) => {
				ctx.plugin.settings.voice!.audioModel = value || undefined;
				await ctx.plugin.saveSettings();
			});
		});

		modelSetting.addButton((button) => {
			button
				.setButtonText("↻")
				.setTooltip("Refresh models")
				.onClick(async () => {
					button.setDisabled(true);
					console.log("Loading audio models...");
					try {
						let models: string[] = [];
						if (selectedProfile.type === 'openai') {
							const OpenAIServiceModule = await import('../../../ai/providers/OpenAIService');
							const apiKey = getOpenAIProfileApiKey(ctx.app, selectedProfile as OpenAIProviderProfile);
							const service = new OpenAIServiceModule.OpenAIService(ctx.app, {
								provider: 'openai', model: 'gpt-4o', streaming: false, apiKey,
								baseURL: (selectedProfile as any).baseURL,
							});
							await service.initialize();
							models = await service.listAudioModels();
						} else if (selectedProfile.type === 'azure-openai') {
							const AzureOpenAIServiceModule = await import('../../../ai/providers/AzureOpenAIService');
							const apiKey = getAzureProfileApiKey(ctx.app, selectedProfile as AzureOpenAIProviderProfile);
							const service = new AzureOpenAIServiceModule.AzureOpenAIService(ctx.app, {
								provider: 'azure-openai', model: 'gpt-4o', streaming: false, apiKey: apiKey || '',
								endpoint: (selectedProfile as any).endpoint,
								deploymentName: (selectedProfile as any).deploymentName,
								apiVersion: (selectedProfile as any).apiVersion,
							});
							await service.initialize();
							models = await service.listAudioModels();
						}
						if (models.length > 0 && modelDropdown) {
							modelDropdown.selectEl.empty();
							modelDropdown.addOption('', 'Default');
							for (const model of models) {
								modelDropdown.addOption(model, model);
							}
							modelDropdown.setValue(ctx.plugin.settings.voice!.audioModel || '');
							console.log(`Loaded ${models.length} audio models`);
						} else {
							console.log("No audio models found");
						}
					} catch (error) {
						console.error("Failed to load audio models:", error);
					} finally {
						button.setDisabled(false);
					}
				});
		});
	}

	// Audio device selection
	const audioDeviceSetting = new Setting(container)
		.setName("Microphone")
		.setDesc("Select the audio input device");
	populateAudioDevices(audioDeviceSetting, ctx);

	// Speech language
	new Setting(container)
		.setName("Speech Language")
		.setDesc("The language that text-to-speech and speech-to-text should use. Select 'auto' to use the configured display language if possible. Note that not all display languages may be supported by speech recognition and synthesizers.")
		.addDropdown((dropdown) => {
			const languages = [
				{ value: 'auto', name: 'Auto (Use Display Language)' },
				{ value: 'en-US', name: 'English (US)' },
				{ value: 'en-GB', name: 'English (UK)' },
				{ value: 'es-ES', name: 'Spanish' },
				{ value: 'fr-FR', name: 'French' },
				{ value: 'de-DE', name: 'German' },
				{ value: 'it-IT', name: 'Italian' },
				{ value: 'pt-BR', name: 'Portuguese (Brazil)' },
				{ value: 'ja-JP', name: 'Japanese' },
				{ value: 'zh-CN', name: 'Chinese (Simplified)' },
				{ value: 'ko-KR', name: 'Korean' },
			];
			for (const lang of languages) {
				dropdown.addOption(lang.value, lang.name);
			}
			dropdown.setValue(ctx.plugin.settings.voice!.language);
			dropdown.onChange(async (value) => {
				ctx.plugin.settings.voice!.language = value;
				await ctx.plugin.saveSettings();
			});
		});

	// Auto Synthesize
	new Setting(container)
		.setName("Auto Synthesize")
		.setDesc("Whether a textual response should automatically be read out aloud when speech was used as input. For example in a chat session, a response is automatically synthesized when voice was used as chat request.")
		.addDropdown((dropdown) => {
			dropdown.addOption('off', 'off');
			dropdown.addOption('on', 'on');
			dropdown.setValue(ctx.plugin.settings.voice!.autoSynthesize || 'off');
			dropdown.onChange(async (value) => {
				ctx.plugin.settings.voice!.autoSynthesize = value as 'off' | 'on';
				await ctx.plugin.saveSettings();
			});
		});

	// Speech Timeout
	new Setting(container)
		.setName("Speech Timeout")
		.setDesc("The duration in milliseconds that voice speech recognition remains active after you stop speaking. For example in a chat session, the transcribed text is submitted automatically after the timeout is met. Set to 0 to disable this feature.")
		.addText((text) => {
			text.setPlaceholder('0');
			text.setValue(String(ctx.plugin.settings.voice!.speechTimeout || 0));
			text.inputEl.type = 'number';
			text.inputEl.min = '0';
			text.onChange(async (value) => {
				const timeout = parseInt(value, 10) || 0;
				ctx.plugin.settings.voice!.speechTimeout = timeout;
				await ctx.plugin.saveSettings();
			});
		});
}

/** @internal */
async function populateAudioDevices(setting: Setting, ctx: SettingSectionContext): Promise<void> {
	setting.addDropdown(async (dropdown) => {
		dropdown.addOption('default', 'System Default');
		try {
			await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
				stream.getTracks().forEach(track => track.stop());
			});
			const devices = await navigator.mediaDevices.enumerateDevices();
			const audioInputs = devices.filter(d => d.kind === 'audioinput');
			for (const device of audioInputs) {
				const label = device.label || `Microphone ${audioInputs.indexOf(device) + 1}`;
				dropdown.addOption(device.deviceId, label);
			}
		} catch (error) {
			console.log('Could not enumerate audio devices:', error);
		}
		dropdown.setValue(ctx.plugin.settings.voice?.audioDeviceId || 'default');
		dropdown.onChange(async (value) => {
			if (ctx.plugin.settings.voice) {
				ctx.plugin.settings.voice.audioDeviceId = value === 'default' ? undefined : value;
				await ctx.plugin.saveSettings();
			}
		});
	});
}
