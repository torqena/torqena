/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module MarkedExtensions
 * @description Configures `marked` with extensions for Obsidian-flavored markdown
 * rendering in reading view.
 *
 * Adds support for:
 * - `==highlight==` → `<mark>`
 * - `[[wikilinks]]` → internal links
 * - `![[embeds]]` → embedded content
 * - `%%comments%%` → stripped from output
 * - `> [!type]` callouts → styled callout blocks
 * - `$math$` and `$$math$$` → KaTeX rendered math
 * - Mermaid code blocks → diagram containers (post-rendered)
 * - Code syntax highlighting via highlight.js
 * - Footnotes via marked-footnote
 * - Obsidian image sizing `![alt|WxH](url)`
 *
 * @since 0.0.42
 */

import { marked, type TokenizerAndRendererExtension, type MarkedExtension } from "marked";
import hljs from "highlight.js";
import katex from "katex";

/** Callout type → icon SVG mapping (subset of Lucide icons) */
const CALLOUT_ICONS: Record<string, string> = {
	note: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
	abstract: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
	info: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
	todo: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
	tip: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
	success: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
	question: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
	warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
	failure: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
	danger: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
	bug: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="14" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/></svg>`,
	example: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
	quote: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>`,
};

/** Callout type aliases */
const CALLOUT_ALIASES: Record<string, string> = {
	summary: "abstract",
	tldr: "abstract",
	hint: "tip",
	important: "tip",
	check: "success",
	done: "success",
	help: "question",
	faq: "question",
	caution: "warning",
	attention: "warning",
	fail: "failure",
	missing: "failure",
	error: "danger",
	cite: "quote",
};

/** Callout type → CSS color variable */
const CALLOUT_COLORS: Record<string, string> = {
	note: "68, 138, 255",
	abstract: "0, 176, 255",
	info: "68, 138, 255",
	todo: "68, 138, 255",
	tip: "0, 191, 165",
	success: "0, 200, 83",
	question: "255, 145, 0",
	warning: "255, 145, 0",
	failure: "255, 82, 82",
	danger: "255, 23, 68",
	bug: "255, 82, 82",
	example: "124, 77, 255",
	quote: "158, 158, 158",
};

/**
 * Resolve a callout type (including aliases) to its canonical type.
 * @internal
 */
function resolveCalloutType(type: string): string {
	const lower = type.toLowerCase();
	return CALLOUT_ALIASES[lower] || lower;
}

/**
 * Get icon SVG for a callout type.
 * @internal
 */
function getCalloutIcon(type: string): string {
	return CALLOUT_ICONS[type] ?? CALLOUT_ICONS.note ?? "";
}

/**
 * Get color for a callout type (RGB string for CSS).
 * @internal
 */
function getCalloutColor(type: string): string {
	return CALLOUT_COLORS[type] ?? CALLOUT_COLORS.note ?? "";
}

// ── Inline extensions ──

/** Highlight extension: ==text== → <mark>text</mark> */
const highlightExtension: TokenizerAndRendererExtension = {
	name: "highlight",
	level: "inline",
	start(src) {
		return src.indexOf("==");
	},
	tokenizer(src) {
		const match = src.match(/^==([^=]+?)==/);
		if (match) {
			return {
				type: "highlight",
				raw: match[0],
				text: match[1],
				tokens: [],
			};
		}
		return undefined;
	},
	renderer(token) {
		return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`;
	},
};

/** WikiLink extension: [[target|alias]] → <a class="internal-link"> */
const wikilinkExtension: TokenizerAndRendererExtension = {
	name: "wikilink",
	level: "inline",
	start(src) {
		return src.indexOf("[[");
	},
	tokenizer(src) {
		// Don't match embeds ![[
		const match = src.match(/^\[\[([^\]]+?)\]\]/);
		if (match) {
			const full = match[1] ?? "";
			const pipeIndex = full.indexOf("|");
			const target = pipeIndex >= 0 ? full.slice(0, pipeIndex) : full;
			const display = pipeIndex >= 0 ? full.slice(pipeIndex + 1) : full;
			return {
				type: "wikilink",
				raw: match[0],
				target,
				display,
			};
		}
		return undefined;
	},
	renderer(token) {
		const target = token.target as string;
		const display = token.display as string;
		return `<a class="internal-link" data-href="${target.replace(/"/g, "&quot;")}">${display}</a>`;
	},
};

