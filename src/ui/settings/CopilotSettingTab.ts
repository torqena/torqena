/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module CopilotSettingTab
 * @description Slim orchestrator for the Vault Copilot settings tab.
 *
 * Delegates each section to a dedicated module under `./sections/`.
 * This file handles only the plugin lifecycle (display, hide) and
 * coordinates the async CLI status check flow.
 *
 * @see {@link CopilotPlugin} for the main plugin implementation
 * @since 0.0.1
 */

import { App, PluginSettingTab } from "obsidian";
import { AIServiceManager as CopilotPlugin } from "../../app/AIServiceManager";
import { GitHubCopilotCliManager, CliStatus } from "../../ai/providers/GitHubCopilotCliManager";
import { ToolCatalog } from "../../ai/tools/ToolCatalog";
import { CopilotChatView, COPILOT_VIEW_TYPE } from "../../chat";
import { isDesktop } from "../../utils/platform";
import { getProfileById, getProfileTypeDisplayName } from "./profiles";

import type { SettingSectionContext } from "./sections/SectionHelpers";
import {
	renderCliStatusSection,
	renderChatPreferencesSection,
	renderAIProviderProfilesSection,
	renderDateTimeSection,
	renderPeriodicNotesSection,
	renderWhisperCppSection,
	renderVoiceInputSection,
	renderRealtimeAgentSection,
	renderToolSelectionSection,
	renderSkillsMcpSection,
	renderAutomationsSection,
	renderAdvancedSettings,
	renderVaultSetupSection,
	renderHelpSection,
	type CliStatusState,
	type ChatPreferencesState,
	type SkillsMcpState,
} from "./sections";

/**
 * Supported Vault Copilot settings sections that can be displayed as individual tabs.
 */
export type CopilotSettingsSection =
	| "chat-preferences"
	| "ai-provider-profiles"
	| "date-time"
	| "periodic-notes"
	| "whisper-cpp"
	| "voice-input"
	| "realtime-agent"
	| "tool-selection"
	| "skills-mcp"
	| "automations"
	| "advanced-settings"
	| "connection-status"
	| "vault-setup"
	| "help";

/**
 * Descriptor for top-level settings items shown in the settings sidebar.
 */
export interface CopilotSettingsTabDescriptor {
	id: string;
	name: string;
	icon: string;
	section: CopilotSettingsSection;
	requiresDesktop?: boolean;
}

/**
 * Default list of section tabs to register for Vault Copilot.
 */
export const COPILOT_SETTINGS_TABS: ReadonlyArray<CopilotSettingsTabDescriptor> = [
	{ id: "vault-copilot-datetime", name: "Date & time", icon: "calendar-clock", section: "date-time" },
	{ id: "vault-copilot-periodic-notes", name: "Periodic notes", icon: "notebook-pen", section: "periodic-notes" },
	{ id: "vault-copilot-profiles", name: "AI Providers", icon: "bot", section: "ai-provider-profiles" },
	{ id: "vault-copilot-chat", name: "Chat Preferences", icon: "message-square", section: "chat-preferences" },
	{ id: "vault-copilot-whisper", name: "Whisper.cpp", icon: "mic", section: "whisper-cpp", requiresDesktop: true },
	{ id: "vault-copilot-voice", name: "Voice input", icon: "audio-lines", section: "voice-input" },
	{ id: "vault-copilot-realtime", name: "Realtime agent", icon: "radio", section: "realtime-agent" },
	{ id: "vault-copilot-tools", name: "Tool selection", icon: "sliders-horizontal", section: "tool-selection" },
	{ id: "vault-copilot-skills", name: "Skills & MCP", icon: "wrench", section: "skills-mcp" },
	{ id: "vault-copilot-automations", name: "Automations", icon: "zap", section: "automations" },
	{ id: "vault-copilot-advanced", name: "Folder Paths", icon: "sliders-horizontal", section: "advanced-settings" },
	{ id: "vault-copilot-connection", name: "Connection status", icon: "plug", section: "connection-status", requiresDesktop: true },
	{ id: "vault-copilot-setup", name: "Vault setup", icon: "folder-cog", section: "vault-setup", requiresDesktop: true },
	{ id: "vault-copilot-help", name: "Help", icon: "circle-help", section: "help" },
];

