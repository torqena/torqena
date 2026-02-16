/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module PaneManager
 * @description Manages a tree of split panes, each containing an EditorManager.
 *
 * Supports recursive horizontal/vertical splits, tab drag-and-drop between
 * panes, and collapsing empty panes. Lives inside `.mod-root` and orchestrates
 * multiple EditorManager instances.
 *
 * @since 0.0.27
 */

import { EditorManager } from "./EditorManager.js";
import type { DocumentStats } from "./EditorManager.js";
import type { LayoutManager } from "../layout/LayoutManager.js";
import type { PaneTreeState, PaneNodeState, PaneLeafState, PaneSplitState } from "../shell-settings/WebShellSettings.js";
import { loadSettings, saveSettings } from "../shell-settings/WebShellSettings.js";

/** Direction of a split */
type SplitDirection = "horizontal" | "vertical";

/** A leaf pane that holds an EditorManager */
interface LeafNode {
	type: "leaf";
	id: string;
	element: HTMLElement;
	editorManager: EditorManager;
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
 * Manages the split-pane layout tree inside the center workspace area.
 */
export class PaneManager {
	private container: HTMLElement;
	private vault: any;
	private root: PaneNode;
	private paneCounter = 0;
	private activePaneId: string;

	/** LayoutManager for sidebar delegation (set after construction) */
	private layoutManager: LayoutManager | null = null;

	/** Workspace reference for active-file tracking */
	private _workspace: any = null;

	/** Stats change handler propagated to all leaves */
	private _statsHandler: ((stats: DocumentStats) => void) | null = null;

	/** All leaf panes indexed by ID for fast lookup */
	private leaves: Map<string, LeafNode> = new Map();

	constructor(container: HTMLElement, vault: any) {
		this.container = container;
		this.vault = vault;
		this.container.innerHTML = "";
		this.container.classList.add("ws-pane-root");

		// Create the initial single leaf pane
		const leaf = this.createLeaf();
		this.root = leaf;
		this.activePaneId = leaf.id;
		this.container.appendChild(leaf.element);

		this.setupDropZone(leaf);
	}

	/** Set the LayoutManager so new EditorManagers can delegate sidebar toggle. */
	setLayoutManager(lm: LayoutManager): void {
		this.layoutManager = lm;
		// Propagate to existing leaves
		for (const leaf of this.leaves.values()) {
			leaf.editorManager.setLayoutManager(lm);
		}
	}

	/** Set the Workspace so EditorManagers can track active files. */
	setWorkspace(workspace: any): void {
		this._workspace = workspace;
		for (const leaf of this.leaves.values()) {
			leaf.editorManager.setWorkspace(workspace);
		}
	}

	/** Set a stats change handler on all current and future EditorManagers. */
	setStatsChangeHandler(handler: (stats: DocumentStats) => void): void {
		this._statsHandler = handler;
		for (const leaf of this.leaves.values()) {
			leaf.editorManager.setStatsChangeHandler(handler);
		}
	}

	/** Get the EditorManager for the currently active pane */
	getActiveEditor(): EditorManager {
		const leaf = this.leaves.get(this.activePaneId);
		if (leaf) return leaf.editorManager;
		// Fallback to first available leaf
		const first = this.leaves.values().next().value;
		if (!first) throw new Error("No panes available");
		return first.editorManager;
	}

	/** Get the active pane's ID */
	getActivePaneId(): string {
		return this.activePaneId;
	}

	/** Open a file in the active pane */
	async openFile(filePath: string): Promise<void> {
		const activeLeaf = this.leaves.get(this.activePaneId);
		if (activeLeaf?.editorManager.isBlankTabActive()) {
			await activeLeaf.editorManager.openFile(filePath);
			return;
		}

		const blankLeaf = Array.from(this.leaves.values()).find((leaf) => leaf.editorManager.isBlankTabActive());
		if (blankLeaf) {
			this.setActivePane(blankLeaf.id);
			await blankLeaf.editorManager.openFile(filePath);
			return;
		}

		await this.getActiveEditor().openFile(filePath);
	}

