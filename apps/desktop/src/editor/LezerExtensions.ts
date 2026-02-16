/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module LezerExtensions
 * @description Custom Lezer markdown parser extensions for Obsidian-flavored markdown.
 *
 * Provides inline and block parsers for:
 * - `==highlight==` syntax
 * - `[[wikilinks]]` and `[[wikilinks|alias]]`
 * - `![[embeds]]`
 * - `%%comments%%` (Obsidian hidden comments)
 * - `$inline math$` and `$$block math$$`
 * - `[^footnote]` references
 *
 * These extensions produce named Lezer nodes that the LivePreviewPlugin can
 * detect and decorate.
 *
 * @since 0.0.42
 */

import { MarkdownConfig } from "@lezer/markdown";

/**
 * Highlight extension: parses `==text==` into a `Highlight` node.
 *
 * @example
 * ```markdown
 * This is ==highlighted text== in a paragraph.
 * ```
 */
export const Highlight: MarkdownConfig = {
	defineNodes: ["Highlight", "HighlightMark"],
	parseInline: [
		{
			name: "Highlight",
			parse(cx, next, pos) {
				if (next !== 61 /* = */ || cx.char(pos + 1) !== 61) return -1;
				// Find closing ==
				let end = pos + 2;
				while (end < cx.end) {
					if (cx.char(end) === 61 && cx.char(end + 1) === 61) {
						// Build the node: ==content==
						return cx.addElement(
							cx.elt("Highlight", pos, end + 2, [
								cx.elt("HighlightMark", pos, pos + 2),
								cx.elt("HighlightMark", end, end + 2),
							])
						);
					}
					end++;
				}
				return -1;
			},
		},
	],
};

/**
 * WikiLink extension: parses `[[target]]` and `[[target|alias]]` into a `WikiLink` node.
 *
 * @example
 * ```markdown
 * Link to [[Another Note]] or [[Note|display text]].
 * ```
 */
export const WikiLink: MarkdownConfig = {
	defineNodes: ["WikiLink", "WikiLinkMark"],
	parseInline: [
		{
			name: "WikiLink",
			parse(cx, next, pos) {
				// Must start with [[ but NOT ![[
				if (next !== 91 /* [ */ || cx.char(pos + 1) !== 91) return -1;
				// Check it's not an embed (preceded by !)
				if (pos > 0 && cx.char(pos - 1) === 33 /* ! */) return -1;
				let end = pos + 2;
				while (end < cx.end - 1) {
					if (cx.char(end) === 93 /* ] */ && cx.char(end + 1) === 93) {
						return cx.addElement(
							cx.elt("WikiLink", pos, end + 2, [
								cx.elt("WikiLinkMark", pos, pos + 2),
								cx.elt("WikiLinkMark", end, end + 2),
							])
						);
					}
					// Don't allow newlines inside wikilinks
					if (cx.char(end) === 10) return -1;
					end++;
				}
				return -1;
			},
		},
	],
};

/**
 * Embed extension: parses `![[target]]` into an `Embed` node.
 *
 * @example
 * ```markdown
 * ![[Image.png]]
 * ![[Note to embed]]
 * ```
 */
export const Embed: MarkdownConfig = {
	defineNodes: ["Embed", "EmbedMark"],
	parseInline: [
		{
			name: "Embed",
			parse(cx, next, pos) {
				// Must start with ![[
				if (next !== 33 /* ! */ || cx.char(pos + 1) !== 91 || cx.char(pos + 2) !== 91) return -1;
				let end = pos + 3;
				while (end < cx.end - 1) {
					if (cx.char(end) === 93 && cx.char(end + 1) === 93) {
						return cx.addElement(
							cx.elt("Embed", pos, end + 2, [
								cx.elt("EmbedMark", pos, pos + 3),
								cx.elt("EmbedMark", end, end + 2),
							])
						);
					}
					if (cx.char(end) === 10) return -1;
					end++;
				}
				return -1;
			},
		},
	],
};

