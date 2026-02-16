/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ui/WorkspaceNavigatorView
 * @description Left sidebar view that displays workspace navigation.
 *
 * Shows a clickable workspace header (with icon and dropdown chevron)
 * and a list of workspace folders defined in `.torqena/workspace.json`.
 * Clicking the header opens a switcher dropdown with recent workspaces,
 * create/open actions, and workspace settings.
 *
 * @example
 * ```typescript
 * import { WorkspaceNavigatorView, WORKSPACE_NAV_VIEW_TYPE } from "./ui/WorkspaceNavigatorView";
 * plugin.registerView(WORKSPACE_NAV_VIEW_TYPE, (leaf) =>
 *   new WorkspaceNavigatorView(leaf, workspaceService, app)
 * );
 * ```
 *
 * @see {@link WorkspaceService} for workspace config loading
 * @see {@link WorkspaceConfig} for the configuration shape
 * @since 0.1.0
 */

import { ItemView } from "../platform/ui/ItemView.js";
import { setIcon } from "../platform/utils/icons.js";
import type { WorkspaceLeaf } from "../platform/workspace/WorkspaceLeaf.js";
import type { App } from "../platform/core/App.js";
import type { WorkspaceService } from "./WorkspaceService.js";
import type { WorkspaceFolder, RecentWorkspace } from "../types/workspace.js";

/** Unique view type identifier for the workspace navigator. */
export const WORKSPACE_NAV_VIEW_TYPE = "workspace-navigator-view";

/**
 * Workspace navigator view for the left sidebar.
 *
 * Replaces the file explorer with a workspace-aware navigation panel
 * that shows the current workspace name, icon, and folder structure.
 */
export class WorkspaceNavigatorView extends ItemView {
	/** @internal */
	private _workspaceService: WorkspaceService;
	/** @internal */
	private _app: App;
	/** @internal */
	private _activeDropdown: HTMLElement | null = null;
	/** @internal */
	private _dropdownDismissHandler: ((e: MouseEvent) => void) | null = null;
	/** @internal */
	private _dropdownEscHandler: ((e: KeyboardEvent) => void) | null = null;
	/** @internal */
	private _unsubscribe: (() => void) | null = null;
	/** @internal */
	private _activeFolderId: string | null = null;

	/** Callback invoked when user wants to switch workspaces. */
	private _switchWorkspaceHandler: ((path: string) => void) | null = null;

	/** Callback invoked when user wants to open a folder picker. */
	private _openFolderHandler: (() => void) | null = null;

	/** Callback invoked when user wants to create a new workspace. */
	private _createWorkspaceHandler: (() => void) | null = null;

	/** Callback invoked when a folder nav item is clicked. */
	private _folderClickHandler: ((folder: WorkspaceFolder) => void) | null = null;

	constructor(leaf: WorkspaceLeaf, workspaceService: WorkspaceService, app: App) {
		super(leaf);
		this._workspaceService = workspaceService;
		this._app = app;
	}

	getViewType(): string {
		return WORKSPACE_NAV_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Workspace";
	}

	getIcon(): string {
		return "layout-grid";
	}

	// ── Handler setters ────────────────────────────────────────

	/**
	 * Set the handler called when the user selects a different workspace.
	 *
	 * @param handler - Receives the absolute path of the selected workspace
	 */
	setSwitchWorkspaceHandler(handler: (path: string) => void): void {
		this._switchWorkspaceHandler = handler;
	}

	/**
	 * Set the handler called when the user clicks "Open Workspace Folder…".
	 *
	 * @param handler - Called to show the native folder picker
	 */
	setOpenFolderHandler(handler: () => void): void {
		this._openFolderHandler = handler;
	}

	/**
	 * Set the handler called when the user clicks "+ Create New Workspace".
	 *
	 * @param handler - Called to show workspace creation flow
	 */
	setCreateWorkspaceHandler(handler: () => void): void {
		this._createWorkspaceHandler = handler;
	}

	/**
	 * Set the handler called when a folder navigation item is clicked.
	 *
	 * @param handler - Receives the folder definition
	 */
	setFolderClickHandler(handler: (folder: WorkspaceFolder) => void): void {
		this._folderClickHandler = handler;
	}

	// ── Lifecycle ──────────────────────────────────────────────

	async onOpen(): Promise<void> {
		this._unsubscribe = this._workspaceService.onChange(() => this.render());
		this.render();
	}

