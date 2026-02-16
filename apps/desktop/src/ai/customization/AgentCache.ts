/**
 * AgentCache - Caches custom agents from configured directories for fast access.
 * Loads agents on startup and watches for changes to agent directories.
 */

import { App, TFile, TFolder, TAbstractFile, EventRef } from "obsidian";
import { CustomizationLoader, CustomAgent } from "./CustomizationLoader";
import { parseYamlKeyValues } from "./YamlParser";

/**
 * Lightweight agent info for caching (excludes the full instructions)
 */
export interface CachedAgentInfo {
	/** Unique identifier from frontmatter name field */
	name: string;
	/** Human-readable description */
	description: string;
	/** Tools the agent can use */
	tools?: string[];
	/** Allowlist of agent names this agent can invoke as subagents */
	agents?: string[];
	/** Model override(s) for this agent */
	model?: string | string[];
	/** Whether this agent appears in the user-facing agent selector (default: true) */
	userInvokable?: boolean;
	/** Whether the model can autonomously invoke this agent as a subagent (default: false) */
	disableModelInvocation?: boolean;
	/** Full path to the agent file */
	path: string;
}

/**
 * Event types for agent cache changes
 */
export type AgentCacheEvent = 
	| { type: 'loaded'; agents: CachedAgentInfo[] }
	| { type: 'added'; agent: CachedAgentInfo }
	| { type: 'updated'; agent: CachedAgentInfo }
	| { type: 'removed'; path: string };

/**
 * Listener callback for cache changes
 */
export type AgentCacheListener = (event: AgentCacheEvent) => void;

/**
 * AgentCache manages a cached list of available agents for quick access.
 * It loads agents on initialization and watches for file changes in agent directories.
 */
export class AgentCache {
	private app: App;
	private loader: CustomizationLoader;
	private cachedAgents: Map<string, CachedAgentInfo> = new Map();
	private agentDirectories: string[] = [];
	private listeners: Set<AgentCacheListener> = new Set();
	private fileWatcherRef: EventRef | null = null;
	private isLoading = false;

	constructor(app: App) {
		this.app = app;
		this.loader = new CustomizationLoader(app);
	}

	/**
	 * Initialize the cache by loading agents from the given directories.
	 * Call this when the plugin loads.
	 */
	async initialize(directories: string[]): Promise<void> {
		this.agentDirectories = directories;
		await this.refreshCache();
		this.setupFileWatcher();
	}

	/**
	 * Update the agent directories and refresh the cache.
	 * Call this when the user changes the agent directory settings.
	 */
	async updateDirectories(directories: string[]): Promise<void> {
		// Normalize paths for comparison (trim whitespace, normalize slashes)
		const normalize = (paths: string[]) => paths.map(p => p.trim().replace(/\\/g, '/'));
		const normalizedNew = normalize(directories);
		const normalizedOld = normalize(this.agentDirectories);
		
		const changed = JSON.stringify(normalizedNew) !== JSON.stringify(normalizedOld);
		
		console.log(`[VC] Agent directories update - changed: ${changed}`, { 
			old: this.agentDirectories, 
			new: directories 
		});
		
		this.agentDirectories = directories;
		
		if (changed) {
			await this.refreshCache();
		}
	}