/** Embed extension: ![[target]] → embedded content placeholder */
const embedExtension: TokenizerAndRendererExtension = {
	name: "embed",
	level: "inline",
	start(src) {
		return src.indexOf("![[");
	},
	tokenizer(src) {
		const match = src.match(/^!\[\[([^\]]+?)\]\]/);
		if (match) {
			const target = match[1] ?? "";
			// Check if it's an image embed
			const isImage = /\.(png|jpe?g|gif|svg|webp|bmp|ico)(\|.*)?$/i.test(target);
			return {
				type: "embed",
				raw: match[0],
				target,
				isImage,
			};
		}
		return undefined;
	},
	renderer(token) {
		const target = token.target as string;
		if (token.isImage) {
			// Parse optional sizing: ![[image.png|100x200]] or ![[image.png|100]]
			const sizeMatch = target.match(/^(.+)\|(\d+)(?:x(\d+))?$/);
			if (sizeMatch) {
				const src = sizeMatch[1];
				const w = sizeMatch[2];
				const h = sizeMatch[3];
				const attrs = h ? `width="${w}" height="${h}"` : `width="${w}"`;
				return `<img src="${src}" alt="${src}" ${attrs} loading="lazy" />`;
			}
			return `<img src="${target}" alt="${target}" loading="lazy" />`;
		}
		return `<div class="embed-placeholder" data-embed="${target.replace(/"/g, "&quot;")}"><span class="embed-icon">📄</span> ${target}</div>`;
	},
};

/** Comment extension: %%text%% → stripped from output */
const commentExtension: TokenizerAndRendererExtension = {
	name: "obsidianComment",
	level: "inline",
	start(src) {
		return src.indexOf("%%");
	},
	tokenizer(src) {
		const match = src.match(/^%%([\s\S]+?)%%/);
		if (match) {
			return {
				type: "obsidianComment",
				raw: match[0],
				text: match[1],
			};
		}
		return undefined;
	},
	renderer() {
		return ""; // Comments are hidden
	},
};

/** Inline math: $expression$ → KaTeX rendered */
const inlineMathExtension: TokenizerAndRendererExtension = {
	name: "inlineMath",
	level: "inline",
	start(src) {
		return src.indexOf("$");
	},
	tokenizer(src) {
		// Don't match $$ (block math)
		if (src.startsWith("$$")) return undefined;
		const match = src.match(/^\$([^\s$](?:[^$]*[^\s$])?)\$/);
		if (match) {
			return {
				type: "inlineMath",
				raw: match[0],
				expression: match[1],
			};
		}
		return undefined;
	},
	renderer(token) {
		try {
			return katex.renderToString(token.expression as string, {
				displayMode: false,
				throwOnError: false,
				output: "htmlAndMathml",
			});
		} catch {
			return `<code class="math-error">${token.expression}</code>`;
		}
	},
};

/** Block math: $$expression$$ → KaTeX rendered (block mode) */
const blockMathExtension: TokenizerAndRendererExtension = {
	name: "blockMath",
	level: "block",
	start(src) {
		// Only match $$ at the start of a line to avoid matching $$ inside
		// inline code spans like `$$` which would consume the entire document.
		const match = src.match(/(^|\n)\$\$/);
		if (!match) return -1;
		return match.index! + (match[1] === "\n" ? 1 : 0);
	},
	tokenizer(src) {
		const match = src.match(/^\$\$([\s\S]+?)\$\$/);
		if (match?.[1]) {
			return {
				type: "blockMath",
				raw: match[0],
				expression: match[1].trim(),
			};
		}
		return undefined;
	},
	renderer(token) {
		try {
			return katex.renderToString(token.expression as string, {
				displayMode: true,
				throwOnError: false,
				output: "htmlAndMathml",
			});
		} catch {
			return `<pre class="math-error"><code>${token.expression}</code></pre>`;
		}
	},
};

