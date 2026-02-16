/**
 * Modal — overlay dialog replicating Obsidian's Modal class.
 *
 * Creates a backdrop with a centered modal box containing titleEl
 * and contentEl. Dismisses on ESC or clicking the backdrop.
 */

import type { App } from "../core/App.js";

export class Modal {
	app: App;

	/** Overlay backdrop element. */
	containerEl: HTMLElement;

	/** The modal box element. */
	modalEl: HTMLElement;

	/** Title bar inside the modal. */
	titleEl: HTMLElement;

	/** Content area inside the modal. */
	contentEl: HTMLElement;

	/** Close button element. */
	private _closeButton: HTMLElement;

	/** Bound ESC handler for cleanup. */
	private _escHandler: (e: KeyboardEvent) => void;

	/** Scope for hotkey registration (minimal stub). */
	scope: any = { register: () => {} };

	constructor(app: App) {
		this.app = app;

		// Create DOM structure
		this.containerEl = document.createElement("div");
		this.containerEl.addClass("modal-container");

		const bg = document.createElement("div");
		bg.addClass("modal-bg");
		bg.style.opacity = "0.85";
		bg.addEventListener("click", () => this.close());
		this.containerEl.appendChild(bg);

		this.modalEl = document.createElement("div");
		this.modalEl.addClass("modal");
		this.containerEl.appendChild(this.modalEl);

		this.titleEl = document.createElement("div");
		this.titleEl.addClass("modal-title");
		this.modalEl.appendChild(this.titleEl);

		this.contentEl = document.createElement("div");
		this.contentEl.addClass("modal-content");
		this.modalEl.appendChild(this.contentEl);

		this._closeButton = document.createElement("div");
		this._closeButton.addClass("modal-close-button");
		this._closeButton.textContent = "\u00D7"; // ×
		this._closeButton.addEventListener("click", () => this.close());
		this.modalEl.appendChild(this._closeButton);

		this._escHandler = (e: KeyboardEvent) => {
			if (e.key === "Escape") this.close();
		};
	}

	/** Show the modal. */
	open(): void {
		document.body.appendChild(this.containerEl);
		document.addEventListener("keydown", this._escHandler);
		this.onOpen();
	}

	/** Hide and destroy the modal. */
	close(): void {
		this.onClose();
		document.removeEventListener("keydown", this._escHandler);
		this.containerEl.remove();
	}

	/** Override in subclass to populate contentEl. */
	onOpen(): void {}

	/** Override in subclass for cleanup. */
	onClose(): void {}
}
