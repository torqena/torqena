/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module frontmatterPlugin
 * @description CodeMirror 6 plugin for inline frontmatter property rendering.
 *
 * Provides three modes controlled by the `propertiesInDocument` setting:
 * - "source": No decoration — raw YAML shown as-is
 * - "hidden": Frontmatter lines collapsed via Decoration.replace()
 * - "visible": Frontmatter replaced with an interactive property table widget
 *
 * @since 0.0.28
 */

import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { StateField, type Extension } from "@codemirror/state";
import {
	parseFrontmatter,
	replaceFrontmatter,
	renderPropertiesTable,
} from "./FrontmatterService.js";

/**
 * Widget that renders an Obsidian-style property table inline in the editor.
 * @internal
 */
class PropertiesWidget extends WidgetType {
	private properties: Record<string, unknown>;

	constructor(properties: Record<string, unknown>) {
		super();
		this.properties = properties;
	}

	toDOM(view: EditorView): HTMLElement {
		const wrapper = document.createElement("div");
		wrapper.className = "cm-ws-properties-widget";

		renderPropertiesTable(wrapper, this.properties, {
			onPropertyChange: (key, newValue) => {
				this.dispatchUpdate(view, key, newValue);
			},
			onPropertyDelete: (key) => {
				this.dispatchUpdate(view, key, undefined, true);
			},
			onPropertyAdd: (key, value) => {
				this.dispatchUpdate(view, key, value);
			},
		});

		return wrapper;
	}

	/**
	 * Update the document's YAML frontmatter via a CM6 transaction.
	 * @internal
	 */
	private dispatchUpdate(view: EditorView, key: string, value: unknown, remove = false): void {
		const content = view.state.doc.toString();
		const fm = parseFrontmatter(content);
		const props = fm ? { ...fm.properties } : {};

		if (remove) {
			delete props[key];
		} else {
			props[key] = value;
		}

		const newContent = replaceFrontmatter(content, props);

		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: newContent },
		});
	}

	eq(other: PropertiesWidget): boolean {
		return JSON.stringify(this.properties) === JSON.stringify(other.properties);
	}

	ignoreEvent(): boolean {
		return true;
	}
}

/**
 * Find the character range of the frontmatter block in the document.
 * @internal
 */
function findFrontmatterRange(doc: string): { from: number; to: number } | null {
	const match = doc.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
	if (!match) return null;
	return { from: 0, to: match[0].length };
}

/**
 * Create a CM6 StateField that decorates frontmatter based on mode.
 * @internal
 */
function createFrontmatterStateField(mode: "hidden" | "visible"): Extension {
	const field = StateField.define<DecorationSet>({
		create(state) {
			return buildDecorations(state.doc.toString(), mode);
		},
		update(decorations, transaction) {
			if (!transaction.docChanged) return decorations;
			return buildDecorations(transaction.state.doc.toString(), mode);
		},
	});

	return [field, EditorView.decorations.from(field)];
}

/**
 * Build the decoration set for the current document state.
 * @internal
 */
function buildDecorations(content: string, mode: "hidden" | "visible"): DecorationSet {
	const range = findFrontmatterRange(content);
	if (!range) return Decoration.none;

	if (mode === "hidden") {
		// Replace the entire frontmatter block with nothing (collapse)
		const deco = Decoration.replace({}).range(range.from, range.to);
		return Decoration.set([deco]);
	}

	// mode === "visible": replace with widget
	const fm = parseFrontmatter(content);
	if (!fm) return Decoration.none;

	const widget = new PropertiesWidget(fm.properties);
	const deco = Decoration.replace({
		widget,
		block: true,
	}).range(range.from, range.to);

	return Decoration.set([deco]);
}

/**
 * Create a CM6 extension for frontmatter display based on the setting mode.
 *
 * @param mode - "visible" | "hidden" | "source"
 * @returns CM6 Extension (empty array for "source" mode)
 *
 * @example
 * ```ts
 * const ext = frontmatterPlugin("visible");
 * // Use in a Compartment for dynamic reconfiguration
 * ```
 */
export function frontmatterPlugin(mode: "visible" | "hidden" | "source"): Extension {
	if (mode === "source") return [];
	return createFrontmatterStateField(mode);
}
