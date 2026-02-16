/**
 * Workspace — manages leaves (view containers) across layout zones.
 *
 * Replicates Obsidian's Workspace: left sidebar, center, right sidebar.
 * Manages view lifecycle and active-file tracking.
 */

import { Events } from "../core/Events.js";
import type { App } from "../core/App.js";
import type { ItemView } from "../ui/ItemView.js";
import type { TFile } from "../vault/TFile.js";
import { WorkspaceLeaf } from "./WorkspaceLeaf.js";

export class Workspace extends Events {
	/** DOM element for the left sidebar. */
	leftSplit: HTMLElement;

	/** DOM element for the center (root) area. */
	rootSplit: HTMLElement;

	/** DOM element for the right sidebar. */
	rightSplit: HTMLElement;

	/** All managed leaves. */
	private _leaves: WorkspaceLeaf[] = [];

	/** Currently active file. */
	private _activeFile: TFile | null = null;

	/** App instance, set after construction. */
	app!: App;

	constructor(containerEl: HTMLElement | null) {
		super();
		// If a container element is provided, look for layout zones inside it.
		// Otherwise create detached placeholders.
		if (containerEl) {
			this.leftSplit =
				containerEl.querySelector(".mod-left-split") ||
				document.createElement("div");
			this.rootSplit =
				containerEl.querySelector(".mod-root") ||
				document.createElement("div");
			this.rightSplit =
				containerEl.querySelector(".mod-right-split") ||
				document.createElement("div");
		} else {
			this.leftSplit = document.createElement("div");
			this.rootSplit = document.createElement("div");
			this.rightSplit = document.createElement("div");
		}
	}

	/** Get the currently active file. */
	getActiveFile(): TFile | null {
		return this._activeFile;
	}

	/** Set the active file (called internally or by the web shell). */
	setActiveFile(file: TFile | null): void {
		this._activeFile = file;
		this.trigger("file-open", file);
	}

	/** Find all leaves whose view matches the given type string. */
	getLeavesOfType(viewType: string): WorkspaceLeaf[] {
		return this._leaves.filter(
			(leaf) => leaf.view && leaf.view.getViewType() === viewType,
		);
	}

	/** Helper to create a leaf with app reference. */
	private _createLeaf(zone: "left" | "center" | "right"): WorkspaceLeaf {
		const leaf = new WorkspaceLeaf(zone);
		leaf.app = this.app;
		return leaf;
	}

	/** Create a new leaf in the center zone. */
	getLeaf(newTab?: boolean | "window"): WorkspaceLeaf {
		if (newTab) {
			const leaf = this._createLeaf("center");
			this._leaves.push(leaf);
			this.rootSplit.appendChild(leaf.containerEl);
			return leaf;
		}
		// Reuse existing center leaf or create one
		const existing = this._leaves.find((l) => l._zone === "center");
		if (existing) return existing;
		const leaf = this._createLeaf("center");
		this._leaves.push(leaf);
		this.rootSplit.appendChild(leaf.containerEl);
		return leaf;
	}

	/** Get (or create) a leaf in the right sidebar. */
	getRightLeaf(shouldSplit: boolean): WorkspaceLeaf {
		const existing = this._leaves.find((l) => l._zone === "right");
		if (existing && !shouldSplit) return existing;
		const leaf = this._createLeaf("right");
		this._leaves.push(leaf);
		// Append after the tab header if present, otherwise directly to rightSplit
		const rightContent =
			this.rightSplit.querySelector(".ws-right-content") || this.rightSplit;
		rightContent.appendChild(leaf.containerEl);
		return leaf;
	}

	/** Get (or create) a leaf in the left sidebar. */
	getLeftLeaf(shouldSplit: boolean): WorkspaceLeaf {
		const existing = this._leaves.find((l) => l._zone === "left");
		if (existing && !shouldSplit) return existing;
		const leaf = this._createLeaf("left");
		this._leaves.push(leaf);
		// Append to .ws-left-content if available, otherwise leftSplit directly
		const target = this.leftSplit.querySelector(".ws-left-content") || this.leftSplit;
		target.appendChild(leaf.containerEl);
		return leaf;
	}

	/** Make a leaf visible and active. */
	revealLeaf(leaf: WorkspaceLeaf): void {
		// Show the zone containing this leaf
		const zone =
			leaf._zone === "left"
				? this.leftSplit
				: leaf._zone === "right"
					? this.rightSplit
					: this.rootSplit;
		zone.style.display = "";
		leaf.containerEl.style.display = "";
		this.trigger("layout-change");
	}

	/** Open a link in the workspace (resolve note link and open). */
	async openLinkText(
		_linktext: string,
		_sourcePath: string,
	): Promise<void> {
		// Minimal implementation: no-op in web shim
	}

	/** Get the active view of a specific type. */
	getActiveViewOfType<T extends ItemView>(
		type: new (...args: any[]) => T,
	): T | null {
		for (const leaf of this._leaves) {
			if (leaf.view && leaf.view instanceof type) {
				return leaf.view as T;
			}
		}
		return null;
	}

	/** Whether layout-ready has been triggered. */
	private _layoutReady = false;

	/** Trigger the layout-ready event (called after bootstrap). */
	layoutReady(): void {
		this._layoutReady = true;
		this.trigger("layout-ready");
	}

	/**
	 * Register a callback for when the layout is ready.
	 * If already ready, calls the callback immediately.
	 */
	onLayoutReady(callback: () => void): void {
		if (this._layoutReady) {
			callback();
		} else {
			this.on("layout-ready", callback);
		}
	}
}
