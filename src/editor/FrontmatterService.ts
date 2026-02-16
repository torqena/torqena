/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module FrontmatterService
 * @description Shared YAML frontmatter parsing, serialization, and rendering utilities.
 *
 * Used by both the inline CM6 frontmatter widget and the right-sidebar
 * PropertiesView to parse, display, and edit YAML frontmatter.
 *
 * @since 0.0.28
 */

import { parseYaml, stringifyYaml } from "../platform/utils/parseYaml.js";

/** Regex to match YAML frontmatter at the start of a document. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** Parsed frontmatter result. */
export interface FrontmatterData {
	/** Raw YAML string between the --- delimiters. */
	raw: string;
	/** Parsed key-value properties. */
	properties: Record<string, unknown>;
	/** Character offset where the body content starts (after closing ---). */
	bodyStart: number;
	/** Line number where the closing --- is (0-indexed). */
	endLine: number;
}

/** Property type for rendering icons and appropriate editors. */
export type PropertyType = "text" | "number" | "date" | "datetime" | "list" | "tags" | "checkbox" | "multiline";

import type { PropertyTypeRegistry } from "./PropertyTypeRegistry.js";

/**
 * Parse YAML frontmatter from document content.
 *
 * @param content - Full document content
 * @returns Parsed frontmatter or null if none found
 */
export function parseFrontmatter(content: string): FrontmatterData | null {
	const match = content.match(FRONTMATTER_RE);
	if (!match) return null;

	const raw = match[1] ?? "";
	let properties: Record<string, unknown> = {};
	try {
		const parsed = parseYaml(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			properties = parsed as Record<string, unknown>;
		}
	} catch {
		// Invalid YAML — return raw but empty properties
	}

	const fullMatch = match[0];
	const bodyStart = fullMatch.length;

	// Count lines in the full match to find the end line
	const lines = fullMatch.split(/\r?\n/);
	// endLine is the line index of the closing ---
	const endLine = lines.length - (fullMatch.endsWith("\n") ? 2 : 1);

	return { raw, properties, bodyStart, endLine };
}

/**
 * Strip frontmatter from content, returning only the body.
 *
 * @param content - Full document content
 * @returns Content without frontmatter
 */
export function stripFrontmatter(content: string): string {
	const match = content.match(FRONTMATTER_RE);
	if (!match) return content;
	return content.slice(match[0].length);
}

/**
 * Serialize properties back to YAML and replace the frontmatter in the document.
 *
 * @param content - Full document content
 * @param properties - Updated properties to serialize
 * @returns Full content with updated frontmatter
 */
export function replaceFrontmatter(content: string, properties: Record<string, unknown>): string {
	const yaml = stringifyYaml(properties).trimEnd();
	const newFrontmatter = `---\n${yaml}\n---\n`;

	const match = content.match(FRONTMATTER_RE);
	if (match) {
		return newFrontmatter + content.slice(match[0].length);
	}
	// No existing frontmatter — prepend
	return newFrontmatter + content;
}

/**
 * Detect the type of a property value for rendering purposes.
 *
 * If a registry is provided and has a stored type for the key, that type
 * takes precedence. Otherwise falls back to value-based inference.
 *
 * @param key - Property key name (used for heuristics)
 * @param value - Property value
 * @param registry - Optional property type registry for stored overrides
 * @returns Detected property type
 */
export function detectPropertyType(key: string, value: unknown, registry?: PropertyTypeRegistry): PropertyType {
	// Registry override takes precedence
	if (registry) {
		const stored = registry.getType(key);
		if (stored) return stored;
	}

	if (typeof value === "boolean") return "checkbox";
	if (typeof value === "number") return "number";
	if (Array.isArray(value)) {
		const lk = key.toLowerCase();
		if (lk === "tags" || lk === "tag") return "tags";
		return "list";
	}

	if (typeof value === "string") {
		// Datetime detection (with time component)
		if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return "datetime";
		// Date detection: ISO dates or common date formats
		if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
		// Key-based heuristics
		const lk = key.toLowerCase();
		if (lk.includes("date") || lk.includes("created") || lk.includes("modified")) return "date";
		if (value.includes("\n")) return "multiline";
	}

	return "text";
}

/**
 * Get an SVG icon string for a property type.
 *
 * @param type - The property type
 * @returns SVG string for the icon
 */
