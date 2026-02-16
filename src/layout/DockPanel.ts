/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module layout/DockPanel
 * @description Mixed tab bar component that can host both editor tabs (EditorManager)
 * and widget tabs (ItemView instances) in a single tabbed container.
 *
 * A DockPanel is the leaf-level container inside a DockPaneManager's split tree.
 * It renders a unified tab bar with drag-and-drop support for reordering and
 * cross-panel transfer of any tab type.
 *
 * @example
 * ```ts
 * const panel = new DockPanel("panel-1", container, vault);
 * panel.addWidgetTab("copilot-chat-view", chatViewInstance);
 * panel.addEditorTab("notes/hello.md");
 * ```
 *
 * @see {@link DockPaneManager} for the split-tree that hosts DockPanels
 * @since 0.1.0
 */

import { EditorManager } from "../editor/EditorManager.js";
import type { TabState } from "../editor/EditorManager.js";
import type { ItemView } from "../platform/ui/ItemView.js";
import type { WorkspaceLeaf, ViewCreator } from "../platform/workspace/WorkspaceLeaf.js";
import { viewRegistry } from "../platform/workspace/WorkspaceLeaf.js";
import type { DockTabState } from "../shell-settings/WebShellSettings.js";

// ── Tab descriptor ───────────────────────────────────────────

/**
 * Internal representation of a tab inside a DockPanel.
 * Either wraps an EditorManager (editor tabs) or an ItemView (widget tabs).
 */
interface DockTab {
	/** Unique ID within this panel */
	id: string;
	/** "editor" for file tabs, "widget" for ItemView tabs */
	kind: "editor" | "widget";
	/** Display label shown in the tab bar */
	label: string;
	/** CSS class for icon (lucide name or custom) */
	icon: string;
	/** The tab header element in the DOM */
	tabEl: HTMLElement;
	/** Content container for this tab */
	contentEl: HTMLElement;
	/** For widget tabs: the ItemView instance */
	view?: ItemView;
	/** For widget tabs: the view type string */
	viewType?: string;
	/** For editor tabs: the underlying EditorManager that manages its own sub-tabs */
	editorManager?: EditorManager;
	/** For editor tabs: the vault-relative file path this tab is showing */
	filePath?: string;
}

// ── SVG icons ────────────────────────────────────────────────

/** @internal */
const closeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

/**
 * A mixed-content tabbed panel that can host editor tabs and widget tabs.
 *
 * The tab bar is rendered at the top of the panel. Each tab's content lives
 * in a stacked container below — only the active tab is visible.
 */
export class DockPanel {
	/** Unique panel identifier (matches pane-leaf ID in the split tree). */
	readonly id: string;

	/** The outer DOM element for this panel. */
	readonly element: HTMLElement;

	/** The tab bar element. */
	private tabBar: HTMLElement;

	/** Stacked content area (only active child is visible). */
	private contentStack: HTMLElement;

	/** All tabs in order. */
	private tabs: DockTab[] = [];

	/** ID of the currently active tab. */
	private activeTabId: string | null = null;

	/** Counter for generating unique tab IDs. */
	private tabCounter = 0;

	/** Vault reference for creating EditorManagers. */
	private vault: any;

	/** Column zone this panel belongs to. */
	readonly zone: "left" | "center" | "right";

	/** Callback: request closing this panel (invoked by DockPaneManager). */
	onRequestClose: (() => void) | null = null;

	/** Callback: request splitting this panel. */
	onRequestSplit: ((direction: "horizontal" | "vertical") => void) | null = null;

	/** Callback: file opened in editor sub-tab (for center pane tracking). */
	onFileOpen: ((filePath: string) => void) | null = null;

	/** App reference injected by DockPaneManager for widget leaf creation. */
	private _app: any = null;

