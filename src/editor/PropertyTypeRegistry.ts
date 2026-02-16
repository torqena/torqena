/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module PropertyTypeRegistry
 * @description Vault-wide index of YAML property names and their types.
 *
 * Scans all markdown files on startup to build a map of property names → types.
 * Supports user-specified type overrides persisted to `.vault-copilot/types.json`.
 * Subscribes to vault events for incremental updates when files change.
 *
 * @example
 * ```ts
 * const registry = new PropertyTypeRegistry();
 * await registry.buildIndex(vault);
 * await registry.loadOverrides(vault);
 * const type = registry.getType("due_date"); // "date"
 * ```
 *
 * @since 0.0.29
 */

import type { PropertyType } from "./FrontmatterService.js";
import { parseFrontmatter, detectPropertyType } from "./FrontmatterService.js";

/** Path for persisting user type overrides inside the vault. */
const OVERRIDES_FOLDER = ".vault-copilot";
const OVERRIDES_FILE = ".vault-copilot/types.json";

/**
 * Vault-wide property type registry.
 *
 * Maintains an in-memory index of property names → inferred types,
 * overlaid with explicit user overrides that persist to the vault.
 */
export class PropertyTypeRegistry {
	/** Inferred types from scanning all markdown files. */
	private _inferred: Map<string, PropertyType> = new Map();

	/** User-specified type overrides (persisted to vault). */
	private _overrides: Map<string, PropertyType> = new Map();

	/** Reference to vault for persistence and incremental updates. */
	private _vault: any = null;

	/**
	 * Build the property index by scanning all markdown files in the vault.
	 *
	 * @param vault - The vault instance to scan
	 */
	async buildIndex(vault: any): Promise<void> {
		this._vault = vault;

		const files = vault.getMarkdownFiles();
		for (const file of files) {
			try {
				const content = await vault.cachedRead(file);
				this._indexFileContent(content);
			} catch {
				// Skip files that can't be read
			}
		}

		// Subscribe to vault events for incremental updates
		vault.on("modify", (file: any) => {
			if (file.path?.endsWith(".md")) {
				this._reindexFile(file);
			}
		});

		vault.on("create", (file: any) => {
			if (file.path?.endsWith(".md")) {
				this._reindexFile(file);
			}
		});

		console.log(`[PropertyTypeRegistry] Indexed ${this._inferred.size} unique property names from ${files.length} files`);
	}

	/**
	 * Load user type overrides from `.vault-copilot/types.json`.
	 *
	 * @param vault - The vault instance to read from
	 */
	async loadOverrides(vault: any): Promise<void> {
		this._vault = vault;
		try {
			const content = await vault.adapter.read(OVERRIDES_FILE);
			const parsed = JSON.parse(content);
			if (parsed && typeof parsed === "object") {
				for (const [key, value] of Object.entries(parsed)) {
					if (typeof value === "string") {
						this._overrides.set(key, value as PropertyType);
					}
				}
			}
			console.log(`[PropertyTypeRegistry] Loaded ${this._overrides.size} type overrides`);
		} catch {
			// File doesn't exist yet — that's fine
		}
	}

	/**
	 * Save user type overrides to `.vault-copilot/types.json`.
	 */
	async saveOverrides(): Promise<void> {
		if (!this._vault) return;

		const data: Record<string, string> = {};
		for (const [key, type] of this._overrides) {
			data[key] = type;
		}

		try {
			// Ensure the folder exists
			const folder = this._vault.getAbstractFileByPath(OVERRIDES_FOLDER);
			if (!folder) {
				await this._vault.createFolder(OVERRIDES_FOLDER);
			}

			// Write the overrides file
			const file = this._vault.getAbstractFileByPath(OVERRIDES_FILE);
			if (file) {
				await this._vault.modify(file, JSON.stringify(data, null, 2));
			} else {
				await this._vault.create(OVERRIDES_FILE, JSON.stringify(data, null, 2));
			}
		} catch (err) {
			console.error("[PropertyTypeRegistry] Failed to save type overrides:", err);
		}
	}

	/**
	 * Set a user-specified type override for a property name.
	 *
	 * @param name - Property name
	 * @param type - The type to assign
	 */
	setType(name: string, type: PropertyType): void {
		this._overrides.set(name, type);
		this.saveOverrides();
	}

	/**
	 * Get the resolved type for a property name (override wins, then inferred).
	 *
	 * @param name - Property name
	 * @returns The stored type, or undefined if not indexed
	 */
	getType(name: string): PropertyType | undefined {
		return this._overrides.get(name) ?? this._inferred.get(name);
	}

	/**
	 * Get all known property names with their resolved types, sorted alphabetically.
	 *
	 * @returns Sorted array of { name, type } entries
	 */
	getAllProperties(): Array<{ name: string; type: PropertyType }> {
		const merged = new Map<string, PropertyType>(this._inferred);
		for (const [key, type] of this._overrides) {
			merged.set(key, type);
		}

		return Array.from(merged.entries())
			.map(([name, type]) => ({ name, type }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Extract and index property names/types from file content.
	 * @internal
	 */
	private _indexFileContent(content: string): void {
		const fm = parseFrontmatter(content);
		if (!fm) return;

		for (const [key, value] of Object.entries(fm.properties)) {
			if (!this._inferred.has(key)) {
				this._inferred.set(key, detectPropertyType(key, value));
			}
		}
	}

	/**
	 * Re-index a single file after modification.
	 * @internal
	 */
	private async _reindexFile(file: any): Promise<void> {
		if (!this._vault) return;
		try {
			const content = await this._vault.cachedRead(file);
			this._indexFileContent(content);
		} catch {
			// Skip unreadable files
		}
	}
}
