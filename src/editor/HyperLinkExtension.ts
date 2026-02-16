/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module HyperLinkExtension
 * @description CodeMirror 6 extension that makes URLs and WikiLinks clickable
 * in source mode. Uses @uiw/codemirror-extensions-hyper-link under the hood.
 *
 * In source mode, bare URLs (http/https) and WikiLinks ([[target]]) are
 * decorated as clickable links. WikiLinks are rendered with the
 * `internal-link` class and `data-href` attribute so they integrate with
 * the delegated click handler in EditorManager.
 *
 * In live-preview mode, only bare URLs benefit from this extension since
 * WikiLinks are already replaced by LivePreviewPlugin widgets.
 *
 * @since 0.0.50
 */

import { hyperLinkExtension, hyperLinkStyle } from "@uiw/codemirror-extensions-hyper-link";
import type { Extension } from "@codemirror/state";

/**
 * WikiLink regex pattern that matches `[[target]]` and `[[target|alias]]`.
 * Also matches bare URLs (http/https) via the default behaviour of
 * hyperLinkExtension.
 */
const WIKILINK_REGEX = /\[\[([^\]]+?)\]\]/gi;

/**
 * Build the hyper-link CM6 extension for the editor.
 *
 * @returns CM6 Extension array with hyperlink decoration and styling
 *
 * @example
 * ```ts
 * import { buildHyperLinkExtension } from "./HyperLinkExtension.js";
 * const extensions = [buildHyperLinkExtension()];
 * ```
 *
 * @since 0.0.50
 */
export function buildHyperLinkExtension(): Extension {
	return [
		hyperLinkExtension({
			regexp: WIKILINK_REGEX,
			handle: (value: string, _input: string, _from: number, _to: number): string => {
				// value is the full match e.g. "[[My Note|alias]]"
				const inner = value.slice(2, -2);
				const pipeIdx = inner.indexOf("|");
				const target = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
				return `wikilink://${encodeURIComponent(target)}`;
			},
			anchor: (dom: HTMLAnchorElement): HTMLAnchorElement => {
				const href = dom.getAttribute("href") || "";
				if (href.startsWith("wikilink://")) {
					// Style as internal link for delegated click handling
					const target = decodeURIComponent(href.replace("wikilink://", ""));
					dom.className = "cm-hyper-link-icon internal-link";
					dom.dataset.href = target;
					dom.removeAttribute("href");
					dom.title = target;
				}
				return dom;
			},
		}),
		hyperLinkStyle,
	];
}