	constructor(id: string, container: HTMLElement, vault: any, zone: "left" | "center" | "right" = "center") {
		this.id = id;
		this.vault = vault;
		this.zone = zone;

		// Build DOM structure
		this.element = document.createElement("div");
		this.element.className = "ws-dock-panel";
		this.element.dataset.panelId = id;

		this.tabBar = document.createElement("div");
		this.tabBar.className = "ws-dock-tab-bar";
		this.element.appendChild(this.tabBar);

		this.contentStack = document.createElement("div");
		this.contentStack.className = "ws-dock-content-stack";
		this.element.appendChild(this.contentStack);

		container.appendChild(this.element);
	}

	/**
	 * Set the App reference so widget tabs get a proper leaf.app.
	 * @param app - The App instance
	 */
	setApp(app: any): void {
		this._app = app;
	}

	// ── Public API: Tab Management ───────────────────────────

	/**
	 * Add a widget tab backed by a registered ItemView.
	 *
	 * @param viewType - The view type identifier (e.g. "copilot-chat-view")
	 * @param existingView - An already-instantiated ItemView (optional; lazy-created from registry if omitted)
	 * @returns The tab ID, or null if the view type is not registered
	 */
	async addWidgetTab(viewType: string, existingView?: ItemView): Promise<string | null> {
		// Check if this widget type is already open
		const existing = this.tabs.find(t => t.kind === "widget" && t.viewType === viewType);
		if (existing) {
			this.activateTab(existing.id);
			return existing.id;
		}

		let view: ItemView;
		if (existingView) {
			view = existingView;
		} else {
			const factory = viewRegistry.get(viewType);
			if (!factory) {
				console.warn(`[DockPanel] No view registered for type "${viewType}"`);
				return null;
			}
			// Create a minimal WorkspaceLeaf-like host
			const leafEl = document.createElement("div");
			leafEl.className = "workspace-leaf";
			const headerEl = document.createElement("div");
			headerEl.className = "view-header";
			leafEl.appendChild(headerEl);
			const contentEl = document.createElement("div");
			contentEl.className = "view-content";
			leafEl.appendChild(contentEl);

			const leaf = { containerEl: leafEl, _zone: this.zone, app: this._app } as any;
			// Add detach() so views can request their own removal
			leaf.detach = () => {
				const tab = this.tabs.find(t => t.kind === "widget" && t.viewType === viewType);
				if (tab) void this.removeTab(tab.id);
			};
			view = factory(leaf);
			(view as any).containerEl = leafEl;
			(view as any).contentEl = contentEl;
			(view as any).leaf = leaf;
			// Ensure the view has app set (ItemView reads from leaf.app)
			if (this._app && !(view as any).app) {
				(view as any).app = this._app;
			}
		}

		const tabId = `${this.id}-tab-${++this.tabCounter}`;

		// Content wrapper
		const contentEl = document.createElement("div");
		contentEl.className = "ws-dock-tab-content";
		contentEl.style.display = "none";
		contentEl.appendChild((view as any).containerEl || view.contentEl);
		this.contentStack.appendChild(contentEl);

		// Tab header element
		const tabEl = this.createTabEl(tabId, view.getDisplayText(), view.getIcon(), "widget");

		const tab: DockTab = {
			id: tabId,
			kind: "widget",
			label: view.getDisplayText(),
			icon: view.getIcon(),
			tabEl,
			contentEl,
			view,
			viewType,
		};

		this.tabs.push(tab);
		this.tabBar.appendChild(tabEl);

		// Initialize the view
		try {
			await view.onOpen();
		} catch (err) {
			console.error(`[DockPanel] Error opening view "${viewType}":`, err);
		}

		this.activateTab(tabId);
		return tabId;
	}

