/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module LivePreviewPlugin
 * @description CodeMirror 6 ViewPlugin that provides Obsidian-style Live Preview mode.
 *
 * Hides markdown syntax (bold markers, italic markers, heading hashes, link brackets,
 * etc.) and applies formatting decorations — but reveals raw syntax when the cursor
 * is on the same line as the decorated range.
 *
 * Controlled via a Compartment in EditorManager so it can be toggled dynamically.
 *
 * @since 0.0.30
 */

import {
	Decoration,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import type { DecorationSet, PluginValue } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { EditorState, StateField } from "@codemirror/state";
import type { Extension, Range } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { InlineMathWidget, BlockMathWidget } from "./widgets/MathWidget.js";
import { MermaidWidget } from "./widgets/MermaidWidget.js";
import { CodeBlockHeaderWidget } from "./widgets/CodeBlockWidget.js";

// ── Lightweight widget types for replaced syntax ──

/** Renders an interactive checkbox widget for task list items. */
class CheckboxWidget extends WidgetType {
	private checked: boolean;
	constructor(checked: boolean) {
		super();
		this.checked = checked;
	}
	toDOM(view: EditorView): HTMLElement {
		const cb = document.createElement("input");
		cb.type = "checkbox";
		cb.checked = this.checked;
		cb.className = "cm-task-checkbox";
		cb.addEventListener("click", (e) => {
			e.preventDefault();
			// Toggle in document
			const pos = view.posAtDOM(cb);
			const line = view.state.doc.lineAt(pos);
			const text = line.text;
			const newText = this.checked
				? text.replace("[x]", "[ ]").replace("[X]", "[ ]")
				: text.replace("[ ]", "[x]");
			view.dispatch({ changes: { from: line.from, to: line.to, insert: newText } });
		});
		return cb;
	}
	eq(other: CheckboxWidget): boolean {
		return this.checked === other.checked;
	}
}

/** Renders a bullet character for unordered list items. */
class BulletWidget extends WidgetType {
	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = "cm-bullet-widget";
		span.textContent = "•";
		return span;
	}
}

/** Renders a horizontal rule. */
class HRWidget extends WidgetType {
	toDOM(): HTMLElement {
		const hr = document.createElement("hr");
		hr.className = "cm-hr-widget";
		return hr;
	}
}

/** Renders an embedded image below the line. */
class ImageWidget extends WidgetType {
	private src: string;
	private alt: string;
	constructor(src: string, alt: string) {
		super();
		this.src = src;
		this.alt = alt;
	}
	toDOM(): HTMLElement {
		const wrapper = document.createElement("div");
		wrapper.className = "cm-image-widget";
		const img = document.createElement("img");
		img.src = this.src;
		img.alt = this.alt;
		img.loading = "lazy";
		wrapper.appendChild(img);
		return wrapper;
	}
	eq(other: ImageWidget): boolean {
		return this.src === other.src;
	}
}

/** Renders a clickable link label. */
class LinkWidget extends WidgetType {
	private label: string;
	private href: string;
	constructor(label: string, href: string) {
		super();
		this.label = label;
		this.href = href;
	}
	toDOM(): HTMLElement {
		const a = document.createElement("a");
		a.textContent = this.label;
		if (this.href.startsWith("http://") || this.href.startsWith("https://")) {
			// External link — styled and opened in browser
			a.className = "cm-link-widget";
			a.href = this.href;
		} else {
			// Internal link — styled as WikiLink, handled by delegated listener
			a.className = "cm-link-widget internal-link";
			a.dataset.href = this.href;
		}
		return a;
	}
	eq(other: LinkWidget): boolean {
		return this.label === other.label && this.href === other.href;
	}
}

/** Renders a wiki-style internal link. */
class WikiLinkWidget extends WidgetType {
	private target: string;
	private display: string;
	constructor(target: string, display: string) {
		super();
		this.target = target;
		this.display = display;
	}
	toDOM(): HTMLElement {
		const a = document.createElement("a");
		a.className = "cm-wikilink internal-link";
		a.textContent = this.display;
		a.dataset.href = this.target;
		return a;
	}
	eq(other: WikiLinkWidget): boolean {
		return this.target === other.target && this.display === other.display;
	}
}

