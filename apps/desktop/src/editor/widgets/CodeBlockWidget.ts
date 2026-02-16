/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module CodeBlockWidget
 * @description CodeMirror 6 widget for enhanced code blocks in Live Preview mode.
 *
 * Adds:
 * - Language label header
 * - Copy-to-clipboard button
 * - Syntax highlighting via highlight.js
 *
 * @since 0.0.42
 */

import { WidgetType } from "@codemirror/view";
import hljs from "highlight.js";

/**
 * Widget that renders a language label + copy button header for code blocks.
 * Placed as a block widget at the start of a FencedCode node.
 *
 * @example
 * ```ts
 * new CodeBlockHeaderWidget("typescript", "const x = 1;")
 * ```
 */
export class CodeBlockHeaderWidget extends WidgetType {
	constructor(
		readonly language: string,
		readonly code: string,
	) {
		super();
	}

	toDOM(): HTMLElement {
		const header = document.createElement("div");
		header.className = "cm-codeblock-header";

		const langLabel = document.createElement("span");
		langLabel.className = "cm-codeblock-lang";
		langLabel.textContent = this.language || "text";
		header.appendChild(langLabel);

		const copyBtn = document.createElement("button");
		copyBtn.className = "cm-codeblock-copy";
		copyBtn.textContent = "Copy";
		copyBtn.addEventListener("mousedown", (e) => {
			e.preventDefault(); // Don't steal focus from editor
			e.stopPropagation();
			navigator.clipboard.writeText(this.code).then(() => {
				copyBtn.textContent = "Copied!";
				setTimeout(() => {
					copyBtn.textContent = "Copy";
				}, 2000);
			});
		});
		header.appendChild(copyBtn);

		return header;
	}

	eq(other: CodeBlockHeaderWidget): boolean {
		return this.language === other.language && this.code === other.code;
	}

	get estimatedHeight(): number {
		return 28;
	}
}

/**
 * Highlight a code string with highlight.js and return HTML.
 *
 * @param code - The code to highlight
 * @param language - The language identifier
 * @returns HTML string with syntax highlighting classes
 *
 * @example
 * ```ts
 * const html = highlightCode("const x = 1;", "typescript");
 * ```
 */
export function highlightCode(code: string, language: string): string {
	if (language && hljs.getLanguage(language)) {
		return hljs.highlight(code, { language }).value;
	}
	return hljs.highlightAuto(code).value;
}
