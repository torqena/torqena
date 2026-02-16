/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module LayoutManager
 * @description Manages the three-column shell layout (left sidebar, center workspace, right sidebar),
 * resizers between columns, and sidebar collapse/expand state. Persists layout dimensions across sessions.
 *
 * Responsibilities:
 * - Left/right sidebar collapse and expand with animated transitions
 * - Resizer drag handles between columns
 * - Layout state persistence (widths, collapsed states)
 * - Right sidebar toggle shared across EditorManager titlebar and ribbon
 *
 * @since 0.0.28
 */

import { loadSettings, saveSettings } from "../shell-settings/WebShellSettings.js";
import type { LayoutState } from "../shell-settings/WebShellSettings.js";

/**
 * Manages the three-column workspace layout and persists state.
 */
export class LayoutManager {
	private leftSplit: HTMLElement;
	private centerSplit: HTMLElement;
	private rightSplit: HTMLElement;
	private leftResizer: HTMLElement | null;
	private rightResizer: HTMLElement | null;
	private leftContent: HTMLElement;

	private leftCollapsed = false;
	private rightCollapsed = false;
	private savedLeftWidth = "250px";
	private savedRightWidth = "420px";

	/** Floating button to restore the right sidebar when it's collapsed */
	private floatingRightBtn: HTMLButtonElement | null = null;
	/** Titlebar button to restore the right sidebar when it's collapsed */
	private titlebarRightBtn: HTMLButtonElement | null = null;
	/** MutationObserver tracking right sidebar style/class changes */
	private rightSidebarObserver: MutationObserver | null = null;

	/** Callbacks notified when layout state changes. */
	private onStateChange: (() => void)[] = [];

	constructor(
		leftSplit: HTMLElement,
		centerSplit: HTMLElement,
		rightSplit: HTMLElement,
	) {
		this.leftSplit = leftSplit;
		this.centerSplit = centerSplit;
		this.rightSplit = rightSplit;

		this.leftResizer = document.querySelector<HTMLElement>('.workspace-resizer[data-resize="left"]');
		this.rightResizer = document.querySelector<HTMLElement>('.workspace-resizer[data-resize="right"]');
		this.leftContent = leftSplit.querySelector<HTMLElement>(".ws-left-content") || leftSplit;

		// Restore persisted layout state
		this.restoreState();

		// Wire resizers
		this.initResizer(this.leftResizer, this.leftSplit, "left");
		this.initResizer(this.rightResizer, this.rightSplit, "right");

		// Create right sidebar restore controls
		this.createFloatingRightButton();
		this.createTitlebarRightButton();
		this.watchRightSidebarState();
		this.bindRightCloseButton();
	}

	// ── Left sidebar ──────────────────────────────────────────

	/** Whether the left sidebar is currently collapsed. */
	get isLeftCollapsed(): boolean {
		return this.leftCollapsed;
	}

	/** Collapse the left sidebar. */
	collapseLeft(): void {
		if (this.leftCollapsed) return;
		this.leftCollapsed = true;
		this.savedLeftWidth = this.leftSplit.style.width || `${this.leftSplit.getBoundingClientRect().width}px`;
		this.leftContent.style.display = "none";
		this.leftSplit.style.width = "auto";
		this.leftSplit.style.minWidth = "0";
		this.leftSplit.style.background = "transparent";
		const header = this.leftSplit.querySelector<HTMLElement>(".ws-left-tab-header");
		if (header) header.style.borderBottom = "none";
		if (this.leftResizer) this.leftResizer.style.display = "none";

		// Hide ribbon file/ext buttons
		const filesBtn = document.querySelector<HTMLElement>(".ws-ribbon-files");
		const extBtn = document.querySelector<HTMLElement>(".ws-ribbon-extensions");
		if (filesBtn) filesBtn.style.display = "none";
		if (extBtn) extBtn.style.display = "none";

		this.persistState();
	}

