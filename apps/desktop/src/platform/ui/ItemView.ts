/**
 * ItemView — abstract base class for plugin views.
 *
 * Replicates Obsidian's ItemView which provides containerEl/contentEl
 * and lifecycle hooks (onOpen/onClose).
 */

import { Component } from "../core/Component.js";
import type { App } from "../core/App.js";
import type { WorkspaceLeaf } from "../workspace/WorkspaceLeaf.js";

export abstract class ItemView extends Component {
	app: App;
	leaf: WorkspaceLeaf;

	/**
	 * Root DOM element for this view. Contains two children:
	 * [0] = view-header, [1] = view-content (contentEl).
	 */
	containerEl: HTMLElement;

	/** Content area element (containerEl.children[1]). */
	contentEl: HTMLElement;

	constructor(leaf: WorkspaceLeaf) {
		super();
		this.leaf = leaf;
		this.app = (leaf as any).app || ((leaf as any).view?.app);
		// containerEl and contentEl are set by WorkspaceLeaf.setViewState()
		this.containerEl = document.createElement("div");
		this.contentEl = document.createElement("div");
	}

	/** Unique type identifier for this view. */
	abstract getViewType(): string;

	/** Human-readable display name. */
	abstract getDisplayText(): string;

	/** Lucide icon name for tabs/headers. */
	getIcon(): string {
		return "file";
	}

	/** Called when the view is opened. Override for initialization. */
	async onOpen(): Promise<void> {}

	/** Called when the view is closed. Override for cleanup. */
	async onClose(): Promise<void> {}

	/**
	 * Get view state for persistence.
	 * Override to include custom state.
	 */
	getState(): any {
		return {};
	}

	/**
	 * Restore view state.
	 * Override to apply custom state.
	 */
	async setState(_state: any, _result: any): Promise<void> {}
}

/**
 * MarkdownView — stub for getActiveViewOfType(MarkdownView) checks.
 *
 * The web shim has no markdown editor, so this is never instantiated.
 * Exists only so instanceof checks and type references compile.
 */
export class MarkdownView extends ItemView {
	editor: { getSelection(): string } = {
		getSelection: () => "",
	};

	getViewType(): string {
		return "markdown";
	}

	getDisplayText(): string {
		return "";
	}
}

/** Result type for setState. */
export interface ViewStateResult {
	type: string;
	state?: any;
}
