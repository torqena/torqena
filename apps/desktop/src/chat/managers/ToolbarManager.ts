/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ToolbarManager
 * @description Manages the chat input toolbar: agent selector, model selector,
 * tool selector, voice/agent buttons, and the settings menu.
 *
 * @see {@link CopilotChatView} for integration
 * @since 0.0.20
 */

import { Menu } from "obsidian";
import { AIServiceManager as CopilotPlugin } from "../../app/AIServiceManager";
import { GitHubCopilotCliService } from "../../ai/providers/GitHubCopilotCliService";
import { getAvailableModels, getModelDisplayName, CopilotSession, getProfileById } from "../../ui/settings";
import { CachedAgentInfo } from "../../ai/customization/AgentCache";
import { ToolCatalog } from "../../ai/tools/ToolCatalog";
import { ToolPickerModal } from "../modals/ToolPickerModal";
import { openTracingPopout } from "../modals/TracingModal";
import { VoiceManager } from "./VoiceManager";
import { RealtimeAgentManager } from "./RealtimeAgentManager";
import { getTracingService } from "../../ai/TracingService";

/**
 * Callbacks for toolbar events
 */
export interface ToolbarCallbacks {
	/** Get the current session */
	getCurrentSession: () => CopilotSession | undefined;
	/** Save plugin settings */
	saveSettings: () => Promise<void>;
	/** Open the extension browser */
	openExtensionBrowser: () => void;
	/** Open plugin settings */
	openPluginSettings: () => void;
	/** Open tool picker */
	openToolPicker: () => void;
	/** Open voice history */
	openVoiceHistory: () => void;
}

/**
 * Manages the input toolbar area (agent/model/tool selectors, voice buttons)
 */
export class ToolbarManager {
	private plugin: CopilotPlugin;
	private service: GitHubCopilotCliService;
	private callbacks: ToolbarCallbacks;
	private toolCatalog: ToolCatalog;

	// Selectors
	private agentSelectorEl: HTMLButtonElement | null = null;
	private modelSelectorEl: HTMLButtonElement | null = null;
	private toolSelectorEl: HTMLButtonElement | null = null;
	private toolbarRightEl: HTMLDivElement | null = null;
	private sendButton: HTMLButtonElement | null = null;

	// Agent state
	private selectedAgent: CachedAgentInfo | null = null;
	private agentCacheUnsubscribe: (() => void) | null = null;

	// Voice sub-managers
	private voiceManager: VoiceManager | null = null;
	private realtimeAgentManager: RealtimeAgentManager | null = null;

	constructor(
		plugin: CopilotPlugin,
		service: GitHubCopilotCliService,
		toolCatalog: ToolCatalog,
		callbacks: ToolbarCallbacks
	) {
		this.plugin = plugin;
		this.service = service;
		this.toolCatalog = toolCatalog;
		this.callbacks = callbacks;
	}

	/**
	 * Set the voice and agent managers so toolbar can manage their buttons
	 */
	setVoiceManagers(voiceManager: VoiceManager | null, realtimeAgentManager: RealtimeAgentManager | null): void {
		this.voiceManager = voiceManager;
		this.realtimeAgentManager = realtimeAgentManager;
	}

	/**
	 * Get the currently selected agent
	 */
	getSelectedAgent(): CachedAgentInfo | null {
		return this.selectedAgent;
	}

	/**
	 * Reset the selected agent
	 */
	resetSelectedAgent(): void {
		this.selectedAgent = null;
		this.updateAgentSelectorText();
	}