export function getPropertyTypeIcon(type: PropertyType): string {
	switch (type) {
		case "date":
			return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
		case "datetime":
			return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
		case "tags":
			return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
		case "list":
			return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
		case "checkbox":
			return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
		case "number":
			return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`;
		case "text":
		case "multiline":
		default:
			return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/></svg>`;
	}
}

/**
 * Format a property value for display.
 *
 * @param value - The property value
 * @param type - Detected property type
 * @returns Formatted display string
 */
export function formatPropertyValue(value: unknown, type: PropertyType): string {
	if (value === null || value === undefined) return "";
	if (type === "date" && typeof value === "string") {
		// Format as MM/DD/YYYY for display
		const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (match) return `${match[2]}/${match[3]}/${match[1]}`;
	}
	if (type === "datetime" && typeof value === "string") {
		const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
		if (match) return `${match[2]}/${match[3]}/${match[1]} ${match[4]}:${match[5]}`;
	}
	if (type === "checkbox") return String(value);
	if (Array.isArray(value)) return value.join(", ");
	return String(value);
}

/** Callbacks for property editing operations. */
export interface PropertyCallbacks {
	onPropertyChange?: (key: string, newValue: unknown) => void;
	onPropertyDelete?: (key: string) => void;
	onPropertyAdd?: (key: string, value: unknown) => void;
	onTypeChange?: (key: string, newType: PropertyType) => void;
}

/**
 * Render an Obsidian-style properties table into a container element.
 *
 * @param container - DOM element to render into
 * @param properties - Parsed frontmatter properties
 * @param callbacks - Optional callbacks for editing
 * @param registry - Optional property type registry for stored types
 * @returns The table element
 */
export function renderPropertiesTable(
	container: HTMLElement,
	properties: Record<string, unknown>,
	callbacks?: PropertyCallbacks,
	registry?: PropertyTypeRegistry,
): HTMLElement {
	container.innerHTML = "";

	const table = document.createElement("div");
	table.className = "ws-properties-table";

	// Header
	const header = document.createElement("div");
	header.className = "ws-properties-header";
	header.textContent = "Properties";
	table.appendChild(header);

	// Rows
	const entries = Object.entries(properties);
	for (const [key, value] of entries) {
		const type = detectPropertyType(key, value, registry);
		const row = createPropertyRow(key, value, type, callbacks);
		table.appendChild(row);
	}

	// Add property button
	const existingKeys = Object.keys(properties);
	const addRow = document.createElement("div");
	addRow.className = "ws-property-row ws-property-add";
	addRow.innerHTML = `<span class="ws-property-add-icon">+</span><span class="ws-property-add-text">Add property</span>`;
	addRow.addEventListener("click", () => {
		handleAddProperty(table, addRow, callbacks, registry, existingKeys);
	});
	table.appendChild(addRow);

	container.appendChild(table);
	return table;
}

/**
 * Create a single property row element.
 * @internal
 */
function createPropertyRow(
	key: string,
	value: unknown,
	type: PropertyType,
	callbacks?: PropertyCallbacks,
): HTMLElement {
	const row = document.createElement("div");
	row.className = "ws-property-row";
	row.dataset.propertyKey = key;

	// Icon — clickable to show type picker
	const iconEl = document.createElement("span");
	iconEl.className = "ws-property-icon";
	iconEl.innerHTML = getPropertyTypeIcon(type);
	let currentType = type;
	iconEl.addEventListener("click", (e) => {
		e.stopPropagation();
		showPropertyTypeMenu(iconEl, currentType, (newType) => {
			if (newType === currentType) return;
			// Immediately update icon and value editor
			iconEl.innerHTML = getPropertyTypeIcon(newType);
			const coerced = coerceValue(value, currentType, newType);
			value = coerced;
			currentType = newType;
			renderValueEditor(valueEl, key, coerced, newType, callbacks);
			callbacks?.onTypeChange?.(key, newType);
		});
	});
	row.appendChild(iconEl);

	// Key
	const keyEl = document.createElement("span");
	keyEl.className = "ws-property-key";
	keyEl.textContent = key;
	row.appendChild(keyEl);

	// Value
	const valueEl = document.createElement("span");
	valueEl.className = "ws-property-value";

	renderValueEditor(valueEl, key, value, type, callbacks);

	row.appendChild(valueEl);
	return row;
}

/**
 * Render the appropriate value editor for a property type.
 * @internal
 */