	/** Split the active pane (or a specific pane) in the given direction */
	splitPane(direction: SplitDirection, paneId?: string): void {
		const targetId = paneId || this.activePaneId;
		const leaf = this.leaves.get(targetId);
		if (!leaf) return;

		// Create a new leaf for the new pane
		const newLeaf = this.createLeaf();

		// Replace the leaf with a split node containing the old leaf + new leaf
		const splitEl = document.createElement("div");
		splitEl.className = direction === "horizontal"
			? "ws-pane-split ws-pane-split-h"
			: "ws-pane-split ws-pane-split-v";

		// Create resizer between the two panes
		const resizer = document.createElement("div");
		resizer.className = "ws-pane-resizer";
		resizer.dataset.direction = direction;

		// Move existing leaf into split container
		const parent = leaf.element.parentElement!;
		parent.replaceChild(splitEl, leaf.element);

		splitEl.appendChild(leaf.element);
		splitEl.appendChild(resizer);
		splitEl.appendChild(newLeaf.element);

		// Give panes equal sizes
		if (direction === "horizontal") {
			leaf.element.style.flex = "0 0 50%";
			newLeaf.element.style.flex = "0 0 50%";
			leaf.element.style.width = "";
			newLeaf.element.style.width = "";
			leaf.element.style.height = "";
			newLeaf.element.style.height = "";
		} else {
			leaf.element.style.flex = "0 0 50%";
			newLeaf.element.style.flex = "0 0 50%";
			leaf.element.style.width = "";
			newLeaf.element.style.width = "";
			leaf.element.style.height = "";
			newLeaf.element.style.height = "";
		}

		const splitNode: SplitNode = {
			type: "split",
			id: `split-${++this.paneCounter}`,
			direction,
			element: splitEl,
			children: [leaf, newLeaf],
			resizers: [resizer],
		};

		// Update tree reference
		this.replaceNodeInTree(leaf, splitNode);

		// Wire up resizer drag
		this.initPaneResizer(resizer, splitNode, 0);

		// Setup drop zones for both panes
		this.setupDropZone(newLeaf);

		// Activate the new pane
		this.setActivePane(newLeaf.id);
		this.persistState();
	}

	/** Close a pane. If it's the last one, create a fresh pane. */
	closePane(paneId: string): void {
		if (this.leaves.size <= 1) return; // Don't close the last pane

		const leaf = this.leaves.get(paneId);
		if (!leaf) return;

		// Find the parent split
		const parentSplit = this.findParentSplit(leaf);
		if (!parentSplit) return;

		// Remove the leaf and its adjacent resizer from the split
		const idx = parentSplit.children.indexOf(leaf);
		parentSplit.children.splice(idx, 1);
		leaf.element.remove();

		// Remove the associated resizer
		if (idx < parentSplit.resizers.length) {
			const resizerToRemove = parentSplit.resizers[idx];
			if (resizerToRemove) resizerToRemove.remove();
			parentSplit.resizers.splice(idx, 1);
		} else if (parentSplit.resizers.length > 0) {
			const lastResizer = parentSplit.resizers[parentSplit.resizers.length - 1];
			if (lastResizer) lastResizer.remove();
			parentSplit.resizers.pop();
		}

		this.leaves.delete(paneId);

		// If only one child remains, promote it up
		if (parentSplit.children.length === 1) {
			const remaining = parentSplit.children[0];
			if (remaining) {
				const grandparent = parentSplit.element.parentElement!;
				grandparent.replaceChild(remaining.element, parentSplit.element);

				// Clear inline sizing from promotion
				remaining.element.style.flex = "1 1 0";
				remaining.element.style.width = "";
				remaining.element.style.height = "";

				this.replaceNodeInTree(parentSplit, remaining);
			}
		}

		// Give remaining children equal sizes
		if (parentSplit.children.length > 1) {
			const size = `${100 / parentSplit.children.length}%`;
			for (const child of parentSplit.children) {
				child.element.style.flex = `0 0 ${size}`;
			}
		}

		// Activate another pane
		if (this.activePaneId === paneId) {
			const firstLeaf = this.leaves.values().next().value;
			if (firstLeaf) this.setActivePane(firstLeaf.id);
		}
		this.persistState();
	}