/** Renders an embed placeholder for non-image embeds. */
class EmbedWidget extends WidgetType {
	private target: string;
	constructor(target: string) {
		super();
		this.target = target;
	}
	toDOM(): HTMLElement {
		const div = document.createElement("div");
		div.className = "cm-embed-widget";
		const icon = document.createElement("span");
		icon.className = "cm-embed-icon";
		icon.textContent = "📄";
		div.appendChild(icon);
		const label = document.createElement("span");
		label.textContent = this.target;
		div.appendChild(label);
		return div;
	}
	eq(other: EmbedWidget): boolean {
		return this.target === other.target;
	}
}

/** Renders a footnote reference as a superscript. */
class FootnoteRefWidget extends WidgetType {
	private id: string;
	constructor(id: string) {
		super();
		this.id = id;
	}
	toDOM(): HTMLElement {
		const sup = document.createElement("sup");
		sup.className = "cm-footnote-ref";
		const a = document.createElement("a");
		a.textContent = this.id;
		a.href = `#fn-${this.id}`;
		sup.appendChild(a);
		return sup;
	}
	eq(other: FootnoteRefWidget): boolean {
		return this.id === other.id;
	}
}

/** Callout type aliases for canonical resolution. */
const CALLOUT_ALIASES: Record<string, string> = {
	summary: "abstract", tldr: "abstract",
	hint: "tip", important: "tip",
	check: "success", done: "success",
	help: "question", faq: "question",
	caution: "warning", attention: "warning",
	fail: "failure", missing: "failure",
	error: "danger",
	cite: "quote",
};

/** Resolve callout type alias to canonical name. @internal */
function resolveCalloutType(type: string): string {
	const lower = type.toLowerCase();
	return CALLOUT_ALIASES[lower] || lower;
}

// ── Decoration helpers ──

/** Get the line number (1-indexed) for a position in the document. */
function lineAt(view: EditorView, pos: number): number {
	return view.state.doc.lineAt(pos).number;
}

/** Check whether the cursor is on the same line as a range. */
function cursorOnLine(view: EditorView, from: number, to: number): boolean {
	const sel = view.state.selection.main;
	const cursorLine = view.state.doc.lineAt(sel.head).number;
	const fromLine = view.state.doc.lineAt(from).number;
	const toLine = view.state.doc.lineAt(Math.min(to, view.state.doc.length)).number;
	return cursorLine >= fromLine && cursorLine <= toLine;
}

/**
 * Check whether the cursor is on any line within a range (state-based).
 * Used by the StateField which doesn't have access to EditorView.
 * @internal
 */
function cursorInRange(state: EditorState, from: number, to: number): boolean {
	const sel = state.selection.main;
	const cursorLine = state.doc.lineAt(sel.head).number;
	const fromLine = state.doc.lineAt(from).number;
	const toLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;
	return cursorLine >= fromLine && cursorLine <= toLine;
}

/**
 * Build block-level decorations for multi-line replacements (mermaid, math).
 *
 * These must be provided via StateField rather than ViewPlugin because CM6
 * forbids Decoration.replace() that spans across line boundaries from any
 * dynamic (function-based) decoration source.
 * @internal
 */
function buildBlockDecorations(state: EditorState): DecorationSet {
	const decorations: Range<Decoration>[] = [];
	const doc = state.doc;
	const tree = syntaxTree(state);

	tree.iterate({
		enter(node): false | void {
		  try {
			if (node.type.name !== "FencedCode") return;

			const { from, to } = node;
			if (cursorInRange(state, from, to)) return false;

			const infoNode = node.node.getChild("CodeInfo");
			const lang = infoNode ? doc.sliceString(infoNode.from, infoNode.to).trim() : "";
			const codeTextNode = node.node.getChild("CodeText");
			const code = codeTextNode ? doc.sliceString(codeTextNode.from, codeTextNode.to) : "";

			if (lang === "mermaid") {
				decorations.push(Decoration.replace({
					widget: new MermaidWidget(code),
					block: true,
				}).range(from, to));
				return false;
			}

			if (lang === "math") {
				decorations.push(Decoration.replace({
					widget: new BlockMathWidget(code.trim()),
					block: true,
				}).range(from, to));
				return false;
			}
		  } catch (err) {
			console.warn("[LivePreview] Block decoration error:", err);
		  }
		},
	});

	decorations.sort((a, b) => a.from - b.from);
	return Decoration.set(decorations);
}

/**
 * StateField that provides block-level decorations (mermaid, math).
 *
 * Unlike ViewPlugin, StateField decorations are not subject to CM6's
 * restriction on block decorations and multi-line replacements.
 * @internal
 */