	/**
	 * Refresh the cache by reloading all agents from the configured directories.
	 */
	async refreshCache(): Promise<void> {
		if (this.isLoading) return;
		
		this.isLoading = true;
		try {
			const agents = await this.loader.loadAgents(this.agentDirectories);
			
			this.cachedAgents.clear();
			for (const agent of agents) {
				this.cachedAgents.set(agent.path, {
					name: agent.name,
					description: agent.description,
					tools: agent.tools,
					agents: agent.agents,
					model: agent.model,
					userInvokable: agent.userInvokable,
					disableModelInvocation: agent.disableModelInvocation,
					path: agent.path,
				});
			}
			
			this.notifyListeners({ type: 'loaded', agents: this.getAgents() });
			console.log(`[VC] Agent cache refreshed: ${this.cachedAgents.size} agents loaded`);
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * Get all cached agents.
	 */
	getAgents(): CachedAgentInfo[] {
		return Array.from(this.cachedAgents.values());
	}

	/**
	 * Get a cached agent by name.
	 */
	getAgentByName(name: string): CachedAgentInfo | undefined {
		for (const agent of this.cachedAgents.values()) {
			if (agent.name === name) {
				return agent;
			}
		}
		return undefined;
	}

	/**
	 * Get a cached agent by path.
	 */
	getAgentByPath(path: string): CachedAgentInfo | undefined {
		return this.cachedAgents.get(path);
	}

	/**
	 * Load the full agent details (including instructions) for a specific agent.
	 */
	async getFullAgent(name: string): Promise<CustomAgent | undefined> {
		return await this.loader.getAgent(this.agentDirectories, name);
	}

	/**
	 * Check if there are any cached agents.
	 */
	hasAgents(): boolean {
		return this.cachedAgents.size > 0;
	}

	/**
	 * Get the number of cached agents.
	 */
	get count(): number {
		return this.cachedAgents.size;
	}

	/**
	 * Subscribe to cache change events.
	 * Returns an unsubscribe function.
	 */
	onCacheChange(listener: AgentCacheListener): () => void {
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
		this.cachedAgents.clear();
	}

	/**
	 * Set up file watchers for agent directories to detect changes.
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
		if (!this.isAgentFile(file.path)) return;

		console.log(`[VC] Agent file ${eventType}: ${file.path}`);

		if (eventType === 'delete') {
			if (this.cachedAgents.has(file.path)) {
				this.cachedAgents.delete(file.path);
				this.notifyListeners({ type: 'removed', path: file.path });
			}
			return;
		}

		// For create or modify, load/reload the agent
		try {
			const content = await this.app.vault.read(file);
			const agent = this.parseAgentFile(file.path, content);
			
			if (agent) {
				const isNew = !this.cachedAgents.has(file.path);
				this.cachedAgents.set(file.path, agent);
				this.notifyListeners({ 
					type: isNew ? 'added' : 'updated', 
					agent 
				});
			}
		} catch (error) {
			console.error(`[VC] Failed to process agent file ${file.path}:`, error);
		}
	}

	/**
	 * Handle file rename events.
	 */
	private async handleFileRename(file: TAbstractFile, oldPath: string): Promise<void> {
		// Check if the old path was an agent file
		if (this.cachedAgents.has(oldPath)) {
			this.cachedAgents.delete(oldPath);
			this.notifyListeners({ type: 'removed', path: oldPath });
		}

		// Check if the new path is an agent file
		if (file instanceof TFile && this.isAgentFile(file.path)) {
			await this.handleFileChange(file, 'create');
		}
	}

	/**
	 * Check if a file path is within one of the agent directories and is an .agent.md file.
	 */
	private isAgentFile(filePath: string): boolean {
		if (!filePath.endsWith('.agent.md')) return false;
		
		for (const dir of this.agentDirectories) {
			if (filePath.startsWith(dir + '/') || filePath === dir) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Parse an agent file and extract the cached info.
	 */
	private parseAgentFile(path: string, content: string): CachedAgentInfo | null {
		const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (!match) return null;

		const yamlStr = match[1] || '';
		const frontmatter = parseYamlKeyValues(yamlStr);

		if (frontmatter.name && frontmatter.description) {
			return {
				name: String(frontmatter.name),
				description: String(frontmatter.description),
				tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
				agents: Array.isArray(frontmatter.agents) ? (frontmatter.agents as string[]).map(String) : undefined,
				model: Array.isArray(frontmatter.model)
					? (frontmatter.model as string[]).map(String)
					: frontmatter.model ? String(frontmatter.model) : undefined,
				userInvokable: frontmatter['user-invokable'] === 'false' || frontmatter['user-invokable'] === false ? false : undefined,
				disableModelInvocation: frontmatter['disable-model-invocation'] === 'true' || frontmatter['disable-model-invocation'] === true ? true : undefined,
				path,
			};
		}

		return null;
	}

	/**
	 * Notify all listeners of a cache change event.
	 */
	private notifyListeners(event: AgentCacheEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('[VC] Error in agent cache listener:', error);
			}
		}
	}
}
