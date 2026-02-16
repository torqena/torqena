/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AdvancedSettingsSection
 * @description Assistant Customization (skill/agent/instruction/prompt directories),
 * Vault Setup, and Help/About sections.
 *
 * @since 0.0.15
 */

import { FileSystemAdapter } from "obsidian";
import { GitHubCopilotCliManager } from "../../../ai/providers/GitHubCopilotCliManager";
import { createCollapsibleSection, renderDirectoryList, type SettingSectionContext } from "./SectionHelpers";

/**
 * Render the Assistant Customization section with directory lists.
 *
 * @param containerEl - Parent element
 * @param ctx - Shared settings context
 *
 * @internal
 */
export function renderAdvancedSettings(containerEl: HTMLElement, ctx: SettingSectionContext): void {
	const { content: section } = createCollapsibleSection(containerEl, "Assistant Customization", "vc-settings-advanced", "h2");

	const content = section.createDiv({ cls: "vc-advanced-content" });

	renderDirectoryList(
		content,
		"Skill Directories",
		"Folders containing skill definition files. Paths can be relative to the vault or absolute.",
		ctx.plugin.settings.skillDirectories,
		async (dirs) => {
			ctx.plugin.settings.skillDirectories = dirs;
			await ctx.plugin.saveSettings();
		}
	);

	renderDirectoryList(
		content,
		"Agent Directories",
		"Folders containing custom agent definition files. Paths can be relative to the vault or absolute.",
		ctx.plugin.settings.agentDirectories,
		async (dirs) => {
			ctx.plugin.settings.agentDirectories = dirs;
			await ctx.plugin.saveSettings();
		}
	);

	renderDirectoryList(
		content,
		"Instruction Directories",
		"Folders containing .instructions.md files that provide context to the assistant.",
		ctx.plugin.settings.instructionDirectories,
		async (dirs) => {
			ctx.plugin.settings.instructionDirectories = dirs;
			await ctx.plugin.saveSettings();
		}
	);

	renderDirectoryList(
		content,
		"Prompt Directories",
		"Folders containing .prompt.md files that define reusable prompts. Access prompts by typing / in chat.",
		ctx.plugin.settings.promptDirectories,
		async (dirs) => {
			ctx.plugin.settings.promptDirectories = dirs;
			await ctx.plugin.saveSettings();
		}
	);
}

/**
 * Render the Vault Setup section (visible only when CLI installed but vault
 * not yet initialized).
 *
 * @param containerEl - Parent element
 * @param ctx - Shared settings context
 * @param cachedStatus - Cached CLI status
 * @param cliManager - CLI manager instance
 *
 * @internal
 */
export function renderVaultSetupSection(
	containerEl: HTMLElement,
	ctx: SettingSectionContext,
	cachedStatus: { installed: boolean } | null,
	cliManager: GitHubCopilotCliManager,
): void {
	if (!cachedStatus?.installed) return;

	const vaultInitialized = ctx.app.vault.getAbstractFileByPath(".github/copilot-instructions.md") !== null;
	if (vaultInitialized) return;

	const { content: section } = createCollapsibleSection(containerEl, "Vault Setup");

	section.createEl("p", {
		text: "Initialize GitHub Copilot for this vault to enable context-aware assistance.",
		cls: "vc-status-desc"
	});

	const btnRow = section.createDiv({ cls: "vc-btn-row" });
	const btn = btnRow.createEl("button", { text: "Initialize Vault", cls: "vc-btn-primary" });
	btn.addEventListener("click", async () => {
		const vaultPath = getVaultPath(ctx);
		if (!vaultPath) {
			console.error("Could not determine vault path");
			return;
		}
		btn.disabled = true;
		btn.textContent = "Initializing...";
		await cliManager.initializeVault(vaultPath);
		btn.disabled = false;
		btn.textContent = "Initialize Vault";
		ctx.refreshDisplay();
	});

	const cmdPreview = section.createDiv({ cls: "vc-cmd-group" });
	cmdPreview.createEl("label", { text: "Command that will be run:" });
	const vaultPath = getVaultPath(ctx) || "<vault_path>";
	const normalizedPath = vaultPath.replace(/\\/g, "/");
	cmdPreview.createEl("code", { text: `copilot --add-dir "${normalizedPath}"`, cls: "vc-code-block" });
}

/**
 * Render the About / Help section.
 *
 * @param containerEl - Parent element
 * @param ctx - Shared settings context
 *
 * @internal
 */
export function renderHelpSection(containerEl: HTMLElement, ctx: SettingSectionContext): void {
	const { content: section } = createCollapsibleSection(containerEl, "About Vault Copilot", "vc-settings-help", "h4");

	const helpContent = section.createDiv({ cls: "vc-help-content" });
	helpContent.createEl("p", {
		text: `Version ${ctx.plugin.manifest.version}`,
		cls: "vc-version-info"
	});
	helpContent.createEl("p", {
		text: "Vault Copilot brings AI assistance to Obsidian by connecting to your GitHub Copilot, Azure OpenAI, or OpenAI account to your vault. It supports Agent Skills, MCP Tools, and plugin-defined tools to enable powerful operations inside your vault. The assistant can read, search notes, create and update content, help organize information, and support workflows that span multiple plugins."
	});
	helpContent.createEl("p", {
		text: "Vault Copilot is designed to be extensible. You can add your own skills, enable MCP integrations, or install plugins that register additional capabilities. The assistant automatically discovers these tools and uses them when they are relevant."
	});
	helpContent.createEl("p", {
		text: "Vault Copilot is written by Dan Shue and welcomes community contributions. It is not affiliated with, sponsored by, or endorsed by Microsoft, GitHub, or OpenAI."
	});

	const reqDiv = helpContent.createDiv({ cls: "vc-requirements" });
	reqDiv.createEl("h4", { text: "Requirements" });
	const reqList = reqDiv.createEl("ul");
	reqList.createEl("li", { text: "One of: GitHub Copilot CLI (with active subscription), Azure OpenAI, or OpenAI" });
	reqList.createEl("li", { text: "Obsidian vault with read and write access" });

	const linksDiv = helpContent.createDiv({ cls: "vc-help-links" });
	const links = [
		{ text: "GitHub Copilot Documentation", url: "https://docs.github.com/en/copilot" },
		{ text: "GitHub Copilot CLI", url: "https://docs.github.com/en/ai/how-tos/copilot-cli" },
		{ text: "GitHub Copilot Pricing", url: "https://github.com/features/ai/plans" },
	];
	for (const link of links) {
		const a = linksDiv.createEl("a", { text: link.text, href: link.url });
		a.setAttr("target", "_blank");
	}
}

/** @internal */
function getVaultPath(ctx: SettingSectionContext): string | undefined {
	const adapter = ctx.app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		return adapter.getBasePath();
	}
	return undefined;
}