	/** Set the active pane by ID */
	setActivePane(paneId: string): void {
		this.activePaneId = paneId;
		for (const [id, leaf] of this.leaves) {
			leaf.element.classList.toggle("ws-pane-active", id === paneId);
		}
	}

	/** Move a tab from one pane to another */
	async moveTab(fromPaneId: string, toPaneId: string, filePath: string): Promise<void> {
		const fromLeaf = this.leaves.get(fromPaneId);
		const toLeaf = this.leaves.get(toPaneId);
		if (!fromLeaf || !toLeaf || fromPaneId === toPaneId) return;

		const tabState = fromLeaf.editorManager.exportTab(filePath);
		if (!tabState) return;

		await toLeaf.editorManager.importTab(tabState);
		this.setActivePane(toPaneId);
		this.persistState();
	}

	// ---- State Persistence ----

	/** Serialize the entire pane tree to a JSON-safe state object. */
	serializeTree(): PaneTreeState {
		return {
			root: this.serializeNode(this.root),
			activePaneId: this.activePaneId,
		};
	}

	/** Save the pane tree state to localStorage. */
	persistState(): void {
		const settings = loadSettings();
		settings.paneTree = this.serializeTree();
		saveSettings(settings);
	}

	/**
	 * Restore the pane tree from saved state. Re-opens files asynchronously.
	 * Should be called after construction, before user interaction.
	 */
	async restoreState(): Promise<void> {
		const settings = loadSettings();
		const saved = settings.paneTree;
		if (!saved || !saved.root) return;

		// Tear down the default single leaf created in constructor
		this.container.innerHTML = "";
		this.leaves.clear();
		this.paneCounter = 0;

		// Recursively rebuild
		const root = await this.restoreNode(saved.root);
		this.root = root;
		this.container.appendChild(root.element);

		// Restore active pane
		if (saved.activePaneId && this.leaves.has(saved.activePaneId)) {
			this.setActivePane(saved.activePaneId);
		} else {
			const first = this.leaves.values().next().value;
			if (first) this.setActivePane(first.id);
		}
	}