interface CopilotSettingTabOptions {
	tabId?: string;
	tabName?: string;
	tabIcon?: string;
	section?: CopilotSettingsSection;
}

export class CopilotSettingTab extends PluginSettingTab {
	plugin: CopilotPlugin;
	private githubCopilotCliManager: GitHubCopilotCliManager;
	private cachedStatus: CliStatus | null = null;
	private skillRegistryUnsubscribe: (() => void) | null = null;
	private toolCatalog: ToolCatalog;
	private readonly section: CopilotSettingsSection | "all";

	constructor(app: App, plugin: CopilotPlugin, options?: CopilotSettingTabOptions) {
		super(app, plugin);
		this.plugin = plugin;
		this.githubCopilotCliManager = new GitHubCopilotCliManager(plugin.settings.cliPath);
		this.toolCatalog = new ToolCatalog(plugin.skillRegistry, plugin.mcpManager, plugin.skillCache);
		this.section = options?.section ?? "all";
		(this as unknown as { id: string }).id = options?.tabId ?? "vault-copilot";
		(this as unknown as { name: string }).name = options?.tabName ?? "Vault Copilot";
		(this as unknown as { icon: string }).icon = options?.tabIcon ?? "bot";
	}

	display(): void {
		const { containerEl } = this;

		// Snapshot which collapsible sections are currently open
		const openSections = new Set<string>();
		containerEl.querySelectorAll("details.vc-collapsible[open]").forEach(el => {
			const cls = el.className;
			openSections.add(cls);
		});

		containerEl.empty();
		containerEl.addClass("vc-settings");

		// Build the shared context used by every section renderer
		const ctx: SettingSectionContext = {
			app: this.app,
			plugin: this.plugin,
			cliManager: this.githubCopilotCliManager,
			toolCatalog: this.toolCatalog,
			refreshDisplay: () => this.display(),
		};

		const shouldRender = (section: CopilotSettingsSection): boolean => {
			return this.section === "all" || this.section === section;
		};

		let chatState: ChatPreferencesState | null = null;
		if (shouldRender("chat-preferences")) {
			chatState = renderChatPreferencesSection(containerEl, ctx);
			chatState.renderMainSettingsIfReady(this.cachedStatus || { installed: false } as CliStatus);
		}

		if (shouldRender("ai-provider-profiles")) {
			renderAIProviderProfilesSection(containerEl, ctx);
		}

		if (shouldRender("date-time")) {
			renderDateTimeSection(containerEl, ctx);
		}

		if (shouldRender("periodic-notes")) {
			renderPeriodicNotesSection(containerEl, ctx);
		}

		if (shouldRender("whisper-cpp")) {
			if (isDesktop) {
				renderWhisperCppSection(containerEl, ctx);
			} else {
				this.renderDesktopOnlyMessage(containerEl, "Whisper.cpp");
			}
		}

		if (shouldRender("voice-input")) {
			renderVoiceInputSection(containerEl, ctx);
		}

		if (shouldRender("realtime-agent")) {
			renderRealtimeAgentSection(containerEl, ctx);
		}

		if (shouldRender("tool-selection")) {
			renderToolSelectionSection(containerEl, ctx);
		}

		if (shouldRender("skills-mcp")) {
			const skillsState: SkillsMcpState = renderSkillsMcpSection(containerEl, ctx);
			this.skillRegistryUnsubscribe = this.plugin.skillRegistry.onSkillChange(() => {
				skillsState.updateSkillsDisplay();
			});
		}

		if (shouldRender("automations")) {
			renderAutomationsSection(containerEl, ctx);
		}

		if (shouldRender("advanced-settings")) {
			renderAdvancedSettings(containerEl, ctx);
		}

		let cliState: CliStatusState | null = null;
		if (shouldRender("connection-status")) {
			if (isDesktop) {
				cliState = renderCliStatusSection(
					containerEl,
					ctx,
					{ value: this.cachedStatus },
					(status: CliStatus) => {
						this.cachedStatus = status;
						chatState?.renderMainSettingsIfReady(status);
					}
				);
			} else {
				this.renderWebConnectionStatus(containerEl);
			}
		}

		if (shouldRender("vault-setup")) {
			if (isDesktop) {
				renderVaultSetupSection(containerEl, ctx, this.cachedStatus, this.githubCopilotCliManager);
			} else {
				this.renderDesktopOnlyMessage(containerEl, "Vault setup");
			}
		}

		if (shouldRender("help")) {
			renderHelpSection(containerEl, ctx);
		}

		// ── Restore previously-open sections ──────────────────────────
		if (openSections.size > 0) {
			containerEl.querySelectorAll("details.vc-collapsible").forEach(el => {
				if (openSections.has(el.className)) {
					(el as HTMLDetailsElement).open = true;
				}
			});
		}

		// ── Async CLI status check ────────────────────────────────────
		const hasUserConfig = this.hasUserConfiguration();
		if (!this.plugin.settings.cliStatusChecked && hasUserConfig) {
			this.plugin.settings.cliStatusChecked = true;
			void this.plugin.saveSettings();
		}

		const needsCliStatus = isDesktop && (shouldRender("chat-preferences") || shouldRender("connection-status") || shouldRender("vault-setup"));
		if (!needsCliStatus) {
			return;
		}

		if (!this.plugin.settings.cliStatusChecked && !hasUserConfig) {
			if (cliState) {
				cliState.checkStatusAsync()
					.finally(async () => {
						this.plugin.settings.cliStatusChecked = true;
						await this.plugin.saveSettings();
					});
			} else {
				void this.githubCopilotCliManager.getStatus(true)
					.then((status) => {
						this.cachedStatus = status;
						this.plugin.settings.cliLastKnownStatus = status;
						chatState?.renderMainSettingsIfReady(status);
					})
					.finally(async () => {
						this.plugin.settings.cliStatusChecked = true;
						await this.plugin.saveSettings();
					});
			}
		} else if (this.cachedStatus || this.plugin.settings.cliLastKnownStatus) {
			this.cachedStatus = this.cachedStatus || this.plugin.settings.cliLastKnownStatus || null;
			if (this.cachedStatus) {
				cliState?.renderStatusDisplay(this.cachedStatus);
				chatState?.renderMainSettingsIfReady(this.cachedStatus);
			}
		} else {
			cliState?.renderStatusDeferred();
		}
	}