/**
 * ObsidianComment extension: parses `%%text%%` into an `ObsidianComment` node.
 * Comments are hidden in reading/live preview mode.
 *
 * @example
 * ```markdown
 * This is visible %%this is hidden%% text.
 * ```
 */
export const ObsidianComment: MarkdownConfig = {
	defineNodes: ["ObsidianComment", "ObsidianCommentMark"],
	parseInline: [
		{
			name: "ObsidianComment",
			parse(cx, next, pos) {
				if (next !== 37 /* % */ || cx.char(pos + 1) !== 37) return -1;
				let end = pos + 2;
				while (end < cx.end - 1) {
					if (cx.char(end) === 37 && cx.char(end + 1) === 37) {
						return cx.addElement(
							cx.elt("ObsidianComment", pos, end + 2, [
								cx.elt("ObsidianCommentMark", pos, pos + 2),
								cx.elt("ObsidianCommentMark", end, end + 2),
							])
						);
					}
					end++;
				}
				return -1;
			},
		},
	],
};

/**
 * InlineMath extension: parses `$expression$` into a `MathInline` node.
 * Does not match `$$` (that's block math).
 *
 * @example
 * ```markdown
 * The equation $e^{i\pi} + 1 = 0$ is beautiful.
 * ```
 */
export const InlineMath: MarkdownConfig = {
	defineNodes: ["MathInline", "MathInlineMark"],
	parseInline: [
		{
			name: "MathInline",
			parse(cx, next, pos) {
				if (next !== 36 /* $ */) return -1;
				// Not block math ($$)
				if (cx.char(pos + 1) === 36) return -1;
				// Content must not start with space
				if (cx.char(pos + 1) === 32) return -1;
				let end = pos + 1;
				while (end < cx.end) {
					if (cx.char(end) === 36 && cx.char(end - 1) !== 32) {
						// Don't match if preceded by backslash
						if (end > 0 && cx.char(end - 1) === 92 /* \ */) {
							end++;
							continue;
						}
						// Must have content
						if (end === pos + 1) return -1;
						return cx.addElement(
							cx.elt("MathInline", pos, end + 1, [
								cx.elt("MathInlineMark", pos, pos + 1),
								cx.elt("MathInlineMark", end, end + 1),
							])
						);
					}
					// Don't cross newlines
					if (cx.char(end) === 10) return -1;
					end++;
				}
				return -1;
			},
		},
	],
};

/**
 * FootnoteRef extension: parses `[^id]` into a `FootnoteRef` node.
 *
 * @example
 * ```markdown
 * This has a footnote[^1] reference.
 * [^1]: The footnote text.
 * ```
 */
export const FootnoteRef: MarkdownConfig = {
	defineNodes: ["FootnoteRef"],
	parseInline: [
		{
			name: "FootnoteRef",
			parse(cx, next, pos) {
				if (next !== 91 /* [ */ || cx.char(pos + 1) !== 94 /* ^ */) return -1;
				let end = pos + 2;
				while (end < cx.end) {
					if (cx.char(end) === 93 /* ] */) {
						// Must have an id
						if (end === pos + 2) return -1;
						return cx.addElement(cx.elt("FootnoteRef", pos, end + 1));
					}
					// Only alphanumeric, -, _
					const ch = cx.char(end);
					const valid =
						(ch >= 48 && ch <= 57) || // 0-9
						(ch >= 65 && ch <= 90) || // A-Z
						(ch >= 97 && ch <= 122) || // a-z
						ch === 45 || ch === 95; // - _
					if (!valid) return -1;
					end++;
				}
				return -1;
			},
		},
	],
};

/**
 * Get all custom Lezer markdown extensions for Obsidian-flavored markdown.
 *
 * @returns Array of MarkdownConfig extensions to pass to `markdown({ extensions: [...] })`
 *
 * @example
 * ```ts
 * import { getLezerExtensions } from "./LezerExtensions.js";
 * markdown({ base: markdownLanguage, codeLanguages: languages, extensions: getLezerExtensions() })
 * ```
 */
export function getLezerExtensions(): MarkdownConfig[] {
	return [Highlight, WikiLink, Embed, ObsidianComment, InlineMath, FootnoteRef];
}
