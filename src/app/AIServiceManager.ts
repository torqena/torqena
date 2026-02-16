/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AIServiceManager
 * @description Centralized manager for AI services, settings, caches, and MCP.
 *
 * Replaces the former CopilotPlugin (main.ts) Obsidian entry point with a
 * plain service manager that is owned by {@link WebShellApp}. It handles:
 *
 * - Plugin settings (persisted to localStorage via the platform Plugin shim)
 * - AI provider lifecycle (GitHub Copilot CLI, OpenAI, Azure OpenAI)
 * - MCP server management
 * - Skill / Agent / Prompt / Skill-file caches
 * - Automation engine lifecycle
 * - View registration (Chat, Tracing, Voice History, Extensions)
 *
 * Consumers that previously imported `CopilotPlugin` from `"../main"` should
 * now import `AIServiceManager` from `"../app/AIServiceManager"`.
 *
 * @example
 * ```ts
 * // In WebShellApp.create():
 * const mgr = new AIServiceManager(app, manifest);
 * await mgr.initialize();
 * ```
 *
 * @see {@link WebShellApp} for the application lifecycle controller
 * @since 0.1.0
 */

import { Plugin, type PluginManifest } from "../platform/core/Plugin.js";
import type { App } from "../platform/core/App.js";
import {
	DEFAULT_SETTINGS,
	type CopilotPluginSettings,
	CopilotSettingTab,
	COPILOT_SETTINGS_TABS,
	type AIProviderProfile,
	generateProfileId,
	type OpenAIProviderProfile,
	type AzureOpenAIProviderProfile,
	getProfileById,
	getOpenAIProfileApiKey,
	getAzureProfileApiKey,
	getLegacyOpenAIKey,
} from "../ui/settings/index.js";
import {
	GitHubCopilotCliService,
	type GitHubCopilotCliConfig,
} from "../ai/providers/GitHubCopilotCliService.js";
import {
	CopilotChatView,
	COPILOT_VIEW_TYPE,
	ConversationHistoryView,
	TracingView,
	TRACING_VIEW_TYPE,
	VOICE_HISTORY_VIEW_TYPE,
} from "../chat/index.js";
import {
	ExtensionBrowserView,
	EXTENSION_BROWSER_VIEW_TYPE,
} from "../ui/extensions/ExtensionBrowserView.js";
import {
	ExtensionWebView,
	EXTENSION_WEB_VIEW_TYPE,
} from "../ui/extensions/ExtensionWebView.js";
import { ExtensionSubmissionModal } from "../ui/extensions/ExtensionSubmissionModal.js";
import { GitHubCopilotCliManager } from "../ai/providers/GitHubCopilotCliManager.js";
import {
	type SkillRegistry,
	getSkillRegistry,
} from "../ai/customization/SkillRegistry.js";
import { McpManager } from "../ai/mcp/McpManager.js";
import { AgentCache } from "../ai/customization/AgentCache.js";
import { CustomizationLoader } from "../ai/customization/CustomizationLoader.js";
import { PromptCache } from "../ai/customization/PromptCache.js";
import { SkillCache } from "../ai/customization/SkillCache.js";
import { OpenAIService } from "../ai/providers/OpenAIService.js";
import { AzureOpenAIService } from "../ai/providers/AzureOpenAIService.js";
import type { AIProvider } from "../ai/providers/AIProvider.js";
import { getTracingService } from "../ai/TracingService.js";
import { MainVaultAssistant } from "../ai/realtime-agent/MainVaultAssistant.js";
import { supportsLocalProcesses } from "../utils/platform.js";
import { expandHomePath } from "../utils/pathUtils.js";
import { loadAuthorInfo } from "../ui/extensions/Submission/utils.js";

/**
 * Centralized manager for AI services, settings, caches, and MCP.
 *
 * Extends the platform {@link Plugin} shim to inherit `loadData`/`saveData`
 * (localStorage), `registerView`, `addSettingTab`, and `registerEvent`.
 *
 * @see {@link WebShellApp} for creation and lifecycle
 */
