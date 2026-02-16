/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module types/workspace
 * @description TypeScript interfaces for workspace configuration files.
 *
 * Defines the shape of `.torqena/workspace.json` and related
 * structures used by the workspace navigator and service.
 *
 * @see {@link WorkspaceService} for loading and managing workspace configs
 * @since 0.1.0
 */

/**
 * A folder entry defined in the workspace structure.
 *
 * @example
 * ```typescript
 * const folder: WorkspaceFolder = {
 *   id: "meetings",
 *   name: "Meetings",
 *   description: "Meeting notes, agendas, and recordings",
 *   icon: "calendar",
 *   folderPath: "meetings"
 * };
 * ```
 */
export interface WorkspaceFolder {
	/** Unique identifier for the folder. */
	id: string;
	/** Display name shown in the navigator. */
	name: string;
	/** Brief description of the folder's purpose. */
	description: string;
	/** Lucide icon name (e.g. "calendar", "check-square"). */
	icon: string;
	/** Relative path from workspace root to the folder. */
	folderPath: string;
}

/**
 * Theme configuration for a workspace.
 */
export interface WorkspaceTheme {
	/** Color mode preference. */
	mode: "dark" | "light" | "system";
	/** Accent color hex value. */
	accentColor: string;
	/** Lucide icon name for the workspace (e.g. "rocket", "briefcase"). */
	icon: string;
	/** Optional path to a custom logo image. */
	customLogoPath: string | null;
}

/**
 * Owner information for a workspace.
 */
export interface WorkspaceOwner {
	/** Unique identifier for the owner. */
	id: string;
	/** Display name of the owner. */
	displayName: string;
}

/**
 * Layout preferences for a workspace.
 */
export interface WorkspaceLayout {
	/** Default view to show on open. */
	defaultView: string;
	/** Whether the sidebar starts collapsed. */
	sidebarCollapsed: boolean;
	/** Whether the agent panel is visible. */
	agentPanelVisible: boolean;
	/** Width of the agent panel in pixels. */
	agentPanelWidth?: number;
	/** Last window position and size. */
	lastWindowBounds?: {
		x: number;
		y: number;
		width: number;
		height: number;
		maximized: boolean;
	};
}

/**
 * Full workspace configuration as stored in `.torqena/workspace.json`.
 *
 * @example
 * ```typescript
 * const config: WorkspaceConfig = JSON.parse(
 *   await window.electronAPI.readFile(".torqena/workspace.json", "utf-8")
 * );
 * console.log(config.name, config.structure.folders);
 * ```
 */
export interface WorkspaceConfig {
	/** Schema version for forward compatibility. */
	schemaVersion: number;
	/** Unique workspace identifier. */
	workspaceId: string;
	/** Display name of the workspace. */
	name: string;
	/** Brief description of the workspace. */
	description: string;
	/** ISO 8601 creation timestamp. */
	createdAt?: string;
	/** ISO 8601 last-opened timestamp. */
	lastOpenedAt?: string;
	/** Workspace owner information. */
	owner: WorkspaceOwner;
	/** Theme and appearance settings. */
	theme: WorkspaceTheme;
	/** Layout preferences. */
	layout: WorkspaceLayout;
	/** Folder structure definition. */
	structure: {
		folders: WorkspaceFolder[];
	};
	/** Installed extensions. */
	extensions?: {
		installed: Array<{ id: string; version: string; enabled: boolean }>;
	};
	/** AI configuration. */
	ai?: Record<string, unknown>;
	/** Indexing configuration. */
	indexing?: Record<string, unknown>;
	/** Collaboration settings. */
	collaboration?: Record<string, unknown>;
}

/**
 * A recently opened workspace entry stored in localStorage.
 *
 * @example
 * ```typescript
 * const recent: RecentWorkspace = {
 *   path: "C:/Users/dan/workspaces/acme",
 *   name: "Acme Product Team",
 *   icon: "rocket",
 *   lastOpenedAt: "2026-02-15T21:00:00Z"
 * };
 * ```
 */
export interface RecentWorkspace {
	/** Absolute filesystem path to the workspace root. */
	path: string;
	/** Display name from workspace.json. */
	name: string;
	/** Lucide icon name from workspace theme. */
	icon: string;
	/** ISO 8601 timestamp of last open. */
	lastOpenedAt: string;
}
