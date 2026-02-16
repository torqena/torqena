/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module MathWidget
 * @description CodeMirror 6 widgets for rendering KaTeX math expressions in Live Preview mode.
 *
 * Provides:
 * - `InlineMathWidget` — renders `$expression$` inline
 * - `BlockMathWidget` — renders `$$expression$$` as a display block
 *
 * @since 0.0.42
 */

import { WidgetType } from "@codemirror/view";
import katex from "katex";

/**
 * Widget for inline math: `$expression$`
 *
 * @example
 * ```ts
 * new InlineMathWidget("e^{i\\pi} + 1 = 0")
 * ```
 */
export class InlineMathWidget extends WidgetType {
	constructor(readonly expression: string) {
		super();
	}

	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = "cm-math-inline";
		try {
			katex.render(this.expression, span, {
				displayMode: false,
				throwOnError: false,
				output: "htmlAndMathml",
			});
		} catch {
			span.textContent = `$${this.expression}$`;
			span.classList.add("cm-math-error");
		}
		return span;
	}

	eq(other: InlineMathWidget): boolean {
		return this.expression === other.expression;
	}
}

/**
 * Widget for block math: `$$expression$$`
 *
 * @example
 * ```ts
 * new BlockMathWidget("\\begin{vmatrix}a & b\\\\c & d\\end{vmatrix}=ad-bc")
 * ```
 */
export class BlockMathWidget extends WidgetType {
	constructor(readonly expression: string) {
		super();
	}

	toDOM(): HTMLElement {
		const div = document.createElement("div");
		div.className = "cm-math-block";
		try {
			katex.render(this.expression, div, {
				displayMode: true,
				throwOnError: false,
				output: "htmlAndMathml",
			});
		} catch {
			const pre = document.createElement("pre");
			pre.className = "cm-math-error";
			pre.textContent = this.expression;
			div.appendChild(pre);
		}
		return div;
	}

	eq(other: BlockMathWidget): boolean {
		return this.expression === other.expression;
	}

	get estimatedHeight(): number {
		return 48;
	}
}
