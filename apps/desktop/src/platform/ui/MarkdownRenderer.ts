/**
 * MarkdownRenderer — renders markdown to HTML.
 *
 * Replicates Obsidian's MarkdownRenderer.render() using the `marked`
 * library. Post-processes [[wiki-links]] into internal link elements.
 */

import { marked } from "marked";
import type { App } from "../core/App.js";
import type { Component } from "../core/Component.js";

export class MarkdownRenderer {
	/**
	 * Render markdown text into an HTML element.
	 *
	 * @param app - The app instance (unused in shim but required for API compat)
	 * @param markdown - Markdown source text
	 * @param el - Target element to render into
	 * @param sourcePath - Source file path for link resolution
	 * @param component - Parent component for lifecycle management
	 */
	static async render(
		_app: App,
		markdown: string,
		el: HTMLElement,
		_sourcePath: string,
		_component: Component,
	): Promise<void> {
		// Pre-process: convert [[wiki-links]] to placeholder anchors
		const processed = markdown.replace(
			/\[\[([^\]]+)\]\]/g,
			(_match, linkText: string) => {
				const parts = linkText.split("|");
				const href = parts[0]!.trim();
				const display = (parts[1] || parts[0])!.trim();
				return `<a class="internal-link" data-href="${href}">${display}</a>`;
			},
		);

		// Render markdown to HTML
		const html = await marked(processed, {
			breaks: true,
			gfm: true,
		});

		el.innerHTML = html;

		// Add syntax highlighting class hints for code blocks
		el.querySelectorAll("pre code").forEach((block) => {
			block.parentElement?.addClass("code-block");
		});
	}
}
