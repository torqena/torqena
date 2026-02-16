/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ToolSelectionSection
 * @description Tool Selection settings for configuring default enabled tools.
 *
 * This section lets users choose which tools are enabled by default for new
 * chat sessions using the tool picker modal.
 *
 * @since 0.0.16
 */

import { Setting } from "obsidian";
import { ToolPickerModal } from "../../../chat";
import { createCollapsibleSection, type SettingSectionContext } from "./SectionHelpers";

/**
 * Render the Tool Selection section.
 *
 * @param parentContainer - Parent element to render into
 * @param ctx - Shared settings context
 *
 * @example
 * renderToolSelectionSection(containerEl, ctx);
 *
 * @internal
 */
export function renderToolSelectionSection(
	parentContainer: HTMLElement,
	ctx: SettingSectionContext
): void {
	const { content: toolSection } = createCollapsibleSection(parentContainer, "Tool Selection");

	toolSection.createEl("p", {
		text: "Configure which tools are available to the AI by default. Built-in tools are enabled by default, MCP tools are disabled.",
		cls: "vc-status-desc"
	});

	const toolSummaryEl = toolSection.createDiv({ cls: "vc-tool-summary" });
	updateToolSummary(toolSummaryEl, ctx);

	new Setting(toolSection)
		.setName("Default Enabled Tools")
		.setDesc("Choose which tools are enabled by default for new chat sessions")
		.addButton((button) => {
			button
				.setButtonText("Configure Tools...")
				.onClick(() => {
					const modal = new ToolPickerModal(ctx.app, {
						toolCatalog: ctx.toolCatalog,
						settings: ctx.plugin.settings,
						session: undefined,
						mode: "defaults",
						onSave: async (enabledTools: string[]) => {
							ctx.plugin.settings.defaultEnabledTools = enabledTools;
							ctx.plugin.settings.defaultDisabledTools = [];
							await ctx.plugin.saveSettings();
							updateToolSummary(toolSummaryEl, ctx);
						}
					});
					modal.open();
				});
		});
}

/**
 * Update the tool summary line for enabled/total tools.
 *
 * @param container - Summary element container
 * @param ctx - Shared settings context
 *
 * @example
 * updateToolSummary(summaryEl, ctx);
 *
 * @internal
 */
function updateToolSummary(container: HTMLElement, ctx: SettingSectionContext): void {
	container.empty();
	const summary = ctx.toolCatalog.getToolsSummary(ctx.plugin.settings);
	container.createEl("span", {
		text: `${summary.enabled}/${summary.total} tools enabled (${summary.builtin} built-in, ${summary.plugin} plugin, ${summary.mcp} MCP)`,
		cls: "vc-status-detail"
	});
}