	/** Serialize a single node recursively. */
	private serializeNode(node: PaneNode): PaneNodeState {
		if (node.type === "leaf") {
			const leaf = node as LeafNode;
			return {
				type: "leaf",
				id: leaf.id,
				openTabs: leaf.editorManager.getOpenTabPaths(),
				activeTab: leaf.editorManager.getActiveFilePath(),
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

	/** Restore a single node recursively. */
	private async restoreNode(state: PaneNodeState): Promise<PaneNode> {
		if (state.type === "leaf") {
			const leafState = state as PaneLeafState;
			const leaf = this.createLeaf();

			// Re-open each saved tab
			for (const tabPath of leafState.openTabs) {
				try {
					await leaf.editorManager.openFile(tabPath);
				} catch {
					// File may have been deleted — skip silently
				}
			}
			// Activate the previously active tab
			if (leafState.activeTab) {
				try {
					await leaf.editorManager.openFile(leafState.activeTab);
				} catch { /* skip */ }
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

			// Apply saved flex size
			const savedSize = splitState.sizes[i];
			if (savedSize) {
				child.element.style.flex = savedSize;
			}

			if (i > 0) {
				// Add resizer between children
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

		// Wire resizers
		for (let i = 0; i < resizers.length; i++) {
			const resizer = resizers[i];
			if (resizer) {
				this.initPaneResizer(resizer, splitNode, i);
			}
		}

		return splitNode;
	}

	// ---- Private helpers ----

	/** Create a new leaf pane with its own EditorManager */
	private createLeaf(): LeafNode {
		const id = `pane-${++this.paneCounter}`;
		const element = document.createElement("div");
		element.className = "ws-pane-leaf";
		element.dataset.paneId = id;

		const editorManager = new EditorManager(element, this.vault);
		editorManager.paneId = id;
		if (this.layoutManager) {
			editorManager.setLayoutManager(this.layoutManager);
		}
		if (this._workspace) {
			editorManager.setWorkspace(this._workspace);
		}
		if (this._statsHandler) {
			editorManager.setStatsChangeHandler(this._statsHandler);
		}
		editorManager.setCloseLastTabHandler(() => {
			if (this.leaves.size > 1) {
				this.closePane(id);
			}
		});

		// Track focus — when user clicks inside a pane, make it active
		element.addEventListener("mousedown", () => {
			this.setActivePane(id);
		}, true);

		const leaf: LeafNode = { type: "leaf", id, element, editorManager };
		this.leaves.set(id, leaf);

		// Wire split controls on the kebab/breadcrumb
		this.wireSplitControls(leaf);

		return leaf;
	}

	/** Wire the pane menu button in the tab header to show split options */
	private wireSplitControls(leaf: LeafNode): void {
		const btn = leaf.editorManager.paneMenuBtn;
		if (!btn) return;
		leaf.editorManager.setPaneMenuHandler(() => {
			this.showPaneMenu(btn, leaf.id);
		});
	}

	/** Show the pane action menu (split, close) */
	private showPaneMenu(anchor: HTMLElement, paneId: string): void {
		// Remove any existing menu
		const existing = document.querySelector(".ws-pane-menu");
		if (existing) existing.remove();

		const menu = document.createElement("div");
		menu.className = "menu ws-pane-menu";
		menu.style.position = "fixed";
		menu.style.zIndex = "10001";

		const leaf = this.leaves.get(paneId);
		const activeFile = leaf?.editorManager.getActiveFilePath() || null;
		type MenuItem = {
			label?: string;
			icon?: string;
			action?: () => void | Promise<void>;
			disabled?: boolean;
			separator?: boolean;
			check?: boolean;
		};
		const items: MenuItem[] = [];

		if (activeFile && leaf) {
			const mode = leaf.editorManager.getActiveTabMode();

			// Source mode option
			items.push({
				label: "Source mode",
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
				check: mode === "source",
				action: () => leaf.editorManager.setActiveTabMode("source"),
			});

			// Live Preview option
			items.push({
				label: "Live Preview",
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
				check: mode === "live-preview",
				action: () => leaf.editorManager.setActiveTabMode("live-preview"),
			});

			// Reading view option
			items.push({
				label: "Reading view",
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
				check: mode === "reading",
				action: () => leaf.editorManager.setActiveTabMode("reading"),
			});

			items.push({ separator: true });
		}

		items.push(
			{ label: "Split right", icon: this.getSplitIcon("horizontal"), action: () => this.splitPane("horizontal", paneId) },
			{ label: "Split down", icon: this.getSplitIcon("vertical"), action: () => this.splitPane("vertical", paneId) },
		);

		if (activeFile && leaf) {
			items.push({
				label: "Open in new window",
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>`,
				action: () => leaf.editorManager.popOutActiveTab(),
			});
			items.push({ separator: true });
			items.push(
				{ label: "Rename...", icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`, disabled: true },
				{ label: "Move file to...", icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h6l2 2h10v11H3z"/></svg>`, disabled: true },
				{ label: "Bookmark...", icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`, disabled: true },
				{ label: "Add file property", icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`, disabled: true },
				{ separator: true },
				{ label: "Find...", icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`, disabled: true },
				{ label: "Replace...", icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/><path d="M21 8a9 9 0 0 0-15-4"/><path d="M3 16a9 9 0 0 0 15 4"/></svg>`, disabled: true },
			);
		}

		// Add close option if more than one pane
		if (this.leaves.size > 1) {
			items.push({
				label: "Close pane",
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
				action: () => this.closePane(paneId),
			});
		}

		for (const item of items) {
			if (item.separator) {
				const sep = document.createElement("div");
				sep.className = "menu-separator";
				menu.appendChild(sep);
				continue;
			}
			const row = document.createElement("div");
			row.className = "menu-item";
			if (item.disabled) row.classList.add("is-disabled");
			const checkHtml = item.check
				? `<span class="menu-item-check"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>`
				: "";
			row.innerHTML = `${checkHtml}<span class="menu-item-icon">${item.icon || ""}</span><span>${item.label || ""}</span>`;
			row.addEventListener("click", () => {
				if (item.disabled || !item.action) return;
				menu.remove();
				cleanup();
				item.action();
			});
			menu.appendChild(row);
		}

		document.body.appendChild(menu);

		// Position near anchor
		const rect = anchor.getBoundingClientRect();
		menu.style.top = `${rect.bottom + 4}px`;
		menu.style.left = `${rect.right - menu.offsetWidth}px`;

		// Clamp to viewport
		const menuRect = menu.getBoundingClientRect();
		if (menuRect.left < 4) menu.style.left = "4px";
		if (menuRect.bottom > window.innerHeight - 4) {
			menu.style.top = `${rect.top - menu.offsetHeight - 4}px`;
		}

		const cleanup = () => {
			document.removeEventListener("mousedown", onClickOutside);
		};
		const onClickOutside = (ev: MouseEvent) => {
			if (!menu.contains(ev.target as Node)) {
				menu.remove();
				cleanup();
			}
		};
		setTimeout(() => document.addEventListener("mousedown", onClickOutside), 0);
	}

	/** SVG icons for split directions */
	private getSplitIcon(direction: SplitDirection): string {
		if (direction === "horizontal") {
			return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`;
		}
		return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>`;
	}

	/** Replace a node in the tree with a new one */
	private replaceNodeInTree(oldNode: PaneNode, newNode: PaneNode): void {
		if (this.root === oldNode) {
			this.root = newNode;
			return;
		}
		this.replaceInChildren(this.root, oldNode, newNode);
	}

	/** Recursively find and replace a child node */
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

	/** Find the parent split of a given node */
	private findParentSplit(target: PaneNode): SplitNode | null {
		return this.findParentSplitRecursive(this.root, target);
	}

	private findParentSplitRecursive(node: PaneNode, target: PaneNode): SplitNode | null {
		if (node.type !== "split") return null;
		for (const child of node.children) {
			if (child === target) return node;
			const found = this.findParentSplitRecursive(child, target);
			if (found) return found;
		}
		return null;
	}

	/** Initialize drag behavior on a pane resizer */
	private initPaneResizer(resizer: HTMLElement, splitNode: SplitNode, index: number): void {
		const isHorizontal = splitNode.direction === "horizontal";
		const minPaneSizePx = 30;
		let startPos = 0;
		let startSizeA = 0;
		let startSizeB = 0;
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
			startSizeB = isHorizontal ? rectB.width : rectB.height;
			totalSize = startSizeA + startSizeB;

			resizer.classList.add("is-dragging");
			document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		});
	}

	/** Setup a pane as a drop zone for tab drag-and-drop */
	private setupDropZone(leaf: LeafNode): void {
		const el = leaf.element;

		el.addEventListener("dragover", (e: DragEvent) => {
			if (!e.dataTransfer?.types.includes("text/x-pane-tab")) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";

			// Detect edge zones for split-on-drop
			const rect = el.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			const edgeThreshold = Math.min(rect.width, rect.height) * 0.2;

			const isEdge = x < edgeThreshold || x > rect.width - edgeThreshold
				|| y < edgeThreshold || y > rect.height - edgeThreshold;

			// For same-pane drags, only show indicator on edges (to create a split)
			const dragData = e.dataTransfer.types.includes("text/x-pane-tab");
			if (dragData && !isEdge) {
				// Peek at fromPaneId — if same pane and center zone, skip
				// (can't read data during dragover, so use a class marker set during dragenter)
			}

			// Show drop indicator
			el.classList.add("ws-pane-drop-target");

			el.classList.remove("ws-drop-left", "ws-drop-right", "ws-drop-top", "ws-drop-bottom", "ws-drop-center");
			if (x < edgeThreshold) el.classList.add("ws-drop-left");
			else if (x > rect.width - edgeThreshold) el.classList.add("ws-drop-right");
			else if (y < edgeThreshold) el.classList.add("ws-drop-top");
			else if (y > rect.height - edgeThreshold) el.classList.add("ws-drop-bottom");
			else el.classList.add("ws-drop-center");
		});

		el.addEventListener("dragleave", () => {
			el.classList.remove("ws-pane-drop-target", "ws-drop-left", "ws-drop-right", "ws-drop-top", "ws-drop-bottom", "ws-drop-center");
		});

		el.addEventListener("drop", async (e: DragEvent) => {
			el.classList.remove("ws-pane-drop-target", "ws-drop-left", "ws-drop-right", "ws-drop-top", "ws-drop-bottom", "ws-drop-center");
			if (!e.dataTransfer) return;

			const data = e.dataTransfer.getData("text/x-pane-tab");
			if (!data) return;
			e.preventDefault();

			const { fromPaneId, filePath, blankTabId } = JSON.parse(data);
			const fromLeaf = this.leaves.get(fromPaneId);
			const isExternalFileDrop = !!filePath && !fromLeaf;

			// Detect which zone was dropped on
			const rect = el.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			const edgeThreshold = Math.min(rect.width, rect.height) * 0.2;

			const isEdge = x < edgeThreshold || x > rect.width - edgeThreshold
				|| y < edgeThreshold || y > rect.height - edgeThreshold;

			// Same-pane center drop is a no-op (just reordering within same pane)
			if (fromPaneId === leaf.id && !isEdge) return;

			if (isEdge) {
				// Edge drop — split and move
				let direction: SplitDirection;
				if (x < edgeThreshold || x > rect.width - edgeThreshold) {
					direction = "horizontal";
				} else {
					direction = "vertical";
				}

				if (isExternalFileDrop) {
					this.splitPane(direction, leaf.id);
					const newLeaf = this.leaves.get(this.activePaneId);
					if (newLeaf) {
						await newLeaf.editorManager.openFile(filePath);
					}
					return;
				}

				// Export tab from source pane (could be the same pane)
				if (!fromLeaf) return;
				const isBlank = typeof blankTabId === "string" && !filePath;
				let tabState: ReturnType<EditorManager["exportTab"]> | null = null;
				if (!isBlank) {
					tabState = fromLeaf.editorManager.exportTab(filePath);
					if (!tabState) return;
				} else if (!fromLeaf.editorManager.removeBlankTabForTransfer(blankTabId)) {
					return;
				}

				// Split the target pane
				this.splitPane(direction, leaf.id);

				// The new pane is the active pane after split — import into it
				const newLeaf = this.leaves.get(this.activePaneId);
				if (newLeaf) {
					if (tabState) {
						await newLeaf.editorManager.importTab(tabState);
					} else {
						newLeaf.editorManager.createBlankTab();
					}
				}
			} else {
				if (isExternalFileDrop) {
					await leaf.editorManager.openFile(filePath);
					this.setActivePane(leaf.id);
					return;
				}

				// Center drop on a different pane — move tab there
				const isBlank = typeof blankTabId === "string" && !filePath;
				if (isBlank) {
					if (!fromLeaf) return;
					if (!fromLeaf.editorManager.removeBlankTabForTransfer(blankTabId)) return;
					leaf.editorManager.createBlankTab();
					this.setActivePane(leaf.id);
				} else {
					await this.moveTab(fromPaneId, leaf.id, filePath);
				}
			}
		});
	}
}
