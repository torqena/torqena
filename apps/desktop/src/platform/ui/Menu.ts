/**
 * Menu — context menu replicating Obsidian's Menu class.
 *
 * Creates a positioned popup with menu items. Dismisses on click-outside
 * or ESC.
 */

import { setIcon } from "../utils/icons.js";

export class MenuItem {
	private _el: HTMLElement;
	private _disabled = false;

	constructor(parentEl: HTMLElement) {
		this._el = document.createElement("div");
		this._el.addClass("menu-item");
		parentEl.appendChild(this._el);
	}

	setTitle(title: string): this {
		// Preserve existing icon span if present
		const existing = this._el.querySelector(".menu-item-icon");
		const titleSpan =
			(this._el.querySelector(".menu-item-title") as HTMLElement) ||
			document.createElement("span");
		titleSpan.addClass("menu-item-title");
		titleSpan.textContent = title;
		if (!titleSpan.parentElement) {
			this._el.appendChild(titleSpan);
		}
		return this;
	}

	setIcon(icon: string): this {
		let iconEl = this._el.querySelector(
			".menu-item-icon",
		) as HTMLElement | null;
		if (!iconEl) {
			iconEl = document.createElement("span");
			iconEl.addClass("menu-item-icon");
			this._el.prepend(iconEl);
		}
		setIcon(iconEl, icon);
		return this;
	}

	onClick(callback: (evt: MouseEvent | KeyboardEvent) => any): this {
		this._el.addEventListener("click", (e) => {
			if (this._disabled) return;
			callback(e);
		});
		return this;
	}

	setSection(_section: string): this {
		// Sections are used for grouping; minimal impl
		return this;
	}

	setDisabled(disabled: boolean): this {
		this._disabled = disabled;
		this._el.toggleClass("is-disabled", disabled);
		return this;
	}

	setChecked(checked: boolean): this {
		this._el.toggleClass("is-selected", checked);
		return this;
	}
}

export class Menu {
	private _menuEl: HTMLElement;
	private _items: MenuItem[] = [];
	private _dismissHandler: (e: MouseEvent) => void;
	private _escHandler: (e: KeyboardEvent) => void;
	private _shown = false;

	constructor() {
		this._menuEl = document.createElement("div");
		this._menuEl.addClass("menu");

		this._dismissHandler = (e: MouseEvent) => {
			if (!this._menuEl.contains(e.target as Node)) {
				this.hide();
			}
		};

		this._escHandler = (e: KeyboardEvent) => {
			if (e.key === "Escape") this.hide();
		};
	}

	/** Add a menu item via callback. */
	addItem(cb: (item: MenuItem) => any): this {
		const item = new MenuItem(this._menuEl);
		this._items.push(item);
		cb(item);
		return this;
	}

	/** Add a visual separator. */
	addSeparator(): this {
		const sep = document.createElement("div");
		sep.addClass("menu-separator");
		this._menuEl.appendChild(sep);
		return this;
	}

	/** Show the menu at the position of a mouse event. */
	showAtMouseEvent(event: MouseEvent): void {
		event.preventDefault();
		this.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	/** Show the menu at an explicit position. */
	showAtPosition(position: { x: number; y: number }): void {
		this._menuEl.style.position = "fixed";
		this._menuEl.style.left = `${position.x}px`;
		this._menuEl.style.top = `${position.y}px`;
		this._menuEl.style.zIndex = "1000";

		document.body.appendChild(this._menuEl);
		this._shown = true;

		// Auto-dismiss on click outside, after a microtask to avoid
		// the current click event from dismissing immediately
		requestAnimationFrame(() => {
			document.addEventListener("click", this._dismissHandler, true);
			document.addEventListener("keydown", this._escHandler);
		});

		// Ensure menu stays within viewport
		requestAnimationFrame(() => {
			const rect = this._menuEl.getBoundingClientRect();
			if (rect.right > window.innerWidth) {
				this._menuEl.style.left = `${window.innerWidth - rect.width - 8}px`;
			}
			if (rect.bottom > window.innerHeight) {
				this._menuEl.style.top = `${window.innerHeight - rect.height - 8}px`;
			}
		});
	}

	/** Hide and remove the menu. */
	hide(): void {
		if (!this._shown) return;
		this._shown = false;
		document.removeEventListener("click", this._dismissHandler, true);
		document.removeEventListener("keydown", this._escHandler);
		this._menuEl.remove();
	}
}
