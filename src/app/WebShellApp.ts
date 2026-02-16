/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module WebShellApp
 * @description Application controller for the Vault Copilot Web Shell renderer.
 *
 * Encapsulates the full bootstrap lifecycle:
 * 1. Initialize shim objects (Vault, Workspace, App, Plugin)
 * 2. Apply theme and register settings tabs
 * 3. Create PaneManager, LayoutManager, and wire UI
 * 4. Persist state on unload
 *
 * Also provides a lightweight standalone bootstrap path for child
 * Electron windows that render a single view panel.
 *
 * @example
 * ```ts
 * const app = await WebShellApp.create(dirPath);
 * // app is now fully initialized with chat view, file explorer, ribbon
 * ```
 *
 * @see {@link LayoutManager} for the 3-column shell layout
 * @see {@link PaneManager} for the split-pane editor tree
 * @since 0.0.28
 */

import { App } from "../platform/core/App.js";
import { Vault } from "../platform/vault/Vault.js";
import { Workspace } from "../platform/workspace/Workspace.js";
import { MetadataCache } from "../platform/metadata/MetadataCache.js";
import { FileManager } from "../platform/metadata/FileManager.js";
import { set } from "idb-keyval";

import { PaneManager } from "../editor/PaneManager.js";
import { EditorManager } from "../editor/EditorManager.js";
import { PropertiesView, PROPERTIES_VIEW_TYPE } from "../editor/PropertiesView.js";
import { PropertyTypeRegistry } from "../editor/PropertyTypeRegistry.js";
import { LayoutManager } from "../layout/LayoutManager.js";
import { GeneralSettingTab } from "../shell-settings/GeneralSettingTab.js";
import { EditorSettingTab } from "../shell-settings/EditorSettingTab.js";
import { FilesAndLinksSettingTab } from "../shell-settings/FilesAndLinksSettingTab.js";
import { AppearanceSettingTab, applyTheme } from "../shell-settings/AppearanceSettingTab.js";
import { KeychainSettingTab } from "../shell-settings/KeychainSettingTab.js";
import { loadSettings, settingsChanged } from "../shell-settings/WebShellSettings.js";

/** @internal IndexedDB key for persisting the FileSystemDirectoryHandle (browser mode). */
const DIR_HANDLE_KEY = "vault-copilot-dir-handle";

/** @internal localStorage key for persisting the vault directory path (Electron mode). */
const DIR_PATH_KEY = "vault-copilot-dir-path";

/** @internal localStorage key for plugin settings. */
const SETTINGS_KEY = "plugin:obsidian-vault-copilot:data";

/**
 * Application controller for the Web Shell renderer process.
 *
 * Holds references to the shim objects, managers, and plugin instance
 * created during bootstrap. Provides persist/teardown for clean shutdown.
 */
export class WebShellApp {
	/** @internal */
	private _vault: InstanceType<typeof Vault>;
	/** @internal */
	private _workspace: InstanceType<typeof Workspace>;
	/** @internal */
	private _app: InstanceType<typeof App>;
	/** @internal */
	private _plugin: any;
	/** @internal */
	private _paneManager: PaneManager | null = null;
	/** @internal */
	private _layoutManager: LayoutManager | null = null;
	/** @internal */
	private static _systemThemeSyncInitialized = false;

	private constructor(
		vault: InstanceType<typeof Vault>,
		workspace: InstanceType<typeof Workspace>,
		app: InstanceType<typeof App>,
		plugin: any,
	) {
		this._vault = vault;
		this._workspace = workspace;
		this._app = app;
		this._plugin = plugin;
	}

	// ---- Accessors ----

	/** The shim Vault instance. */
	get vault(): InstanceType<typeof Vault> { return this._vault; }

	/** The shim Workspace instance. */
	get workspace(): InstanceType<typeof Workspace> { return this._workspace; }

	/** The shim App instance. */
	get app(): InstanceType<typeof App> { return this._app; }

	/** The loaded CopilotPlugin instance. */
	get plugin(): any { return this._plugin; }

	/** The PaneManager instance (null until UI wiring). */
	get paneManager(): PaneManager | null { return this._paneManager; }

	/** The LayoutManager instance (null until UI wiring). */
	get layoutManager(): LayoutManager | null { return this._layoutManager; }

	// ---- Static Factory ----

