/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module layout/DockPaneManager
 * @description Generalized split-pane tree manager that uses DockPanel leaves.
 *
 * Extracted and generalized from PaneManager. Each column (left, center, right)
 * in the workspace gets its own DockPaneManager instance. The tree contains
 * DockPanel leaf nodes that can host both editor and widget tabs.
 *
 * Supports:
 * - Recursive horizontal/vertical splits
 * - Drag-and-drop between panels (within same column and cross-column)
 * - Collapsing empty panels
 * - State persistence/restore per column
 *
 * @example
 * ```ts
 * const manager = new DockPaneManager(containerEl, vault, "center");
 * await manager.addWidgetToActivePanel("copilot-chat-view");
 * manager.splitPane("horizontal");
 * ```
 *
 * @see {@link DockPanel} for the mixed tab bar leaf component
 * @see {@link LayoutManager} for the 3-column layout that owns these managers
 * @since 0.1.0
 */

import { DockPanel } from "./DockPanel.js";
import type { EditorManager, DocumentStats } from "../editor/EditorManager.js";
import type { LayoutManager } from "./LayoutManager.js";
import type {
	PaneTreeState,
	PaneNodeState,
	PaneLeafState,
	PaneSplitState,
	DockTabState,
} from "../shell-settings/WebShellSettings.js";
import { loadSettings, saveSettings } from "../shell-settings/WebShellSettings.js";

/** Direction of a split */
type SplitDirection = "horizontal" | "vertical";

// ── Tree node types ──────────────────────────────────────────

/** A leaf pane that holds a DockPanel */
interface LeafNode {
	type: "leaf";
	id: string;
	element: HTMLElement;
	panel: DockPanel;
}

/** A split container with two or more children */
interface SplitNode {
	type: "split";
	id: string;
	direction: SplitDirection;
	element: HTMLElement;
	children: PaneNode[];
	resizers: HTMLElement[];
}

type PaneNode = LeafNode | SplitNode;

/**
 * Manages the split-pane layout tree for one column of the workspace.
 */
export class DockPaneManager {
	/** The container element for this column. */
	private container: HTMLElement;

	/** Vault reference passed to DockPanels / EditorManagers. */
	private vault: any;

	/** Which column zone this manager controls. */
	readonly zone: "left" | "center" | "right";

	/** Root of the split tree. */
	private root: PaneNode;

	/** Counter for generating unique pane/split IDs. */
	private paneCounter = 0;

	/** ID of the currently active panel. */
	private activePanelId: string;

	/** All leaf panels indexed by ID for fast lookup. */
	private panels: Map<string, LeafNode> = new Map();

	/** LayoutManager for sidebar delegation (set after construction). */
	private layoutManager: LayoutManager | null = null;

	/** Workspace reference for active-file tracking in editors. */
	private _workspace: any = null;

	/** App reference propagated to DockPanels for widget tabs. */
	private _app: any = null;

	/** Stats change handler propagated to editor tabs. */
	private _statsHandler: ((stats: DocumentStats) => void) | null = null;

	/** localStorage key suffix for this column's tree. */
	private settingsKey: "paneTree" | "leftDockTree" | "rightDockTree";

	constructor(container: HTMLElement, vault: any, zone: "left" | "center" | "right") {
		this.container = container;
		this.vault = vault;
		this.zone = zone;
		this.container.innerHTML = "";
		this.container.classList.add("ws-dock-pane-root");

		// Map zone to settings key
		this.settingsKey = zone === "left" ? "leftDockTree"
			: zone === "right" ? "rightDockTree"
			: "paneTree";

		// Create the initial single leaf panel
		const leaf = this.createLeaf();
		this.root = leaf;
		this.activePanelId = leaf.id;
		this.container.appendChild(leaf.element);

		this.setupDropZone(leaf);
	}

	// ── Configuration ────────────────────────────────────────

	/** Set the LayoutManager so editors can delegate sidebar toggle. */
	setLayoutManager(lm: LayoutManager): void {
		this.layoutManager = lm;
		for (const leaf of this.panels.values()) {
			for (const em of leaf.panel.getEditorManagers()) {
				em.setLayoutManager(lm);
			}
		}
	}