	async onClose(): Promise<void> {
		this._dismissDropdown();
		this._unsubscribe?.();
		this._unsubscribe = null;
		this.contentEl.innerHTML = "";
	}

	// ── Rendering ──────────────────────────────────────────────

	/** @internal Build the entire navigator UI. */
	private render(): void {
		const container = this.contentEl;
		container.innerHTML = "";
		container.classList.add("ws-workspace-navigator");

		const config = this._workspaceService.current;

		// ── Header ──
		this._renderHeader(container, config);

		// ── Folder list ──
		if (config?.structure?.folders?.length) {
			this._renderFolderList(container, config.structure.folders);
		} else {
			this._renderEmptyState(container);
		}
	}

	/**
	 * Render the workspace header with icon, name, and dropdown chevron.
	 * @internal
	 */
	private _renderHeader(container: HTMLElement, config: import("../types/workspace.js").WorkspaceConfig | null): void {
		const header = document.createElement("div");
		header.className = "ws-nav-header";

		const headerBtn = document.createElement("button");
		headerBtn.className = "ws-nav-header-btn";
		headerBtn.setAttribute("aria-label", "Switch workspace");

		// Workspace icon
		const iconEl = document.createElement("span");
		iconEl.className = "ws-nav-header-icon";
		if (config?.theme?.icon) {
			setIcon(iconEl, config.theme.icon);
		} else {
			setIcon(iconEl, "folder");
		}
		headerBtn.appendChild(iconEl);

		// Workspace name
		const nameEl = document.createElement("span");
		nameEl.className = "ws-nav-header-name";
		nameEl.textContent = config?.name || this._getFallbackName();
		headerBtn.appendChild(nameEl);

		// Dropdown chevron
		const chevronEl = document.createElement("span");
		chevronEl.className = "ws-nav-header-chevron";
		setIcon(chevronEl, "chevron-down");
		headerBtn.appendChild(chevronEl);

		headerBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this._toggleDropdown(header);
		});

		header.appendChild(headerBtn);
		container.appendChild(header);
	}

	/**
	 * Render the folder navigation list.
	 * @internal
	 */
	private _renderFolderList(container: HTMLElement, folders: WorkspaceFolder[]): void {
		const list = document.createElement("div");
		list.className = "ws-nav-folder-list";

		for (const folder of folders) {
			const item = document.createElement("div");
			item.className = "ws-nav-folder-item";
			if (this._activeFolderId === folder.id) {
				item.classList.add("is-active");
			}

			const itemIcon = document.createElement("span");
			itemIcon.className = "ws-nav-folder-icon";
			setIcon(itemIcon, folder.icon);
			item.appendChild(itemIcon);

			const itemName = document.createElement("span");
			itemName.className = "ws-nav-folder-name";
			itemName.textContent = folder.name;
			item.appendChild(itemName);

			item.addEventListener("click", () => {
				// Update active state
				this._activeFolderId = folder.id;
				list.querySelectorAll(".ws-nav-folder-item.is-active").forEach(
					(el) => el.classList.remove("is-active"),
				);
				item.classList.add("is-active");

				this._folderClickHandler?.(folder);
			});

			list.appendChild(item);
		}

		container.appendChild(list);
	}

	/**
	 * Render empty state when no workspace config is loaded.
	 * @internal
	 */
	private _renderEmptyState(container: HTMLElement): void {
		const empty = document.createElement("div");
		empty.className = "ws-nav-empty";
		empty.textContent = "No workspace folders configured.";
		container.appendChild(empty);
	}

	// ── Dropdown ───────────────────────────────────────────────

	/**
	 * Toggle the workspace switcher dropdown.
	 * @internal
	 */
	private _toggleDropdown(anchorEl: HTMLElement): void {
		if (this._activeDropdown) {
			this._dismissDropdown();
			return;
		}

		const dropdown = document.createElement("div");
		dropdown.className = "ws-nav-dropdown";

		const config = this._workspaceService.current;
		const currentPath = this._workspaceService.currentPath;
		const recents = this._workspaceService.getRecentWorkspaces();

		// ── Owner section ──
		if (config?.owner?.displayName) {
			const ownerEl = document.createElement("div");
			ownerEl.className = "ws-nav-dropdown-owner";
			ownerEl.textContent = config.owner.displayName;
			dropdown.appendChild(ownerEl);
		}

		// ── Workspace list ──
		if (recents.length > 0) {
			const wsSection = document.createElement("div");
			wsSection.className = "ws-nav-dropdown-section";

			for (const ws of recents) {
				const wsItem = document.createElement("div");
				wsItem.className = "ws-nav-dropdown-item";
				const isCurrent = currentPath?.toLowerCase() === ws.path.toLowerCase();
				if (isCurrent) wsItem.classList.add("is-current");

				const wsIcon = document.createElement("span");
				wsIcon.className = "ws-nav-dropdown-item-icon";
				setIcon(wsIcon, ws.icon || "folder");
				wsItem.appendChild(wsIcon);

				const wsName = document.createElement("span");
				wsName.className = "ws-nav-dropdown-item-name";
				wsName.textContent = ws.name;
				wsItem.appendChild(wsName);

				if (isCurrent) {
					const checkEl = document.createElement("span");
					checkEl.className = "ws-nav-dropdown-check";
					setIcon(checkEl, "check");
					wsItem.appendChild(checkEl);
				}

				if (!isCurrent) {
					wsItem.addEventListener("click", () => {
						this._dismissDropdown();
						this._switchWorkspaceHandler?.(ws.path);
					});
				}

				wsSection.appendChild(wsItem);
			}

			dropdown.appendChild(wsSection);
		}

		// ── Separator ──
		const sep = document.createElement("div");
		sep.className = "ws-nav-dropdown-separator";
		dropdown.appendChild(sep);

		// ── Actions ──
		const actionsSection = document.createElement("div");
		actionsSection.className = "ws-nav-dropdown-section";

		this._addDropdownAction(actionsSection, "plus", "Create New Workspace", () => {
			this._dismissDropdown();
			this._createWorkspaceHandler?.();
		});

		this._addDropdownAction(actionsSection, "folder-open", "Open Workspace Folder\u2026", () => {
			this._dismissDropdown();
			this._openFolderHandler?.();
		});

		this._addDropdownAction(actionsSection, "settings", "Workspace Settings", () => {
			this._dismissDropdown();
			this._app?.setting?.open?.();
		});

		dropdown.appendChild(actionsSection);

		// Position below the header
		anchorEl.appendChild(dropdown);
		this._activeDropdown = dropdown;

		// Auto-dismiss on click outside or ESC
		this._dropdownDismissHandler = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) {
				this._dismissDropdown();
			}
		};
		this._dropdownEscHandler = (e: KeyboardEvent) => {
			if (e.key === "Escape") this._dismissDropdown();
		};

		requestAnimationFrame(() => {
			document.addEventListener("click", this._dropdownDismissHandler!, true);
			document.addEventListener("keydown", this._dropdownEscHandler!);
		});
	}

	/**
	 * Add an action item to the dropdown.
	 * @internal
	 */
	private _addDropdownAction(
		container: HTMLElement,
		icon: string,
		label: string,
		action: () => void,
	): void {
		const item = document.createElement("div");
		item.className = "ws-nav-dropdown-item ws-nav-dropdown-action";

		const iconEl = document.createElement("span");
		iconEl.className = "ws-nav-dropdown-item-icon";
		setIcon(iconEl, icon);
		item.appendChild(iconEl);

		const nameEl = document.createElement("span");
		nameEl.className = "ws-nav-dropdown-item-name";
		nameEl.textContent = label;
		item.appendChild(nameEl);

		item.addEventListener("click", action);
		container.appendChild(item);
	}

	/**
	 * Dismiss and clean up the dropdown.
	 * @internal
	 */
	private _dismissDropdown(): void {
		if (this._activeDropdown) {
			this._activeDropdown.remove();
			this._activeDropdown = null;
		}
		if (this._dropdownDismissHandler) {
			document.removeEventListener("click", this._dropdownDismissHandler, true);
			this._dropdownDismissHandler = null;
		}
		if (this._dropdownEscHandler) {
			document.removeEventListener("keydown", this._dropdownEscHandler);
			this._dropdownEscHandler = null;
		}
	}

	// ── Helpers ────────────────────────────────────────────────

	/**
	 * Get a fallback workspace name from the directory path.
	 * @internal
	 */
	private _getFallbackName(): string {
		const path = this._workspaceService.currentPath;
		if (!path) return "Workspace";
		const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
		return parts[parts.length - 1] || "Workspace";
	}
}