	/**
	 * Create and fully initialize the Web Shell application.
	 *
	 * This is the main entry point. It:
	 * 1. Persists the directory handle/path for next load
	 * 2. Creates shim instances (Vault, Workspace, App)
	 * 3. Applies the saved theme
	 * 4. Loads the CopilotPlugin
	 * 5. Wires PaneManager, LayoutManager, file explorer, ribbon, and chat view
	 * 6. Registers a beforeunload handler to persist state
	 *
	 * @param dirHandleOrPath - A FileSystemDirectoryHandle (browser) or string path (Electron)
	 * @param initialFilePath - Optional file to open on startup
	 * @param renderFileExplorer - Callback to render the file explorer in the left pane
	 * @param initRibbon - Callback to wire the left ribbon icon strip
	 * @returns The initialized WebShellApp instance
	 *
	 * @throws {Error} If vault initialization or plugin loading fails
	 */
	static async create(
		dirHandleOrPath: FileSystemDirectoryHandle | string,
		initialFilePath?: string,
		renderFileExplorer?: (container: HTMLElement, vault: any, app: any, paneManager: PaneManager | null) => void,
		initRibbon?: (leftSplit: HTMLElement, vault: any, app: any, plugin: any, workspace: any, paneManager: PaneManager | null, layoutManager: LayoutManager) => void,
	): Promise<WebShellApp> {
		// Persist for next load
		if (typeof dirHandleOrPath === "string") {
			localStorage.setItem(DIR_PATH_KEY, dirHandleOrPath);
		} else {
			await set(DIR_HANDLE_KEY, dirHandleOrPath).catch(() => {});
		}

		// Hide the vault picker UI
		const picker = document.getElementById("vault-picker");
		if (picker) picker.style.display = "none";

		// Show a loading indicator
		const rootSplit = document.querySelector(".mod-root") as HTMLElement;
		if (rootSplit) {
			rootSplit.innerHTML = '<div style="padding: 2em; color: var(--text-muted);">Loading vault...</div>';
		}

		// ---- Create shim instances ----
		console.log("[web-shell] Initializing vault...");
		const vault = new Vault(dirHandleOrPath);
		await vault.initialize();
		console.log("[web-shell] Vault initialized:", vault.getFiles().length, "files");

		// Build vault-wide property type index
		const propertyRegistry = new PropertyTypeRegistry();
		await propertyRegistry.buildIndex(vault);
		await propertyRegistry.loadOverrides(vault);
		console.log("[web-shell] Property registry built:", propertyRegistry.getAllProperties().length, "properties");

		const workspaceEl = document.querySelector(".workspace") as HTMLElement;
		const workspace = new Workspace(workspaceEl);
		const metadataCache = new MetadataCache(vault);
		const fileManager = new FileManager(vault);

		const app = new App(vault, workspace, metadataCache, fileManager);
		workspace.app = app;

		// Apply saved theme
		const savedSettings = loadSettings();
		applyTheme(savedSettings.theme);
		WebShellApp._initializeSystemThemeSync();

		WebShellApp._syncTitleBarOverlay();

		// Register built-in settings tabs
		app.registerBuiltInTab(new GeneralSettingTab(app));
		app.registerBuiltInTab(new EditorSettingTab(app));
		app.registerBuiltInTab(new FilesAndLinksSettingTab(app));
		app.registerBuiltInTab(new AppearanceSettingTab(app));
		app.registerBuiltInTab(new KeychainSettingTab(app));

		// ---- Load the plugin ----
		console.log("[web-shell] Loading plugin...");

		const isElectronShell = Boolean(window.electronAPI?.isElectron);
		WebShellApp._ensureProviderDefaults(isElectronShell);

		const CopilotPlugin = await WebShellApp._loadCopilotPlugin();
		const manifest = {
			id: "obsidian-vault-copilot",
			name: "Vault Copilot",
			version: "0.0.26",
			description: "AI assistant for your vault",
			isDesktopOnly: false,
		};

		const plugin = new CopilotPlugin(app, manifest);
		await plugin.onload();
		console.log("[web-shell] Plugin loaded successfully");

		const instance = new WebShellApp(vault, workspace, app, plugin);

		// ---- Wire UI ----
		if (rootSplit) rootSplit.innerHTML = "";

		// Populate center pane with split pane manager
		if (rootSplit) {
			const paneManager = new PaneManager(rootSplit, vault);
			instance._paneManager = paneManager;
			paneManager.setWorkspace(workspace);

			await paneManager.restoreState();

			if (initialFilePath) {
				await paneManager.openFile(initialFilePath);
			}
		}

		// Populate left pane with file explorer
		const leftSplit = document.querySelector(".mod-left-split") as HTMLElement;
		const leftContent = document.querySelector(".ws-left-content") as HTMLElement || leftSplit;
		if (leftContent && renderFileExplorer) {
			renderFileExplorer(leftContent, vault, app, instance._paneManager);
		}

		// Open chat in the right pane
		const leaf = workspace.getRightLeaf(false);
		await leaf.setViewState({ type: "copilot-chat-view", active: true });
		workspace.revealLeaf(leaf);

		// Register and open Properties view in a second right-sidebar leaf
		plugin.registerView(PROPERTIES_VIEW_TYPE, (l: any) => new PropertiesView(l, vault, propertyRegistry));
		const propsLeaf = workspace.getRightLeaf(true);
		await propsLeaf.setViewState({ type: PROPERTIES_VIEW_TYPE });
		// Start hidden — toggled via sidebar tab icon
		propsLeaf.containerEl.style.display = "none";

		// Wire right-sidebar tab switching between Chat and Properties
		const chatIcon = document.querySelector(".ws-ribbon-chat") as HTMLElement | null;
		const propsIcon = document.querySelector(".ws-ribbon-properties") as HTMLElement | null;
		if (chatIcon && propsIcon) {
			const showChat = () => {
				leaf.containerEl.style.display = "";
				propsLeaf.containerEl.style.display = "none";
				chatIcon.classList.add("is-active");
				propsIcon.classList.remove("is-active");
			};
			const showProps = () => {
				leaf.containerEl.style.display = "none";
				propsLeaf.containerEl.style.display = "";
				propsIcon.classList.add("is-active");
				chatIcon.classList.remove("is-active");
			};
			chatIcon.addEventListener("click", showChat);
			propsIcon.addEventListener("click", showProps);
		}

		workspace.layoutReady();

		// Wire up resizable panes via LayoutManager
		const rightSplit = document.querySelector<HTMLElement>(".mod-right-split")!;
		const layoutManager = new LayoutManager(leftSplit, rootSplit, rightSplit);
		instance._layoutManager = layoutManager;

		if (instance._paneManager) {
			instance._paneManager.setLayoutManager(layoutManager);
		}

		// Wire right-pane status bar with document stats
		const statusBar = rightSplit.querySelector<HTMLElement>(".status-bar");
		if (statusBar && instance._paneManager) {
			const propsItem = document.createElement("span");
			propsItem.className = "status-bar-item";
			propsItem.textContent = "0 properties";
			const wordsItem = document.createElement("span");
			wordsItem.className = "status-bar-item";
			wordsItem.textContent = "0 words";
			const charsItem = document.createElement("span");
			charsItem.className = "status-bar-item";
			charsItem.textContent = "0 characters";
			statusBar.append(propsItem, wordsItem, charsItem);

			instance._paneManager.setStatsChangeHandler((stats) => {
				propsItem.textContent = `${stats.properties} ${stats.properties === 1 ? "property" : "properties"}`;
				wordsItem.textContent = `${stats.words} ${stats.words === 1 ? "word" : "words"}`;
				charsItem.textContent = `${stats.characters} ${stats.characters === 1 ? "character" : "characters"}`;
			});
		}

		// Wire up ribbon
		if (initRibbon) {
			initRibbon(leftSplit, vault, app, plugin, workspace, instance._paneManager, layoutManager);
		}

		// Persist state before unload
		window.addEventListener("beforeunload", () => {
			instance.persistState();
		});

		console.log("[web-shell] Chat view activated");
		return instance;
	}