export class AIServiceManager extends Plugin {
	// ---- Public fields (consumed by 20+ files) ----

	/** Plugin settings */
	settings!: CopilotPluginSettings;
	/** GitHub Copilot CLI service (desktop only, null otherwise) */
	githubCopilotCliService: GitHubCopilotCliService | null = null;
	/** OpenAI service instance */
	openaiService: OpenAIService | null = null;
	/** Azure OpenAI service instance */
	azureOpenaiService: AzureOpenAIService | null = null;
	/** Custom skill registry for tool definitions */
	skillRegistry!: SkillRegistry;
	/** Cache for custom agent definitions */
	agentCache!: AgentCache;
	/** Cache for custom prompt definitions */
	promptCache!: PromptCache;
	/** Cache for custom file-based skill definitions */
	skillCache!: SkillCache;
	/** MCP server manager */
	mcpManager!: McpManager;
	/** Automation engine for scheduled/triggered workflows */
	automationEngine: import("../automation/AutomationEngine.js").AutomationEngine | null = null;

	// ---- Private fields ----

	/** CLI manager for checking Copilot CLI status */
	private cliManager: GitHubCopilotCliManager | null = null;
	/** Settings change listeners */
	private settingsChangeListeners: Set<() => void> = new Set();
	/** Debounce timer for settings save */
	private saveSettingsTimer: ReturnType<typeof setTimeout> | null = null;

	// ---- Lifecycle ----

	/**
	 * Initialize all services.
	 *
	 * Call this once after construction. It replaces the former
	 * `CopilotPlugin.onload()`.
	 */
	async initialize(): Promise<void> {
		await this.loadSettings();

		// Auto-detect GitHub username if not already set
		if (supportsLocalProcesses() && !this.settings.githubUsername) {
			try {
				const authorInfo = await loadAuthorInfo();
				if (authorInfo.githubUsername) {
					console.log("[AIServiceManager] Auto-detected GitHub username:", authorInfo.githubUsername);
					this.settings.githubUsername = authorInfo.githubUsername;
					await this.saveSettings();
				}
			} catch {
				// Silently fail — username is optional
			}
		}

		// Auto-discover available models from CLI if not already cached
		if (
			supportsLocalProcesses() &&
			(!this.settings.availableModels || this.settings.availableModels.length === 0)
		) {
			this.discoverModels();
		}

		// Tracing
		if (this.settings.tracingEnabled) {
			getTracingService().enable();
		}

		// Skill registry
		this.skillRegistry = getSkillRegistry();

		// Voice agents
		MainVaultAssistant.registerBuiltInAgents();

		// Caches
		this.agentCache = new AgentCache(this.app as any);
		await this.agentCache.initialize(this.settings.agentDirectories);

		this.promptCache = new PromptCache(this.app as any);
		await this.promptCache.initialize(this.settings.promptDirectories);

		this.skillCache = new SkillCache(this.app as any);
		await this.skillCache.initialize(this.settings.skillDirectories);

		// MCP
		this.mcpManager = new McpManager(this.app as any);
		await this.mcpManager.initialize();

		// Automation
		const { getAutomationEngine } = await import("../automation/AutomationEngine.js");
		this.automationEngine = getAutomationEngine(this.app as any, this as any);
		await this.automationEngine.initialize();

		// Copilot CLI service
		if (supportsLocalProcesses()) {
			this.githubCopilotCliService = new GitHubCopilotCliService(
				this.app as any,
				this.getServiceConfig(),
			);
			this.cliManager = new GitHubCopilotCliManager(
				this.settings.cliPath ? expandHomePath(this.settings.cliPath) : undefined,
			);
		}

		// Register views
		this.registerView(
			COPILOT_VIEW_TYPE,
			(leaf) => new CopilotChatView(leaf as any, this as any, this.githubCopilotCliService) as any,
		);
		this.registerView(TRACING_VIEW_TYPE, (leaf) => new TracingView(leaf as any) as any);
		this.registerView(
			VOICE_HISTORY_VIEW_TYPE,
			(leaf) => new ConversationHistoryView(leaf as any, this as any) as any,
		);
		this.registerView(
			EXTENSION_BROWSER_VIEW_TYPE,
			(leaf) => new ExtensionBrowserView(leaf as any, this as any) as any,
		);
		this.registerView(EXTENSION_WEB_VIEW_TYPE, (leaf) => new ExtensionWebView(leaf as any) as any);

		// Settings tabs
		for (const tab of COPILOT_SETTINGS_TABS) {
			if (tab.requiresDesktop && !supportsLocalProcesses()) continue;
			this.addSettingTab(
				new CopilotSettingTab(this.app as any, this as any, {
					tabId: tab.id,
					tabName: tab.name,
					tabIcon: tab.icon,
					section: tab.section,
				}) as any,
			);
		}
	}