	/**
	 * Create the left-side toolbar buttons (agent, model, tool selectors)
	 */
	createToolbarLeft(toolbarLeft: HTMLDivElement): void {
		// Brain icon button
		const brainIconBtn = toolbarLeft.createEl("button", {
			cls: "vc-brain-icon-btn",
			attr: { "aria-label": "AI Assistant" }
		});
		brainIconBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>`;

		// Agent selector
		this.agentSelectorEl = toolbarLeft.createEl("button", {
			cls: "vc-agent-selector",
			attr: { "aria-label": "Select agent" }
		});
		this.updateAgentSelectorText();
		this.setupAgentSelector();

		// Model selector
		this.modelSelectorEl = toolbarLeft.createEl("button", {
			cls: "vc-model-selector",
			attr: { "aria-label": "Select model" }
		});
		this.updateModelSelectorText();
		this.setupModelSelector();

		// Tool selector
		this.toolSelectorEl = toolbarLeft.createEl("button", {
			cls: "vc-tool-selector",
			attr: { "aria-label": "Select tools" }
		});
		this.updateToolSelectorText();
		this.toolSelectorEl.addEventListener("click", () => this.callbacks.openToolPicker());
	}

	/**
	 * Create the right-side toolbar (voice/agent buttons + send)
	 */
	createToolbarRight(toolbarRightEl: HTMLDivElement, sendButton: HTMLButtonElement): void {
		this.toolbarRightEl = toolbarRightEl;
		this.sendButton = sendButton;

		// Detach send button, add voice/agent buttons, then re-append send at the end
		sendButton.remove();
		this.createVoiceButtons();
		toolbarRightEl.appendChild(sendButton);
	}

	/**
	 * Create voice/agent toolbar buttons based on current settings
	 */
	private createVoiceButtons(): void {
		if (!this.toolbarRightEl) return;

		if (this.plugin.settings.voice?.realtimeAgentEnabled && this.realtimeAgentManager) {
			this.realtimeAgentManager.createButtons(this.toolbarRightEl);

			// Wire voice visibility: hide voice button when agent is active
			if (this.voiceManager) {
				this.realtimeAgentManager.setVoiceVisibilityCallback(
					(visible) => this.voiceManager?.setVisible(visible)
				);
			}
		}

		if (this.plugin.settings.voice?.voiceInputEnabled && this.voiceManager) {
			this.voiceManager.createButtons(this.toolbarRightEl);
		}
	}

	/**
	 * Refresh voice toolbar buttons when settings change
	 */
	refreshVoiceToolbar(): void {
		if (!this.toolbarRightEl || !this.sendButton) return;

		// Remove existing buttons
		this.realtimeAgentManager?.removeButtons();
		this.voiceManager?.removeButtons();

		// Detach send button temporarily
		const sendButton = this.sendButton;
		sendButton.remove();

		// Recreate voice/agent buttons
		this.createVoiceButtons();

		// Re-add send button at the end
		this.toolbarRightEl.appendChild(sendButton);
	}

	/**
	 * Refresh toolbar after settings change (model validation, voice toolbar, etc.)
	 */
	refreshFromSettings(): void {
		const availableModels = getAvailableModels(this.plugin.settings);
		const firstModel = availableModels[0];
		if (firstModel && !availableModels.includes(this.plugin.settings.model)) {
			this.plugin.settings.model = firstModel;
			this.plugin.saveSettings();
		}
		this.updateModelSelectorText();
		this.service?.updateConfig({ model: this.plugin.settings.model });
		this.refreshVoiceToolbar();
	}

	/**
	 * Update model selector text. Hides for Azure OpenAI profiles.
	 */
	updateModelSelectorText(): void {
		if (!this.modelSelectorEl) return;

		const profileId = this.plugin.settings.chatProviderProfileId;
		const profile = getProfileById(this.plugin.settings, profileId);

		if (profile && profile.type === 'azure-openai') {
			this.modelSelectorEl.style.display = 'none';
		} else {
			this.modelSelectorEl.style.display = '';
			this.modelSelectorEl.textContent = getModelDisplayName(this.plugin.settings.model);
		}
	}

	/**
	 * Update agent selector button text
	 */
	updateAgentSelectorText(): void {
		if (!this.agentSelectorEl) return;

		if (this.selectedAgent) {
			this.agentSelectorEl.textContent = this.selectedAgent.name;
			this.agentSelectorEl.addClass("vc-agent-selected");
		} else {
			this.agentSelectorEl.textContent = "Agent";
			this.agentSelectorEl.removeClass("vc-agent-selected");
		}
	}

	/**
	 * Update tool selector button text with enabled/total summary
	 */
	updateToolSelectorText(): void {
		if (!this.toolSelectorEl) return;

		const currentSession = this.callbacks.getCurrentSession();
		const summary = this.toolCatalog.getToolsSummary(this.plugin.settings, currentSession);

		this.toolSelectorEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
		this.toolSelectorEl.setAttribute("aria-label", `Tools ${summary.enabled}/${summary.total}`);

		if (summary.enabled < summary.total) {
			this.toolSelectorEl.addClass("vc-tools-filtered");
		} else {
			this.toolSelectorEl.removeClass("vc-tools-filtered");
		}
	}

	/**
	 * Show the settings menu dropdown
	 */
	showSettingsMenu(e: Event): void {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle("Extensions").setIcon("puzzle")
				.onClick(() => this.callbacks.openExtensionBrowser());
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item.setTitle("Custom Agents").setIcon("bot")
				.onClick(() => this.callbacks.openPluginSettings());
		});
		menu.addItem((item) => {
			item.setTitle("Prompt Files").setIcon("file-text")
				.onClick(() => this.callbacks.openPluginSettings());
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item.setTitle("Skills").setIcon("sparkles")
				.onClick(() => this.callbacks.openPluginSettings());
		});
		menu.addItem((item) => {
			item.setTitle("Chat Instructions").setIcon("scroll-text")
				.onClick(() => this.callbacks.openPluginSettings());
		});
		menu.addItem((item) => {
			item.setTitle("Generate Chat Instructions").setIcon("wand")
				.onClick(async () => { /* TODO */ });
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item.setTitle("MCP Servers").setIcon("server")
				.onClick(() => this.callbacks.openPluginSettings());
		});
		menu.addItem((item) => {
			item.setTitle("Tool Sets").setIcon("wrench")
				.onClick(() => this.callbacks.openToolPicker());
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item.setTitle("Diagnostics").setIcon("activity")
				.onClick(() => this.showDiagnostics());
		});

		if (this.plugin.settings.tracingEnabled) {
			menu.addItem((item) => {
				item.setTitle("View Tracing").setIcon("list-tree")
					.onClick(() => openTracingPopout(this.plugin.app));
			});
		}

		if (this.plugin.settings.voice?.realtimeAgentEnabled) {
			menu.addItem((item) => {
				item.setTitle("Voice History").setIcon("history")
					.onClick(() => this.callbacks.openVoiceHistory());
			});
		}

		menu.addItem((item) => {
			item.setTitle("Chat Settings").setIcon("settings")
				.onClick(() => this.callbacks.openPluginSettings());
		});

		menu.showAtMouseEvent(e as MouseEvent);
	}

	/**
	 * Show diagnostics information
	 * @internal
	 */
	private showDiagnostics(): void {
		const diagnostics: string[] = [];

		diagnostics.push(`**Service Status:** ${this.service.isConnected() ? "Connected" : "Disconnected"}`);
		diagnostics.push(`**Model:** ${this.plugin.settings.model}`);
		diagnostics.push(`**Streaming:** ${this.plugin.settings.streaming ? "Enabled" : "Disabled"}`);

		const session = this.callbacks.getCurrentSession();
		if (session) {
			diagnostics.push(`\n**Session:** ${session.name}`);
			diagnostics.push(`**Messages:** ${session.messages?.length || 0}`);
		}

		const tools = this.toolCatalog.getAllTools();
		diagnostics.push(`\n**Available Tools:** ${tools.length}`);

		diagnostics.push(`\n**Agent Directories:** ${this.plugin.settings.agentDirectories.length}`);
		diagnostics.push(`**Prompt Directories:** ${this.plugin.settings.promptDirectories.length}`);
		diagnostics.push(`**Skill Directories:** ${this.plugin.settings.skillDirectories.length}`);

		console.log(diagnostics.join("\n"));
	}

	/**
	 * Log tool context for debugging
	 */
	logToolContext(promptTools?: string[]): void {
		const tracingService = getTracingService();
		const currentSession = this.callbacks.getCurrentSession();
		const allTools = this.toolCatalog.getAllTools();
		const enabledTools = this.toolCatalog.getEnabledTools(this.plugin.settings, currentSession);
		const toolsBySource = this.toolCatalog.getToolsBySource();

		const lines: string[] = ['[Tool Context]'];

		if (promptTools && promptTools.length > 0) {
			lines.push(`\nPrompt specifies tools: ${promptTools.join(', ')}`);
		}

		lines.push(`\nEnabled: ${enabledTools.length}/${allTools.length} tools`);

		for (const [source, tools] of Object.entries(toolsBySource)) {
			const sourceEnabled = tools.filter(t => enabledTools.includes(t.id));
			if (tools.length > 0) {
				lines.push(`\n[${source.toUpperCase()}] (${sourceEnabled.length}/${tools.length} enabled)`);
				for (const tool of tools) {
					const status = enabledTools.includes(tool.id) ? '✓' : '○';
					lines.push(`  ${status} ${tool.id}`);
				}
			}
		}

		tracingService.addSdkLog('info', lines.join('\n'), 'tool-context');
	}

	/**
	 * Open the tool picker modal
	 */
	openToolPicker(): void {
		const currentSession = this.callbacks.getCurrentSession();

		new ToolPickerModal(this.plugin.app, {
			toolCatalog: this.toolCatalog,
			settings: this.plugin.settings,
			session: currentSession,
			mode: "session",
			onSave: async (enabledTools) => {
				if (currentSession) {
					currentSession.toolOverrides = { enabled: enabledTools };
					await this.callbacks.saveSettings();
					await this.service.createSession(currentSession.id);
				}
				this.updateToolSelectorText();
			}
		}).open();
	}

	// --- Private setup helpers ---

	private setupAgentSelector(): void {
		if (!this.agentSelectorEl) return;

		this.agentCacheUnsubscribe = this.plugin.agentCache.onCacheChange((event) => {
			if (event.type === 'loaded') {
				if (this.selectedAgent) {
					const stillExists = event.agents.some(a => a.path === this.selectedAgent?.path);
					if (!stillExists) {
						this.selectedAgent = null;
						this.updateAgentSelectorText();
					}
				}
			} else if (event.type === 'removed' && this.selectedAgent?.path === event.path) {
				this.selectedAgent = null;
				this.updateAgentSelectorText();
			} else if (event.type === 'updated' && this.selectedAgent?.path === event.agent.path) {
				this.selectedAgent = event.agent;
				this.updateAgentSelectorText();
			}
		});

		this.agentSelectorEl.addEventListener("click", (e) => {
			const menu = new Menu();

			menu.addItem((item) => {
				item.setTitle("Default")
					.onClick(() => {
						this.selectedAgent = null;
						this.updateAgentSelectorText();
					});
				if (this.selectedAgent === null) item.setChecked(true);
			});

			const agents = this.plugin.agentCache.getAgents().filter(a => a.userInvokable !== false);

			if (agents.length > 0) {
				menu.addSeparator();
				for (const agent of agents) {
					menu.addItem((item) => {
						item.setTitle(agent.name)
							.onClick(() => {
								this.selectedAgent = agent;
								this.updateAgentSelectorText();
							});
						if (this.selectedAgent?.name === agent.name) item.setChecked(true);
						const itemEl = (item as any).dom as HTMLElement;
						if (agent.description) {
							const descSpan = itemEl.createSpan({ cls: "vc-agent-desc", text: agent.description });
							itemEl.appendChild(descSpan);
						}
					});
				}
			} else if (this.plugin.settings.agentDirectories.length === 0) {
				menu.addItem((item) => item.setTitle("No agent directories configured").setDisabled(true));
			} else {
				menu.addItem((item) => item.setTitle("No agents found").setDisabled(true));
			}

			menu.showAtMouseEvent(e as MouseEvent);
		});
	}

	private setupModelSelector(): void {
		if (!this.modelSelectorEl) return;

		this.modelSelectorEl.addEventListener("click", (e) => {
			const menu = new Menu();
			const models = getAvailableModels(this.plugin.settings);
			const currentModel = this.plugin.settings.model;

			for (const modelId of models) {
				menu.addItem((item) => {
					item.setTitle(getModelDisplayName(modelId))
						.onClick(async () => {
							this.plugin.settings.model = modelId;
							await this.callbacks.saveSettings();
							this.service.updateConfig({ model: modelId });
							this.updateModelSelectorText();
						});
					if (currentModel === modelId) item.setChecked(true);
				});
			}

			menu.showAtMouseEvent(e as MouseEvent);
		});
	}

	/**
	 * Clean up subscriptions
	 */
	destroy(): void {
		if (this.agentCacheUnsubscribe) {
			this.agentCacheUnsubscribe();
			this.agentCacheUnsubscribe = null;
		}
	}
}
