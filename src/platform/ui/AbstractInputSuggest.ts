/**
 * AbstractInputSuggest — autocomplete dropdown attached to an input.
 *
 * Replicates Obsidian's AbstractInputSuggest: listens for input events,
 * renders a positioned dropdown below the input, handles keyboard
 * navigation and mouse selection.
 */

import type { App } from "../core/App.js";

export abstract class AbstractInputSuggest<T> {
	protected app: App;
	protected inputEl: HTMLInputElement | HTMLTextAreaElement;
	private _dropdownEl: HTMLElement | null = null;
	private _items: T[] = [];
	private _selectedIndex = 0;

	constructor(app: App, inputEl: HTMLInputElement | HTMLTextAreaElement) {
		this.app = app;
		this.inputEl = inputEl;

		this.inputEl.addEventListener("input", () => this._onInput());
		this.inputEl.addEventListener("keydown", ((e: KeyboardEvent) => this._onKeydown(e)) as EventListener);
		this.inputEl.addEventListener("blur", () => {
			// Delay close so click events on dropdown fire first
			setTimeout(() => this.close(), 200);
		});
	}

	/** Return suggestions for the current query. */
	abstract getSuggestions(query: string): T[] | Promise<T[]>;

	/** Render a single suggestion item into the provided element. */
	abstract renderSuggestion(item: T, el: HTMLElement): void;

	/** Called when a suggestion is selected. */
	abstract selectSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;

	/** Close the suggestion dropdown. */
	close(): void {
		if (this._dropdownEl) {
			this._dropdownEl.remove();
			this._dropdownEl = null;
		}
	}

	private async _onInput(): Promise<void> {
		const query = this.inputEl.value;
		const suggestions = await this.getSuggestions(query);
		this._items = suggestions;
		this._selectedIndex = 0;
		this._render();
	}

	private _onKeydown(e: KeyboardEvent): void {
		if (!this._dropdownEl) return;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			this._selectedIndex = Math.min(
				this._selectedIndex + 1,
				this._items.length - 1,
			);
			this._updateSelection();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
			this._updateSelection();
		} else if (e.key === "Enter" && this._items.length > 0) {
			e.preventDefault();
			const item = this._items[this._selectedIndex];
			if (item) {
				this.selectSuggestion(item, e);
				this.close();
			}
		} else if (e.key === "Escape") {
			this.close();
		}
	}

	private _render(): void {
		this.close();

		if (this._items.length === 0) return;

		this._dropdownEl = document.createElement("div");
		this._dropdownEl.addClass("suggestion-container");
		this._dropdownEl.style.position = "absolute";
		this._dropdownEl.style.zIndex = "1000";

		// Position below input
		const rect = this.inputEl.getBoundingClientRect();
		this._dropdownEl.style.left = `${rect.left}px`;
		this._dropdownEl.style.top = `${rect.bottom}px`;
		this._dropdownEl.style.width = `${rect.width}px`;
		this._dropdownEl.style.maxHeight = "200px";
		this._dropdownEl.style.overflowY = "auto";

		for (let i = 0; i < this._items.length; i++) {
			const item = this._items[i]!;
			const el = document.createElement("div");
			el.addClass("suggestion-item");
			if (i === this._selectedIndex) el.addClass("is-selected");
			this.renderSuggestion(item, el);
			el.addEventListener("mousedown", (e) => {
				e.preventDefault(); // Prevent blur
				this.selectSuggestion(item, e);
				this.close();
			});
			el.addEventListener("mouseenter", () => {
				this._selectedIndex = i;
				this._updateSelection();
			});
			this._dropdownEl.appendChild(el);
		}

		document.body.appendChild(this._dropdownEl);
	}

	private _updateSelection(): void {
		if (!this._dropdownEl) return;
		const children = this._dropdownEl.children;
		for (let i = 0; i < children.length; i++) {
			children[i]!.classList.toggle("is-selected", i === this._selectedIndex);
		}
		const selected = children[this._selectedIndex];
		if (selected) selected.scrollIntoView({ block: "nearest" });
	}
}