	/** Set the Workspace so EditorManagers can track active files. */
	setWorkspace(workspace: any): void {
		this._workspace = workspace;
		for (const leaf of this.panels.values()) {
			for (const em of leaf.panel.getEditorManagers()) {
				em.setWorkspace(workspace);
			}
		}
	}

	/** Set the App reference so widget views get leaf.app. */
	setApp(app: any): void {
		this._app = app;
		for (const leaf of this.panels.values()) {
			leaf.panel.setApp(app);
		}
	}

	/** Set a stats change handler on all current and future editors. */
	setStatsChangeHandler(handler: (stats: DocumentStats) => void): void {
		this._statsHandler = handler;
		for (const leaf of this.panels.values()) {
			for (const em of leaf.panel.getEditorManagers()) {
				em.setStatsChangeHandler(handler);
			}
		}
	}

	// ── Panel Access ─────────────────────────────────────────

	/** Get the currently active DockPanel. */
	getActivePanel(): DockPanel {
		const leaf = this.panels.get(this.activePanelId);
		if (leaf) return leaf.panel;
		const first = this.panels.values().next().value;
		if (!first) throw new Error(`[DockPaneManager:${this.zone}] No panels available`);
		return first.panel;
	}

	/** Get the active panel's ID. */
	getActivePanelId(): string {
		return this.activePanelId;
	}

	/** Get all panels. */
	getAllPanels(): DockPanel[] {
		return Array.from(this.panels.values()).map(l => l.panel);
	}

	/** Get the EditorManager from the active panel (if it has one). */
	getActiveEditorManager(): EditorManager | null {
		return this.getActivePanel().getActiveEditorManager();
	}

	// ── Widget / File Operations ─────────────────────────────

	/**
	 * Add a widget tab to the active panel or open a file in it.
	 *
	 * @param viewType - The registered view type to add
	 * @returns The tab ID, or null if not registered
	 */
	async addWidgetToActivePanel(viewType: string): Promise<string | null> {
		return this.getActivePanel().addWidgetTab(viewType);
	}

	/**
	 * Open a file in the active panel's editor tab.
	 * Creates an editor tab if the active panel doesn't have one.
	 *
	 * @param filePath - Vault-relative file path
	 */
	async openFile(filePath: string): Promise<void> {
		const panel = this.getActivePanel();
		// Each file gets its own dock tab — always create a new editor tab
		// (addEditorTab deduplicates if the file is already open)
		await panel.addEditorTab(filePath);
	}

	// ── Split Operations ─────────────────────────────────────

	/** Split the active panel (or a specific panel) in the given direction. */
	splitPane(direction: SplitDirection, panelId?: string): void {
		const targetId = panelId || this.activePanelId;
		const leaf = this.panels.get(targetId);
		if (!leaf) return;

		const newLeaf = this.createLeaf();

		const splitEl = document.createElement("div");
		splitEl.className = direction === "horizontal"
			? "ws-pane-split ws-pane-split-h"
			: "ws-pane-split ws-pane-split-v";

		const resizer = document.createElement("div");
		resizer.className = "ws-pane-resizer";
		resizer.dataset.direction = direction;

		const parent = leaf.element.parentElement!;
		parent.replaceChild(splitEl, leaf.element);

		splitEl.appendChild(leaf.element);
		splitEl.appendChild(resizer);
		splitEl.appendChild(newLeaf.element);

		leaf.element.style.flex = "0 0 50%";
		newLeaf.element.style.flex = "0 0 50%";
		leaf.element.style.width = "";
		newLeaf.element.style.width = "";
		leaf.element.style.height = "";
		newLeaf.element.style.height = "";

		const splitNode: SplitNode = {
			type: "split",
			id: `split-${++this.paneCounter}`,
			direction,
			element: splitEl,
			children: [leaf, newLeaf],
			resizers: [resizer],
		};

		this.replaceNodeInTree(leaf, splitNode);
		this.initPaneResizer(resizer, splitNode, 0);
		this.setupDropZone(newLeaf);
		this.setActivePanel(newLeaf.id);
		this.persistState();
	}

