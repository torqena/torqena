/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module SkillsMcpSection
 * @description Registered Skills table and MCP Servers management section.
 *
 * @since 0.0.15
 */

import { Setting } from "obsidian";
import { SkillInfo, McpServerConfig } from "../../../ai/customization/SkillRegistry";
import { CachedSkillInfo } from "../../../ai/customization/SkillCache";
import { DiscoveredMcpServer, isStdioConfig, McpConnectionStatus, McpServerSource } from "../../../ai/mcp/McpTypes";
import { getSourceLabel, getSourceIcon } from "../../../ai/mcp/McpManager";
import { isMobile } from "../../../utils/platform";
import { AddHttpMcpServerModal } from "../modals";
import { createCollapsibleSection, type SettingSectionContext } from "./SectionHelpers";

/**
 * State returned by the Skills & MCP section.
 */
export interface SkillsMcpState {
	updateSkillsDisplay: () => void;
}

/**
 * Render the Registered Skills & MCP Servers section.
 *
 * @param containerEl - Parent element
 * @param ctx - Shared settings context
 * @returns State with updateSkillsDisplay method
 *
 * @internal
 */
export function renderSkillsMcpSection(containerEl: HTMLElement, ctx: SettingSectionContext): SkillsMcpState {
	const { content: section } = createCollapsibleSection(containerEl, "Registered Skills & MCP Servers", "vc-skills-section");

	const skillsContainer = section.createDiv({ cls: "vc-skills-container" });

	let unsubscribe: (() => void) | null = null;
	let unsubscribeSkillCache: (() => void) | null = null;

	// Subscribe to skill registry changes
	unsubscribe = ctx.plugin.skillRegistry.onSkillChange(() => {
		updateSkillsDisplay();
	});

	// Subscribe to skill cache changes (file-based skills)
	if (ctx.plugin.skillCache) {
		unsubscribeSkillCache = ctx.plugin.skillCache.onCacheChange(() => {
			updateSkillsDisplay();
		});
	}

	function updateSkillsDisplay(): void {
		skillsContainer.empty();
		// Merge runtime-registered skills with file-based skills from cache
		const runtimeSkills = ctx.plugin.skillRegistry.listSkills();
		const cachedSkills = ctx.plugin.skillCache?.getSkills() ?? [];
		const mergedSkills = mergeSkills(runtimeSkills, cachedSkills);
		renderSkillsTable(skillsContainer, mergedSkills);
		renderMcpServersSection(skillsContainer, ctx);
	}

	// Initial render
	updateSkillsDisplay();

	return {
		updateSkillsDisplay,
	};
}

/**
 * Get the cleanup function for unsubscribing from skill registry.
 * Callers should use the skillRegistryUnsubscribe from the parent.
 *
 * @internal
 */
export function createSkillRegistrySubscription(ctx: SettingSectionContext, onChanged: () => void): () => void {
	return ctx.plugin.skillRegistry.onSkillChange(onChanged);
}

/**
 * Unified skill entry for display in the table.
 * @internal
 */
interface DisplaySkill {
	name: string;
	description: string;
	source: string;
	category?: string;
}

/**
 * Merge runtime-registered skills with file-based cached skills, deduplicating by name.
 * @internal
 */
function mergeSkills(runtimeSkills: SkillInfo[], cachedSkills: CachedSkillInfo[]): DisplaySkill[] {
	const seen = new Set<string>();
	const result: DisplaySkill[] = [];

	for (const s of runtimeSkills) {
		seen.add(s.name);
		result.push({
			name: s.name,
			description: s.description,
			source: s.pluginId || 'plugin',
			category: s.category || 'general',
		});
	}

	for (const s of cachedSkills) {
		if (seen.has(s.name)) continue;
		seen.add(s.name);
		result.push({
			name: s.name,
			description: s.description,
			source: 'file',
			category: undefined,
		});
	}

	return result;
}