function renderValueEditor(
	valueEl: HTMLElement,
	key: string,
	value: unknown,
	type: PropertyType,
	callbacks?: PropertyCallbacks,
): void {
	valueEl.innerHTML = "";

	if ((type === "list" || type === "tags") && Array.isArray(value)) {
		renderListValue(valueEl, key, value, callbacks, type === "tags");
	} else if (type === "checkbox") {
		const cb = document.createElement("input");
		cb.type = "checkbox";
		cb.checked = Boolean(value);
		cb.className = "ws-property-checkbox";
		cb.addEventListener("change", () => {
			callbacks?.onPropertyChange?.(key, cb.checked);
		});
		valueEl.appendChild(cb);
	} else if (type === "datetime") {
		const dtContainer = document.createElement("span");
		dtContainer.className = "ws-property-date";

		const clockIcon = document.createElement("span");
		clockIcon.className = "ws-property-date-icon";
		clockIcon.innerHTML = getPropertyTypeIcon("datetime");
		dtContainer.appendChild(clockIcon);

		const dtText = document.createElement("span");
		dtText.className = "ws-property-date-text";
		dtText.textContent = formatPropertyValue(value, type);
		dtContainer.appendChild(dtText);

		valueEl.appendChild(dtContainer);

		// Click to edit — show separate date + time inputs
		dtText.addEventListener("click", () => {
			const wrapper = document.createElement("span");
			wrapper.className = "ws-property-datetime-inputs";

			const dateInput = document.createElement("input");
			dateInput.type = "date";
			dateInput.className = "ws-property-date-input";

			const timeInput = document.createElement("input");
			timeInput.type = "time";
			timeInput.className = "ws-property-date-input";

			const strVal = String(value ?? "");
			const dtMatch = strVal.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
			if (dtMatch?.[1]) {
				dateInput.value = dtMatch[1];
				timeInput.value = dtMatch[2] ?? "00:00";
			}

			wrapper.appendChild(dateInput);
			wrapper.appendChild(timeInput);
			dtContainer.replaceWith(wrapper);
			dateInput.focus();

			const commit = () => {
				if (dateInput.value) {
					const time = timeInput.value || "00:00";
					callbacks?.onPropertyChange?.(key, `${dateInput.value}T${time}`);
				}
			};
			let blurTimeout: ReturnType<typeof setTimeout>;
			const onBlur = () => {
				blurTimeout = setTimeout(() => {
					if (document.activeElement !== dateInput && document.activeElement !== timeInput) {
						commit();
					}
				}, 0);
			};
			const onFocus = () => clearTimeout(blurTimeout);
			dateInput.addEventListener("blur", onBlur);
			timeInput.addEventListener("blur", onBlur);
			dateInput.addEventListener("focus", onFocus);
			timeInput.addEventListener("focus", onFocus);
			const onKeydown = (e: KeyboardEvent) => {
				if (e.key === "Enter") { commit(); dateInput.blur(); timeInput.blur(); }
				if (e.key === "Escape") { dateInput.blur(); timeInput.blur(); }
			};
			dateInput.addEventListener("keydown", onKeydown);
			timeInput.addEventListener("keydown", onKeydown);
		});
	} else if (type === "date") {
		const dateContainer = document.createElement("span");
		dateContainer.className = "ws-property-date";

		const calIcon = document.createElement("span");
		calIcon.className = "ws-property-date-icon";
		calIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
		dateContainer.appendChild(calIcon);

		const dateText = document.createElement("span");
		dateText.className = "ws-property-date-text";
		dateText.textContent = formatPropertyValue(value, type);
		dateContainer.appendChild(dateText);

		const linkIcon = document.createElement("span");
		linkIcon.className = "ws-property-date-link";
		linkIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
		dateContainer.appendChild(linkIcon);

		valueEl.appendChild(dateContainer);

		// Click to edit date
		dateText.addEventListener("click", () => {
			const input = document.createElement("input");
			input.type = "date";
			input.className = "ws-property-date-input";
			const strVal = String(value ?? "");
			const dateMatch = strVal.match(/^(\d{4}-\d{2}-\d{2})/);
			if (dateMatch?.[1]) input.value = dateMatch[1];
			dateContainer.replaceWith(input);
			input.focus();

			const commit = () => {
				if (input.value) {
					callbacks?.onPropertyChange?.(key, input.value);
				}
			};
			input.addEventListener("blur", commit);
			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") { commit(); input.blur(); }
				if (e.key === "Escape") input.blur();
			});
		});
	} else if (type === "multiline") {
		// Multiline — show preview, click to open textarea
		const preview = document.createElement("span");
		preview.className = "ws-property-multiline-preview";
		preview.textContent = formatPropertyValue(value, type);
		valueEl.appendChild(preview);

		preview.addEventListener("click", () => {
			const textarea = document.createElement("textarea");
			textarea.className = "ws-property-input ws-property-textarea";
			textarea.value = String(value ?? "");
			textarea.rows = 4;
			valueEl.textContent = "";
			valueEl.appendChild(textarea);
			textarea.focus();

			const commit = () => {
				callbacks?.onPropertyChange?.(key, textarea.value);
			};
			textarea.addEventListener("blur", commit);
			textarea.addEventListener("keydown", (e) => {
				if (e.key === "Escape") textarea.blur();
			});
		});
	} else {
		// Text / number value — click to edit
		valueEl.textContent = formatPropertyValue(value, type);
		valueEl.addEventListener("click", () => {
			const input = document.createElement("input");
			input.type = type === "number" ? "number" : "text";
			input.className = "ws-property-input";
			input.value = String(value ?? "");
			valueEl.textContent = "";
			valueEl.appendChild(input);
			input.focus();
			input.select();

			const commit = () => {
				const newVal = type === "number" ? Number(input.value) : input.value;
				callbacks?.onPropertyChange?.(key, newVal);
			};
			input.addEventListener("blur", commit);
			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") { commit(); input.blur(); }
				if (e.key === "Escape") input.blur();
			});
		});
	}
}