	/**
	 * Shut down all services and clean up resources.
	 *
	 * Called by {@link WebShellApp} on teardown / beforeunload.
	 */
	async shutdown(): Promise<void> {
		if (this.saveSettingsTimer) {
			clearTimeout(this.saveSettingsTimer);
			this.saveSettingsTimer = null;
		}

		await this.disconnectCopilot();
		await this.mcpManager?.shutdown();
		await this.automationEngine?.shutdown();
		this.agentCache?.destroy();
		this.promptCache?.destroy();
		this.skillCache?.destroy();
		MainVaultAssistant.unregisterBuiltInAgents();
	}

	// ---- Settings ----

	/**
	 * Get the CLI manager instance for checking Copilot CLI availability.
	 *
	 * @returns The CLI manager, or null when unavailable
	 */
	getCliManager(): GitHubCopilotCliManager | null {
		return this.cliManager;
	}

	/**
	 * Subscribe to settings changes. Returns an unsubscribe function.
	 *
	 * @param listener - Callback invoked when settings change
	 * @returns Unsubscribe function
	 */
	onSettingsChange(listener: () => void): () => void {
		this.settingsChangeListeners.add(listener);
		return () => {
			this.settingsChangeListeners.delete(listener);
		};
	}

	/**
	 * Load plugin settings from localStorage.
	 *
	 * Performs deep merge with defaults and handles migrations.
	 * @internal
	 */
	async loadSettings(): Promise<void> {
		const savedData = ((await this.loadData()) as Partial<CopilotPluginSettings>) || {};

		this.settings = {
			...DEFAULT_SETTINGS,
			...savedData,
			voice: {
				...DEFAULT_SETTINGS.voice,
				...(savedData.voice || {}),
				voiceAgentFiles: {
					...DEFAULT_SETTINGS.voice?.voiceAgentFiles,
					...(savedData.voice?.voiceAgentFiles || {}),
				},
				backend:
					savedData.voice?.backend ?? DEFAULT_SETTINGS.voice?.backend ?? "openai-whisper",
				whisperServerUrl:
					savedData.voice?.whisperServerUrl ??
					DEFAULT_SETTINGS.voice?.whisperServerUrl ??
					"http://127.0.0.1:8080",
				language: savedData.voice?.language ?? DEFAULT_SETTINGS.voice?.language ?? "auto",
			},
			openai: {
				...DEFAULT_SETTINGS.openai,
				...(savedData.openai || {}),
			},
			periodicNotes: {
				...DEFAULT_SETTINGS.periodicNotes,
				...(savedData.periodicNotes || {}),
			},
			aiProviderProfiles: savedData.aiProviderProfiles ?? [],
			voiceInputProfileId: savedData.voiceInputProfileId ?? null,
			realtimeAgentProfileId: savedData.realtimeAgentProfileId ?? null,
		};

		// Migrations
		if (this.settings.analyticsEndpoint?.includes("azurewebsites.net")) {
			this.settings.analyticsEndpoint = DEFAULT_SETTINGS.analyticsEndpoint;
		}
		if (
			this.settings.extensionCatalogUrl?.includes(
				"obsidian-vault-copilot/catalog/catalog.json",
			)
		) {
			this.settings.extensionCatalogUrl = DEFAULT_SETTINGS.extensionCatalogUrl;
		}

		await this.migrateVoiceSettingsToProfiles();

		const { ensureBuiltInProfiles } = await import("../ui/settings/index.js");
		ensureBuiltInProfiles(this.settings);
		await this.saveSettings();
	}

