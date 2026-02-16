/**
 * WorkspaceLeaf — a container for a single view in the workspace layout.
 *
 * Replicates Obsidian's WorkspaceLeaf: hosts an ItemView, manages
 * view state transitions, and provides the containerEl for rendering.
 */

import type { ItemView } from "../ui/ItemView.js";
import type { TFile } from "../vault/TFile.js";
import type { App } from "../core/App.js";

/** View factory registered via Plugin.registerView(). */
export type ViewCreator = (leaf: WorkspaceLeaf) => ItemView;

/** Global registry of view factories, populated by Plugin.registerView(). */
export const viewRegistry: Map<string, ViewCreator> = new Map();

export class WorkspaceLeaf {
	/** The view currently rendered in this leaf. */
	view!: ItemView;

	/** The App instance. Available on all leaves in Obsidian. */
	app!: App;

	/** DOM container for the leaf. Created by Workspace when the leaf is allocated. */
	containerEl: HTMLElement;

	/** The zone this leaf belongs to ("left" | "center" | "right"). */
	_zone: "left" | "center" | "right";

	constructor(zone: "left" | "center" | "right" = "center") {
		this._zone = zone;
		this.containerEl = document.createElement("div");
		this.containerEl.addClass("workspace-leaf");
	}

	/**
	 * Set the view type rendered in this leaf.
	 * Looks up the view factory from the global registry and instantiates it.
	 */
	async setViewState(state: {
		type: string;
		active?: boolean;
		state?: any;
	}): Promise<void> {
		// Tear down existing view
		if (this.view) {
			await this.view.onClose();
			this.containerEl.empty();
		}

		const factory = viewRegistry.get(state.type);
		if (!factory) {
			console.warn(
				`[obsidian-shim] No view registered for type "${state.type}"`,
			);
			return;
		}

		// Build the containerEl structure Obsidian uses:
		// children[0] = view header, children[1] = content area
		const headerEl = document.createElement("div");
		headerEl.addClass("view-header");
		this.containerEl.appendChild(headerEl);

		const contentEl = document.createElement("div");
		contentEl.addClass("view-content");
		this.containerEl.appendChild(contentEl);

		try {
			const view = factory(this);
			this.view = view;

			// Assign to the view
			(view as any).containerEl = this.containerEl;
			(view as any).contentEl = contentEl;
			(view as any).leaf = this;

			await view.onOpen();
		} catch (err: any) {
			console.error(`[obsidian-shim] Error creating view "${state.type}":`, err);
			contentEl.innerHTML = `<div style="padding: 1em; color: var(--text-error, #e93147);">
				<p><strong>View Error</strong></p>
				<p>${err?.message || err}</p>
			</div>`;
		}
	}

	/** Open a file in this leaf (no-op in web shim — no markdown editor). */
	async openFile(_file: TFile): Promise<void> {
		// No markdown editor in web shim
	}

	/** Detach this leaf from the workspace. */
	detach(): void {
		if (this.view) {
			this.view.onClose();
		}
		this.containerEl.remove();
	}

	/** Get the current view state. */
	getViewState(): { type: string; state?: any } {
		return {
			type: this.view?.getViewType() || "",
		};
	}
}