	/** Expand the left sidebar. */
	expandLeft(): void {
		if (!this.leftCollapsed) return;
		this.leftCollapsed = false;
		this.leftContent.style.display = "";
		this.leftSplit.style.width = this.savedLeftWidth;
		this.leftSplit.style.minWidth = "";
		this.leftSplit.style.background = "";
		const header = this.leftSplit.querySelector<HTMLElement>(".ws-left-tab-header");
		if (header) header.style.borderBottom = "";
		if (this.leftResizer) this.leftResizer.style.display = "";

		// Show ribbon file/ext buttons
		const filesBtn = document.querySelector<HTMLElement>(".ws-ribbon-files");
		const extBtn = document.querySelector<HTMLElement>(".ws-ribbon-extensions");
		if (filesBtn) filesBtn.style.display = "";
		if (extBtn) extBtn.style.display = "";

		this.persistState();
	}

	/** Toggle left sidebar collapsed/expanded. */
	toggleLeft(): void {
		if (this.leftCollapsed) this.expandLeft();
		else this.collapseLeft();
	}

	// ── Right sidebar ──────────────────────────────────────────

	/** Whether the right sidebar is currently collapsed. */
	get isRightCollapsed(): boolean {
		return this.rightCollapsed;
	}

	/** Collapse the right sidebar. */
	collapseRight(): void {
		if (this.rightCollapsed) return;
		this.rightCollapsed = true;
		const currentWidth = this.rightSplit.getBoundingClientRect().width;
		if (currentWidth > 20) {
			this.savedRightWidth = `${Math.round(currentWidth)}px`;
		}
		this.rightSplit.style.display = "none";
		if (this.rightResizer) this.rightResizer.style.display = "none";
		this.updateRightSidebarUI(true);
		this.persistState();
	}

	/** Expand the right sidebar. */
	expandRight(): void {
		if (!this.rightCollapsed) return;
		this.rightCollapsed = false;
		this.rightSplit.classList.remove("is-collapsed", "mod-collapsed", "is-hidden");
		this.rightSplit.style.display = "";
		this.rightSplit.style.visibility = "";
		if (this.rightSplit.getBoundingClientRect().width < 8) {
			this.rightSplit.style.width = this.savedRightWidth;
		}
		if (this.rightResizer) this.rightResizer.style.display = "";
		this.updateRightSidebarUI(false);
		this.persistState();
	}

	/** Toggle right sidebar collapsed/expanded. */
	toggleRight(): void {
		if (this.rightCollapsed) this.expandRight();
		else this.collapseRight();
	}

	/** Register a callback invoked when layout state changes. */
	addStateChangeListener(fn: () => void): void {
		this.onStateChange.push(fn);
	}