	/**
	 * Save plugin settings to localStorage.
	 *
	 * Triggers service config updates and notifies listeners.
	 * Heavy operations (cache directory scans) are deferred.
	 */
	async saveSettings(): Promise<void> {
		if (this.saveSettingsTimer) {
			clearTimeout(this.saveSettingsTimer);
			this.saveSettingsTimer = null;
		}

		await this.saveData(this.settings);

		if (this.githubCopilotCliService) {
			this.githubCopilotCliService.updateConfig(this.getServiceConfig());
		}

		const tracingService = getTracingService();
		if (this.settings.tracingEnabled) {
			tracingService.enable();
		} else {
			tracingService.disable();
		}

		if (this.cliManager) {
			this.cliManager.setCliPath(expandHomePath(this.settings.cliPath) || "copilot");
		}

		for (const listener of this.settingsChangeListeners) {
			try {
				listener();
			} catch (e) {
				console.error("[AIServiceManager] Settings change listener error:", e);
			}
		}

		setTimeout(() => {
			this.applyDeferredSettingsUpdates();
		}, 0);
	}

	/**
	 * Stub for status bar update. No-op in the shell — the shell manages
	 * its own status bar via LayoutManager.
	 */
	updateStatusBar(): void {
		// No-op — shell manages its own status bar
	}

	// ---- AI provider management ----

	/**
	 * Get the currently active AI service based on user settings.
	 *
	 * @returns The active AI provider, or null if none available
	 */
	getActiveService(): AIProvider | GitHubCopilotCliService | null {
		if (this.settings.chatProviderProfileId) {
			const profile = getProfileById(this.settings, this.settings.chatProviderProfileId);
			if (profile?.type === "openai") {
				if (
					!this.openaiService &&
					getOpenAIProfileApiKey(this.app as any, profile as OpenAIProviderProfile)
				) {
					this.initializeOpenAIService(profile as OpenAIProviderProfile);
				}
				return this.openaiService;
			} else if (profile?.type === "azure-openai") {
				if (
					!this.azureOpenaiService &&
					getAzureProfileApiKey(this.app as any, profile as AzureOpenAIProviderProfile)
				) {
					this.initializeAzureService(profile as AzureOpenAIProviderProfile);
				}
				return this.azureOpenaiService;
			}
		}

		if (this.settings.aiProvider === "openai") {
			if (!this.openaiService) this.initializeOpenAIServiceFromSettings();
			return this.openaiService;
		} else if (this.settings.aiProvider === "azure-openai") {
			if (!this.azureOpenaiService) this.initializeAzureServiceFromSettings();
			return this.azureOpenaiService;
		}
		return this.githubCopilotCliService;
	}

	/**
	 * Check if any AI service is currently connected and ready.
	 */
	isAnyServiceConnected(): boolean {
		if (this.settings.chatProviderProfileId) {
			const profile = getProfileById(this.settings, this.settings.chatProviderProfileId);
			if (profile?.type === "openai") return this.openaiService?.isReady() ?? false;
			if (profile?.type === "azure-openai")
				return this.azureOpenaiService?.isReady() ?? false;
		}
		if (this.settings.aiProvider === "openai") return this.openaiService?.isReady() ?? false;
		if (this.settings.aiProvider === "azure-openai")
			return this.azureOpenaiService?.isReady() ?? false;
		return this.githubCopilotCliService?.isConnected() ?? false;
	}