	/** Close a panel. If it's the last one, keep an empty panel. */
	closePanel(panelId: string): void {
		if (this.panels.size <= 1) return;

		const leaf = this.panels.get(panelId);
		if (!leaf) return;

		const parentSplit = this.findParentSplit(leaf);
		if (!parentSplit) return;

		const idx = parentSplit.children.indexOf(leaf);
		parentSplit.children.splice(idx, 1);
		leaf.element.remove();

		if (idx < parentSplit.resizers.length) {
			parentSplit.resizers[idx]?.remove();
			parentSplit.resizers.splice(idx, 1);
		} else if (parentSplit.resizers.length > 0) {
			parentSplit.resizers[parentSplit.resizers.length - 1]?.remove();
			parentSplit.resizers.pop();
		}

		void leaf.panel.destroy();
		this.panels.delete(panelId);

		if (parentSplit.children.length === 1) {
			const remaining = parentSplit.children[0]!;
			const grandparent = parentSplit.element.parentElement!;
			grandparent.replaceChild(remaining.element, parentSplit.element);
			remaining.element.style.flex = "1 1 0";
			remaining.element.style.width = "";
			remaining.element.style.height = "";
			this.replaceNodeInTree(parentSplit, remaining);
		}

		if (parentSplit.children.length > 1) {
			const size = `${100 / parentSplit.children.length}%`;
			for (const child of parentSplit.children) {
				child.element.style.flex = `0 0 ${size}`;
			}
		}

		if (this.activePanelId === panelId) {
			const first = this.panels.values().next().value;
			if (first) this.setActivePanel(first.id);
		}
		this.persistState();
	}

	/** Set the active panel by ID. */
	setActivePanel(panelId: string): void {
		this.activePanelId = panelId;
		for (const [id, leaf] of this.panels) {
			leaf.element.classList.toggle("ws-pane-active", id === panelId);
		}
	}

	// ── State Persistence ────────────────────────────────────

	/** Serialize the pane tree to a JSON-safe state. */
	serializeTree(): PaneTreeState {
		return {
			root: this.serializeNode(this.root),
			activePaneId: this.activePanelId,
		};
	}

	/** Save the pane tree state to localStorage. */
	persistState(): void {
		const settings = loadSettings();
		settings[this.settingsKey] = this.serializeTree();
		saveSettings(settings);
	}

	/**
	 * Restore the pane tree from saved state.
	 * Should be called after construction, before user interaction.
	 */
	async restoreState(): Promise<void> {
		const settings = loadSettings();
		const saved = settings[this.settingsKey];
		if (!saved || !saved.root) return;

		this.container.innerHTML = "";
		this.panels.clear();
		this.paneCounter = 0;

		const root = await this.restoreNode(saved.root);
		this.root = root;
		this.container.appendChild(root.element);

		if (saved.activePaneId && this.panels.has(saved.activePaneId)) {
			this.setActivePanel(saved.activePaneId);
		} else {
			const first = this.panels.values().next().value;
			if (first) this.setActivePanel(first.id);
		}
	}

	// ── Serialization Helpers ────────────────────────────────

	/** @internal */
	private serializeNode(node: PaneNode): PaneNodeState {
		if (node.type === "leaf") {
			const panel = node.panel;
			return {
				type: "leaf",
				id: node.id,
				openTabs: [], // Legacy compat
				activeTab: null,
				tabs: panel.serializeTabs(),
				activeTabIndex: panel.getActiveTabIndex(),
			} satisfies PaneLeafState;
		}
		const split = node as SplitNode;
		return {
			type: "split",
			id: split.id,
			direction: split.direction,
			sizes: split.children.map(c => c.element.style.flex || "1 1 0"),
			children: split.children.map(c => this.serializeNode(c)),
		} satisfies PaneSplitState;
	}