	/** Get a right sidebar toggle icon SVG string. */
	getRightSidebarIcon(collapsed: boolean): string {
		if (collapsed) {
			return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="11 8 16 12 11 16"/></svg>`;
		}
		return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="13 8 8 12 13 16"/></svg>`;
	}

	/** Clean up observers. */
	destroy(): void {
		this.rightSidebarObserver?.disconnect();
		this.floatingRightBtn?.remove();
		this.titlebarRightBtn?.remove();
	}

	// ── Resizer wiring ──────────────────────────────────────────

	private initResizer(resizer: HTMLElement | null, pane: HTMLElement, side: "left" | "right"): void {
		if (!resizer) return;

		let startX = 0;
		let startWidth = 0;

		const onMouseMove = (e: MouseEvent) => {
			const delta = e.clientX - startX;
			const newWidth = side === "left" ? startWidth + delta : startWidth - delta;
			const clamped = Math.max(180, Math.min(newWidth, window.innerWidth * 0.5));
			pane.style.width = `${clamped}px`;
		};

		const onMouseUp = () => {
			resizer.classList.remove("is-dragging");
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			// Persist after resize
			if (side === "left") this.savedLeftWidth = pane.style.width;
			else this.savedRightWidth = pane.style.width;
			this.persistState();
		};

		resizer.addEventListener("mousedown", (e: MouseEvent) => {
			e.preventDefault();
			startX = e.clientX;
			startWidth = pane.getBoundingClientRect().width;
			resizer.classList.add("is-dragging");
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		});
	}

	// ── Right sidebar restore UI ──────────────────────────────────

	private createFloatingRightButton(): void {
		const btn = document.createElement("button");
		btn.className = "ws-right-sidebar-restore-btn";
		btn.setAttribute("aria-label", "Show right sidebar");
		btn.title = "Show right sidebar";
		btn.style.display = "none";
		btn.innerHTML = this.getRightSidebarIcon(true);
		btn.addEventListener("click", () => this.toggleRight());
		document.body.appendChild(btn);
		this.floatingRightBtn = btn;
	}

	private createTitlebarRightButton(): void {
		const btn = document.createElement("button");
		btn.className = "ws-titlebar-right-sidebar-btn";
		btn.setAttribute("aria-label", "Right sidebar");
		btn.title = "Right sidebar";
		btn.style.display = "none";
		btn.innerHTML = this.getRightSidebarIcon(true);
		btn.addEventListener("click", () => this.toggleRight());
		document.body.appendChild(btn);
		this.titlebarRightBtn = btn;
	}

	private updateRightSidebarUI(collapsed: boolean): void {
		if (this.titlebarRightBtn) {
			this.titlebarRightBtn.innerHTML = this.getRightSidebarIcon(collapsed);
			this.titlebarRightBtn.style.display = collapsed ? "flex" : "none";
		}
		if (this.floatingRightBtn) {
			this.floatingRightBtn.innerHTML = this.getRightSidebarIcon(collapsed);
			this.floatingRightBtn.style.display = collapsed ? "flex" : "none";
		}
		// Notify listeners (EditorManager's split button needs updating)
		for (const fn of this.onStateChange) fn();
	}

	/** Bind the close button in the right sidebar header. */
	private bindRightCloseButton(): void {
		const closeBtn = document.querySelector<HTMLElement>(".ws-right-close");
		if (!closeBtn || closeBtn.dataset.wsBound === "true") return;
		closeBtn.dataset.wsBound = "true";
		closeBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.toggleRight();
		});
	}

	/** Watch for external changes to right sidebar visibility. */
	private watchRightSidebarState(): void {
		this.rightSidebarObserver?.disconnect();
		this.rightSidebarObserver = new MutationObserver(() => {
			const collapsed = this.detectRightCollapsed();
			if (collapsed !== this.rightCollapsed) {
				this.rightCollapsed = collapsed;
				this.updateRightSidebarUI(collapsed);
			}
		});
		this.rightSidebarObserver.observe(this.rightSplit, {
			attributes: true,
			attributeFilter: ["style", "class"],
		});
		// Initial sync
		this.rightCollapsed = this.detectRightCollapsed();
		this.updateRightSidebarUI(this.rightCollapsed);
	}

	/** Detect whether right sidebar is collapsed by inspecting DOM. */
	private detectRightCollapsed(): boolean {
		const computed = getComputedStyle(this.rightSplit);
		const hiddenByDisplay = this.rightSplit.style.display === "none" || computed.display === "none";
		const hiddenByVisibility = computed.visibility === "hidden";
		const hiddenByClass = this.rightSplit.classList.contains("is-collapsed")
			|| this.rightSplit.classList.contains("mod-collapsed")
			|| this.rightSplit.classList.contains("is-hidden");
		const hiddenBySize = this.rightSplit.getBoundingClientRect().width < 8;
		return hiddenByDisplay || hiddenByVisibility || hiddenByClass || hiddenBySize;
	}

	// ── Persistence ──────────────────────────────────────────

	/** Persist the current layout state to localStorage. */
	persistState(): void {
		const settings = loadSettings();
		settings.layout = {
			leftWidth: this.savedLeftWidth,
			rightWidth: this.savedRightWidth,
			leftCollapsed: this.leftCollapsed,
			rightCollapsed: this.rightCollapsed,
		};
		saveSettings(settings);
	}

	private restoreState(): void {
		const settings = loadSettings();
		const layout = settings.layout;
		if (!layout) return;

		if (layout.leftWidth) this.savedLeftWidth = layout.leftWidth;
		if (layout.rightWidth) this.savedRightWidth = layout.rightWidth;

		// Apply widths
		if (!layout.leftCollapsed) {
			this.leftSplit.style.width = this.savedLeftWidth;
		}
		if (!layout.rightCollapsed) {
			this.rightSplit.style.width = this.savedRightWidth;
		}

		// Apply collapsed states
		if (layout.leftCollapsed) {
			this.collapseLeft();
		}
		if (layout.rightCollapsed) {
			this.collapseRight();
		}
	}
}