	/**
	 * Render a simple desktop-only notice for sections not available on mobile/web.
	 *
	 * @param containerEl - Parent element to render into
	 * @param sectionName - Friendly section name
	 */
	private renderDesktopOnlyMessage(containerEl: HTMLElement, sectionName: string): void {
		const section = containerEl.createDiv({ cls: "vc-settings-section" });
		section.createEl("h3", { text: sectionName });
		section.createEl("p", {
			cls: "setting-item-description",
			text: `${sectionName} is available on desktop only.`,
		});
	}

	private hasUserConfiguration(): boolean {
		const settings = this.plugin.settings;
		const hasProfiles = (settings.aiProviderProfiles?.length ?? 0) > 0;
		const hasSelectedProfiles = !!settings.chatProviderProfileId || !!settings.voiceInputProfileId || !!settings.realtimeAgentProfileId;
		const hasOpenAiKey = !!settings.openai?.apiKeySecretId;
		const hasVoiceEnabled = !!settings.voice?.voiceInputEnabled || !!settings.voice?.realtimeAgentEnabled;
		return hasProfiles || hasSelectedProfiles || hasOpenAiKey || hasVoiceEnabled;
	}

	/**
	 * Render a simplified connection status section for web/mobile platforms
	 * where the GitHub Copilot CLI is not available.
	 *
	 * @param containerEl - Parent element to render into
	 * @internal
	 */
	private renderWebConnectionStatus(containerEl: HTMLElement): void {
		const details = containerEl.createEl("details", { cls: "vc-settings-section vc-collapsible" });
		details.open = true;
		const summary = details.createEl("summary", { cls: "vc-section-summary" });
		summary.createEl("h3", { text: "Connection Status" });
		const content = details.createDiv({ cls: "vc-section-content" });

		const statusCard = content.createDiv({ cls: "vc-status-card" });

		const profileId = this.plugin.settings.chatProviderProfileId;
		const profile = getProfileById(this.plugin.settings, profileId);

		if (profile) {
			// Provider configured — show connected status
			const statusGrid = statusCard.createDiv({ cls: "vc-status-grid" });
			const item = statusGrid.createDiv({ cls: "vc-status-item vc-status-ok" });
			const iconEl = item.createDiv({ cls: "vc-status-icon" });
			iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
			const textEl = item.createDiv({ cls: "vc-status-text" });
			textEl.createEl("span", { text: "AI Provider", cls: "vc-status-label" });
			textEl.createEl("span", {
				text: `${profile.name} (${getProfileTypeDisplayName(profile.type)})`,
				cls: "vc-status-detail"
			});
		} else {
			// No provider configured — show warning
			const statusGrid = statusCard.createDiv({ cls: "vc-status-grid" });
			const item = statusGrid.createDiv({ cls: "vc-status-item vc-status-error" });
			const iconEl = item.createDiv({ cls: "vc-status-icon" });
			iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
			const textEl = item.createDiv({ cls: "vc-status-text" });
			textEl.createEl("span", { text: "AI Provider", cls: "vc-status-label" });
			textEl.createEl("span", { text: "Not configured", cls: "vc-status-detail" });

			const noteEl = content.createDiv({ cls: "vc-auth-note" });
			noteEl.createEl("p", {
				text: "Create an AI Provider Profile above (OpenAI or Azure OpenAI) and select it in Chat Preferences to get started.",
				cls: "vc-status-desc"
			});
			noteEl.createEl("p", {
				text: "GitHub Copilot CLI is only available on the desktop app.",
				cls: "vc-status-desc"
			});
		}
	}