	/** @internal */
	private async restoreNode(state: PaneNodeState): Promise<PaneNode> {
		if (state.type === "leaf") {
			const leafState = state as PaneLeafState;
			const leaf = this.createLeaf();

			// Restore tabs from the new dock tab format
			if (leafState.tabs && leafState.tabs.length > 0) {
				for (const tabState of leafState.tabs) {
					if (tabState.type === "editor") {
						// Skip blank editor tabs (no file path)
						if (!tabState.filePath) continue;
						try {
							await leaf.panel.addEditorTab(tabState.filePath);
						} catch { /* file may be missing */ }
					} else if (tabState.type === "widget") {
						try {
							await leaf.panel.addWidgetTab(tabState.viewType);
						} catch { /* view type may not be registered yet */ }
					}
				}
				// Restore active tab
				if (typeof leafState.activeTabIndex === "number" && leafState.activeTabIndex >= 0) {
					// Tabs are added in order, so we can activate by finding the Nth tab
					const allTabs = leaf.panel.serializeTabs();
					if (leafState.activeTabIndex < allTabs.length) {
						// activateTab expects the tab ID, but we need to reconstruct
						// For now, just leave the last-added tab active (addWidgetTab/addEditorTab activate on add)
					}
				}
			} else if (leafState.openTabs && leafState.openTabs.length > 0) {
				// Legacy format: openTabs is an array of file paths
				for (const tabPath of leafState.openTabs) {
					try {
						await leaf.panel.addEditorTab(tabPath);
					} catch { /* skip missing files */ }
				}
			}

			return leaf;
		}

		const splitState = state as PaneSplitState;
		const splitEl = document.createElement("div");
		splitEl.className = splitState.direction === "horizontal"
			? "ws-pane-split ws-pane-split-h"
			: "ws-pane-split ws-pane-split-v";

		const children: PaneNode[] = [];
		const resizers: HTMLElement[] = [];

		for (let i = 0; i < splitState.children.length; i++) {
			const childState = splitState.children[i];
			if (!childState) continue;
			const child = await this.restoreNode(childState);

			const savedSize = splitState.sizes[i];
			if (savedSize) child.element.style.flex = savedSize;

			if (i > 0) {
				const resizer = document.createElement("div");
				resizer.className = "ws-pane-resizer";
				resizer.dataset.direction = splitState.direction;
				splitEl.appendChild(resizer);
				resizers.push(resizer);
			}

			splitEl.appendChild(child.element);
			children.push(child);
		}

		const idNum = parseInt(splitState.id.replace("split-", ""), 10);
		if (!isNaN(idNum) && idNum >= this.paneCounter) {
			this.paneCounter = idNum + 1;
		}

		const splitNode: SplitNode = {
			type: "split",
			id: splitState.id,
			direction: splitState.direction,
			element: splitEl,
			children,
			resizers,
		};

		for (let i = 0; i < resizers.length; i++) {
			const resizer = resizers[i];
			if (resizer) this.initPaneResizer(resizer, splitNode, i);
		}

		return splitNode;
	}

	// ── Private: Leaf Creation ───────────────────────────────

	/** @internal Create a new leaf with its own DockPanel. */
	private createLeaf(): LeafNode {
		const id = `${this.zone}-pane-${++this.paneCounter}`;
		const element = document.createElement("div");
		element.className = "ws-pane-leaf ws-dock-pane-leaf";
		element.dataset.paneId = id;

		const panel = new DockPanel(id, element, this.vault, this.zone);

		// Wire panel close/split callbacks
		panel.onRequestClose = () => {
			if (this.panels.size > 1) this.closePanel(id);
		};
		panel.onRequestSplit = (dir) => this.splitPane(dir, id);

		// Propagate app reference if already set
		if (this._app) panel.setApp(this._app);

		// Track focus
		element.addEventListener("mousedown", () => {
			this.setActivePanel(id);
		}, true);

		const leaf: LeafNode = { type: "leaf", id, element, panel };
		this.panels.set(id, leaf);

		// Setup drop zone for drag-and-drop
		this.setupDropZone(leaf);

		return leaf;
	}

	// ── Private: Drop Zone ───────────────────────────────────

