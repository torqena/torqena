/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module CliStatusSection
 * @description GitHub Copilot CLI connection status card for the settings tab.
 *
 * Renders the CLI installation status, refresh button, install actions, and
 * authentication notes.
 *
 * @since 0.0.15
 */

import { CliStatus, GitHubCopilotCliManager } from "../../../ai/providers/GitHubCopilotCliManager";
import { createCollapsibleSection, type SettingSectionContext } from "./SectionHelpers";

/**
 * State returned by the CLI status section for use by the parent.
 */
export interface CliStatusState {
	statusContainer: HTMLElement;
	renderLoadingStatus: () => void;
	renderStatusDeferred: () => void;
	checkStatusAsync: () => Promise<void>;
	renderStatusDisplay: (status: CliStatus) => void;
}

/**
 * Render the GitHub Copilot Connection Status section.
 *
 * @param containerEl - Parent element
 * @param ctx - Shared settings context
 * @param cachedStatus - Current cached CLI status (mutated in place)
 * @param onStatusUpdate - Called when status changes with new status
 * @returns Accessors for status rendering sub-methods
 *
 * @internal
 */
export function renderCliStatusSection(
	containerEl: HTMLElement,
	ctx: SettingSectionContext,
	cachedStatus: { value: CliStatus | null },
	onStatusUpdate: (status: CliStatus) => void
): CliStatusState {
	const { details, content: section } = createCollapsibleSection(containerEl, "GitHub Copilot Connection Status");

	// Place refresh button in the summary so it's visible when collapsed
	const summary = details.querySelector("summary")!;
	const refreshBtn = summary.createEl("button", {
		cls: "vc-refresh-btn",
		attr: { "aria-label": "Refresh status" }
	});
	refreshBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
	refreshBtn.addEventListener("click", () => {
		refreshBtn.addClass("vc-spinning");
		ctx.cliManager.invalidateCache();
		checkStatusAsync().finally(() => {
			refreshBtn.removeClass("vc-spinning");
		});
	});

	const statusContainer = section.createDiv({ cls: "vc-status-card" });

	function renderLoadingStatus(): void {
		statusContainer.empty();
		const loadingEl = statusContainer.createDiv({ cls: "vc-status-loading" });
		loadingEl.innerHTML = `
			<div class="vc-spinner"></div>
			<span>Checking connection...</span>
		`;
	}

	function renderStatusDeferred(): void {
		statusContainer.empty();
		const infoEl = statusContainer.createDiv({ cls: "vc-status-loading" });
		infoEl.innerHTML = `
			<span>Connection status check is paused. Use refresh to check.</span>
		`;
	}

	async function checkStatusAsync(): Promise<void> {
		try {
			const status = await ctx.cliManager.getStatus(true);
			cachedStatus.value = status;
			ctx.plugin.settings.cliLastKnownStatus = status;
			await ctx.plugin.saveSettings();
			renderStatusDisplay(status);
			onStatusUpdate(status);
		} catch (error) {
			renderStatusError(String(error));
		}
	}

	function renderStatusDisplay(status: CliStatus): void {
		statusContainer.empty();
		const statusGrid = statusContainer.createDiv({ cls: "vc-status-grid" });

		const cliCard = statusGrid.createDiv({ cls: "vc-status-item" });
		renderStatusCard(cliCard, {
			label: "CLI Installation",
			isOk: status.installed,
			detail: status.installed ? `v${status.version || "unknown"}` : "Not installed",
			icon: status.installed
				? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
				: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
		});

		if (!status.installed) {
			renderInstallActions(statusContainer);
		} else {
			renderAuthNote(statusContainer);
		}
	}

	function renderStatusCard(container: HTMLElement, opts: { label: string; isOk: boolean; detail: string; icon: string }): void {
		container.addClass(opts.isOk ? "vc-status-ok" : "vc-status-error");
		const iconEl = container.createDiv({ cls: "vc-status-icon" });
		iconEl.innerHTML = opts.icon;
		const textEl = container.createDiv({ cls: "vc-status-text" });
		textEl.createEl("span", { text: opts.label, cls: "vc-status-label" });
		textEl.createEl("span", { text: opts.detail, cls: "vc-status-detail" });
	}

	function renderStatusError(error: string): void {
		statusContainer.empty();
		const errorEl = statusContainer.createDiv({ cls: "vc-status-error-msg" });
		errorEl.createEl("span", { text: `Error checking status: ${error}` });
	}

	function renderInstallActions(container: HTMLElement): void {
		const actionsEl = container.createDiv({ cls: "vc-status-actions" });
		const installInfo = ctx.cliManager.getInstallCommand();

		const cmdGroup = actionsEl.createDiv({ cls: "vc-cmd-group" });
		cmdGroup.createEl("label", { text: installInfo.description });

		const cmdRow = cmdGroup.createDiv({ cls: "vc-cmd-row" });
		cmdRow.createEl("code", { text: installInfo.command });

		const copyBtn = cmdRow.createEl("button", { text: "Copy", cls: "vc-btn-secondary vc-btn-sm" });
		copyBtn.addEventListener("click", () => {
			navigator.clipboard.writeText(installInfo.command);
			console.log("Copied to clipboard");
		});

		const btnRow = actionsEl.createDiv({ cls: "vc-btn-row" });
		const docsLink = btnRow.createEl("a", { text: "View Guide", cls: "vc-btn-link", href: installInfo.url });
		docsLink.setAttr("target", "_blank");
	}

	function renderAuthNote(container: HTMLElement): void {
		const noteEl = container.createDiv({ cls: "vc-auth-note" });
		noteEl.createEl("p", {
			text: "Authentication is handled automatically when you first use GitHub Copilot. If prompted, use the /login command in the CLI.",
			cls: "vc-status-desc"
		});

		const detailsEl = noteEl.createEl("details", { cls: "vc-auth-details" });
		detailsEl.createEl("summary", { text: "Alternative: Use Personal Access Token" });

		const patContent = detailsEl.createDiv({ cls: "vc-pat-content" });
		patContent.innerHTML = `
			<ol>
				<li>Visit <a href="https://github.com/settings/personal-access-tokens/new" target="_blank">GitHub PAT Settings</a></li>
				<li>Add the "Copilot Requests" permission</li>
				<li>Generate and copy the token</li>
				<li>Set <code>GH_TOKEN</code> or <code>GITHUB_TOKEN</code> environment variable</li>
			</ol>
		`;
	}

	// Show loading state immediately
	renderLoadingStatus();

	return {
		statusContainer,
		renderLoadingStatus,
		renderStatusDeferred,
		checkStatusAsync,
		renderStatusDisplay,
	};
}
