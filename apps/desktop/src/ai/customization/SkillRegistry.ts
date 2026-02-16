/**
 * Skill Registry for Vault Copilot
 * 
 * Provides a way for third-party plugins to register custom skills/tools
 * that can be invoked by the AI assistant.
 */

/**
 * Parameter schema for a skill (JSON Schema subset)
 */
export interface SkillParameterSchema {
	type: 'object';
	properties: Record<string, {
		type: 'string' | 'number' | 'boolean' | 'array' | 'object';
		description: string;
		enum?: string[];
		items?: { type: string };
		default?: unknown;
	}>;
	required?: string[];
}

/**
 * Result returned by a skill handler
 */
export interface SkillResult {
	success: boolean;
	data?: unknown;
	error?: string;
}

/**
 * Definition of a skill that can be registered with Vault Copilot
 */
export interface VaultCopilotSkill {
	/** Unique identifier for the skill (e.g., 'periodic-agent.create-note') */
	name: string;
	
	/** Human-readable description of what the skill does */
	description: string;
	
	/** JSON Schema defining the parameters the skill accepts */
	parameters: SkillParameterSchema;
	
	/** 
	 * Handler function that executes the skill
	 * @param args - Arguments matching the parameter schema
	 * @returns Result of the skill execution
	 */
	handler: (args: Record<string, unknown>) => Promise<SkillResult>;
	
	/** Optional: Plugin ID that registered this skill */
	pluginId?: string;
	
	/** Optional: Plugin name for display purposes */
	pluginName?: string;
	
	/** Optional: Version of the skill */
	version?: string;
	
	/** Optional: Whether this skill requires confirmation before execution */
	requiresConfirmation?: boolean;
	
	/** Optional: Category for grouping skills in the UI */
	category?: 'notes' | 'search' | 'automation' | 'integration' | 'utility' | 'custom';
}

/**
 * Information about a registered skill (without the handler for serialization)
 */
export interface SkillInfo {
	name: string;
	description: string;
	parameters: SkillParameterSchema;
	pluginId?: string;
	pluginName?: string;
	version?: string;
	requiresConfirmation?: boolean;
	category?: string;
	registeredAt: number;
}

/**
 * MCP Server configuration
 */
export interface McpServerConfig {
	/** Server URL */
	url: string;
	/** Optional API key for authentication */
	apiKey?: string;
	/** Optional: Human-readable name */
	name?: string;
	/** Optional: Whether the server is enabled */
	enabled?: boolean;
}

/**
 * Event emitted when skills change
 */
export interface SkillRegistryEvent {
	type: 'registered' | 'unregistered' | 'updated';
	skillName: string;
	skill?: SkillInfo;
}

/**
 * Skill Registry Manager
 * 
 * Manages the registration, lookup, and execution of skills from third-party plugins.
 */
export class SkillRegistry {
	private skills: Map<string, VaultCopilotSkill> = new Map();
	private mcpServers: Map<string, McpServerConfig> = new Map();
	private listeners: Set<(event: SkillRegistryEvent) => void> = new Set();

	/**
	 * Register a new skill
	 * @throws Error if a skill with the same name is already registered
	 */
	registerSkill(skill: VaultCopilotSkill): void {
		if (this.skills.has(skill.name)) {
			throw new Error(`Skill '${skill.name}' is already registered. Use updateSkill() to modify it.`);
		}
		
		this.validateSkill(skill);
		this.skills.set(skill.name, {
			...skill,
			category: skill.category || 'custom',
		});
		
		this.emit({
			type: 'registered',
			skillName: skill.name,
			skill: this.toSkillInfo(skill),
		});
	}

	/**
	 * Update an existing skill
	 * @throws Error if the skill is not registered
	 */
	updateSkill(skill: VaultCopilotSkill): void {
		if (!this.skills.has(skill.name)) {
			throw new Error(`Skill '${skill.name}' is not registered. Use registerSkill() first.`);
		}
		
		this.validateSkill(skill);
		this.skills.set(skill.name, {
			...skill,
			category: skill.category || 'custom',
		});
		
		this.emit({
			type: 'updated',
			skillName: skill.name,
			skill: this.toSkillInfo(skill),
		});
	}

	/**
	 * Unregister a skill by name
	 * @returns true if the skill was removed, false if it wasn't registered
	 */
	unregisterSkill(name: string): boolean {
		const existed = this.skills.delete(name);
		
		if (existed) {
			this.emit({
				type: 'unregistered',
				skillName: name,
			});
		}
		
		return existed;
	}

	/**
	 * Unregister all skills from a specific plugin
	 * @returns Number of skills unregistered
	 */
	unregisterPluginSkills(pluginId: string): number {
		let count = 0;
		for (const [name, skill] of this.skills.entries()) {
			if (skill.pluginId === pluginId) {
				this.skills.delete(name);
				this.emit({
					type: 'unregistered',
					skillName: name,
				});
				count++;
			}
		}
		return count;
	}