	/**
	 * Connect to the configured AI provider.
	 */
	async connectCopilot(): Promise<void> {
		if (this.settings.chatProviderProfileId) {
			const profile = getProfileById(this.settings, this.settings.chatProviderProfileId);
			if (profile?.type === "openai")
				return this.connectOpenAI(profile as OpenAIProviderProfile);
			if (profile?.type === "azure-openai")
				return this.connectAzureOpenAI(profile as AzureOpenAIProviderProfile);
		}

		const provider = this.settings.aiProvider;
		if (provider === "openai") {
			if (!this.openaiService) {
				const apiKey = getLegacyOpenAIKey(this.app as any, this.settings);
				this.openaiService = new OpenAIService(this.app as any, {
					provider: "openai",
					model: this.settings.openai.model,
					streaming: this.settings.streaming,
					apiKey,
					baseURL: this.settings.openai.baseURL || undefined,
					organization: this.settings.openai.organization || undefined,
					maxTokens: this.settings.openai.maxTokens,
					temperature: this.settings.openai.temperature,
					mcpManager: this.mcpManager,
				});
			}
			try {
				await this.openaiService.initialize();
			} catch (error) {
				console.error(`Failed to connect to OpenAI: ${error}`);
			}
		} else if (provider === "azure-openai") {
			console.error(
				"Azure OpenAI requires a provider profile. Please configure one in settings.",
			);
		} else {
			if (!this.githubCopilotCliService) {
				this.githubCopilotCliService = new GitHubCopilotCliService(
					this.app as any,
					this.getServiceConfig(),
				);
			}
			try {
				await this.githubCopilotCliService.start();
			} catch (error) {
				console.error(`Failed to connect to Copilot: ${error}`);
			}
		}
	}

	/**
	 * Disconnect all AI services.
	 */
	async disconnectCopilot(): Promise<void> {
		if (this.githubCopilotCliService) {
			try {
				await this.githubCopilotCliService.stop();
			} catch (error) {
				console.error("Error disconnecting Copilot:", error);
			}
		}
		if (this.openaiService) {
			try {
				await this.openaiService.destroy();
			} catch (error) {
				console.error("Error disconnecting OpenAI:", error);
			}
		}
		if (this.azureOpenaiService) {
			try {
				await this.azureOpenaiService.destroy();
			} catch (error) {
				console.error("Error disconnecting Azure OpenAI:", error);
			}
		}
	}

	// ---- View activation helpers (used by chat UI) ----