	hide(): void {
		let settingsChanged = false;

		// Auto-disable Voice Input if enabled but no provider selected
		if (this.plugin.settings.voice?.voiceInputEnabled && !this.plugin.settings.voiceInputProfileId) {
			this.plugin.settings.voice.voiceInputEnabled = false;
			settingsChanged = true;
		}

		// Auto-disable Realtime Agent if enabled but no provider selected
		if (this.plugin.settings.voice?.realtimeAgentEnabled && !this.plugin.settings.realtimeAgentProfileId) {
			this.plugin.settings.voice.realtimeAgentEnabled = false;
			settingsChanged = true;
		}

		if (settingsChanged) {
			void this.plugin.saveSettings();
		}

		// Clean up skill registry subscription
		if (this.skillRegistryUnsubscribe) {
			this.skillRegistryUnsubscribe();
			this.skillRegistryUnsubscribe = null;
		}

		// Refresh caches when settings panel closes
		this.plugin.agentCache?.refreshCache();
		this.plugin.promptCache?.refreshCache();

		// Refresh chat view from settings (model, voice toolbar, etc.)
		const chatLeaves = this.app.workspace.getLeavesOfType(COPILOT_VIEW_TYPE);
		for (const leaf of chatLeaves) {
			const view = leaf.view as CopilotChatView;
			if (view?.refreshFromSettings) {
				view.refreshFromSettings();
			}
		}
	}
}