	/**
	 * Get a skill by name
	 */
	getSkill(name: string): VaultCopilotSkill | undefined {
		return this.skills.get(name);
	}

	/**
	 * Check if a skill is registered
	 */
	hasSkill(name: string): boolean {
		return this.skills.has(name);
	}

	/**
	 * List all registered skills (info only, no handlers)
	 */
	listSkills(): SkillInfo[] {
		return Array.from(this.skills.values()).map(skill => this.toSkillInfo(skill));
	}

	/**
	 * List skills by category
	 */
	listSkillsByCategory(category: string): SkillInfo[] {
		return Array.from(this.skills.values())
			.filter(skill => skill.category === category)
			.map(skill => this.toSkillInfo(skill));
	}

	/**
	 * List skills by plugin
	 */
	listSkillsByPlugin(pluginId: string): SkillInfo[] {
		return Array.from(this.skills.values())
			.filter(skill => skill.pluginId === pluginId)
			.map(skill => this.toSkillInfo(skill));
	}

	/**
	 * Execute a skill by name
	 */
	async executeSkill(name: string, args: Record<string, unknown>): Promise<SkillResult> {
		const skill = this.skills.get(name);
		if (!skill) {
			return {
				success: false,
				error: `Skill '${name}' not found`,
			};
		}

		try {
			// Validate required parameters
			const missing = this.validateArgs(skill, args);
			if (missing.length > 0) {
				return {
					success: false,
					error: `Missing required parameters: ${missing.join(', ')}`,
				};
			}

			return await skill.handler(args);
		} catch (error) {
			return {
				success: false,
				error: `Skill execution failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Configure an MCP server
	 */
	configureMcpServer(id: string, config: McpServerConfig): void {
		this.mcpServers.set(id, {
			...config,
			enabled: config.enabled ?? true,
		});
	}

	/**
	 * Remove an MCP server configuration
	 */
	removeMcpServer(id: string): boolean {
		return this.mcpServers.delete(id);
	}

	/**
	 * Get all configured MCP servers
	 */
	getMcpServers(): Map<string, McpServerConfig> {
		return new Map(this.mcpServers);
	}

	/**
	 * Get enabled MCP servers for use with SDK
	 */
	getEnabledMcpServers(): Record<string, { url: string; apiKey?: string }> {
		const result: Record<string, { url: string; apiKey?: string }> = {};
		for (const [id, config] of this.mcpServers.entries()) {
			if (config.enabled) {
				result[id] = {
					url: config.url,
					apiKey: config.apiKey,
				};
			}
		}
		return result;
	}

	/**
	 * Subscribe to registry changes
	 */
	onSkillChange(listener: (event: SkillRegistryEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Get the total number of registered skills
	 */
	get size(): number {
		return this.skills.size;
	}

	/**
	 * Clear all registered skills
	 */
	clear(): void {
		const names = Array.from(this.skills.keys());
		this.skills.clear();
		
		for (const name of names) {
			this.emit({
				type: 'unregistered',
				skillName: name,
			});
		}
	}

	// ===== Private Helpers =====

	private validateSkill(skill: VaultCopilotSkill): void {
		if (!skill.name || typeof skill.name !== 'string') {
			throw new Error('Skill must have a valid name');
		}
		if (!skill.description || typeof skill.description !== 'string') {
			throw new Error('Skill must have a description');
		}
		if (!skill.parameters || skill.parameters.type !== 'object') {
			throw new Error('Skill must have valid parameters schema');
		}
		if (typeof skill.handler !== 'function') {
			throw new Error('Skill must have a handler function');
		}
	}

	private validateArgs(skill: VaultCopilotSkill, args: Record<string, unknown>): string[] {
		const required = skill.parameters.required || [];
		return required.filter(param => !(param in args));
	}

	private toSkillInfo(skill: VaultCopilotSkill): SkillInfo {
		return {
			name: skill.name,
			description: skill.description,
			parameters: skill.parameters,
			pluginId: skill.pluginId,
			pluginName: skill.pluginName,
			version: skill.version,
			requiresConfirmation: skill.requiresConfirmation,
			category: skill.category,
			registeredAt: Date.now(),
		};
	}

	private emit(event: SkillRegistryEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('Error in skill registry listener:', error);
			}
		}
	}
}

// Singleton instance
let registryInstance: SkillRegistry | null = null;

/**
 * Get the global skill registry instance
 */
export function getSkillRegistry(): SkillRegistry {
	if (!registryInstance) {
		registryInstance = new SkillRegistry();
	}
	return registryInstance;
}

/**
 * Reset the registry (for testing)
 */
export function resetSkillRegistry(): void {
	if (registryInstance) {
		registryInstance.clear();
	}
	registryInstance = null;
}
