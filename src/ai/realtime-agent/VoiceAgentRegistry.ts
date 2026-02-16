/**
 * VoiceAgentRegistry - Central registry for voice agent discovery and registration
 * 
 * Allows voice agents to:
 * - Register themselves with the main assistant
 * - Declare their definition file patterns (*.voice-agent.md)
 * - Provide factory functions for instantiation
 * 
 * Third-party plugins can use this to add custom voice agents.
 */

import { App } from "obsidian";
import type { BaseVoiceAgent } from "./BaseVoiceAgent";
import type { BaseVoiceAgentConfig } from "./types";
import type { VoiceAgentDefinition } from "../customization/CustomizationLoader";
import { logger } from "./types";

/**
 * Factory function signature for creating voice agents
 */
export type VoiceAgentFactory = (
	app: App,
	config: BaseVoiceAgentConfig,
	definition?: VoiceAgentDefinition
) => BaseVoiceAgent;

/**
 * Registration metadata for a voice agent
 */
export interface VoiceAgentRegistration {
	/** Unique identifier for the agent type */
	id: string;
	
	/** Display name for the agent */
	name: string;
	
	/** Description of what this agent specializes in */
	description: string;
	
	/** 
	 * File name pattern for the voice agent definition (e.g., "task-manager.voice-agent.md")
	 * This is the filename that will be searched for in voice agent directories.
	 */
	definitionFileName: string;
	
	/** Factory function to create the agent instance */
	factory: VoiceAgentFactory;
	
	/** Plugin ID that registered this agent (for cleanup) */
	pluginId?: string;
	
	/** Whether this is a built-in agent */
	isBuiltIn?: boolean;
	
	/** Priority for ordering (higher = loaded first) */
	priority?: number;
}

/**
 * Event types for registry changes
 */
export interface VoiceAgentRegistryEvents {
	registered: (registration: VoiceAgentRegistration) => void;
	unregistered: (id: string) => void;
}

/**
 * Central registry for voice agents
 * 
 * Usage:
 * ```typescript
 * // Register a custom voice agent
 * VoiceAgentRegistry.register({
 *   id: "my-custom-agent",
 *   name: "My Custom Agent",
 *   description: "Handles custom tasks",
 *   definitionFileName: "my-custom-agent.voice-agent.md",
 *   factory: (app, config, definition) => new MyCustomAgent(app, config, definition),
 *   pluginId: "my-plugin"
 * });
 * 
 * // Later, unregister when plugin unloads
 * VoiceAgentRegistry.unregisterByPlugin("my-plugin");
 * ```
 */
export class VoiceAgentRegistry {
	/** Singleton instance */
	private static instance: VoiceAgentRegistry | null = null;
	
	/** Registered voice agents by ID */
	private registrations: Map<string, VoiceAgentRegistration> = new Map();
	
	/** Event listeners */
	private listeners: Map<keyof VoiceAgentRegistryEvents, Set<(...args: unknown[]) => void>> = new Map();

	private constructor() {}

	/**
	 * Get the singleton registry instance
	 */
	static getInstance(): VoiceAgentRegistry {
		if (!VoiceAgentRegistry.instance) {
			VoiceAgentRegistry.instance = new VoiceAgentRegistry();
		}
		return VoiceAgentRegistry.instance;
	}

	/**
	 * Register a voice agent
	 * @param registration The agent registration metadata
	 */
	register(registration: VoiceAgentRegistration): void {
		if (this.registrations.has(registration.id)) {
			logger.warn(`[VoiceAgentRegistry] Agent already registered: ${registration.id}, updating...`);
		}

		this.registrations.set(registration.id, {
			...registration,
			priority: registration.priority ?? 0,
			isBuiltIn: registration.isBuiltIn ?? false,
		});

		logger.info(`[VoiceAgentRegistry] Registered voice agent: ${registration.name} (${registration.id})`);
		this.emit("registered", registration);
	}

