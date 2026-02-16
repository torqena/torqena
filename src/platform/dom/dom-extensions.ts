/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module dom-extensions
 * @description DOM prototype extensions for convenient element creation.
 *
 * Adds helper methods like createDiv, createEl, createSpan, empty, addClass,
 * removeClass, and setText to HTMLElement.prototype. These methods provide
 * a fluent API for DOM manipulation.
 *
 * Call {@link initDomExtensions} once at startup before any UI code runs.
 *
 * @example
 * ```typescript
 * import { initDomExtensions } from '../platform/dom/dom-extensions';
 *
 * // Initialize at app startup
 * initDomExtensions();
 *
 * // Then use anywhere
 * const container = document.createElement('div');
 * const header = container.createEl('h2', { text: 'Title', cls: 'header' });
 * const content = container.createDiv({ cls: 'content' });
 * content.setText('Hello World');
 * ```
 *
 * @since 0.1.0
 */

/**
 * Options for creating DOM elements.
 */
export interface DomElementInfo {
	/** CSS class name(s) to add */
	cls?: string | string[];
	/** Text content */
	text?: string;
	/** Additional attributes */
	attr?: Record<string, string>;
	/** Title attribute (tooltip) */
	title?: string;
	/** Placeholder for input elements */
	placeholder?: string;
	/** Type for input elements */
	type?: string;
	/** Value for input/textarea elements */
	value?: string;
	/** Href for anchor elements */
	href?: string;
	/** If true, prepend instead of append */
	prepend?: boolean;
	/** Parent element (not commonly used) */
	parent?: HTMLElement;
}

/**
 * Apply options to an element.
 * @internal
 */
function applyOptions(el: HTMLElement, options?: DomElementInfo | string): void {
	if (!options) return;
	if (typeof options === "string") {
		el.className = options;
		return;
	}
	if (options.cls) {
		if (Array.isArray(options.cls)) {
			el.classList.add(...options.cls);
		} else {
			el.className = options.cls;
		}
	}
	if (options.text) {
		el.textContent = options.text;
	}
	if (options.title) {
		el.setAttribute("title", options.title);
	}
	if (options.attr) {
		for (const [key, val] of Object.entries(options.attr)) {
			el.setAttribute(key, val);
		}
	}
	if (options.placeholder && el instanceof HTMLInputElement) {
		el.placeholder = options.placeholder;
	}
	if (options.type && el instanceof HTMLInputElement) {
		el.type = options.type;
	}
	if (options.value) {
		if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
			el.value = options.value;
		}
	}
	if (options.href && el instanceof HTMLAnchorElement) {
		el.href = options.href;
	}
}

/**
 * Install DOM helper methods on HTMLElement.prototype.
 *
 * Safe to call multiple times; subsequent calls are no-ops.
 * Call this once at application startup.
 *
 * @example
 * ```typescript
 * // In your main.ts or app initialization
 * import { initDomExtensions } from './platform/dom/dom-extensions';
 * initDomExtensions();
 * ```
 */
export function initDomExtensions(): void {
	if ((HTMLElement.prototype as any).__nativeDomInstalled) return;
	(HTMLElement.prototype as any).__nativeDomInstalled = true;

	HTMLElement.prototype.createDiv = function (
		this: HTMLElement,
		options?: DomElementInfo | string,
	): HTMLDivElement {
		const div = document.createElement("div");
		applyOptions(div, options);
		if (options && typeof options === "object" && options.prepend) {
			this.prepend(div);
		} else {
			this.appendChild(div);
		}
		return div;
	};

	HTMLElement.prototype.createSpan = function (
		this: HTMLElement,
		options?: DomElementInfo | string,
	): HTMLSpanElement {
		const span = document.createElement("span");
		applyOptions(span, options);
		if (options && typeof options === "object" && options.prepend) {
			this.prepend(span);
		} else {
			this.appendChild(span);
		}
		return span;
	};

	HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
		this: HTMLElement,
		tag: K,
		options?: DomElementInfo | string,
	): HTMLElementTagNameMap[K] {
		const el = document.createElement(tag);
		applyOptions(el, options);
		if (options && typeof options === "object" && options.prepend) {
			this.prepend(el);
		} else {
			this.appendChild(el);
		}
		return el;
	};

	HTMLElement.prototype.empty = function (this: HTMLElement): void {
		while (this.firstChild) {
			this.removeChild(this.firstChild);
		}
	};

	HTMLElement.prototype.addClass = function (
		this: HTMLElement,
		...cls: string[]
	): void {
		this.classList.add(...cls);
	};

	HTMLElement.prototype.removeClass = function (
		this: HTMLElement,
		...cls: string[]
	): void {
		this.classList.remove(...cls);
	};

	HTMLElement.prototype.setText = function (
		this: HTMLElement,
		text: string,
	): void {
		this.textContent = text;
	};

	HTMLElement.prototype.toggleClass = function (
		this: HTMLElement,
		cls: string,
		force?: boolean,
	): void {
		this.classList.toggle(cls, force);
	};

	(HTMLElement.prototype as any).setAttr = function (
		this: HTMLElement,
		name: string,
		value: string,
	): void {
		this.setAttribute(name, value);
	};

	(HTMLInputElement.prototype as any).trigger = function (
		this: HTMLInputElement,
		eventType: string,
	): void {
		this.dispatchEvent(new Event(eventType, { bubbles: true }));
	};
}

// Augment the HTMLElement interface so TypeScript knows about the new methods
declare global {
	interface HTMLElement {
		createDiv(options?: DomElementInfo | string): HTMLDivElement;
		createSpan(options?: DomElementInfo | string): HTMLSpanElement;
		createEl<K extends keyof HTMLElementTagNameMap>(tag: K, options?: DomElementInfo | string): HTMLElementTagNameMap[K];
		empty(): void;
		addClass(...cls: string[]): void;
		removeClass(...cls: string[]): void;
		setText(text: string): void;
		toggleClass(cls: string, force?: boolean): void;
		setAttr(name: string, value: string): void;
	}
	interface HTMLInputElement {
		trigger(eventType: string): void;
	}
}