	// ---- Standalone View ----

	/**
	 * Bootstrap a standalone view in a child Electron window.
	 *
	 * Initialises the vault + plugin without the full UI (no file explorer,
	 * editor, or chat). The requested view panel fills the entire window.
	 *
	 * @param viewType - The view type identifier (e.g., 'vc-tracing-view')
	 */
	static async bootstrapStandaloneView(viewType: string): Promise<void> {
		const picker = document.getElementById("vault-picker");
		if (picker) picker.style.display = "none";
		const appContainer = document.querySelector(".app-container") as HTMLElement;
		if (appContainer) appContainer.style.display = "none";

		const container = document.createElement("div");
		container.className = "ws-standalone-view";
		document.body.appendChild(container);

		const dirPath = localStorage.getItem(DIR_PATH_KEY);
		if (!dirPath) {
			container.innerHTML = '<div style="padding:2em;color:var(--text-error);">No vault selected — close this window and open from the main window.</div>';
			return;
		}

		try {
			const openFilePath = new URLSearchParams(window.location.search).get("openFile") || "";

			const vault = new Vault(dirPath);
			await vault.initialize();

			const dummyWsEl = document.createElement("div");
			const workspace = new Workspace(dummyWsEl);
			const metadataCache = new MetadataCache(vault);
			const fileManager = new FileManager(vault);
			const app = new App(vault, workspace, metadataCache, fileManager);
			workspace.app = app;

			const savedSettings = loadSettings();
			applyTheme(savedSettings.theme);
			WebShellApp._initializeSystemThemeSync();

			// Apply frameless window behavior in standalone windows
			try {
				const frameStyle = await window.electronAPI?.getWindowFrame?.();
				if (frameStyle && frameStyle !== "native") {
					document.body.classList.add("is-frameless");
					WebShellApp._syncTitleBarOverlay();
					new MutationObserver(() => WebShellApp._syncTitleBarOverlay()).observe(
						document.body,
						{ attributes: true, attributeFilter: ["class"] },
					);
					new MutationObserver(() => WebShellApp._syncTitleBarOverlay()).observe(
						document.body,
						{ childList: true, subtree: true },
					);
				}
			} catch { /* ignore */ }

			const CopilotPlugin = await WebShellApp._loadCopilotPlugin();
			const manifest = {
				id: "obsidian-vault-copilot",
				name: "Vault Copilot",
				version: "0.0.26",
				description: "AI assistant for your vault",
				isDesktopOnly: false,
			};
			const plugin = new CopilotPlugin(app, manifest);
			await plugin.onload();

			if (viewType === "ws-file-tab-view") {
				if (!openFilePath) {
					container.innerHTML = '<div style="padding:2em;color:var(--text-error);">No file specified for detached tab view.</div>';
					return;
				}
				container.classList.add("ws-file-tab-standalone");
				const editor = new EditorManager(container, vault);
				editor.setSaveHandler(async (path, content) => {
					const file = vault.getAbstractFileByPath(path);
					if (!file) throw new Error(`File not found: ${path}`);
					await vault.modify(file as import("../platform/vault/TFile.js").TFile, content);
				});
				await editor.openFile(openFilePath);
				WebShellApp._syncTitleBarOverlay();
			} else if (viewType === "vc-tracing-view") {
				const { TracingPanel } = await import("../chat/modals/TracingModal.js");
				container.classList.add("vc-tracing-modal");
				const panel = new TracingPanel(container, app as any);
				panel.mount();
			} else if (viewType === "vc-voice-history-view") {
				const { ConversationHistoryPanel } = await import("../chat/modals/ConversationHistoryModal.js");
				const conversations = plugin.settings?.voice?.conversations || [];
				const panel = new ConversationHistoryPanel(
					app as any,
					container,
					conversations,
					(id: string) => {
						if (!plugin.settings?.voice?.conversations) return;
						const idx = plugin.settings.voice.conversations.findIndex((c: any) => c.id === id);
						if (idx > -1) {
							plugin.settings.voice.conversations.splice(idx, 1);
							plugin.saveSettings();
						}
					},
					() => {
						if (plugin.settings?.voice) {
							plugin.settings.voice.conversations = [];
							plugin.saveSettings();
						}
					}
				);
				panel.mount();
			} else {
				container.innerHTML = `<div style="padding:2em;color:var(--text-muted);">Unknown view type: ${viewType}</div>`;
			}
		} catch (err: any) {
			console.error("[web-shell] Standalone view bootstrap failed:", err);
			container.innerHTML = `<div style="padding:2em;color:var(--text-error);">
				<h3>View Error</h3>
				<pre style="white-space:pre-wrap;font-size:0.85em;">${err?.stack || err?.message || err}</pre>
			</div>`;
		}
	}