	/**
	 * Add an editor tab backed by an EditorManager.
	 * Each editor tab opens exactly one file — no internal sub-tabs.
	 *
	 * @param initialFilePath - Optional file to open immediately
	 * @returns The tab ID
	 */
	async addEditorTab(initialFilePath?: string): Promise<string> {
		// If this file is already open in a tab, just activate it
		if (initialFilePath) {
			const existing = this.tabs.find(t => t.kind === "editor" && t.filePath === initialFilePath);
			if (existing) {
				this.activateTab(existing.id);
				return existing.id;
			}
		}

		const tabId = `${this.id}-tab-${++this.tabCounter}`;

		// Content wrapper
		const contentEl = document.createElement("div");
		contentEl.className = "ws-dock-tab-content ws-dock-editor-content";
		contentEl.style.display = "none";
		this.contentStack.appendChild(contentEl);

		// Create EditorManager inside the content wrapper
		const editorManager = new EditorManager(contentEl, this.vault);
		editorManager.paneId = this.id;

		// Hide EditorManager's internal tab bar — the dock tab is the only tab
		const internalTabHeader = contentEl.querySelector(".ws-tab-header") as HTMLElement;
		if (internalTabHeader) {
			internalTabHeader.style.display = "none";
		}

		if (initialFilePath) {
			await editorManager.openFile(initialFilePath);
		}

		// Derive initial label from file path, or default to "Editor"
		const initialLabel = initialFilePath
			? initialFilePath.split("/").pop()?.replace(/\.md$/, "") || "Editor"
			: "Editor";
		const tabEl = this.createTabEl(tabId, initialLabel, "file-text", "editor");

		const tab: DockTab = {
			id: tabId,
			kind: "editor",
			label: initialLabel,
			icon: "file-text",
			tabEl,
			contentEl,
			editorManager,
			filePath: initialFilePath,
		};

		this.tabs.push(tab);
		this.tabBar.appendChild(tabEl);
		this.activateTab(tabId);
		return tabId;
	}

	/**
	 * Remove a tab by ID. If it was the active tab, activates an adjacent one.
	 *
	 * @param tabId - The tab to remove
	 */
	async removeTab(tabId: string): Promise<void> {
		const idx = this.tabs.findIndex(t => t.id === tabId);
		if (idx === -1) return;

		const tab = this.tabs[idx]!;

		// Clean up
		if (tab.view) {
			try { await tab.view.onClose(); } catch { /* ignore */ }
		}
		tab.tabEl.remove();
		tab.contentEl.remove();
		this.tabs.splice(idx, 1);

		// Activate neighbour
		if (this.activeTabId === tabId) {
			const next = this.tabs[idx] || this.tabs[idx - 1];
			if (next) {
				this.activateTab(next.id);
			} else {
				this.activeTabId = null;
				// Panel is now empty — request close from parent
				this.onRequestClose?.();
			}
		}
	}

	/**
	 * Activate a tab by ID — shows its content and highlights its header.
	 *
	 * @param tabId - The tab to activate
	 */
	activateTab(tabId: string): void {
		this.activeTabId = tabId;
		for (const tab of this.tabs) {
			const isActive = tab.id === tabId;
			tab.tabEl.classList.toggle("is-active", isActive);
			tab.contentEl.style.display = isActive ? "" : "none";
		}
	}

	/** Get the number of tabs in this panel. */
	get tabCount(): number {
		return this.tabs.length;
	}

	/** Get the active tab ID. */
	getActiveTabId(): string | null {
		return this.activeTabId;
	}

	/** Get the EditorManager for the currently active editor tab (if any). */
	getActiveEditorManager(): EditorManager | null {
		const activeTab = this.tabs.find(t => t.id === this.activeTabId);
		return activeTab?.editorManager || null;
	}

	/** Get all EditorManagers in this panel. */
	getEditorManagers(): EditorManager[] {
		return this.tabs.filter(t => t.editorManager).map(t => t.editorManager!);
	}

	/** Check if a widget of the given type is already open in this panel. */
	hasWidgetType(viewType: string): boolean {
		return this.tabs.some(t => t.kind === "widget" && t.viewType === viewType);
	}

	/** Find and activate a widget tab by view type. Returns true if found. */
	activateWidgetByType(viewType: string): boolean {
		const tab = this.tabs.find(t => t.kind === "widget" && t.viewType === viewType);
		if (tab) {
			this.activateTab(tab.id);
			return true;
		}
		return false;
	}

	// ── Serialization ────────────────────────────────────────