	/** @internal Set up drag-and-drop target on a leaf. */
	private setupDropZone(leaf: LeafNode): void {
		const el = leaf.element;

		// Use capture phase so our handler fires BEFORE any child content
		// handlers (e.g. CodeMirror, chat input) can swallow the event.
		el.addEventListener("dragover", (e: DragEvent) => {
			if (!e.dataTransfer) return;
			const hasDockTab = e.dataTransfer.types.includes("text/x-dock-tab");
			const hasPaneTab = e.dataTransfer.types.includes("text/x-pane-tab");
			if (!hasDockTab && !hasPaneTab) return;

			e.preventDefault();
			e.stopPropagation();
			e.dataTransfer.dropEffect = "move";

			// Detect edge zones for split-on-drop
			const rect = el.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			const edgeThreshold = Math.min(rect.width, rect.height) * 0.2;

			el.classList.add("ws-pane-drop-target");
			el.classList.remove("ws-drop-left", "ws-drop-right", "ws-drop-top", "ws-drop-bottom", "ws-drop-center");

			if (x < edgeThreshold) el.classList.add("ws-drop-left");
			else if (x > rect.width - edgeThreshold) el.classList.add("ws-drop-right");
			else if (y < edgeThreshold) el.classList.add("ws-drop-top");
			else if (y > rect.height - edgeThreshold) el.classList.add("ws-drop-bottom");
			else el.classList.add("ws-drop-center");
		}, true);

		el.addEventListener("dragleave", (e: DragEvent) => {
			// Only remove classes when leaving the leaf itself, not its children
			const related = e.relatedTarget as Node | null;
			if (related && el.contains(related)) return;
			el.classList.remove("ws-pane-drop-target", "ws-drop-left", "ws-drop-right", "ws-drop-top", "ws-drop-bottom", "ws-drop-center");
		});

		el.addEventListener("drop", async (e: DragEvent) => {
			el.classList.remove("ws-pane-drop-target", "ws-drop-left", "ws-drop-right", "ws-drop-top", "ws-drop-bottom", "ws-drop-center");
			if (!e.dataTransfer) return;

			// Handle dock-tab transfers (new unified format)
			const dockData = e.dataTransfer.getData("text/x-dock-tab");
			if (dockData) {
				e.preventDefault();
				e.stopPropagation();
				const { panelId, tabId, kind, zone: sourceZone } = JSON.parse(dockData);
				await this.handleDockTabDrop(e, leaf, panelId, tabId, kind, sourceZone);
				return;
			}

			// Handle legacy pane-tab transfers (from old PaneManager)
			const legacyData = e.dataTransfer.getData("text/x-pane-tab");
			if (legacyData) {
				e.preventDefault();
				e.stopPropagation();
				const { fromPaneId, filePath } = JSON.parse(legacyData);
				if (filePath) {
					await leaf.panel.addEditorTab(filePath);
					this.setActivePanel(leaf.id);
				}
			}
		}, true);
	}

	/**
	 * Find a panel by ID across all columns via the LayoutManager.
	 * Falls back to local lookup if LayoutManager is not set.
	 *
	 * @param panelId - The panel ID to find
	 * @returns The source panel and its owning DockPaneManager, or null
	 * @internal
	 */
	private findPanelAcrossColumns(panelId: string): { panel: DockPanel; manager: DockPaneManager } | null {
		// Check local panels first
		const local = this.panels.get(panelId);
		if (local) return { panel: local.panel, manager: this };

		// Search other columns via LayoutManager
		if (this.layoutManager) {
			const docks = [
				this.layoutManager.leftDock,
				this.layoutManager.centerDock,
				this.layoutManager.rightDock,
			].filter((d): d is DockPaneManager => d !== null && d !== this);

			for (const dock of docks) {
				for (const p of dock.getAllPanels()) {
					if (p.id === panelId) {
						return { panel: p, manager: dock };
					}
				}
			}
		}

		return null;
	}

