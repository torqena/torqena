/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ui/WorkspaceService
 * @description Loads and manages workspace configuration from `.torqena/workspace.json`.
 *
 * Provides:
 * - Loading the current workspace config from disk
 * - Tracking recently opened workspaces in localStorage
 * - Notifying listeners when the workspace changes
 *
 * @example
 * ```typescript
 * const service = new WorkspaceService();
 * const config = await service.loadWorkspaceConfig("/path/to/workspace");
 * console.log(config?.name, config?.structure.folders);
 * ```
 *
 * @see {@link WorkspaceConfig} for the configuration shape
 * @see {@link WorkspaceNavigatorView} for the UI consumer
 * @since 0.1.0
 */

import type { WorkspaceConfig, RecentWorkspace } from "../types/workspace.js";

/** @internal localStorage key for the recent workspaces list. */
const RECENT_WORKSPACES_KEY = "torqena-recent-workspaces";

/** @internal localStorage key for the currently active workspace path. */
const ACTIVE_WORKSPACE_KEY = "torqena-active-workspace";

/** @internal Maximum number of recent workspaces to retain. */
const MAX_RECENT = 10;

/**
 * Service for loading workspace configuration and managing the recent
 * workspaces list.
 *
 * Reads `.torqena/workspace.json` from the workspace root via
 * `window.electronAPI` and persists a recent-workspaces list in
 * localStorage.
 */
export class WorkspaceService {
	/** The currently loaded workspace configuration, or null. */
	private _current: WorkspaceConfig | null = null;

	/** The absolute path of the currently loaded workspace. */
	private _currentPath: string | null = null;

	/** Change listeners. */
	private _listeners: Array<(config: WorkspaceConfig | null) => void> = [];

	// ── Accessors ──────────────────────────────────────────────

	/**
	 * The currently loaded workspace configuration.
	 *
	 * @returns The current config or null if none loaded
	 */
	get current(): WorkspaceConfig | null {
		return this._current;
	}

	/**
	 * The absolute path of the currently loaded workspace.
	 *
	 * @returns The current workspace path or null
	 */
	get currentPath(): string | null {
		return this._currentPath;
	}

	// ── Active Workspace (static) ──────────────────────────────

	/**
	 * Get the path of the currently active workspace from localStorage.
	 *
	 * @returns The active workspace path or null if none set
	 */
	static getActiveWorkspace(): string | null {
		return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
	}

	/**
	 * Set the active workspace path in localStorage.
	 *
	 * @param dirPath - Absolute path to the workspace root
	 */
	static setActiveWorkspace(dirPath: string): void {
		localStorage.setItem(ACTIVE_WORKSPACE_KEY, dirPath.replace(/[\\/]$/, ""));
	}

	/**
	 * Clear the active workspace (e.g. when switching or closing).
	 */
	static clearActiveWorkspace(): void {
		localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
	}

	// ── Loading ────────────────────────────────────────────────

	/**
	 * Load workspace configuration from `.torqena/workspace.json`.
	 *
	 * If the file does not exist, returns null. On success, updates
	 * the recent workspaces list and notifies listeners.
	 *
	 * @param dirPath - Absolute path to the workspace root directory
	 * @returns The parsed workspace config or null
	 *
	 * @example
	 * ```typescript
	 * const config = await service.loadWorkspaceConfig("C:/workspaces/acme");
	 * if (config) {
	 *   console.log("Loaded:", config.name);
	 * }
	 * ```
	 */
	async loadWorkspaceConfig(dirPath: string): Promise<WorkspaceConfig | null> {
		const normalizedPath = dirPath.replace(/[\\/]$/, "");
		const configPath = `${normalizedPath}/.torqena/workspace.json`;

		try {
			const exists = await window.electronAPI?.exists(configPath);
			if (!exists) {
				console.log("[WorkspaceService] No workspace.json found at:", configPath);
				this._current = null;
				this._currentPath = normalizedPath;
				this._notify();
				return null;
			}

			const content = await window.electronAPI!.readFile(configPath, "utf-8");
			const config: WorkspaceConfig = JSON.parse(content);

			this._current = config;
			this._currentPath = normalizedPath;

			// Update recent workspaces
			this.addRecentWorkspace({
				path: normalizedPath,
				name: config.name,
				icon: config.theme?.icon || "folder",
				lastOpenedAt: new Date().toISOString(),
			});

			this._notify();
			return config;
		} catch (err) {
			console.warn("[WorkspaceService] Failed to load workspace.json:", err);
			this._current = null;
			this._currentPath = normalizedPath;
			this._notify();
			return null;
		}
	}

	// ── Recent Workspaces ──────────────────────────────────────

	/**
	 * Get the list of recently opened workspaces.
	 *
	 * @returns Array of recent workspace entries, most recent first
	 *
	 * @example
	 * ```typescript
	 * const recents = service.getRecentWorkspaces();
	 * for (const ws of recents) {
	 *   console.log(ws.name, ws.path);
	 * }
	 * ```
	 */
	getRecentWorkspaces(): RecentWorkspace[] {
		try {
			const raw = localStorage.getItem(RECENT_WORKSPACES_KEY);
			if (!raw) return [];
			return JSON.parse(raw) as RecentWorkspace[];
		} catch {
			return [];
		}
	}

	/**
	 * Add or update a workspace in the recent list.
	 *
	 * Moves the workspace to the top if already present.
	 * Trims the list to {@link MAX_RECENT} entries.
	 *
	 * @param entry - The workspace entry to add
	 */
	addRecentWorkspace(entry: RecentWorkspace): void {
		const recents = this.getRecentWorkspaces();

		// Remove existing entry with same path (case-insensitive on Windows)
		const filtered = recents.filter(
			(r) => r.path.toLowerCase() !== entry.path.toLowerCase(),
		);

		// Add to front
		filtered.unshift(entry);

		// Trim
		const trimmed = filtered.slice(0, MAX_RECENT);

		localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(trimmed));
	}

	/**
	 * Remove a workspace from the recent list.
	 *
	 * @param path - The absolute path to remove
	 */
	removeRecentWorkspace(path: string): void {
		const recents = this.getRecentWorkspaces();
		const filtered = recents.filter(
			(r) => r.path.toLowerCase() !== path.toLowerCase(),
		);
		localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(filtered));
	}

	// ── Events ─────────────────────────────────────────────────

	/**
	 * Register a listener for workspace configuration changes.
	 *
	 * @param listener - Called with the new config (or null) on change
	 * @returns A function to unregister the listener
	 *
	 * @example
	 * ```typescript
	 * const unsubscribe = service.onChange((config) => {
	 *   console.log("Workspace changed:", config?.name);
	 * });
	 * // Later: unsubscribe();
	 * ```
	 */
	onChange(listener: (config: WorkspaceConfig | null) => void): () => void {
		this._listeners.push(listener);
		return () => {
			const idx = this._listeners.indexOf(listener);
			if (idx >= 0) this._listeners.splice(idx, 1);
		};
	}

	/** @internal Notify all listeners of a config change. */
	private _notify(): void {
		for (const listener of this._listeners) {
			try {
				listener(this._current);
			} catch (err) {
				console.error("[WorkspaceService] Listener error:", err);
			}
		}
	}
}
