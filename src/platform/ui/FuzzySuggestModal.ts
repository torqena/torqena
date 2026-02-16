/**
 * FuzzySuggestModal — modal with fuzzy search replicating Obsidian's class.
 *
 * Provides a text input and a scrollable list of items filtered by
 * fuzzy matching on getItemText().
 */

import type { App } from "../core/App.js";
import { Modal } from "./Modal.js";

export abstract class FuzzySuggestModal<T> extends Modal {
	inputEl: HTMLInputElement;
	private _resultEl: HTMLElement;
	private _items: T[] = [];
	private _filteredItems: T[] = [];
	private _selectedIndex = 0;

	constructor(app: App) {
		super(app);
		this.modalEl.addClass("suggestion-modal");

		// Input field
		this.inputEl = document.createElement("input");
		this.inputEl.type = "text";
		this.inputEl.addClass("prompt-input");
		this.contentEl.appendChild(this.inputEl);

		// Results container
		this._resultEl = document.createElement("div");
		this._resultEl.addClass("suggestion-container");
		this.contentEl.appendChild(this._resultEl);

		// Wire up input events
		this.inputEl.addEventListener("input", () => this._onInput());
		this.inputEl.addEventListener("keydown", (e) => this._onKeydown(e));
	}

	/** Set placeholder text on the input. */
	setPlaceholder(placeholder: string): void {
		this.inputEl.placeholder = placeholder;
	}

	/** Override to provide the list of all items. */
	abstract getItems(): T[];

	/** Override to return the text representation for fuzzy matching. */
	abstract getItemText(item: T): string;

	/** Override to handle item selection. */
	abstract onChooseItem(
		item: T,
		evt: MouseEvent | KeyboardEvent,
	): void;

	onOpen(): void {
		this._items = this.getItems();
		this._filteredItems = [...this._items];
		this._renderItems();
		// Focus input after rendering
		requestAnimationFrame(() => this.inputEl.focus());
	}

	private _onInput(): void {
		const query = this.inputEl.value.toLowerCase().trim();
		if (!query) {
			this._filteredItems = [...this._items];
		} else {
			this._filteredItems = this._items.filter((item) =>
				this.getItemText(item).toLowerCase().includes(query),
			);
		}
		this._selectedIndex = 0;
		this._renderItems();
	}

	private _onKeydown(e: KeyboardEvent): void {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			this._selectedIndex = Math.min(
				this._selectedIndex + 1,
				this._filteredItems.length - 1,
			);
			this._updateSelection();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
			this._updateSelection();
		} else if (e.key === "Enter") {
			e.preventDefault();
			const item = this._filteredItems[this._selectedIndex];
			if (item) {
				this.onChooseItem(item, e);
				this.close();
			}
		}
	}

	private _renderItems(): void {
		this._resultEl.empty();
		for (let i = 0; i < this._filteredItems.length; i++) {
			const item = this._filteredItems[i]!;
			const el = document.createElement("div");
			el.addClass("suggestion-item");
			if (i === this._selectedIndex) el.addClass("is-selected");
			el.textContent = this.getItemText(item);
			el.addEventListener("click", (e) => {
				this.onChooseItem(item, e);
				this.close();
			});
			el.addEventListener("mouseenter", () => {
				this._selectedIndex = i;
				this._updateSelection();
			});
			this._resultEl.appendChild(el);
		}
	}

	private _updateSelection(): void {
		const children = this._resultEl.children;
		for (let i = 0; i < children.length; i++) {
			children[i]!.classList.toggle("is-selected", i === this._selectedIndex);
		}
		// Scroll selected into view
		const selected = children[this._selectedIndex];
		if (selected) {
			selected.scrollIntoView({ block: "nearest" });
		}
	}
}
