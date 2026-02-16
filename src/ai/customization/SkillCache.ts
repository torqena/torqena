/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module SkillCache
 * @description Caches custom skills from configured directories for fast access.
 * Loads skills on startup and watches for changes to skill directories.
 * Supports both in-vault and out-of-vault directories (via filesystem fallback).
 *
 * @since 0.0.28
 */

import { App, TFile, TFolder, TAbstractFile, EventRef } from "obsidian";
import { CustomizationLoader, CustomSkill } from "./CustomizationLoader";

/**
 * Lightweight skill info for caching (excludes the full instructions)
 */
export interface CachedSkillInfo {
	/** Unique identifier from frontmatter name field */
	name: string;
	/** Description of when to use the skill */
	description: string;
	/** Optional license */
	license?: string;
	/** Full path to the skill directory */
	path: string;
}

/**
 * Event types for skill cache changes
 */
export type SkillCacheEvent =
	| { type: 'loaded'; skills: CachedSkillInfo[] }
	| { type: 'added'; skill: CachedSkillInfo }
	| { type: 'updated'; skill: CachedSkillInfo }
	| { type: 'removed'; path: string };

/**
 * Listener callback for cache changes
 */
export type SkillCacheListener = (event: SkillCacheEvent) => void;

/**
 * SkillCache manages a cached list of available file-based skills for quick access.
 * It loads skills on initialization and watches for file changes in skill directories.
 */
export class SkillCache {
	private app: App;
	private loader: CustomizationLoader;
	private cachedSkills: Map<string, CachedSkillInfo> = new Map();
	private skillDirectories: string[] = [];
	private listeners: Set<SkillCacheListener> = new Set();
	private fileWatcherRef: EventRef | null = null;
	private isLoading = false;

	constructor(app: App) {
		this.app = app;
		this.loader = new CustomizationLoader(app);
	}

	/**
	 * Initialize the cache by loading skills from the given directories.
	 * Call this when the plugin loads.
	 */
	async initialize(directories: string[]): Promise<void> {
		this.skillDirectories = directories;
		await this.refreshCache();
		this.setupFileWatcher();
	}

	/**
	 * Update the skill directories and refresh the cache.
	 * Call this when the user changes the skill directory settings.
	 */
	async updateDirectories(directories: string[]): Promise<void> {
		const normalize = (paths: string[]) => paths.map(p => p.trim().replace(/\\/g, '/'));
		const normalizedNew = normalize(directories);
		const normalizedOld = normalize(this.skillDirectories);

		const changed = JSON.stringify(normalizedNew) !== JSON.stringify(normalizedOld);

		console.log(`[VC] Skill directories update - changed: ${changed}`, {
			old: this.skillDirectories,
			new: directories
		});

		this.skillDirectories = directories;

		if (changed) {
			await this.refreshCache();
		}
	}

	/**
	 * Refresh the cache by reloading all skills from the configured directories.
	 */
	async refreshCache(): Promise<void> {
		if (this.isLoading) return;

		this.isLoading = true;
		try {
			const skills = await this.loader.loadSkills(this.skillDirectories);

			this.cachedSkills.clear();
			for (const skill of skills) {
				this.cachedSkills.set(skill.path, {
					name: skill.name,
					description: skill.description,
					license: skill.license,
					path: skill.path,
				});
			}

			this.notifyListeners({ type: 'loaded', skills: this.getSkills() });
			console.log(`[VC] Skill cache refreshed: ${this.cachedSkills.size} skills loaded`);
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * Get all cached skills.
	 */
	getSkills(): CachedSkillInfo[] {
		return Array.from(this.cachedSkills.values());
	}

	/**
	 * Get a cached skill by name.
	 */
	getSkillByName(name: string): CachedSkillInfo | undefined {
		for (const skill of this.cachedSkills.values()) {
			if (skill.name === name) {
				return skill;
			}
		}
		return undefined;
	}

	/**
	 * Get a cached skill by path.
	 */
	getSkillByPath(path: string): CachedSkillInfo | undefined {
		return this.cachedSkills.get(path);
	}

	/**
	 * Load the full skill details (including instructions) for a specific skill.
	 */
	async getFullSkill(name: string): Promise<CustomSkill | undefined> {
		const skills = await this.loader.loadSkills(this.skillDirectories);
		return skills.find(s => s.name === name);
	}

	/**
	 * Check if there are any cached skills.
	 */
	hasSkills(): boolean {
		return this.cachedSkills.size > 0;
	}

	/**
	 * Get the number of cached skills.
	 */
	get count(): number {
		return this.cachedSkills.size;
	}

	/**
	 * Subscribe to cache change events.
	 * Returns an unsubscribe function.
	 */
	onCacheChange(listener: SkillCacheListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Clean up resources when the plugin unloads.
	 */
	destroy(): void {
		if (this.fileWatcherRef) {
			this.app.vault.offref(this.fileWatcherRef);
			this.fileWatcherRef = null;
		}
		this.listeners.clear();
		this.cachedSkills.clear();
	}

	/**
	 * Set up file watchers for skill directories to detect changes.
	 * Only watches in-vault files (out-of-vault changes require manual refresh).
	 */
	private setupFileWatcher(): void {
		if (this.fileWatcherRef) {
			this.app.vault.offref(this.fileWatcherRef);
		}

		this.fileWatcherRef = this.app.vault.on('modify', (file) => {
			this.handleFileChange(file, 'modify');
		});

		this.app.vault.on('create', (file) => {
			this.handleFileChange(file, 'create');
		});

		this.app.vault.on('delete', (file) => {
			this.handleFileChange(file, 'delete');
		});

		this.app.vault.on('rename', (file, oldPath) => {
			this.handleFileRename(file, oldPath);
		});
	}

	/**
	 * Handle file change events (create, modify, delete).
	 */
	private async handleFileChange(file: TAbstractFile, eventType: 'create' | 'modify' | 'delete'): Promise<void> {
		if (!(file instanceof TFile)) return;
		if (!this.isSkillFile(file.path)) return;

		console.log(`[VC] Skill file ${eventType}: ${file.path}`);

		// For skill files, the cache key is the parent folder path
		const skillDirPath = file.path.replace(/\/SKILL\.md$/, '');

		if (eventType === 'delete') {
			if (this.cachedSkills.has(skillDirPath)) {
				this.cachedSkills.delete(skillDirPath);
				this.notifyListeners({ type: 'removed', path: skillDirPath });
			}
			return;
		}

		// For create or modify, refresh the whole cache (simpler than partial update for skills)
		await this.refreshCache();
	}

	/**
	 * Handle file rename events.
	 */
	private async handleFileRename(file: TAbstractFile, oldPath: string): Promise<void> {
		const oldSkillDir = oldPath.replace(/\/SKILL\.md$/, '');
		if (this.cachedSkills.has(oldSkillDir)) {
			this.cachedSkills.delete(oldSkillDir);
			this.notifyListeners({ type: 'removed', path: oldSkillDir });
		}

		if (file instanceof TFile && this.isSkillFile(file.path)) {
			await this.refreshCache();
		}
	}

	/**
	 * Check if a file path is a SKILL.md within one of the skill directories.
	 */
	private isSkillFile(filePath: string): boolean {
		if (!filePath.endsWith('/SKILL.md') && filePath !== 'SKILL.md') return false;

		for (const dir of this.skillDirectories) {
			if (filePath.startsWith(dir + '/') || filePath === dir) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Notify all listeners of a cache change event.
	 */
	private notifyListeners(event: SkillCacheEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('[VC] Error in skill cache listener:', error);
			}
		}
	}
}