/**
 * Render a list/tag value as pill chips.
 * @internal
 */
function renderListValue(
	container: HTMLElement,
	key: string,
	items: unknown[],
	callbacks?: PropertyCallbacks,
	showHashPrefix = false,
): void {
	const chipsContainer = document.createElement("span");
	chipsContainer.className = "ws-property-tags";

	for (let i = 0; i < items.length; i++) {
		const chip = document.createElement("span");
		chip.className = "ws-property-tag";

		const text = document.createElement("span");
		text.className = "ws-property-tag-text";
		const rawText = String(items[i]);
		text.textContent = showHashPrefix ? `#${rawText.replace(/^#/, "")}` : rawText;
		chip.appendChild(text);

		const removeBtn = document.createElement("span");
		removeBtn.className = "ws-property-tag-remove";
		removeBtn.textContent = "×";
		removeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const newItems = [...items];
			newItems.splice(i, 1);
			callbacks?.onPropertyChange?.(key, newItems);
		});
		chip.appendChild(removeBtn);

		chipsContainer.appendChild(chip);
	}

	// Click container to add a new tag
	chipsContainer.addEventListener("click", (e) => {
		if ((e.target as HTMLElement).closest(".ws-property-tag")) return;
		const input = document.createElement("input");
		input.type = "text";
		input.className = "ws-property-tag-input";
		input.placeholder = showHashPrefix ? "Add tag..." : "Add item...";
		chipsContainer.appendChild(input);
		input.focus();

		const commit = () => {
			let val = input.value.trim();
			if (showHashPrefix) val = val.replace(/^#/, "");
			if (val) {
				callbacks?.onPropertyChange?.(key, [...items, val]);
			} else {
				input.remove();
			}
		};
		input.addEventListener("blur", commit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") { commit(); input.blur(); }
			if (e.key === "Escape") { input.value = ""; input.blur(); }
		});
	});

	container.appendChild(chipsContainer);
}

/**
 * Handle the "Add property" action with optional autocomplete from the registry.
 * @internal
 */