	/**
	 * Activate the chat view in the right sidebar.
	 */
	async activateChatView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(COPILOT_VIEW_TYPE)[0];
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({ type: COPILOT_VIEW_TYPE, active: true });
			}
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	/**
	 * Activate the extension browser in the left sidebar.
	 */
	async activateExtensionBrowser(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(EXTENSION_BROWSER_VIEW_TYPE)[0];
		if (!leaf) {
			const leftLeaf = workspace.getLeftLeaf(false);
			if (leftLeaf) {
				leaf = leftLeaf;
				await leaf.setViewState({ type: EXTENSION_BROWSER_VIEW_TYPE, active: true });
			}
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	/**
	 * Open the extension submission modal.
	 */
	async openExtensionSubmissionModal(): Promise<void> {
		const modal = new ExtensionSubmissionModal(this.app as any, this as any);
		try {
			const submissionData = await modal.show();
			if (!submissionData) return;
			console.log("Extension submission data:", submissionData);
		} catch (error) {
			console.error("Extension submission failed:", error);
		}
	}

	/**
	 * Load a previous session by ID.
	 */
	async loadSession(sessionId: string): Promise<void> {
		const session = this.settings.sessions.find((s) => s.id === sessionId);
		if (!session) {
			console.error("Session not found");
			return;
		}
		if (this.githubCopilotCliService) {
			await this.githubCopilotCliService.loadSession(sessionId, session.messages || []);
			this.settings.activeSessionId = sessionId;
			session.lastUsedAt = Date.now();
			await this.saveSettings();
			this.activateChatView();
		}
	}

	// ---- Private helpers ----

	/** @internal */
	private initializeOpenAIService(profile: OpenAIProviderProfile): void {
		try {
			const apiKey = getOpenAIProfileApiKey(this.app as any, profile);
			this.openaiService = new OpenAIService(this.app as any, {
				provider: "openai",
				model: profile.model || "gpt-4o",
				streaming: true,
				apiKey,
				baseURL: profile.baseURL,
				mcpManager: this.mcpManager,
			});
			if (this.agentCache) {
				this.openaiService.setAgentCache(this.agentCache);
				this.openaiService.setCustomizationLoader(new CustomizationLoader(this.app as any));
			}
		} catch (error) {
			console.error("[AIServiceManager] Failed to initialize OpenAI service:", error);
		}
	}

	/** @internal */
	private initializeAzureService(profile: AzureOpenAIProviderProfile): void {
		try {
			const apiKey = getAzureProfileApiKey(this.app as any, profile);
			this.azureOpenaiService = new AzureOpenAIService(this.app as any, {
				provider: "azure-openai",
				model: profile.model || "gpt-4o",
				streaming: true,
				apiKey: apiKey || "",
				endpoint: profile.endpoint,
				deploymentName: profile.deploymentName,
				apiVersion: profile.apiVersion,
				mcpManager: this.mcpManager,
			});
			if (this.agentCache) {
				this.azureOpenaiService.setAgentCache(this.agentCache);
				this.azureOpenaiService.setCustomizationLoader(new CustomizationLoader(this.app as any));
			}
		} catch (error) {
			console.error("[AIServiceManager] Failed to initialize Azure service:", error);
		}
	}

	/** @internal */
	private initializeOpenAIServiceFromSettings(): void {
		const apiKey = getLegacyOpenAIKey(this.app as any, this.settings);
		if (apiKey) {
			this.initializeOpenAIService({
				id: "legacy-openai",
				name: "OpenAI (Legacy)",
				type: "openai",
				apiKeySecretId: this.settings.openai?.apiKeySecretId,
				baseURL: this.settings.openai?.baseURL || undefined,
				model: this.settings.openai?.model,
			});
		}
	}

	/** @internal */
	private initializeAzureServiceFromSettings(): void {
		console.warn(
			"[AIServiceManager] Azure service initialization from legacy settings not fully implemented",
		);
	}

	/** @internal */
	private async connectOpenAI(profile: OpenAIProviderProfile): Promise<void> {
		if (!this.openaiService) {
			const model = profile.model || this.settings.openai.model || "gpt-4o";
			const apiKey = getOpenAIProfileApiKey(this.app as any, profile);
			this.openaiService = new OpenAIService(this.app as any, {
				provider: "openai",
				model,
				streaming: this.settings.streaming,
				apiKey,
				baseURL: profile.baseURL || undefined,
				maxTokens: this.settings.openai.maxTokens,
				temperature: this.settings.openai.temperature,
				mcpManager: this.mcpManager,
			});
		}
		try {
			await this.openaiService.initialize();
		} catch (error) {
			console.error(`Failed to connect to OpenAI: ${error}`);
		}
	}

	/** @internal */
	private async connectAzureOpenAI(profile: AzureOpenAIProviderProfile): Promise<void> {
		if (!this.azureOpenaiService) {
			if (!profile.deploymentName) {
				console.error("Azure OpenAI profile requires a deployment name");
				return;
			}
			const model = profile.model || profile.deploymentName;
			const apiKey = getAzureProfileApiKey(this.app as any, profile);
			this.azureOpenaiService = new AzureOpenAIService(this.app as any, {
				provider: "azure-openai",
				model,
				deploymentName: profile.deploymentName,
				streaming: this.settings.streaming,
				apiKey: apiKey || "",
				endpoint: profile.endpoint,
				apiVersion: profile.apiVersion,
				maxTokens: this.settings.openai.maxTokens,
				temperature: this.settings.openai.temperature,
				mcpManager: this.mcpManager,
			});
		}
		try {
			await this.azureOpenaiService.initialize();
		} catch (error) {
			console.error(`Failed to connect to Azure OpenAI: ${error}`);
		}
	}

	/** @internal */
	private async migrateVoiceSettingsToProfiles(): Promise<void> {
		if (this.settings.aiProviderProfiles && this.settings.aiProviderProfiles.length > 0) return;
		if (!this.settings.voice?.voiceInputEnabled) return;

		const backend = this.settings.voice.backend;
		let profile: AIProviderProfile | null = null;

		if (backend === "openai-whisper") {
			const secretId = this.settings.openai?.apiKeySecretId;
			if (secretId) {
				profile = {
					id: generateProfileId(),
					name: "OpenAI (Migrated)",
					type: "openai",
					apiKeySecretId: secretId,
					baseURL: this.settings.openai?.baseURL || undefined,
				};
			}
		} else if (backend === "azure-whisper") {
			const azure = this.settings.voice.azure;
			if (azure?.endpoint && azure?.deploymentName) {
				profile = {
					id: generateProfileId(),
					name: "Azure OpenAI (Migrated)",
					type: "azure-openai",
					endpoint: azure.endpoint,
					deploymentName: azure.deploymentName,
					apiVersion: azure.apiVersion,
				};
			}
		} else if (backend === "local-whisper") {
			const serverUrl = this.settings.voice.whisperServerUrl;
			if (serverUrl) {
				profile = {
					id: generateProfileId(),
					name: "Local Whisper (Migrated)",
					type: "local",
					serverUrl,
				};
			}
		}

		if (profile) {
			this.settings.aiProviderProfiles = [profile];
			this.settings.voiceInputProfileId = profile.id;
			console.log(`[AIServiceManager] Migrated voice settings to profile: ${profile.name}`);
			await this.saveSettings();
		}
	}

	/** @internal */
	private async discoverModels(): Promise<void> {
		const mgr = new GitHubCopilotCliManager(
			this.settings.cliPath ? expandHomePath(this.settings.cliPath) : undefined,
		);
		const status = await mgr.getStatus();
		if (!status.installed) {
			console.log("[AIServiceManager] CLI not installed, skipping model discovery");
			return;
		}
		const result = await mgr.fetchAvailableModels();
		if (result.models.length > 0) {
			this.settings.availableModels = result.models;
			await this.saveSettings();
			console.log(`[AIServiceManager] Discovered ${result.models.length} models from CLI`);
		}
	}

	/** @internal */
	private getServiceConfig(): GitHubCopilotCliConfig {
		const vaultPath = this.getVaultBasePath();
		const resolvePaths = (paths: string[]): string[] => {
			if (!vaultPath) return paths;
			return paths.map((p) => {
				p = expandHomePath(p);
				if (p.startsWith("/") || p.match(/^[A-Za-z]:\\/)) return p;
				return `${vaultPath}/${p}`.replace(/\\/g, "/");
			});
		};

		return {
			model: this.settings.model,
			cliPath: this.settings.cliPath ? expandHomePath(this.settings.cliPath) : undefined,
			cliUrl: this.settings.cliUrl || undefined,
			streaming: this.settings.streaming,
			vaultPath,
			requestTimeout: this.settings.requestTimeout,
			tracingEnabled: this.settings.tracingEnabled,
			logLevel: this.settings.logLevel,
			skillRegistry: this.skillRegistry,
			mcpManager: this.mcpManager,
			skillDirectories: resolvePaths(this.settings.skillDirectories),
			agentDirectories: resolvePaths(this.settings.agentDirectories),
			instructionDirectories: resolvePaths(this.settings.instructionDirectories),
			promptDirectories: resolvePaths(this.settings.promptDirectories),
			agentCache: this.agentCache,
		};
	}

	/** @internal */
	private getVaultBasePath(): string | undefined {
		const adapter = this.app.vault.adapter;
		if ("getBasePath" in adapter && typeof adapter.getBasePath === "function") {
			return adapter.getBasePath();
		}
		return undefined;
	}

	/** @internal */
	private async applyDeferredSettingsUpdates(): Promise<void> {
		if (this.agentCache) {
			await this.agentCache.updateDirectories(this.settings.agentDirectories);
		}
		if (this.promptCache) {
			await this.promptCache.updateDirectories(this.settings.promptDirectories);
		}
		if (this.skillCache) {
			await this.skillCache.updateDirectories(this.settings.skillDirectories);
		}
	}
}
