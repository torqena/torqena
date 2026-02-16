/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module SectionHelpers
 * @description Shared helper functions and context type for settings sections.
 *
 * Provides the `SettingSectionContext` interface that each section renderer receives,
 * plus reusable UI helpers like `createCollapsibleSection` and `renderDirectoryList`.
 *
 * @since 0.0.15
 */

import { App, Setting } from "obsidian";
import { AIServiceManager as CopilotPlugin } from "../../../app/AIServiceManager";
import { GitHubCopilotCliManager } from "../../../ai/providers/GitHubCopilotCliManager";
import { ToolCatalog } from "../../../ai/tools/ToolCatalog";

/**
 * Shared context passed to each section renderer function.
 *
 * @internal
 */
export interface SettingSectionContext {
	app: App;
	plugin: CopilotPlugin;
	cliManager: GitHubCopilotCliManager;
	toolCatalog: ToolCatalog;
	/** Re-render the entire settings tab */
	refreshDisplay: () => void;
}

/**
 * Create a collapsible section using `<details>`/`<summary>`.
 *
 * @param container - Parent element to append to
 * @param title - Section heading text
 * @param extraClasses - Additional CSS classes for the details element
 * @param headingLevel - Heading level (default "h3")
 * @returns Object with details element and content container
 *
 * @example
 * ```typescript
 * const { details, content } = createCollapsibleSection(el, "My Section");
 * content.createEl("p", { text: "Hello" });
 * ```
 *
 * @internal
 */
export function createCollapsibleSection(
	container: HTMLElement,
	title: string,
	extraClasses?: string,
	headingLevel: keyof HTMLElementTagNameMap = "h3"
): { details: HTMLDetailsElement; content: HTMLDivElement } {
	const cls = "vc-settings-section vc-collapsible" + (extraClasses ? " " + extraClasses : "");
	const details = container.createEl("details", { cls });
	details.open = true;
	const summary = details.createEl("summary", { cls: "vc-section-summary" });
	summary.createEl(headingLevel, { text: title });
	const content = details.createDiv({ cls: "vc-section-content" });
	return { details, content };
}

/**
 * Render a directory list UI component with add/remove functionality.
 *
 * @param container - Parent element
 * @param title - Section title
 * @param description - Help text
 * @param directories - Current list of directory paths
 * @param onUpdate - Callback when directories change
 *
 * @internal
 */
export function renderDirectoryList(
	container: HTMLElement,
	title: string,
	description: string,
	directories: string[],
	onUpdate: (dirs: string[]) => Promise<void>
): void {
	const wrapper = container.createDiv({ cls: "vc-directory-list" });

	const headerRow = wrapper.createDiv({ cls: "vc-directory-header" });
	headerRow.createEl("label", { text: title, cls: "vc-directory-title" });
	headerRow.createEl("span", { text: description, cls: "vc-directory-desc" });

	const listContainer = wrapper.createDiv({ cls: "vc-directory-items" });

	const renderItems = () => {
		listContainer.empty();

		if (directories.length === 0) {
			listContainer.createEl("span", {
				text: "No directories configured",
				cls: "vc-directory-empty"
			});
		} else {
			for (let i = 0; i < directories.length; i++) {
				const dir = directories[i];
				const itemEl = listContainer.createDiv({ cls: "vc-directory-item" });

				itemEl.createEl("code", { text: dir, cls: "vc-directory-path" });

				const removeBtn = itemEl.createEl("button", {
					cls: "vc-btn-icon vc-btn-remove",
					attr: { "aria-label": "Remove directory" }
				});
				removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
				removeBtn.addEventListener("click", async () => {
					directories.splice(i, 1);
					await onUpdate(directories);
					renderItems();
				});
			}
		}
	};

	renderItems();

	// Add new directory input
	const addRow = wrapper.createDiv({ cls: "vc-directory-add" });
	const input = addRow.createEl("input", {
		type: "text",
		placeholder: "~/.copilot/skills, relative/path, or /absolute/path",
		cls: "vc-directory-input"
	});

	const addBtn = addRow.createEl("button", { text: "Add", cls: "vc-btn-secondary vc-btn-sm" });
	addBtn.addEventListener("click", async () => {
		const value = input.value.trim();
		if (value && !directories.includes(value)) {
			directories.push(value);
			await onUpdate(directories);
			input.value = "";
			renderItems();
		}
	});

	// Allow Enter key to add
	input.addEventListener("keydown", async (e) => {
		if (e.key === "Enter") {
			const value = input.value.trim();
			if (value && !directories.includes(value)) {
				directories.push(value);
				await onUpdate(directories);
				input.value = "";
				renderItems();
			}
		}
	});
}