function handleAddProperty(
	table: HTMLElement,
	addRow: HTMLElement,
	callbacks?: PropertyCallbacks,
	registry?: PropertyTypeRegistry,
	existingKeys?: string[],
): void {
	// Check if an input row already exists
	if (table.querySelector(".ws-property-add-input-row")) return;

	const inputRow = document.createElement("div");
	inputRow.className = "ws-property-row ws-property-add-input-row";

	// Icon placeholder (updates when suggestion is selected)
	const iconEl = document.createElement("span");
	iconEl.className = "ws-property-icon";
	iconEl.innerHTML = getPropertyTypeIcon("text");
	inputRow.appendChild(iconEl);

	const keyInput = document.createElement("input");
	keyInput.type = "text";
	keyInput.className = "ws-property-input ws-property-key-input";
	keyInput.placeholder = "Property name";
	inputRow.appendChild(keyInput);

	const valueInput = document.createElement("input");
	valueInput.type = "text";
	valueInput.className = "ws-property-input ws-property-value-input";
	valueInput.placeholder = "Value";
	inputRow.appendChild(valueInput);

	table.insertBefore(inputRow, addRow);
	keyInput.focus();

	let selectedType: PropertyType = "text";

	// Autocomplete dropdown for property names
	let suggestEl: HTMLElement | null = null;
	let suggestItems: Array<{ name: string; type: PropertyType }> = [];
	let suggestIndex = 0;

	const dismissSuggest = () => {
		if (suggestEl) { suggestEl.remove(); suggestEl = null; }
	};

	const renderSuggest = () => {
		dismissSuggest();
		if (!registry || suggestItems.length === 0) return;

		suggestEl = document.createElement("div");
		suggestEl.className = "suggestion-container ws-property-suggest";
		suggestEl.style.position = "absolute";
		suggestEl.style.zIndex = "1000";

		const rect = keyInput.getBoundingClientRect();
		suggestEl.style.left = `${rect.left}px`;
		suggestEl.style.top = `${rect.bottom}px`;
		suggestEl.style.width = `${Math.max(rect.width, 220)}px`;
		suggestEl.style.maxHeight = "200px";
		suggestEl.style.overflowY = "auto";

		for (let i = 0; i < suggestItems.length; i++) {
			const item = suggestItems[i];
			if (!item) continue;
			const el = document.createElement("div");
			el.className = "suggestion-item" + (i === suggestIndex ? " is-selected" : "");

			const icon = document.createElement("span");
			icon.className = "ws-property-icon";
			icon.innerHTML = getPropertyTypeIcon(item.type);
			el.appendChild(icon);

			const label = document.createElement("span");
			label.textContent = item.name;
			el.appendChild(label);

			el.addEventListener("mousedown", (e) => {
				e.preventDefault();
				selectSuggestion(item);
			});
			el.addEventListener("mouseenter", () => {
				suggestIndex = i;
				updateSuggestSelection();
			});
			suggestEl.appendChild(el);
		}

		document.body.appendChild(suggestEl);
	};

	const updateSuggestSelection = () => {
		if (!suggestEl) return;
		const children = suggestEl.children;
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (child) child.classList.toggle("is-selected", i === suggestIndex);
		}
		const selected = children[suggestIndex];
		if (selected) selected.scrollIntoView({ block: "nearest" });
	};

	const selectSuggestion = (item: { name: string; type: PropertyType }) => {
		keyInput.value = item.name;
		selectedType = item.type;
		iconEl.innerHTML = getPropertyTypeIcon(item.type);

		// Swap value input to type-appropriate editor
		if (item.type === "checkbox") {
			valueInput.type = "checkbox";
			(valueInput as HTMLInputElement).checked = false;
			valueInput.placeholder = "";
		} else if (item.type === "number") {
			valueInput.type = "number";
			valueInput.placeholder = "0";
		} else if (item.type === "date") {
			valueInput.type = "date";
			valueInput.placeholder = "";
		} else if (item.type === "datetime") {
			// Replace single input with date + time pair
			valueInput.type = "date";
			valueInput.placeholder = "";

			const timeInput = document.createElement("input");
			timeInput.type = "time";
			timeInput.className = "ws-property-input";
			timeInput.value = "00:00";
			valueInput.parentElement?.insertBefore(timeInput, valueInput.nextSibling);

			// Override the add-row submit to combine date + time
			const origKeydown = valueInput.onkeydown;
			const commitDatetime = () => {
				if (valueInput.value) {
					const time = timeInput.value || "00:00";
					callbacks?.onPropertyAdd?.(keyInput.value.trim(), `${valueInput.value}T${time}`);
				}
			};
			valueInput.addEventListener("keydown", (e) => {
				if (e.key === "Enter") { e.preventDefault(); commitDatetime(); }
			});
			timeInput.addEventListener("keydown", (e) => {
				if (e.key === "Enter") { e.preventDefault(); commitDatetime(); }
			});
		} else if (item.type === "list" || item.type === "tags") {
			valueInput.type = "text";
			valueInput.placeholder = item.type === "tags" ? "tag1, tag2, ..." : "item1, item2, ...";
		} else {
			valueInput.type = "text";
			valueInput.placeholder = "Value";
		}

		dismissSuggest();
		valueInput.focus();
	};

	const onKeyInput = () => {
		if (!registry) return;
		const query = keyInput.value.trim().toLowerCase();
		const exclude = new Set(existingKeys ?? []);
		const all = registry.getAllProperties();

		suggestItems = query
			? all.filter(p => !exclude.has(p.name) && p.name.toLowerCase().includes(query))
			: all.filter(p => !exclude.has(p.name));

		// Limit to top 15
		suggestItems = suggestItems.slice(0, 15);
		suggestIndex = 0;
		renderSuggest();
	};

	keyInput.addEventListener("input", onKeyInput);
	keyInput.addEventListener("focus", onKeyInput);

	keyInput.addEventListener("keydown", (e) => {
		if (suggestEl && suggestItems.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				suggestIndex = Math.min(suggestIndex + 1, suggestItems.length - 1);
				updateSuggestSelection();
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				suggestIndex = Math.max(suggestIndex - 1, 0);
				updateSuggestSelection();
				return;
			}
			const currentItem = suggestItems[suggestIndex];
			if (e.key === "Enter" && currentItem) {
				e.preventDefault();
				selectSuggestion(currentItem);
				return;
			}
		}
		if (e.key === "Enter") { dismissSuggest(); valueInput.focus(); }
		if (e.key === "Escape") { dismissSuggest(); inputRow.remove(); }
	});

	const commit = () => {
		dismissSuggest();
		const key = keyInput.value.trim();
		if (!key) { inputRow.remove(); return; }

		let value: unknown;
		if (selectedType === "checkbox") {
			value = (valueInput as HTMLInputElement).checked;
		} else {
			const rawVal = valueInput.value.trim();
			value = rawVal;
			if (selectedType === "number") {
				value = rawVal ? Number(rawVal) : 0;
			} else if (selectedType === "list" || selectedType === "tags") {
				if (rawVal.startsWith("[")) {
					try { value = JSON.parse(rawVal); } catch { value = rawVal ? [rawVal] : []; }
				} else if (rawVal.includes(",")) {
					value = rawVal.split(",").map(s => s.trim()).filter(Boolean);
				} else {
					value = rawVal ? [rawVal] : [];
				}
			} else if (rawVal === "true") value = true;
			else if (rawVal === "false") value = false;
			else if (/^\d+(\.\d+)?$/.test(rawVal) && selectedType === "text") value = rawVal;
		}

		callbacks?.onPropertyAdd?.(key, value);
		inputRow.remove();
	};

	valueInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") commit();
		if (e.key === "Escape") { dismissSuggest(); inputRow.remove(); }
	});

	// Remove on blur if both empty
	const onBlur = () => {
		setTimeout(() => {
			if (suggestEl?.contains(document.activeElement)) return;
			if (!inputRow.contains(document.activeElement) && !keyInput.value.trim() && !valueInput.value.trim()) {
				dismissSuggest();
				inputRow.remove();
			}
		}, 200);
	};
	keyInput.addEventListener("blur", onBlur);
	valueInput.addEventListener("blur", onBlur);
}

