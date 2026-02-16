/**
 * setIcon — renders a Lucide icon into an element.
 *
 * Replicates Obsidian's setIcon() function. Uses the lucide library
 * to generate SVG markup for the given icon name.
 */

import { icons, createElement } from "lucide";

/**
 * Render a Lucide icon into the given element.
 * Clears the element's content and inserts the SVG.
 *
 * @param el - Target element
 * @param iconId - Lucide icon name (e.g. "message-square", "settings")
 */
export function setIcon(el: HTMLElement, iconId: string): void {
	// Lucide uses PascalCase internally but accepts kebab-case
	const iconData = (icons as any)[toPascalCase(iconId)];
	if (!iconData) {
		// Fallback: set a text placeholder
		el.textContent = "";
		return;
	}

	const svgEl = createElement(iconData);
	svgEl.setAttribute("width", "16");
	svgEl.setAttribute("height", "16");
	svgEl.classList.add("svg-icon");

	el.textContent = "";
	el.appendChild(svgEl as unknown as Node);
}

/** Convert kebab-case to PascalCase (e.g. "message-square" -> "MessageSquare"). */
function toPascalCase(str: string): string {
	return str
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}
