/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module MermaidWidget
 * @description CodeMirror 6 widget for rendering Mermaid diagrams in Live Preview mode.
 *
 * Renders ```mermaid code blocks as SVG diagrams using the Mermaid.js library.
 * Falls back to displaying source code on render errors.
 *
 * @since 0.0.42
 */

import { WidgetType, EditorView } from "@codemirror/view";

/** Cache rendered SVGs by source code to avoid re-rendering on every update */
const renderCache = new Map<string, string>();
let mermaidInitialized = false;
let idCounter = 0;

/** Queue to serialize mermaid renders (concurrent renders corrupt shared state) */
let renderQueue: Promise<void> = Promise.resolve();

/**
 * Initialize Mermaid with appropriate settings.
 * @internal
 */
async function ensureMermaidInit(isDark: boolean): Promise<typeof import("mermaid").default> {
	const mermaid = (await import("mermaid")).default;
	if (!mermaidInitialized) {
		mermaid.initialize({
			startOnLoad: false,
			theme: isDark ? "dark" : "default",
			securityLevel: "strict",
			fontFamily: "var(--font-text, sans-serif)",
		});
		mermaidInitialized = true;
	}
	return mermaid;
}

/**
 * Widget that renders a Mermaid diagram from source code.
 *
 * @example
 * ```ts
 * new MermaidWidget("graph TD\n  A --> B")
 * ```
 */
export class MermaidWidget extends WidgetType {
	constructor(readonly source: string) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const wrapper = document.createElement("div");
		wrapper.className = "cm-mermaid-widget";

		// Check cache first
		const cached = renderCache.get(this.source);
		if (cached) {
			wrapper.innerHTML = cached;
			return wrapper;
		}

		// Show source as placeholder while rendering
		const placeholder = document.createElement("pre");
		placeholder.className = "cm-mermaid-source";
		placeholder.textContent = this.source;
		wrapper.appendChild(placeholder);

		// Render async
		const isDark = document.body.classList.contains("theme-dark");
		void this.renderDiagram(wrapper, isDark);

		return wrapper;
	}

	/**
	 * Render the mermaid diagram asynchronously.
	 * @internal
	 */
	private async renderDiagram(wrapper: HTMLElement, isDark: boolean): Promise<void> {
		// Serialize renders through a queue to avoid concurrent mermaid.render() calls
		// which corrupt mermaid's shared DOM state.
		const job = renderQueue.then(async () => {
			// Skip if the widget was already removed from the DOM
			if (!wrapper.isConnected) return;
			try {
				const mermaid = await ensureMermaidInit(isDark);
				const id = `mermaid-${++idCounter}`;
				const { svg } = await mermaid.render(id, this.source);
				renderCache.set(this.source, svg);
				if (wrapper.isConnected) wrapper.innerHTML = svg;
				} catch (err) {
				// Show error state
				if (!wrapper.isConnected) return;
				wrapper.innerHTML = "";
				const errorEl = document.createElement("div");
				errorEl.className = "cm-mermaid-error";

				const label = document.createElement("div");
				label.className = "cm-mermaid-error-label";
				label.textContent = "Mermaid diagram error";
				errorEl.appendChild(label);

				const source = document.createElement("pre");
				source.textContent = this.source;
				errorEl.appendChild(source);

				wrapper.appendChild(errorEl);
			}
		});
		renderQueue = job.catch(() => {});
	}

	eq(other: MermaidWidget): boolean {
		return this.source === other.source;
	}

	get estimatedHeight(): number {
		return 200;
	}
}