/**
 * Render frontmatter properties as an HTML string for preview mode.
 *
 * @param properties - Parsed frontmatter properties
 * @returns HTML string for the properties table
 */
export function renderPropertiesHtml(properties: Record<string, unknown>): string {
	const entries = Object.entries(properties);
	if (entries.length === 0) return "";

	let html = '<div class="ws-properties-table ws-properties-preview"><div class="ws-properties-header">Properties</div>';

	for (const [key, value] of entries) {
		const type = detectPropertyType(key, value);
		const icon = getPropertyTypeIcon(type);
		let valueHtml: string;

		if ((type === "list" || type === "tags") && Array.isArray(value)) {
			valueHtml = value.map(v => {
				const display = type === "tags" ? `#${String(v).replace(/^#/, "")}` : String(v);
				return `<span class="ws-property-tag"><span class="ws-property-tag-text">${escapeHtml(display)}</span></span>`;
			}).join("");
		} else if (type === "checkbox") {
			valueHtml = `<input type="checkbox" disabled ${value ? "checked" : ""} />`;
		} else {
			valueHtml = `<strong>${escapeHtml(formatPropertyValue(value, type))}</strong>`;
		}

		html += `<div class="ws-property-row"><span class="ws-property-icon">${icon}</span><span class="ws-property-key">${escapeHtml(key)}</span><span class="ws-property-value">${valueHtml}</span></div>`;
	}

	html += "</div>";
	return html;
}