	/**
	 * Serialize all tabs for persistence.
	 *
	 * @returns Array of DockTabState objects
	 */
	serializeTabs(): DockTabState[] {
		return this.tabs.map(tab => {
			if (tab.kind === "editor") {
				return { type: "editor" as const, filePath: tab.filePath || "" };
			}
			return {
				type: "widget" as const,
				viewType: tab.viewType || "",
				state: tab.view?.getState?.() || undefined,
			};
		});
	}

	/**
	 * Get the index of the currently active tab.
	 *
	 * @returns Zero-based index or -1 if no tab is active
	 */
	getActiveTabIndex(): number {
		return this.tabs.findIndex(t => t.id === this.activeTabId);
	}

	// ── Drag and Drop Data ───────────────────────────────────

	/**
	 * Export a tab's transfer data for cross-panel drag-and-drop.
	 *
	 * @param tabId - The tab to export
	 * @returns Serialized transfer data, or null if tab not found
	 */
	exportDockTab(tabId: string): { kind: "editor" | "widget"; data: any } | null {
		const tab = this.tabs.find(t => t.id === tabId);
		if (!tab) return null;

		if (tab.kind === "editor" && tab.editorManager) {
			const activePath = tab.editorManager.getActiveFilePath();
			return {
				kind: "editor",
				data: activePath ? tab.editorManager.exportTab(activePath) : null,
			};
		}

		return {
			kind: "widget",
			data: { viewType: tab.viewType, state: tab.view?.getState?.() },
		};
	}

	/**
	 * Import a tab from drag-and-drop transfer data.
	 *
	 * @param kind - "editor" or "widget"
	 * @param data - The transfer payload from exportDockTab
	 */
	async importDockTab(kind: "editor" | "widget", data: any): Promise<void> {
		if (kind === "editor" && data) {
			const tabId = await this.addEditorTab();
			const editorTab = this.tabs.find(t => t.id === tabId);
			if (editorTab?.editorManager && data.path) {
				await editorTab.editorManager.importTab(data as TabState);
			}
		} else if (kind === "widget" && data?.viewType) {
			await this.addWidgetTab(data.viewType);
		}
	}

	// ── Cleanup ──────────────────────────────────────────────

	/**
	 * Destroy the panel — close all views and remove from DOM.
	 */
	async destroy(): Promise<void> {
		for (const tab of this.tabs) {
			if (tab.view) {
				try { await tab.view.onClose(); } catch { /* ignore */ }
			}
		}
		this.tabs = [];
		this.element.remove();
	}

	// ── Private: Tab bar rendering ───────────────────────────

	/** @internal Create a tab header element with drag support. */
	private createTabEl(tabId: string, label: string, _icon: string, kind: "editor" | "widget"): HTMLElement {
		const tabEl = document.createElement("div");
		tabEl.className = "ws-dock-tab";
		tabEl.dataset.tabId = tabId;
		tabEl.dataset.tabKind = kind;
		tabEl.draggable = true;

		const labelSpan = document.createElement("span");
		labelSpan.className = "ws-dock-tab-label";
		labelSpan.textContent = label;
		tabEl.appendChild(labelSpan);

		// Close button
		const closeBtn = document.createElement("span");
		closeBtn.className = "ws-dock-tab-close";
		closeBtn.innerHTML = closeIcon;
		closeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.removeTab(tabId);
		});
		tabEl.appendChild(closeBtn);

		// Click to activate
		tabEl.addEventListener("click", () => {
			this.activateTab(tabId);
		});

		// Drag start
		tabEl.addEventListener("dragstart", (e) => {
			if (!e.dataTransfer) return;
			const payload = JSON.stringify({
				panelId: this.id,
				tabId,
				kind,
				zone: this.zone,
			});
			e.dataTransfer.setData("text/x-dock-tab", payload);
			e.dataTransfer.effectAllowed = "move";
			tabEl.classList.add("is-dragging");
		});

		tabEl.addEventListener("dragend", () => {
			tabEl.classList.remove("is-dragging");
		});

		return tabEl;
	}
}