	/** @internal Handle a dock-tab drop event. */
	private async handleDockTabDrop(
		e: DragEvent,
		targetLeaf: LeafNode,
		sourcePanelId: string,
		sourceTabId: string,
		kind: "editor" | "widget",
		_sourceZone: string,
	): Promise<void> {
		const rect = targetLeaf.element.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		const edgeThreshold = Math.min(rect.width, rect.height) * 0.2;

		const isEdge = x < edgeThreshold || x > rect.width - edgeThreshold
			|| y < edgeThreshold || y > rect.height - edgeThreshold;

		// Find source panel — may be in a different column
		const source = this.findPanelAcrossColumns(sourcePanelId);
		if (!source) {
			console.warn(`[DockPaneManager] Source panel "${sourcePanelId}" not found in any column`);
			return;
		}

		// Export tab data from source
		const exportData = source.panel.exportDockTab(sourceTabId);
		if (!exportData) return;

		if (isEdge) {
			// Edge drop — split the target panel and import into new panel
			let direction: SplitDirection;
			if (x < edgeThreshold || x > rect.width - edgeThreshold) {
				direction = "horizontal";
			} else {
				direction = "vertical";
			}

			// Remove from source
			await source.panel.removeTab(sourceTabId);
			if (source.manager !== this) source.manager.persistState();

			// Split and import into new panel
			this.splitPane(direction, targetLeaf.id);
			const newLeaf = this.panels.get(this.activePanelId);
			if (newLeaf) {
				await newLeaf.panel.importDockTab(exportData.kind, exportData.data);
			}
		} else {
			// Center drop — move tab into this panel
			if (sourcePanelId === targetLeaf.id) return; // Same panel, no-op

			await source.panel.removeTab(sourceTabId);
			if (source.manager !== this) source.manager.persistState();
			await targetLeaf.panel.importDockTab(exportData.kind, exportData.data);
			this.setActivePanel(targetLeaf.id);
		}

		this.persistState();
	}

	// ── Private: Tree Operations ─────────────────────────────

	/** @internal */
	private replaceNodeInTree(oldNode: PaneNode, newNode: PaneNode): void {
		if (this.root === oldNode) {
			this.root = newNode;
			return;
		}
		this.replaceInChildren(this.root, oldNode, newNode);
	}

	/** @internal */
	private replaceInChildren(node: PaneNode, target: PaneNode, replacement: PaneNode): boolean {
		if (node.type !== "split") return false;
		for (let i = 0; i < node.children.length; i++) {
			const child = node.children[i];
			if (!child) continue;
			if (child === target) {
				node.children[i] = replacement;
				return true;
			}
			if (this.replaceInChildren(child, target, replacement)) return true;
		}
		return false;
	}

	/** @internal */
	private findParentSplit(target: PaneNode): SplitNode | null {
		return this.findParentSplitRecursive(this.root, target);
	}

	/** @internal */
	private findParentSplitRecursive(node: PaneNode, target: PaneNode): SplitNode | null {
		if (node.type !== "split") return null;
		for (const child of node.children) {
			if (child === target) return node;
			const found = this.findParentSplitRecursive(child, target);
			if (found) return found;
		}
		return null;
	}

	// ── Private: Resizer ─────────────────────────────────────

	/** @internal */
	private initPaneResizer(resizer: HTMLElement, splitNode: SplitNode, index: number): void {
		const isHorizontal = splitNode.direction === "horizontal";
		const minPaneSizePx = 30;
		let startPos = 0;
		let startSizeA = 0;
		let totalSize = 0;

		const onMouseMove = (e: MouseEvent) => {
			const delta = (isHorizontal ? e.clientX : e.clientY) - startPos;
			const minA = minPaneSizePx;
			const maxA = Math.max(minPaneSizePx, totalSize - minPaneSizePx);
			const newSizeA = Math.min(maxA, Math.max(minA, startSizeA + delta));
			const newSizeB = totalSize - newSizeA;
			const childA = splitNode.children[index];
			const childB = splitNode.children[index + 1];
			if (childA && childB) {
				childA.element.style.flex = `0 0 ${(newSizeA / totalSize) * 100}%`;
				childB.element.style.flex = `0 0 ${(newSizeB / totalSize) * 100}%`;
			}
		};

		const onMouseUp = () => {
			resizer.classList.remove("is-dragging");
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			this.persistState();
		};

		resizer.addEventListener("mousedown", (e: MouseEvent) => {
			e.preventDefault();
			startPos = isHorizontal ? e.clientX : e.clientY;

			const childA = splitNode.children[index];
			const childB = splitNode.children[index + 1];
			if (!childA || !childB) return;

			const rectA = childA.element.getBoundingClientRect();
			const rectB = childB.element.getBoundingClientRect();
			startSizeA = isHorizontal ? rectA.width : rectA.height;
			const startSizeB = isHorizontal ? rectB.width : rectB.height;
			totalSize = startSizeA + startSizeB;

			resizer.classList.add("is-dragging");
			document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		});
	}
}