/**
 * Render frontmatter as a source-mode `<pre>` block.
 *
 * @param raw - Raw YAML string
 * @returns HTML string
 */
export function renderFrontmatterSource(raw: string): string {
	return `<pre class="ws-frontmatter-source"><code>---\n${escapeHtml(raw)}\n---</code></pre>`;
}

/** @internal */
function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// ============================================================
// Type Picker Context Menu
// ============================================================

/** Human-readable labels for property types. */
const TYPE_LABELS: Record<PropertyType, string> = {
	checkbox: "Checkbox",
	date: "Date",
	datetime: "Date & time",
	list: "List",
	tags: "Tags",
	number: "Number",
	text: "Text",
	multiline: "Multiline",
};

/** Ordered list of types for the picker menu. */
const TYPE_MENU_ORDER: PropertyType[] = ["checkbox", "date", "datetime", "list", "tags", "number", "text", "multiline"];

/** Active type picker element (singleton — only one open at a time). */
let _activeTypeMenu: HTMLElement | null = null;
let _activeTypeMenuCleanup: (() => void) | null = null;

/**
 * Dismiss the currently open type picker menu.
 * @internal
 */
function dismissTypeMenu(): void {
	if (_activeTypeMenu) {
		_activeTypeMenu.remove();
		_activeTypeMenu = null;
	}
	if (_activeTypeMenuCleanup) {
		_activeTypeMenuCleanup();
		_activeTypeMenuCleanup = null;
	}
}

/**
 * Show a type picker context menu anchored below the given element.
 *
 * @param anchorEl - The icon element to position the menu near
 * @param currentType - The currently active type (shown with checkmark)
 * @param onSelect - Callback when a new type is chosen
 */
export function showPropertyTypeMenu(
	anchorEl: HTMLElement,
	currentType: PropertyType,
	onSelect: (newType: PropertyType) => void,
): void {
	dismissTypeMenu();

	const menu = document.createElement("div");
	menu.className = "menu ws-property-type-menu";
	menu.style.position = "fixed";
	menu.style.zIndex = "10001";

	for (const type of TYPE_MENU_ORDER) {
		const el = document.createElement("div");
		el.className = "menu-item ws-property-type-option" + (type === currentType ? " is-selected" : "");

		const iconSpan = document.createElement("span");
		iconSpan.className = "menu-item-icon";
		iconSpan.innerHTML = getPropertyTypeIcon(type);
		el.appendChild(iconSpan);

		const labelSpan = document.createElement("span");
		labelSpan.className = "menu-item-title";
		labelSpan.textContent = TYPE_LABELS[type];
		el.appendChild(labelSpan);

		if (type === currentType) {
			const check = document.createElement("span");
			check.className = "menu-item-check";
			check.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
			el.appendChild(check);
		}

		el.addEventListener("click", () => {
			dismissTypeMenu();
			if (type !== currentType) {
				onSelect(type);
			}
		});

		menu.appendChild(el);
	}

	document.body.appendChild(menu);

	// Position below the anchor
	const rect = anchorEl.getBoundingClientRect();
	const menuRect = menu.getBoundingClientRect();
	const maxX = window.innerWidth - menuRect.width - 4;
	const maxY = window.innerHeight - menuRect.height - 4;
	menu.style.left = `${Math.min(rect.left, maxX)}px`;
	menu.style.top = `${Math.min(rect.bottom + 4, maxY)}px`;

	// Click outside to dismiss
	const dismiss = (ev: MouseEvent) => {
		if (!menu.contains(ev.target as Node)) {
			dismissTypeMenu();
		}
	};
	const escDismiss = (ev: KeyboardEvent) => {
		if (ev.key === "Escape") dismissTypeMenu();
	};
	setTimeout(() => {
		document.addEventListener("click", dismiss);
		document.addEventListener("keydown", escDismiss);
	}, 0);

	_activeTypeMenu = menu;
	_activeTypeMenuCleanup = () => {
		document.removeEventListener("click", dismiss);
		document.removeEventListener("keydown", escDismiss);
	};
}

// ============================================================
// Type Change Confirmation Modal
// ============================================================

/**
 * Compatibility matrix: type transitions that can be done silently.
 * All other transitions require user confirmation.
 * @internal
 */
const COMPATIBLE_TRANSITIONS = new Set<string>([
	"text:multiline",
	"multiline:text",
	"date:datetime",
	"datetime:date",
	"list:tags",
	"tags:list",
]);

