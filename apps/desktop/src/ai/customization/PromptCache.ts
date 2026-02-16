/**
 * PromptCache - Caches custom prompts from configured directories for fast access.
 * Loads prompts on startup and watches for changes to prompt directories.
 */

import { App, TFile, TAbstractFile, EventRef } from "obsidian";
import { CustomizationLoader, CustomPrompt } from "./CustomizationLoader";
import { parseYamlKeyValues } from "./YamlParser";

/**
 * Lightweight prompt info for caching (same as CustomPrompt but can be extended)
 */
export interface CachedPromptInfo {
	/** Unique identifier from frontmatter name field or filename */
	name: string;
	/** Human-readable description */
	description: string;
	/** Optional tools the prompt can use */
	tools?: string[];
	/** Optional model override for this prompt */
	model?: string;
	/** Optional agent to use when running the prompt */
	agent?: string;
	/** Optional hint text shown in the chat input field */
	argumentHint?: string;
	/** Optional timeout in seconds for this prompt (overrides default) */
	timeout?: number;
	/** Full path to the prompt file */
	path: string;
}

/**
 * Event types for prompt cache changes
 */
export type PromptCacheEvent = 
	| { type: 'loaded'; prompts: CachedPromptInfo[] }
	| { type: 'added'; prompt: CachedPromptInfo }
	| { type: 'updated'; prompt: CachedPromptInfo }
	| { type: 'removed'; path: string };

/**
 * Listener callback for cache changes
 */
export type PromptCacheListener = (event: PromptCacheEvent) => void;

/**
 * PromptCache manages a cached list of available prompts for quick access.
 * It loads prompts on initialization and watches for file changes in prompt directories.
 */
export class PromptCache {
	private app: App;
	private loader: CustomizationLoader;
	private cachedPrompts: Map<string, CachedPromptInfo> = new Map();
	private promptDirectories: string[] = [];
	private listeners: Set<PromptCacheListener> = new Set();
	private fileWatcherRef: EventRef | null = null;
	private isLoading = false;

	constructor(app: App) {
		this.app = app;
		this.loader = new CustomizationLoader(app);
	}

	/**
	 * Initialize the cache by loading prompts from the given directories.
	 * Call this when the plugin loads.
	 */
	async initialize(directories: string[]): Promise<void> {
		this.promptDirectories = directories;
		await this.refreshCache();
		this.setupFileWatcher();
	}

	/**
	 * Update the prompt directories and refresh the cache.
	 * Call this when the user changes the prompt directory settings.
	 */
	async updateDirectories(directories: string[]): Promise<void> {
		// Normalize paths for comparison (trim whitespace, normalize slashes)
		const normalize = (paths: string[]) => paths.map(p => p.trim().replace(/\\/g, '/'));
		const normalizedNew = normalize(directories);
		const normalizedOld = normalize(this.promptDirectories);
		
		const changed = JSON.stringify(normalizedNew) !== JSON.stringify(normalizedOld);
		
		console.log(`[VC] Prompt directories update - changed: ${changed}`, { 
			old: this.promptDirectories, 
			new: directories 
		});
		
		this.promptDirectories = directories;
		
		if (changed) {
			await this.refreshCache();
		}
	}