/** Image sizing: ![alt|WxH](url) → <img> with dimensions */
const imageSizingExtension: MarkedExtension = {
	renderer: {
		image(href: string, title: string | null, text: string) {
			// Check for Obsidian image sizing: alt|WxH or alt|W
			const sizeMatch = text.match(/^(.+)\|(\d+)(?:x(\d+))?$/);
			if (sizeMatch) {
				const alt = sizeMatch[1];
				const w = sizeMatch[2];
				const h = sizeMatch[3];
				const titleAttr = title ? ` title="${title}"` : "";
				const hAttr = h ? ` height="${h}"` : "";
				return `<img src="${href}" alt="${alt}" width="${w}"${hAttr}${titleAttr} loading="lazy" />`;
			}
			const titleAttr = title ? ` title="${title}"` : "";
			return `<img src="${href}" alt="${text}"${titleAttr} loading="lazy" />`;
		},
	},
};

/**
 * Callout extension: renders blockquotes starting with `[!type]` as callout blocks.
 *
 * This overrides the default blockquote renderer to detect and style callouts.
 */
const calloutExtension: MarkedExtension = {
	renderer: {
		blockquote(quote: string) {
			const html = quote;
			// Check if the blockquote starts with a callout marker [!type]
			// The content comes pre-rendered, so we look for [!type] in the HTML
			// Use [\s\S] instead of . with /s flag for ES6 compatibility
			const calloutMatch = html.match(
				/^\s*<p>\s*\[!([\w-]+)\]([+-])?\s*([\s\S]*?)(?:<\/p>|<br>)/
			);
			if (!calloutMatch) {
				return `<blockquote>${html}</blockquote>\n`;
			}

			const rawType = calloutMatch[1] ?? "note";
			const foldMarker = calloutMatch[2] || "";
			const customTitle = calloutMatch[3]?.trim() || "";
			const resolvedType = resolveCalloutType(rawType);
			const icon = getCalloutIcon(resolvedType);
			const color = getCalloutColor(resolvedType);
			const title = customTitle || rawType.charAt(0).toUpperCase() + rawType.slice(1);
			const isFoldable = foldMarker === "+" || foldMarker === "-";
			const isCollapsed = foldMarker === "-";

			// Extract body content after the callout marker.
			// With breaks:true, marked renders the first paragraph as:
			//   <p>[!type]<br>Content line...<br>More...</p>
			// so content after the marker may be in the same <p> tag.
			const matchEnd = calloutMatch.index! + calloutMatch[0].length;
			let body = html.slice(matchEnd).trim();

			// If the match ended at <br>, remaining text is still inside the
			// same <p> — wrap it back into a paragraph for proper display.
			if (calloutMatch[0].endsWith("<br>")) {
				const closingP = body.indexOf("</p>");
				if (closingP >= 0) {
					const inlinePart = body.slice(0, closingP);
					const rest = body.slice(closingP + 4).trim();
					body = inlinePart ? `<p>${inlinePart}</p>${rest ? "\n" + rest : ""}` : rest;
				}
			} else if (body.startsWith("</p>")) {
				// Match ended at </p> — body is subsequent elements
				body = body.slice(4).trim();
			}

			const foldClass = isFoldable ? " is-foldable" : "";
			const collapsedClass = isCollapsed ? " is-collapsed" : "";
			const foldIndicator = isFoldable
				? `<svg class="callout-fold" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
				: "";

			return `<div class="callout${foldClass}${collapsedClass}" data-callout="${resolvedType}" style="--callout-color: ${color}">
	<div class="callout-title">
		<div class="callout-icon">${icon}</div>
		<div class="callout-title-inner">${title}</div>
		${foldIndicator}
	</div>
	<div class="callout-content">${body}</div>
</div>\n`;
		},
	},
};

/**
 * Unified code block renderer: handles mermaid containers and
 * hljs syntax highlighting for all other code blocks.
 * Replaces both markedHighlight and the separate mermaid renderer
 * to avoid double-escaping issues in the renderer chain.
 */
const codeBlockExtension: MarkedExtension = {
	renderer: {
		code(code: string, infostring: string | undefined) {
			// Mermaid diagrams: render as containers for post-processing
			if (infostring === "mermaid") {
				const escaped = code
					.replace(/&/g, "&amp;")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;");
				return `<div class="mermaid-container"><pre class="mermaid">${escaped}</pre></div>\n`;
			}

			// Math/LaTeX code blocks: let default renderer handle
			if (infostring === "math" || infostring === "latex") {
				return false;
			}

			// Syntax highlighting via highlight.js
			let highlighted: string;
			if (infostring && hljs.getLanguage(infostring)) {
				highlighted = hljs.highlight(code, { language: infostring }).value;
			} else {
				highlighted = hljs.highlightAuto(code).value;
			}
			const langClass = infostring ? `hljs language-${infostring}` : "hljs";
			return `<pre><code class="${langClass}">${highlighted}</code></pre>\n`;
		},
	},
};

/**
 * Configure `marked` with all Obsidian-flavored extensions.
 * Call this once during initialization.
 *
 * @example
 * ```ts
 * import { configureMarked } from "./MarkedExtensions.js";
 * configureMarked();
 * // Now marked.parse() supports all Obsidian-flavored markdown
 * ```
 *
 * @since 0.0.42
 */
export function configureMarked(): void {
	marked.use({ gfm: true, breaks: true });

	// Custom extensions
	marked.use({
		extensions: [
			highlightExtension,
			wikilinkExtension,
			embedExtension,
			commentExtension,
			inlineMathExtension,
			blockMathExtension,
		],
	});

	// Renderer overrides (code renderer handles both hljs + mermaid)
	marked.use(imageSizingExtension);
	marked.use(calloutExtension);
	marked.use(codeBlockExtension);
}

/**
 * Post-process rendered HTML to initialize Mermaid diagrams.
 * Call after setting innerHTML on a container.
 *
 * @param container - The DOM element containing rendered markdown
 *
 * @example
 * ```ts
 * container.innerHTML = marked.parse(markdown);
 * await postProcessMermaid(container);
 * ```
 */
export async function postProcessMermaid(container: HTMLElement): Promise<void> {
	const mermaidEls = Array.from(container.querySelectorAll("pre.mermaid")) as HTMLElement[];
	if (mermaidEls.length === 0) return;

	try {
		const mermaid = (await import("mermaid")).default;
		mermaid.initialize({
			startOnLoad: false,
			theme: "dark",
			securityLevel: "strict",
		});

		// Render each diagram individually so one failure doesn't break the rest.
		// Read from textContent (which decodes HTML entities) since
		// mermaid.run() reads innerHTML which keeps entities escaped.
		let idCounter = 0;
		for (const el of mermaidEls) {
			try {
				const source = el.textContent || "";
				const id = `mermaid-rv-${++idCounter}`;
				const { svg } = await mermaid.render(id, source);
				// Replace the <pre> content with the rendered SVG
				const wrapper = el.parentElement;
				if (wrapper && wrapper.classList.contains("mermaid-container")) {
					wrapper.innerHTML = svg;
				} else {
					el.innerHTML = svg;
				}
			} catch (diagErr) {
				console.warn("[MarkedExtensions] Mermaid diagram failed:", diagErr);
				if (!el.parentElement?.querySelector(".mermaid-error")) {
					const errDiv = document.createElement("div");
					errDiv.className = "mermaid-error";
					errDiv.textContent = "Mermaid diagram failed to render";
					el.parentElement?.appendChild(errDiv);
				}
			}
		}
	} catch (err) {
		console.warn("[MarkedExtensions] Mermaid init failed:", err);
	}
}

/**
 * Post-process rendered HTML to add copy buttons to code blocks
 * and language labels.
 *
 * @param container - The DOM element containing rendered markdown
 */
export function postProcessCodeBlocks(container: HTMLElement): void {
	const codeBlocks = Array.from(container.querySelectorAll("pre > code")) as HTMLElement[];
	for (const codeEl of codeBlocks) {
		const pre = codeEl.parentElement;
		if (!pre || pre.classList.contains("mermaid")) continue;
		if (pre.querySelector(".code-block-header")) continue; // Already processed

		// Extract language from class name
		const langClass = Array.from(codeEl.classList).find((c: string) => c.startsWith("language-"));
		const lang = langClass ? langClass.replace("language-", "").replace("hljs ", "") : "";

		// Create header bar
		const header = document.createElement("div");
		header.className = "code-block-header";

		const langLabel = document.createElement("span");
		langLabel.className = "code-block-lang";
		langLabel.textContent = lang || "text";
		header.appendChild(langLabel);

		const copyBtn = document.createElement("button");
		copyBtn.className = "code-block-copy";
		copyBtn.textContent = "Copy";
		copyBtn.addEventListener("click", () => {
			const text = codeEl.textContent || "";
			navigator.clipboard.writeText(text).then(() => {
				copyBtn.textContent = "Copied!";
				setTimeout(() => {
					copyBtn.textContent = "Copy";
				}, 2000);
			});
		});
		header.appendChild(copyBtn);

		pre.classList.add("has-header");
		pre.insertBefore(header, pre.firstChild);
	}
}

/**
 * Post-process rendered HTML to make foldable callouts interactive.
 *
 * @param container - The DOM element containing rendered markdown
 */
export function postProcessCallouts(container: HTMLElement): void {
	const foldables = Array.from(container.querySelectorAll(".callout.is-foldable")) as HTMLElement[];
	for (const callout of foldables) {
		const titleEl = callout.querySelector<HTMLElement>(".callout-title");
		if (!titleEl) continue;
		titleEl.style.cursor = "pointer";
		titleEl.addEventListener("click", () => {
			callout.classList.toggle("is-collapsed");
		});
	}
}

/**
 * Post-process rendered HTML to make links interactive.
 *
 * Attaches click handlers to:
 * - Internal links (`a.internal-link[data-href]`) → calls `onNavigate`
 * - External links (`a[href^="http"]`) → opens in new browser tab
 *
 * @param container - The DOM element containing rendered markdown
 * @param onNavigate - Callback invoked with the WikiLink target when an internal link is clicked
 *
 * @example
 * ```ts
 * postProcessLinks(previewEl, (target) => editor.openFile(resolveLink(target)));
 * ```
 *
 * @since 0.0.50
 */
export function postProcessLinks(
	container: HTMLElement,
	onNavigate: (target: string) => void,
): void {
	// Internal links
	const internalLinks = Array.from(
		container.querySelectorAll<HTMLAnchorElement>("a.internal-link[data-href]"),
	);
	for (const link of internalLinks) {
		link.addEventListener("click", (e) => {
			e.preventDefault();
			const target = link.dataset.href;
			if (target) {
				onNavigate(target);
			}
		});
	}

	// External links
	const externalLinks = Array.from(
		container.querySelectorAll<HTMLAnchorElement>("a[href]"),
	);
	for (const link of externalLinks) {
		if (link.classList.contains("internal-link")) continue;
		const href = link.getAttribute("href") || "";
		if (href.startsWith("http://") || href.startsWith("https://")) {
			link.addEventListener("click", (e) => {
				e.preventDefault();
				window.open(href, "_blank", "noopener");
			});
		}
	}
}