/** @internal */
function renderSkillsTable(container: HTMLElement, skills: DisplaySkill[]): void {
	const skillsSection = container.createDiv({ cls: "vc-skills-subsection" });
	skillsSection.createEl("h4", { text: "Skills" });

	if (skills.length === 0) {
		const emptyState = skillsSection.createDiv({ cls: "vc-empty-state" });
		emptyState.createEl("p", { text: "No skills registered yet." });
		emptyState.createEl("p", {
			text: "Skills can be registered by plugins or loaded from skill directories.",
			cls: "vc-status-desc"
		});
		return;
	}

	const table = skillsSection.createEl("table", { cls: "vc-skills-table" });
	const thead = table.createEl("thead");
	const headerRow = thead.createEl("tr");
	headerRow.createEl("th", { text: "Name" });
	headerRow.createEl("th", { text: "Description" });
	headerRow.createEl("th", { text: "Source" });
	headerRow.createEl("th", { text: "Category" });

	const tbody = table.createEl("tbody");
	for (const skill of skills) {
		const row = tbody.createEl("tr");
		row.createEl("td", { text: skill.name, cls: "vc-skill-name" });
		row.createEl("td", { text: skill.description, cls: "vc-skill-desc" });
		row.createEl("td", { text: skill.source, cls: "vc-skill-plugin" });
		row.createEl("td", { text: skill.category || "—", cls: "vc-skill-category" });
	}

	const summary = skillsSection.createDiv({ cls: "vc-table-summary" });
	summary.createEl("span", {
		text: `${skills.length} skill${skills.length !== 1 ? "s" : ""}`
	});
}

/** @internal */
function renderMcpServersSection(container: HTMLElement, ctx: SettingSectionContext): void {
	const mcpSection = container.createDiv({ cls: "vc-skills-subsection" });

	const headerRow = mcpSection.createDiv({ cls: "vc-mcp-header-row" });
	headerRow.createEl("h4", { text: "MCP Servers" });

	if (!isMobile) {
		const refreshBtn = headerRow.createEl("button", {
			text: "↻ Refresh",
			cls: "vc-mcp-refresh-btn"
		});
		refreshBtn.addEventListener("click", async () => {
			await ctx.plugin.mcpManager.refreshDiscovery();
			renderMcpServersSection(container, ctx);
			console.log("MCP servers refreshed");
		});
	}

	const addHttpBtn = headerRow.createEl("button", {
		text: "+ Add HTTP MCP Server",
		cls: "vc-mcp-add-http-btn"
	});
	addHttpBtn.addEventListener("click", () => {
		const modal = new AddHttpMcpServerModal(ctx.app, ctx.plugin, () => {
			renderMcpServersSection(container, ctx);
		});
		modal.open();
	});

	const servers = ctx.plugin.mcpManager.getServers();

	if (servers.length === 0) {
		const emptyState = mcpSection.createDiv({ cls: "vc-empty-state" });
		emptyState.createEl("p", { text: "No MCP servers discovered." });
		if (isMobile) {
			emptyState.createEl("p", {
				text: "On mobile, only HTTP-based MCP servers are supported. Stdio servers (local processes) are not available.",
				cls: "vc-status-desc"
			});
		} else {
			emptyState.createEl("p", {
				text: "MCP servers are auto-discovered from Claude Desktop, VS Code, Cursor, and Copilot CLI configs.",
				cls: "vc-status-desc"
			});
		}
		return;
	}

	// Group servers by source
	const bySource = new Map<string, DiscoveredMcpServer[]>();
	for (const server of servers) {
		const source = server.config.source;
		if (!bySource.has(source)) bySource.set(source, []);
		bySource.get(source)!.push(server);
	}

	for (const [source, sourceServers] of bySource) {
		const sourceSection = mcpSection.createDiv({ cls: "vc-mcp-source-section" });
		sourceSection.createEl("h5", {
			text: `${getSourceIcon(source as McpServerSource)} ${getSourceLabel(source as McpServerSource)}`,
			cls: "vc-mcp-source-header"
		});

		const table = sourceSection.createEl("table", { cls: "vc-skills-table vc-mcp-table" });
		const thead = table.createEl("thead");
		const headerRow2 = thead.createEl("tr");
		headerRow2.createEl("th", { text: "Name" });
		headerRow2.createEl("th", { text: "Type" });
		headerRow2.createEl("th", { text: "Auto Start" });
		headerRow2.createEl("th", { text: "Status" });
		headerRow2.createEl("th", { text: "Actions" });

		const tbody = table.createEl("tbody");
		for (const server of sourceServers) {
			renderMcpServerRow(tbody, server, ctx, container);
		}
	}

	const summary = mcpSection.createDiv({ cls: "vc-table-summary" });
	const connectedCount = servers.filter(s => s.status.status === "connected").length;
	summary.createEl("span", {
		text: `${connectedCount} of ${servers.length} server${servers.length !== 1 ? "s" : ""} connected`
	});
}

