/**
 * Setting — chainable form builder replicating Obsidian's Setting class.
 *
 * Creates a setting-item div with info (name + description) on the left
 * and controls (text, toggle, dropdown, button, etc.) on the right.
 */

import {
	TextComponent,
	TextAreaComponent,
	ToggleComponent,
	DropdownComponent,
	SliderComponent,
	ButtonComponent,
	ExtraButtonComponent,
} from "./FormComponents.js";

export class Setting {
	/** Root element for the entire setting row. */
	settingEl: HTMLElement;

	/** Info container (left side). */
	infoEl: HTMLElement;

	/** Name element. */
	nameEl: HTMLElement;

	/** Description element. */
	descEl: HTMLElement;

	/** Controls container (right side). */
	controlEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.settingEl = document.createElement("div");
		this.settingEl.addClass("setting-item");

		this.infoEl = document.createElement("div");
		this.infoEl.addClass("setting-item-info");
		this.settingEl.appendChild(this.infoEl);

		this.nameEl = document.createElement("div");
		this.nameEl.addClass("setting-item-name");
		this.infoEl.appendChild(this.nameEl);

		this.descEl = document.createElement("div");
		this.descEl.addClass("setting-item-description");
		this.infoEl.appendChild(this.descEl);

		this.controlEl = document.createElement("div");
		this.controlEl.addClass("setting-item-control");
		this.settingEl.appendChild(this.controlEl);

		containerEl.appendChild(this.settingEl);
	}

	/** Set the setting name (left side, bold). */
	setName(name: string | DocumentFragment): this {
		if (typeof name === "string") {
			this.nameEl.textContent = name;
		} else {
			this.nameEl.textContent = "";
			this.nameEl.appendChild(name);
		}
		return this;
	}

	/** Set the setting description (left side, muted). */
	setDesc(desc: string | DocumentFragment): this {
		if (typeof desc === "string") {
			this.descEl.textContent = desc;
		} else {
			this.descEl.textContent = "";
			this.descEl.appendChild(desc);
		}
		return this;
	}

	/** Add a CSS class to the setting-item element. */
	setClass(cls: string): this {
		this.settingEl.addClass(cls);
		return this;
	}

	/** Add a text input control. */
	addText(cb: (text: TextComponent) => any): this {
		const component = new TextComponent(this.controlEl);
		cb(component);
		return this;
	}

	/** Add a textarea control. */
	addTextArea(cb: (textArea: TextAreaComponent) => any): this {
		const component = new TextAreaComponent(this.controlEl);
		cb(component);
		return this;
	}

	/** Add a toggle (boolean) control. */
	addToggle(cb: (toggle: ToggleComponent) => any): this {
		const component = new ToggleComponent(this.controlEl);
		cb(component);
		return this;
	}

	/** Add a dropdown (select) control. */
	addDropdown(cb: (dropdown: DropdownComponent) => any): this {
		const component = new DropdownComponent(this.controlEl);
		cb(component);
		return this;
	}

	/** Add a slider (range) control. */
	addSlider(cb: (slider: SliderComponent) => any): this {
		const component = new SliderComponent(this.controlEl);
		cb(component);
		return this;
	}

	/** Add a button control. */
	addButton(cb: (button: ButtonComponent) => any): this {
		const component = new ButtonComponent(this.controlEl);
		cb(component);
		return this;
	}

	/** Add an extra (icon) button control. */
	addExtraButton(cb: (button: ExtraButtonComponent) => any): this {
		const component = new ExtraButtonComponent(this.controlEl);
		cb(component);
		return this;
	}

	/** Set the heading style (no controls, full-width name). */
	setHeading(): this {
		this.settingEl.addClass("setting-item-heading");
		return this;
	}

	/** Set visibility. */
	setDisabled(disabled: boolean): this {
		this.settingEl.toggleClass("is-disabled", disabled);
		return this;
	}

	/** Clear the setting from its parent. */
	clear(): this {
		this.settingEl.remove();
		return this;
	}

	/** Convenience: pass a DocumentFragment to name that includes HTML. */
	then(cb: (setting: this) => any): this {
		cb(this);
		return this;
	}
}