/**
 * Check whether a type change is compatible (no data loss risk).
 *
 * @param from - Current property type
 * @param to - Target property type
 * @returns true if the transition is safe and needs no confirmation
 */
export function isTypeChangeCompatible(from: PropertyType, to: PropertyType): boolean {
	if (from === to) return true;
	return COMPATIBLE_TRANSITIONS.has(`${from}:${to}`);
}

/**
 * Coerce a value from one property type to another.
 *
 * @param value - The current value
 * @param from - Current type
 * @param to - Target type
 * @returns The coerced value appropriate for the target type
 */
export function coerceValue(value: unknown, from: PropertyType, to: PropertyType): unknown {
	if (from === to) return value;

	switch (to) {
		case "checkbox": {
			if (typeof value === "boolean") return value;
			if (typeof value === "string") {
				if (value.toLowerCase() === "true") return true;
				if (value.toLowerCase() === "false") return false;
			}
			if (typeof value === "number") return value !== 0;
			return false;
		}
		case "number": {
			if (typeof value === "number") return value;
			if (typeof value === "boolean") return value ? 1 : 0;
			const n = parseFloat(String(value));
			return isNaN(n) ? 0 : n;
		}
		case "date": {
			if (typeof value === "string") {
				const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
				if (m) return m[1];
			}
			return "";
		}
		case "datetime": {
			if (typeof value === "string") {
				const m = String(value).match(/^(\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?)/);
				if (m) return m[0].includes("T") ? m[0] : m[0] + "T00:00";
			}
			return "";
		}
		case "tags":
		case "list": {
			if (Array.isArray(value)) return value;
			if (value === null || value === undefined || value === "") return [];
			return [value];
		}
		case "text": {
			if (Array.isArray(value)) return value.join(", ");
			return String(value ?? "");
		}
		case "multiline": {
			if (Array.isArray(value)) return value.join("\n");
			return String(value ?? "");
		}
		default:
			return String(value ?? "");
	}
}

/**
 * Show a confirmation modal for incompatible type changes.
 *
 * Matches Obsidian's "Display as X?" dialog with Update/Cancel buttons.
 *
 * @param currentType - The current property type
 * @param newType - The target property type
 * @param onConfirm - Called when user clicks "Update"
 */
export function showTypeChangeConfirmation(
	currentType: PropertyType,
	newType: PropertyType,
	onConfirm: () => void,
): void {
	// Create modal overlay
	const container = document.createElement("div");
	container.className = "modal-container";

	const bg = document.createElement("div");
	bg.className = "modal-bg";
	bg.style.opacity = "0.85";
	container.appendChild(bg);

	const modal = document.createElement("div");
	modal.className = "modal";
	modal.style.maxWidth = "480px";
	container.appendChild(modal);

	// Close button
	const closeBtn = document.createElement("div");
	closeBtn.className = "modal-close-button";
	closeBtn.textContent = "\u00D7";
	modal.appendChild(closeBtn);

	// Title
	const title = document.createElement("div");
	title.className = "modal-title";
	title.textContent = `Display as ${TYPE_LABELS[newType].toLowerCase()}?`;
	modal.appendChild(title);

	// Content
	const content = document.createElement("div");
	content.className = "modal-content";

	const message = document.createElement("p");
	message.textContent = `Your ${TYPE_LABELS[currentType].toLowerCase()} data is not compatible. It will be adapted to fit the new format.`;
	content.appendChild(message);

	// Buttons
	const btnRow = document.createElement("div");
	btnRow.className = "modal-button-container";

	const updateBtn = document.createElement("button");
	updateBtn.className = "mod-cta";
	updateBtn.textContent = "Update";

	const cancelBtn = document.createElement("button");
	cancelBtn.textContent = "Cancel";

	btnRow.appendChild(updateBtn);
	btnRow.appendChild(cancelBtn);
	content.appendChild(btnRow);
	modal.appendChild(content);

	// Wire events
	const close = () => container.remove();
	bg.addEventListener("click", close);
	closeBtn.addEventListener("click", close);
	cancelBtn.addEventListener("click", close);
	updateBtn.addEventListener("click", () => {
		close();
		onConfirm();
	});

	const escHandler = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			close();
			document.removeEventListener("keydown", escHandler);
		}
	};
	document.addEventListener("keydown", escHandler);

	document.body.appendChild(container);
}