	// ---- State Persistence ----

	/**
	 * Persist pane tree and layout state.
	 * Called on beforeunload and can be called manually.
	 */
	persistState(): void {
		if (this._paneManager) this._paneManager.persistState();
		if (this._layoutManager) this._layoutManager.persistState();
	}

	/**
	 * Clean up resources. Persists state and destroys the layout manager.
	 */
	teardown(): void {
		this.persistState();
		if (this._layoutManager) {
			this._layoutManager.destroy();
			this._layoutManager = null;
		}
	}

	// ---- Internal Helpers ----

	/**
	 * Register a one-time listener for OS color scheme changes.
	 *
	 * When user theme is set to "system", this reapplies app theme,
	 * re-emits settings-changed for editor reconfiguration, and refreshes
	 * title bar overlay colors.
	 * @internal
	 */
	private static _initializeSystemThemeSync(): void {
		if (WebShellApp._systemThemeSyncInitialized) return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleThemeChange = () => {
			const settings = loadSettings();
			if (settings.theme !== "system") return;
			applyTheme("system");
			settingsChanged.emit();
			WebShellApp._syncTitleBarOverlay();
		};

		if (typeof mediaQuery.addEventListener === "function") {
			mediaQuery.addEventListener("change", handleThemeChange);
		} else {
			mediaQuery.addListener(handleThemeChange);
		}

		WebShellApp._systemThemeSyncInitialized = true;
	}

