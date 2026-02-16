/**
 * Form components used by the Setting class.
 *
 * Each component wraps a standard HTML form element with a chainable
 * API matching Obsidian's TextComponent, ToggleComponent,
 * DropdownComponent, ButtonComponent, and ExtraButtonComponent.
 */

import { setIcon } from "../utils/icons.js";

// --- TextComponent ---

export class TextComponent {
	inputEl: HTMLInputElement;

	constructor(containerEl: HTMLElement) {
		this.inputEl = document.createElement("input");
		this.inputEl.type = "text";
		this.inputEl.addClass("text-input");
		containerEl.appendChild(this.inputEl);
	}

	setValue(value: string): this {
		this.inputEl.value = value;
		return this;
	}

	getValue(): string {
		return this.inputEl.value;
	}

	setPlaceholder(placeholder: string): this {
		this.inputEl.placeholder = placeholder;
		return this;
	}

	onChange(callback: (value: string) => any): this {
		this.inputEl.addEventListener("input", () => callback(this.inputEl.value));
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.inputEl.disabled = disabled;
		return this;
	}
}

// --- TextAreaComponent ---

export class TextAreaComponent {
	inputEl: HTMLTextAreaElement;

	constructor(containerEl: HTMLElement) {
		this.inputEl = document.createElement("textarea");
		this.inputEl.addClass("text-area");
		containerEl.appendChild(this.inputEl);
	}

	setValue(value: string): this {
		this.inputEl.value = value;
		return this;
	}

	getValue(): string {
		return this.inputEl.value;
	}

	setPlaceholder(placeholder: string): this {
		this.inputEl.placeholder = placeholder;
		return this;
	}

	onChange(callback: (value: string) => any): this {
		this.inputEl.addEventListener("input", () =>
			callback(this.inputEl.value),
		);
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.inputEl.disabled = disabled;
		return this;
	}
}

// --- ToggleComponent ---

export class ToggleComponent {
	toggleEl: HTMLElement;
	private _value = false;
	private _onChangeCallback: ((value: boolean) => any) | null = null;

	constructor(containerEl: HTMLElement) {
		this.toggleEl = document.createElement("div");
		this.toggleEl.addClass("checkbox-container");
		this.toggleEl.addEventListener("click", () => {
			if ((this.toggleEl as any)._disabled) return;
			this._value = !this._value;
			this._updateState();
			if (this._onChangeCallback) this._onChangeCallback(this._value);
		});
		containerEl.appendChild(this.toggleEl);
	}

	setValue(on: boolean): this {
		this._value = on;
		this._updateState();
		return this;
	}

	getValue(): boolean {
		return this._value;
	}

	onChange(callback: (value: boolean) => any): this {
		this._onChangeCallback = callback;
		return this;
	}

	setDisabled(disabled: boolean): this {
		(this.toggleEl as any)._disabled = disabled;
		this.toggleEl.toggleClass("is-disabled", disabled);
		return this;
	}

	setTooltip(tooltip: string): this {
		this.toggleEl.setAttribute("title", tooltip);
		return this;
	}

	private _updateState(): void {
		this.toggleEl.toggleClass("is-enabled", this._value);
	}
}

// --- DropdownComponent ---

export class DropdownComponent {
	selectEl: HTMLSelectElement;

	constructor(containerEl: HTMLElement) {
		this.selectEl = document.createElement("select");
		this.selectEl.addClass("dropdown");
		containerEl.appendChild(this.selectEl);
	}

	addOption(value: string, display: string): this {
		const option = document.createElement("option");
		option.value = value;
		option.textContent = display;
		this.selectEl.appendChild(option);
		return this;
	}

	addOptions(options: Record<string, string>): this {
		for (const [value, display] of Object.entries(options)) {
			this.addOption(value, display);
		}
		return this;
	}

	setValue(value: string): this {
		this.selectEl.value = value;
		return this;
	}

	getValue(): string {
		return this.selectEl.value;
	}

	onChange(callback: (value: string) => any): this {
		this.selectEl.addEventListener("change", () =>
			callback(this.selectEl.value),
		);
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.selectEl.disabled = disabled;
		return this;
	}
}

// --- ButtonComponent ---

export class ButtonComponent {
	buttonEl: HTMLButtonElement;

	constructor(containerEl: HTMLElement) {
		this.buttonEl = document.createElement("button");
		containerEl.appendChild(this.buttonEl);
	}

	setButtonText(name: string): this {
		this.buttonEl.textContent = name;
		return this;
	}

	setCta(): this {
		this.buttonEl.addClass("mod-cta");
		return this;
	}

	setWarning(): this {
		this.buttonEl.addClass("mod-warning");
		return this;
	}

	setIcon(icon: string): this {
		setIcon(this.buttonEl, icon);
		return this;
	}

	setTooltip(tooltip: string): this {
		this.buttonEl.setAttribute("title", tooltip);
		this.buttonEl.setAttribute("aria-label", tooltip);
		return this;
	}

	onClick(callback: (evt: MouseEvent) => any): this {
		this.buttonEl.addEventListener("click", callback);
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.buttonEl.disabled = disabled;
		return this;
	}

	setClass(cls: string): this {
		this.buttonEl.addClass(cls);
		return this;
	}

	removeCta(): this {
		this.buttonEl.removeClass("mod-cta");
		return this;
	}
}

// --- SliderComponent ---

export class SliderComponent {
	sliderEl: HTMLInputElement;
	private _onChangeCallback: ((value: number) => any) | null = null;

	constructor(containerEl: HTMLElement) {
		this.sliderEl = document.createElement("input");
		this.sliderEl.type = "range";
		this.sliderEl.addClass("slider");
		this.sliderEl.addEventListener("input", () => {
			if (this._onChangeCallback) this._onChangeCallback(this.getValue());
		});
		containerEl.appendChild(this.sliderEl);
	}

	setValue(value: number): this {
		this.sliderEl.value = String(value);
		return this;
	}

	getValue(): number {
		return parseFloat(this.sliderEl.value);
	}

	setLimits(min: number, max: number, step: number | "any"): this {
		this.sliderEl.min = String(min);
		this.sliderEl.max = String(max);
		this.sliderEl.step = String(step);
		return this;
	}

	setDynamicTooltip(): this {
		this.sliderEl.setAttribute("title", this.sliderEl.value);
		this.sliderEl.addEventListener("input", () => {
			this.sliderEl.setAttribute("title", this.sliderEl.value);
		});
		return this;
	}

	onChange(callback: (value: number) => any): this {
		this._onChangeCallback = callback;
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.sliderEl.disabled = disabled;
		return this;
	}
}

// --- ExtraButtonComponent ---

export class ExtraButtonComponent {
	extraSettingsEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.extraSettingsEl = document.createElement("div");
		this.extraSettingsEl.addClass("extra-setting-button");
		this.extraSettingsEl.setAttribute("tabindex", "0");
		containerEl.appendChild(this.extraSettingsEl);
	}

	setIcon(icon: string): this {
		setIcon(this.extraSettingsEl, icon);
		return this;
	}

	setTooltip(tooltip: string): this {
		this.extraSettingsEl.setAttribute("title", tooltip);
		this.extraSettingsEl.setAttribute("aria-label", tooltip);
		return this;
	}

	onClick(callback: () => any): this {
		this.extraSettingsEl.addEventListener("click", callback);
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.extraSettingsEl.toggleClass("is-disabled", disabled);
		if (disabled) {
			this.extraSettingsEl.removeAttribute("tabindex");
		} else {
			this.extraSettingsEl.setAttribute("tabindex", "0");
		}
		return this;
	}
}