/** @internal */
function renderMcpServerRow(tbody: HTMLElement, server: DiscoveredMcpServer, ctx: SettingSectionContext, sectionContainer: HTMLElement): void {
	const row = tbody.createEl("tr");
	const config = server.config;
	const status = server.status;

	const nameCell = row.createEl("td", { cls: "vc-mcp-name" });
	nameCell.createEl("strong", { text: config.name });
	if (isStdioConfig(config)) {
		nameCell.createEl("div", {
			text: `${config.command} ${(config.args || []).join(" ")}`,
			cls: "vc-mcp-command"
		});
	}

	row.createEl("td", {
		text: config.transport === "stdio" ? "stdio" : "HTTP",
		cls: "vc-mcp-type"
	});

	const autoStartCell = row.createEl("td", { cls: "vc-mcp-autostart" });
	const autoStartCheckbox = autoStartCell.createEl("input", {
		type: "checkbox",
		cls: "vc-mcp-autostart-checkbox"
	});
	autoStartCheckbox.checked = ctx.plugin.mcpManager.isServerAutoStart(config.id);
	autoStartCheckbox.addEventListener("change", async () => {
		await ctx.plugin.mcpManager.setServerAutoStart(config.id, autoStartCheckbox.checked);
		console.log(autoStartCheckbox.checked
			? `${config.name} will auto-start on launch`
			: `${config.name} will not auto-start`);
	});

	const statusCell = row.createEl("td", { cls: "vc-mcp-status" });
	const statusBadge = getStatusBadge(status.status);
	const badge = statusCell.createEl("span", {
		text: statusBadge.text,
		cls: `vc-status-badge ${statusBadge.cls}`
	});
	if (status.error) badge.setAttribute("title", status.error);
	if (status.tools && status.tools.length > 0) {
		statusCell.createEl("div", {
			text: `${status.tools.length} tools`,
			cls: "vc-mcp-tools-count"
		});
	}

	const actionsCell = row.createEl("td", { cls: "vc-mcp-actions" });

	if (status.status === "connected") {
		const stopBtn = actionsCell.createEl("button", {
			text: "Stop",
			cls: "vc-mcp-action-btn vc-mcp-stop-btn"
		});
		stopBtn.addEventListener("click", async () => {
			try {
				await ctx.plugin.mcpManager.stopServer(config.id);
				renderMcpServersSection(sectionContainer, ctx);
				console.log(`Stopped ${config.name}`);
			} catch (error) {
				console.error(`Failed to stop: ${error}`);
			}
		});
	} else if (status.status === "connecting") {
		actionsCell.createEl("span", { text: "Connecting...", cls: "vc-mcp-connecting" });
	} else {
		const startBtn = actionsCell.createEl("button", {
			text: "Start",
			cls: "vc-mcp-action-btn vc-mcp-start-btn"
		});
		startBtn.addEventListener("click", async () => {
			try {
				startBtn.disabled = true;
				startBtn.textContent = "Starting...";
				await ctx.plugin.mcpManager.startServer(config.id);
				renderMcpServersSection(sectionContainer, ctx);
				console.log(`Started ${config.name}`);
			} catch (error) {
				console.error(`Failed to start: ${error}`);
				renderMcpServersSection(sectionContainer, ctx);
			}
		});
	}
}

/** @internal */
function getStatusBadge(status: McpConnectionStatus): { text: string; cls: string } {
	switch (status) {
		case "connected": return { text: "Connected", cls: "vc-badge-ok" };
		case "connecting": return { text: "Connecting", cls: "vc-badge-warning" };
		case "error": return { text: "Error", cls: "vc-badge-error" };
		case "disconnected":
		default: return { text: "Stopped", cls: "vc-badge-disabled" };
	}
}