	/**
	 * Sync the Electron titlebar overlay colors with the current CSS theme.
	 * @internal
	 */
	static _syncTitleBarOverlay(): void {
		if (!window.electronAPI?.setTitleBarOverlay) return;
		const hasModal = document.querySelector(".modal-container, .ws-settings-overlay");
		if (hasModal) {
			window.electronAPI.setTitleBarOverlay({ color: "#000000", symbolColor: "#888888" }).catch(() => {});
			return;
		}
		const style = getComputedStyle(document.body);
		const bg = style.getPropertyValue("--background-secondary").trim() || "#f6f6f6";
		const fg = style.getPropertyValue("--text-normal").trim() || "#2e3338";
		window.electronAPI.setTitleBarOverlay({ color: bg, symbolColor: fg }).catch(() => {});
	}

	/**
	 * Ensure the AI provider defaults are set for the current platform.
	 * Browser mode defaults to OpenAI since Copilot CLI is not available.
	 * @internal
	 */
	private static _ensureProviderDefaults(isElectronShell: boolean): void {
		const existingData = localStorage.getItem(SETTINGS_KEY);
		if (!isElectronShell && !existingData) {
			localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiProvider: "openai" }));
		} else if (!isElectronShell && existingData) {
			try {
				const parsed = JSON.parse(existingData);
				if (parsed.aiProvider === "copilot") {
					parsed.aiProvider = "openai";
					localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
				}
			} catch { /* ignore parse errors */ }
		}
	}

	/**
	 * Load the plugin module with a resilient retry path for transient Vite
	 * dev-server stale-module fetch failures.
	 * @internal
	 */
	private static async _loadCopilotPlugin(): Promise<any> {
		const attempts: Array<{
			label: string;
			load: () => Promise<any>;
		}> = [
			{ label: "source extensionless specifier", load: () => import("../main") },
		];

		let lastError: unknown = null;
		const maxPasses = 4;

		for (let pass = 0; pass < maxPasses; pass += 1) {
			for (let index = 0; index < attempts.length; index += 1) {
				const attempt = attempts[index];
				if (!attempt) continue;
				try {
					if (pass > 0 || index > 0) {
						const retryDelayMs = 150 * (pass + 1);
						await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs));
					}
					const mod = await attempt.load();
					const pluginCtor = WebShellApp._resolvePluginModuleExport(mod);
					if (!pluginCtor) throw new Error(`Plugin module from ${attempt.label} has no default export`);
					if (pass > 0 || index > 0) {
						console.info(`[web-shell] Plugin module loaded via fallback (${attempt.label}, pass ${pass + 1}).`);
					}
					return pluginCtor;
				} catch (error) {
					lastError = error;
					console.warn(`[web-shell] Plugin import attempt failed (${attempt.label}, pass ${pass + 1}).`, error);
				}
			}
		}

		throw lastError instanceof Error
			? lastError
			: new Error("Unable to load plugin module from all known specifiers.");
	}

	/**
	 * Resolve plugin constructor across ESM/CJS interop boundaries.
	 * @param mod - Imported plugin module namespace value
	 * @returns Plugin constructor or undefined when unavailable
	 * @internal
	 */
	private static _resolvePluginModuleExport(mod: any): any {
		if (!mod) return undefined;
		if (typeof mod.default === "function") return mod.default;
		if (typeof mod.default?.default === "function") return mod.default.default;
		return undefined;
	}
}