const livePreviewBlockField = StateField.define<DecorationSet>({
	create(state) {
		return buildBlockDecorations(state);
	},
	update(value, tr) {
		if (tr.docChanged || tr.selection) {
			return buildBlockDecorations(tr.state);
		}
		return value;
	},
	provide: (field) => EditorView.decorations.from(field),
});

/**
 * Build Live Preview decorations for the current document state.
 *
 * Walks the Lezer markdown syntax tree and creates decorations that:
 * - Hide markdown syntax markers (**, *, ~~, `, #, etc.)
 * - Apply formatting classes to content
 * - Replace links, images, checkboxes, bullets, HRs with widgets
 * - Reveal raw syntax when cursor is on the same line
 */
function buildLivePreviewDecorations(view: EditorView): DecorationSet {
	const decorations: Range<Decoration>[] = [];
	const doc = view.state.doc;
	const tree = syntaxTree(view.state);

	tree.iterate({
		enter(node: { type: { name: string }; from: number; to: number; node: SyntaxNode }): false | void {
		  try {
			const { name } = node.type;
			const { from, to } = node;

			// Skip if cursor is on this line (reveal raw syntax)
			if (cursorOnLine(view, from, to)) return;

			// ── Headings ──
			if (name === "ATXHeading1" || name === "ATXHeading2" || name === "ATXHeading3" ||
				name === "ATXHeading4" || name === "ATXHeading5" || name === "ATXHeading6") {
				const level = parseInt(name.replace("ATXHeading", ""), 10);
				decorations.push(Decoration.line({ class: `cm-header cm-header-${level}` }).range(from));

				// Hide the heading marker (# chars + space)
				const mark = node.node.getChild("HeaderMark");
				if (mark) {
					// Include trailing space after hashes
					const hideEnd = Math.min(mark.to + 1, to);
					decorations.push(Decoration.replace({}).range(mark.from, hideEnd));
				}
				return false; // Don't descend
			}

			// ── Strong (bold) ──
			if (name === "StrongEmphasis") {
				const text = doc.sliceString(from, to);
				const marker = text.startsWith("**") ? "**" : "__";
				const markerLen = marker.length;
				// Hide opening marker
				decorations.push(Decoration.replace({}).range(from, from + markerLen));
				// Hide closing marker
				decorations.push(Decoration.replace({}).range(to - markerLen, to));
				// Mark content as bold
				decorations.push(Decoration.mark({ class: "cm-strong" }).range(from + markerLen, to - markerLen));
				return false;
			}

			// ── Emphasis (italic) ──
			if (name === "Emphasis") {
				const markerLen = 1; // * or _
				decorations.push(Decoration.replace({}).range(from, from + markerLen));
				decorations.push(Decoration.replace({}).range(to - markerLen, to));
				decorations.push(Decoration.mark({ class: "cm-em" }).range(from + markerLen, to - markerLen));
				return false;
			}

			// ── Strikethrough ~~text~~ ──
			if (name === "Strikethrough") {
				decorations.push(Decoration.replace({}).range(from, from + 2));
				decorations.push(Decoration.replace({}).range(to - 2, to));
				decorations.push(Decoration.mark({ class: "cm-strikethrough" }).range(from + 2, to - 2));
				return false;
			}

			// ── Inline code ──
			if (name === "InlineCode") {
				const text = doc.sliceString(from, to);
				const backticks = text.startsWith("``") ? 2 : 1;
				decorations.push(Decoration.replace({}).range(from, from + backticks));
				decorations.push(Decoration.replace({}).range(to - backticks, to));
				decorations.push(Decoration.mark({ class: "cm-inline-code" }).range(from + backticks, to - backticks));
				return false;
			}

			// ── Highlight ==text== ──
			if (name === "Highlight") {
				decorations.push(Decoration.replace({}).range(from, from + 2));
				decorations.push(Decoration.replace({}).range(to - 2, to));
				decorations.push(Decoration.mark({ class: "cm-highlight" }).range(from + 2, to - 2));
				return false;
			}

			// ── WikiLink [[target|alias]] ──
			if (name === "WikiLink") {
				const text = doc.sliceString(from, to);
				const inner = text.slice(2, -2);
				const pipeIdx = inner.indexOf("|");
				const target = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
				const display = pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : inner;
				decorations.push(Decoration.replace({
					widget: new WikiLinkWidget(target, display),
				}).range(from, to));
				return false;
			}

			// ── Embed ![[target]] ──
			if (name === "Embed") {
				const text = doc.sliceString(from, to);
				const inner = text.slice(3, -2); // Remove ![[ and ]]
				const isImage = /\.(png|jpe?g|gif|svg|webp|bmp|ico)(\|.*)?$/i.test(inner);
				if (isImage) {
					const sizeMatch = inner.match(/^(.+)\|(\d+)(?:x(\d+))?$/);
					const src = sizeMatch?.[1] ?? inner;
					decorations.push(Decoration.replace({
						widget: new ImageWidget(src, src),
					}).range(from, to));
				} else {
					decorations.push(Decoration.replace({
						widget: new EmbedWidget(inner),
					}).range(from, to));
				}
				return false;
			}

			// ── Obsidian Comment %%text%% ── (hidden)
			if (name === "ObsidianComment") {
				decorations.push(Decoration.replace({}).range(from, to));
				return false;
			}

			// ── Inline Math $expression$ ──
			if (name === "MathInline") {
				const text = doc.sliceString(from, to);
				const expression = text.slice(1, -1);
				decorations.push(Decoration.replace({
					widget: new InlineMathWidget(expression),
				}).range(from, to));
				return false;
			}

			// ── Footnote Reference [^id] ──
			if (name === "FootnoteRef") {
				const text = doc.sliceString(from, to);
				const id = text.slice(2, -1); // Remove [^ and ]
				decorations.push(Decoration.replace({
					widget: new FootnoteRefWidget(id),
				}).range(from, to));
				return false;
			}

			// ── Links [text](url) ──
			if (name === "Link") {
				const fullText = doc.sliceString(from, to);
				const linkMatch = fullText.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
				if (linkMatch) {
					const label = linkMatch[1] ?? "";
					const href = linkMatch[2] ?? "";
					decorations.push(Decoration.replace({
						widget: new LinkWidget(label, href),
					}).range(from, to));
				}
				return false;
			}

			// ── Images ![alt](url) ──
			if (name === "Image") {
				const fullText = doc.sliceString(from, to);
				const imgMatch = fullText.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
				if (imgMatch) {
					const alt = imgMatch[1] ?? "";
					const src = imgMatch[2] ?? "";
					// Replace the entire image syntax with the image widget inline
					decorations.push(Decoration.replace({
						widget: new ImageWidget(src, alt),
					}).range(from, to));
				}
				return false;
			}

			// ── Blockquote (with callout detection) ──
			if (name === "Blockquote") {
				const startLine = doc.lineAt(from).number;
				const endLine = doc.lineAt(Math.min(to, doc.length)).number;
				const firstLine = doc.line(startLine);
				const calloutMatch = firstLine.text.match(/^>\s*\[!([\w-]+)\]([+-])?\s*(.*)/);

				if (calloutMatch) {
					// Render as callout
					const rawType = calloutMatch[1] ?? "note";
					const foldMarker = calloutMatch[2] || "";
					const resolvedType = resolveCalloutType(rawType);

					for (let ln = startLine; ln <= endLine; ln++) {
						const line = doc.line(ln);
						const lineText = line.text;
						const lineClass = ln === startLine
							? `cm-callout cm-callout-${resolvedType} cm-callout-title-line`
							: `cm-callout cm-callout-${resolvedType}`;
						decorations.push(Decoration.line({ class: lineClass }).range(line.from));

						// Hide > marker
						const quoteMatch = lineText.match(/^(\s*>\s?)/);
						if (quoteMatch?.[1]) {
							decorations.push(Decoration.replace({}).range(line.from, line.from + quoteMatch[1].length));
						}

						// On the title line, also hide [!type] and fold marker
						if (ln === startLine) {
							const prefixLen = quoteMatch?.[1]?.length ?? 0;
							const afterPrefix = lineText.slice(prefixLen);
							const typeMatch = afterPrefix.match(/^\[!([\w-]+)\]([+-])?\s?/);
							if (typeMatch) {
								decorations.push(Decoration.replace({}).range(
									line.from + prefixLen,
									line.from + prefixLen + typeMatch[0].length,
								));
							}
						}
					}
					return false;
				}

				// Regular blockquote
				for (let ln = startLine; ln <= endLine; ln++) {
					const line = doc.line(ln);
					decorations.push(Decoration.line({ class: "cm-blockquote" }).range(line.from));
					const lineText = line.text;
					const quoteMatch = lineText.match(/^(\s*>\s?)/);
					if (quoteMatch?.[1]) {
						decorations.push(Decoration.replace({}).range(line.from, line.from + quoteMatch[1].length));
					}
				}
				return false;
			}

			// ── Horizontal rule ──
			if (name === "HorizontalRule") {
				decorations.push(Decoration.replace({
					widget: new HRWidget(),
				}).range(from, to));
				return false;
			}

			// ── Fenced code blocks ──
			if (name === "FencedCode") {
				const infoNode = node.node.getChild("CodeInfo");
				const lang = infoNode ? doc.sliceString(infoNode.from, infoNode.to).trim() : "";
				const codeTextNode = node.node.getChild("CodeText");
				const code = codeTextNode ? doc.sliceString(codeTextNode.from, codeTextNode.to) : "";

				// Mermaid and math blocks are handled by the StateField
				// (multi-line replace decorations are forbidden from ViewPlugin)
				if (lang === "mermaid" || lang === "math") {
					return false;
				}

				const startLine = doc.lineAt(from).number;
				const endLine = doc.lineAt(Math.min(to, doc.length)).number;

				// Add header widget for code blocks with a language
				if (lang) {
					decorations.push(Decoration.widget({
						widget: new CodeBlockHeaderWidget(lang, code),
						side: -1,
					}).range(from));
				}

				// Determine cursor position for fence reveal
				const cursorLineNum = view.state.selection.main.head < doc.length
					? doc.lineAt(view.state.selection.main.head).number
					: -1;

				for (let ln = startLine; ln <= endLine; ln++) {
					const line = doc.line(ln);
					const isFenceLine = ln === startLine || ln === endLine;

					if (isFenceLine) {
						// Hide fence lines unless cursor is on them
						if (cursorLineNum !== ln) {
							decorations.push(Decoration.line({ class: "cm-codeblock cm-codeblock-fence" }).range(line.from));
						} else {
							decorations.push(Decoration.line({ class: "cm-codeblock" }).range(line.from));
						}
					} else {
						decorations.push(Decoration.line({ class: "cm-codeblock" }).range(line.from));
					}
				}
				return false;
			}

			// ── Task lists ──
			if (name === "TaskMarker") {
				const text = doc.sliceString(from, to);
				const checked = text.includes("x") || text.includes("X");
				decorations.push(Decoration.replace({
					widget: new CheckboxWidget(checked),
				}).range(from, to));
				return false;
			}

			// ── Unordered list bullets ──
			if (name === "ListMark") {
				const text = doc.sliceString(from, to).trim();
				if (text === "-" || text === "*" || text === "+") {
					// Replace the bullet marker + trailing space with a bullet widget
					const hideEnd = Math.min(from + text.length + 1, doc.length);
					decorations.push(Decoration.replace({
						widget: new BulletWidget(),
					}).range(from, hideEnd));
				}
				return false;
			}
		  } catch (err) {
			console.warn("[LivePreview] Decoration error for node:", err);
		  }
		},
	});

	// Sort decorations by from position (required by CM6)
	decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);

	// Filter out overlapping decorations (CM6 doesn't allow overlapping replace decorations)
	const filtered: Range<Decoration>[] = [];
	let lastTo = -1;
	for (const deco of decorations) {
		// Line decorations (from === range start) always safe
		if (deco.value.spec?.class && !deco.value.spec?.widget) {
			filtered.push(deco);
			continue;
		}
		if (deco.from >= lastTo) {
			filtered.push(deco);
			if (deco.to > deco.from) lastTo = deco.to;
		}
	}

	return Decoration.set(filtered, true);
}

// ── ViewPlugin implementation ──

const livePreviewViewPlugin = ViewPlugin.fromClass(
	class implements PluginValue {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildLivePreviewDecorations(view);
		}

		update(update: ViewUpdate): void {
			if (update.docChanged || update.selectionSet || update.viewportChanged) {
				this.decorations = buildLivePreviewDecorations(update.view);
			}
		}
	},
	{
		decorations: (v) => v.decorations,
	}
);

/**
 * Create a CM6 extension for Live Preview mode.
 *
 * @param enabled - Whether Live Preview decorations should be active
 * @returns CM6 Extension (empty array when disabled)
 *
 * @example
 * ```ts
 * // Use in a Compartment for dynamic toggling
 * const livePreviewCompartment = new Compartment();
 * const ext = livePreviewCompartment.of(livePreviewPlugin(true));
 * ```
 *
 * @since 0.0.30
 */
export function livePreviewPlugin(enabled: boolean): Extension {
	if (!enabled) return [];
	return [livePreviewViewPlugin, livePreviewBlockField];
}