	/**
	 * Unregister a voice agent by ID
	 * @param id The agent ID to unregister
	 * @returns true if the agent was found and unregistered
	 */
	unregister(id: string): boolean {
		const existed = this.registrations.delete(id);
		if (existed) {
			logger.info(`[VoiceAgentRegistry] Unregistered voice agent: ${id}`);
			this.emit("unregistered", id);
		}
		return existed;
	}

	/**
	 * Unregister all voice agents from a specific plugin
	 * @param pluginId The plugin ID
	 * @returns Number of agents unregistered
	 */
	unregisterByPlugin(pluginId: string): number {
		let count = 0;
		for (const [id, registration] of this.registrations) {
			if (registration.pluginId === pluginId) {
				this.unregister(id);
				count++;
			}
		}
		return count;
	}

	/**
	 * Get all registered voice agents
	 * @returns Array of registrations sorted by priority (descending)
	 */
	getAll(): VoiceAgentRegistration[] {
		return Array.from(this.registrations.values())
			.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
	}

	/**
	 * Get a registration by ID
	 * @param id The agent ID
	 */
	get(id: string): VoiceAgentRegistration | undefined {
		return this.registrations.get(id);
	}

	/**
	 * Get a registration by definition file name
	 * @param fileName The definition file name (e.g., "task-manager.voice-agent.md")
	 */
	getByDefinitionFileName(fileName: string): VoiceAgentRegistration | undefined {
		for (const registration of this.registrations.values()) {
			if (registration.definitionFileName === fileName) {
				return registration;
			}
		}
		return undefined;
	}

	/**
	 * Get all definition file names that should be searched for
	 * @returns Array of file names to search in voice agent directories
	 */
	getDefinitionFileNames(): string[] {
		return Array.from(this.registrations.values())
			.map(r => r.definitionFileName);
	}

	/**
	 * Check if an agent is registered
	 * @param id The agent ID
	 */
	has(id: string): boolean {
		return this.registrations.has(id);
	}

	/**
	 * Create an agent instance using the registered factory
	 * @param id The agent ID
	 * @param app Obsidian App instance
	 * @param config Agent configuration
	 * @param definition Optional voice agent definition from markdown
	 * @returns The created agent instance, or undefined if not found
	 */
	create(
		id: string,
		app: App,
		config: BaseVoiceAgentConfig,
		definition?: VoiceAgentDefinition
	): BaseVoiceAgent | undefined {
		const registration = this.registrations.get(id);
		if (!registration) {
			logger.warn(`[VoiceAgentRegistry] Cannot create agent: ${id} not registered`);
			return undefined;
		}

		try {
			return registration.factory(app, config, definition);
		} catch (error) {
			logger.error(`[VoiceAgentRegistry] Error creating agent ${id}:`, error);
			return undefined;
		}
	}

	/**
	 * Subscribe to registry events
	 */
	on<K extends keyof VoiceAgentRegistryEvents>(
		event: K,
		callback: VoiceAgentRegistryEvents[K]
	): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		const callbacks = this.listeners.get(event)!;
		callbacks.add(callback as (...args: unknown[]) => void);

		return () => {
			callbacks.delete(callback as (...args: unknown[]) => void);
		};
	}

	/**
	 * Emit an event
	 */
	private emit<K extends keyof VoiceAgentRegistryEvents>(
		event: K,
		...args: Parameters<VoiceAgentRegistryEvents[K]>
	): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			callbacks.forEach((cb) => {
				try {
					cb(...args);
				} catch (e) {
					logger.error(`[VoiceAgentRegistry] Error in ${event} callback:`, e);
				}
			});
		}
	}

	/**
	 * Clear all registrations (for testing)
	 */
	clear(): void {
		this.registrations.clear();
	}
}

/**
 * Get the global voice agent registry instance
 */
export function getVoiceAgentRegistry(): VoiceAgentRegistry {
	return VoiceAgentRegistry.getInstance();
}