	/**
	 * Refresh the cache by reloading all prompts from the configured directories.
	 */
	async refreshCache(): Promise<void> {
		if (this.isLoading) return;
		
		this.isLoading = true;
		try {
			const prompts = await this.loader.loadPrompts(this.promptDirectories);
			
			this.cachedPrompts.clear();
			for (const prompt of prompts) {
				this.cachedPrompts.set(prompt.path, {
					name: prompt.name,
					description: prompt.description,
					tools: prompt.tools,
					model: prompt.model,
					agent: prompt.agent,
					argumentHint: prompt.argumentHint,
					path: prompt.path,
				});
			}
			
			this.notifyListeners({ type: 'loaded', prompts: this.getPrompts() });
			console.log(`[VC] Prompt cache refreshed: ${this.cachedPrompts.size} prompts loaded`);
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * Get all cached prompts.
	 */
	getPrompts(): CachedPromptInfo[] {
		return Array.from(this.cachedPrompts.values());
	}

	/**
	 * Get a cached prompt by name.
	 */
	getPromptByName(name: string): CachedPromptInfo | undefined {
		for (const prompt of this.cachedPrompts.values()) {
			if (prompt.name === name) {
				return prompt;
			}
		}
		return undefined;
	}

	/**
	 * Get a cached prompt by path.
	 */
	getPromptByPath(path: string): CachedPromptInfo | undefined {
		return this.cachedPrompts.get(path);
	}

	/**
	 * Load the full prompt details (including content) for a specific prompt.
	 */
	async getFullPrompt(name: string): Promise<CustomPrompt | undefined> {
		return await this.loader.getPrompt(this.promptDirectories, name);
	}

	/**
	 * Check if there are any cached prompts.
	 */
	hasPrompts(): boolean {
		return this.cachedPrompts.size > 0;
	}

	/**
	 * Get the number of cached prompts.
	 */
	get count(): number {
		return this.cachedPrompts.size;
	}

	/**
	 * Subscribe to cache change events.
	 * Returns an unsubscribe function.
	 */
	onCacheChange(listener: PromptCacheListener): () => void {
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
		this.cachedPrompts.clear();
	}

	/**
	 * Set up file watchers for prompt directories to detect changes.
	 */
	private setupFileWatcher(): void {
		// Clean up existing watcher
		if (this.fileWatcherRef) {
			this.app.vault.offref(this.fileWatcherRef);
		}

		// Watch for file changes
		this.fileWatcherRef = this.app.vault.on('modify', (file) => {
			this.handleFileChange(file, 'modify');
		});

		// Also watch for create/delete/rename
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
		if (!this.isPromptFile(file.path)) return;

		console.log(`[VC] Prompt file ${eventType}: ${file.path}`);

		if (eventType === 'delete') {
			if (this.cachedPrompts.has(file.path)) {
				this.cachedPrompts.delete(file.path);
				this.notifyListeners({ type: 'removed', path: file.path });
			}
			return;
		}

		// For create or modify, load/reload the prompt
		try {
			const content = await this.app.vault.read(file);
			const prompt = this.parsePromptFile(file.path, file.basename, content);
			
			if (prompt) {
				const isNew = !this.cachedPrompts.has(file.path);
				this.cachedPrompts.set(file.path, prompt);
				this.notifyListeners({ 
					type: isNew ? 'added' : 'updated', 
					prompt 
				});
			}
		} catch (error) {
			console.error(`[VC] Failed to process prompt file ${file.path}:`, error);
		}
	}

	/**
	 * Handle file rename events.
	 */
	private async handleFileRename(file: TAbstractFile, oldPath: string): Promise<void> {
		// Check if the old path was a prompt file
		if (this.cachedPrompts.has(oldPath)) {
			this.cachedPrompts.delete(oldPath);
			this.notifyListeners({ type: 'removed', path: oldPath });
		}

		// Check if the new path is a prompt file
		if (file instanceof TFile && this.isPromptFile(file.path)) {
			await this.handleFileChange(file, 'create');
		}
	}

	/**
	 * Check if a file path is within one of the prompt directories and is a .prompt.md file.
	 */
	private isPromptFile(filePath: string): boolean {
		if (!filePath.endsWith('.prompt.md')) return false;
		
		for (const dir of this.promptDirectories) {
			if (filePath.startsWith(dir + '/') || filePath === dir) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Parse a prompt file and extract the cached info.
	 */
	private parsePromptFile(path: string, basename: string, content: string): CachedPromptInfo | null {
		const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		let frontmatter: Record<string, unknown> = {};

		if (match) {
			const yamlStr = match[1] || '';
			frontmatter = parseYamlKeyValues(yamlStr);
		}

		// Extract name from frontmatter or filename
		let name = frontmatter.name ? String(frontmatter.name) : basename;
		if (name.endsWith('.prompt')) {
			name = name.replace('.prompt', '');
		}

		// Description is required, but we'll use a default if not provided
		const description = frontmatter.description 
			? String(frontmatter.description) 
			: `Prompt from ${basename}`;

		return {
			name,
			description,
			tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
			model: frontmatter.model ? String(frontmatter.model) : undefined,
			agent: frontmatter.agent ? String(frontmatter.agent) : undefined,
			argumentHint: frontmatter['argument-hint'] ? String(frontmatter['argument-hint']) : undefined,
			timeout: typeof frontmatter.timeout === 'number' ? frontmatter.timeout : undefined,
			path,
		};
	}

	/**
	 * Notify all listeners of a cache change event.
	 */
	private notifyListeners(event: PromptCacheEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('[VC] Error in prompt cache listener:', error);
			}
		}
	}
}
