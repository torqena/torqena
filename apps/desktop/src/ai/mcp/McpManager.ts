/**
 * @module McpManager
 * @description Central orchestrator for Model Context Protocol (MCP) server management.
 *
 * The McpManager handles discovery, configuration, connection lifecycle, and
 * tool execution for MCP servers. It supports both stdio-based (desktop only)
 * and HTTP-based (cross-platform) MCP transports.
 *
 * ## Features
 *
 * - **Server Discovery**: Auto-discovers MCP servers from multiple sources
 * - **Connection Management**: Connects, disconnects, and reconnects servers
 * - **Tool Aggregation**: Collects tools from all connected servers
 * - **Event System**: Notifies listeners of status changes and tool updates
 * - **Platform Awareness**: Filters servers based on platform capabilities
 *
 * ## Discovery Sources
 *
 * MCP servers are discovered from:
 * 1. `.github/copilot-mcp-servers.json` (per-repo config)
 * 2. VS Code settings (`mcp.json` or settings.json)
 * 3. Claude Desktop config (`~/.config/claude/`)
 * 4. workspace-specific config (`.obsidian/mcp.json`)
 *
 * ## Usage
 *
 * ```typescript
 * const manager = new McpManager(app);
 * await manager.initialize();
 *
 * // Get all available tools
 * const tools = manager.getAllTools();
 *
 * // Call a tool
 * const result = await manager.callTool('server-id', 'tool-name', { arg: 'value' });
 *
 * // Listen for events
 * manager.on((event) => {
 *   if (event.type === 'server-status-changed') {
 *     console.log(`Server ${event.serverId}: ${event.status}`);
 *   }
 * });
 * ```
 *
 * @see {@link McpClientFactory} for client creation
 * @see {@link McpConfigDiscovery} for server discovery
 * @see {@link McpTypes} for type definitions
 * @since 0.0.1
 */

import {
	McpServerConfig,
	McpServerStatus,
	McpConnectionStatus,
	DiscoveredMcpServer,
	WorkspaceMcpConfig,
	DEFAULT_WORKSPACE_MCP_CONFIG,
	isStdioConfig,
	McpTool,
} from "./McpTypes";
import { 
	discoverAllMcpServers, 
	DiscoveryResult,
	getSourceLabel,
	getSourceIcon,
} from "./McpConfigDiscovery";
import { createMcpClient, McpClient, isStdioMcpClient, StdioMcpClientEvent } from "./McpClientFactory";
import type { App } from "obsidian";
import type { PlatformInfo } from "../../platform/utils/platform";
import { supportsLocalProcesses } from "../../utils/platform";
import * as fs from "fs";
import * as path from "path";

/**
 * Event types for MCP Manager
 */
export type McpManagerEvent = 
	| { type: "discovery-complete"; servers: DiscoveredMcpServer[] }
	| { type: "server-status-changed"; serverId: string; status: McpConnectionStatus; error?: string }
	| { type: "server-tools-updated"; serverId: string; tools: McpTool[] };

type McpManagerListener = (event: McpManagerEvent) => void;

/**
 * McpManager - central coordinator for all MCP operations
 */
export class McpManager {
	private app: App;
	private servers = new Map<string, DiscoveredMcpServer>();
	private clients = new Map<string, McpClient>();
	private workspaceConfig: WorkspaceMcpConfig = DEFAULT_WORKSPACE_MCP_CONFIG;
	private listeners = new Set<McpManagerListener>();
	private initialized = false;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Initialize the MCP manager
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		// Load workspace-specific config
		await this.loadworkspaceConfig();

		// Only auto-discover on desktop (requires filesystem access and local processes)
		if (supportsLocalProcesses()) {
			await this.discoverServers();
		} else {
			console.log("[McpManager] Skipping server discovery on mobile (filesystem access not available)");
		}

		this.initialized = true;

		// Auto-start servers that have autoStart enabled (async, don't block)
		this.autoStartServers();
	}

	/**
	 * Shutdown all MCP connections
	 */
	async shutdown(): Promise<void> {
		console.log("[McpManager] Shutting down all MCP clients...");
		
		const stopPromises: Promise<void>[] = [];
		for (const client of this.clients.values()) {
			stopPromises.push(client.stop().catch(e => console.warn("[McpManager] Stop error:", e)));
		}
		
		await Promise.all(stopPromises);
		this.clients.clear();
		this.initialized = false;
	}

	/**
	 * Add event listener
	 */
	on(listener: McpManagerListener): void {
		this.listeners.add(listener);
	}

	/**
	 * Remove event listener
	 */
	off(listener: McpManagerListener): void {
		this.listeners.delete(listener);
	}

	/**
	 * Emit event to all listeners
	 */
	private emit(event: McpManagerEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (e) {
				console.error("[McpManager] Listener error:", e);
			}
		}
	}

	/**
	 * Get all discovered servers
	 */
	getServers(): DiscoveredMcpServer[] {
		return Array.from(this.servers.values());
	}

	/**
	 * Get a specific server by ID
	 */
	getServer(id: string): DiscoveredMcpServer | undefined {
		return this.servers.get(id);
	}

	/**
	 * Get workspace config
	 */
	getworkspaceConfig(): WorkspaceMcpConfig {
		return this.workspaceConfig;
	}

	/**
	 * Check if a server is enabled (considering workspace overrides)
	 */
	isServerEnabled(id: string): boolean {
		// Workspace override takes precedence
		if (id in this.workspaceConfig.enabled) {
			return this.workspaceConfig.enabled[id] ?? false;
		}
		// Otherwise use the config's enabled flag
		const server = this.servers.get(id);
		return server?.config.enabled ?? false;
	}

	/**
	 * Set server enabled state
	 */
	async setServerEnabled(id: string, enabled: boolean): Promise<void> {
		this.workspaceConfig.enabled[id] = enabled;
		await this.saveworkspaceConfig();

		// Start or stop the server based on new state
		if (enabled) {
			await this.startServer(id);
		} else {
			await this.stopServer(id);
		}
	}

	/**
	 * Check if a server should auto-start
	 */
	isServerAutoStart(id: string): boolean {
		return this.workspaceConfig.autoStart[id] ?? false;
	}

	/**
	 * Set server auto-start state
	 */
	async setServerAutoStart(id: string, autoStart: boolean): Promise<void> {
		this.workspaceConfig.autoStart[id] = autoStart;
		await this.saveworkspaceConfig();
	}

	/**
	 * Auto-start servers that have autoStart enabled
	 * Called asynchronously during initialization
	 */
	private autoStartServers(): void {
		const serversToStart = Array.from(this.servers.keys()).filter(
			(id) => this.isServerAutoStart(id)
		);

		if (serversToStart.length === 0) {
			return;
		}

		console.log(`[McpManager] Auto-starting ${serversToStart.length} server(s)...`);

		// Start servers in parallel, don't await to not block
		for (const id of serversToStart) {
			this.startServer(id)
				.then(() => {
					const server = this.servers.get(id);
					console.log(`[McpManager] Auto-started: ${server?.config.name || id}`);
				})
				.catch((error) => {
					const server = this.servers.get(id);
					console.warn(`[McpManager] Failed to auto-start ${server?.config.name || id}:`, error);
				});
		}
	}

	/**
	 * Start a specific MCP server
	 */
	async startServer(id: string): Promise<void> {
		const server = this.servers.get(id);
		if (!server) {
			throw new Error(`Server not found: ${id}`);
		}

		// Check platform compatibility
		if (isStdioConfig(server.config) && !supportsLocalProcesses()) {
			throw new Error(
				`Cannot start stdio server "${server.config.name}" on mobile. ` +
				`Only HTTP servers are supported.`
			);
		}

		// Check if already running
		if (this.clients.has(id)) {
			const existing = this.clients.get(id)!;
			if (existing.getStatus() === "connected" || existing.getStatus() === "connecting") {
				return;
			}
		}

		// Create client using factory (handles platform-specific logic)
		const client = await createMcpClient(server.config);
		
		// For StdioMcpClient, set up event handlers using type guard
		if (isStdioMcpClient(client)) {
			client.on((event: StdioMcpClientEvent) => {
				switch (event.type) {
					case "connected":
						this.updateServerStatus(id, "connected");
						break;
					case "disconnected":
						this.updateServerStatus(id, "disconnected", event.error);
						break;
					case "error":
						this.updateServerStatus(id, "error", event.error);
						break;
					case "tools":
						server.status.tools = event.tools;
						this.emit({ type: "server-tools-updated", serverId: id, tools: event.tools });
						break;
				}
			});
		}

		this.clients.set(id, client);
		
		try {
			await client.start();
			
			// For HTTP clients, update status and tools manually
			if (!isStdioConfig(server.config)) {
				this.updateServerStatus(id, "connected");
				server.status.tools = client.getTools();
				this.emit({ type: "server-tools-updated", serverId: id, tools: client.getTools() });
			}
		} catch (error) {
			console.error(`[McpManager] Failed to start server ${id}:`, error);
			this.updateServerStatus(id, "error", error instanceof Error ? error.message : String(error));
			throw error;
		}
	}

	/**
	 * Stop a specific MCP server
	 */
	async stopServer(id: string): Promise<void> {
		const client = this.clients.get(id);
		if (!client) return;

		try {
			await client.stop();
		} finally {
			this.clients.delete(id);
			this.updateServerStatus(id, "disconnected");
		}
	}

	/**
	 * Call a tool on a specific server
	 */
	async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
		const client = this.clients.get(serverId);
		if (!client) {
			throw new Error(`Server not connected: ${serverId}`);
		}

		return await client.callTool(toolName, args);
	}

	/**
	 * Get all tools from all connected servers
	 */
	getAllTools(): Array<{ serverId: string; serverName: string; tool: McpTool }> {
		const tools: Array<{ serverId: string; serverName: string; tool: McpTool }> = [];
		
		for (const [id, server] of this.servers) {
			const client = this.clients.get(id);
			if (client?.getStatus() === "connected" && server.status.tools) {
				for (const tool of server.status.tools) {
					tools.push({
						serverId: id,
						serverName: server.config.name,
						tool,
					});
				}
			}
		}
		
		return tools;
	}

	/**
	 * Get tools formatted for SDK registration
	 * Returns tool definitions with handlers that call through to the MCP server
	 */
	getSdkToolDefinitions(): Array<{
		name: string;
		description: string;
		parameters: Record<string, unknown>;
		serverId: string;
	}> {
		const tools: Array<{
			name: string;
			description: string;
			parameters: Record<string, unknown>;
			serverId: string;
		}> = [];
		
		for (const [id, server] of this.servers) {
			const client = this.clients.get(id);
			if (client?.getStatus() === "connected" && server.status.tools) {
				for (const tool of server.status.tools) {
					// Prefix tool name with server name to avoid collisions
					const prefixedName = `mcp_${server.config.name}_${tool.name}`;
					
					tools.push({
						name: prefixedName,
						description: `[MCP: ${server.config.name}] ${tool.description || tool.name}`,
						parameters: tool.inputSchema || { type: "object", properties: {} },
						serverId: id,
					});
				}
			}
		}
		
		return tools;
	}

	/**
	 * Check if any servers are connected with tools
	 */
	hasConnectedServers(): boolean {
		for (const client of this.clients.values()) {
			if (client.getStatus() === "connected") {
				return true;
			}
		}
		return false;
	}

	/**
	 * Refresh discovery
	 */
	async refreshDiscovery(): Promise<void> {
		await this.discoverServers();
	}

	/**
	 * Discover MCP servers from all sources
	 */
	private async discoverServers(): Promise<void> {
		console.log("[McpManager] Discovering MCP servers...");

		const results = discoverAllMcpServers();
		
		// Process discovery results
		for (const result of results) {
			// Skip disabled sources based on workspace config
			if (!this.isSourceEnabled(result.source)) {
				continue;
			}

			for (const config of result.servers) {
				const existing = this.servers.get(config.id);
				const status: McpServerStatus = existing?.status ?? {
					id: config.id,
					status: "disconnected",
				};

				this.servers.set(config.id, {
					config,
					status,
				});
			}
		}

		// Add workspace-specific servers
		for (const config of this.workspaceConfig.servers) {
			const existing = this.servers.get(config.id);
			const status: McpServerStatus = existing?.status ?? {
				id: config.id,
				status: "disconnected",
			};

			this.servers.set(config.id, {
				config,
				status,
			});
		}

		console.log(`[McpManager] Discovered ${this.servers.size} MCP servers`);
		this.emit({ type: "discovery-complete", servers: this.getServers() });
	}

	/**
	 * Check if a source is enabled for discovery
	 */
	private isSourceEnabled(source: string): boolean {
		switch (source) {
			case "claude-desktop":
				return this.workspaceConfig.autoDiscovery.claudeDesktop;
			case "vscode":
			case "vscode-insiders":
				return this.workspaceConfig.autoDiscovery.vscode;
			case "cursor":
				return this.workspaceConfig.autoDiscovery.cursor;
			case "copilot-cli":
				return this.workspaceConfig.autoDiscovery.copilotCli;
			case "docker":
				return this.workspaceConfig.autoDiscovery.docker;
			default:
				return true;
		}
	}

	/**
	 * Update server status
	 */
	private updateServerStatus(id: string, status: McpConnectionStatus, error?: string): void {
		const server = this.servers.get(id);
		if (server) {
			server.status.status = status;
			server.status.error = error;
			
			if (status === "connected") {
				server.status.connectedAt = Date.now();
				const client = this.clients.get(id);
				if (client) {
					// getPid() only exists on StdioMcpClient, use type guard
					if (isStdioMcpClient(client)) {
						server.status.pid = client.getPid();
					}
					server.status.tools = client.getTools();
				}
			}
			
			this.emit({ type: "server-status-changed", serverId: id, status, error });
		}
	}

	/**
	 * Get the workspace config file path
	 */
	private getworkspaceConfigPath(): string {
		const vaultPath = (this.app.vault.adapter as any).basePath;
		return path.join(vaultPath, ".obsidian", "mcp-servers.json");
	}

	/**
	 * Load workspace-specific MCP configuration
	 */
	private async loadworkspaceConfig(): Promise<void> {
		const configPath = this.getworkspaceConfigPath();
		
		try {
			if (fs.existsSync(configPath)) {
				const content = fs.readFileSync(configPath, "utf-8");
				const parsed = JSON.parse(content) as Partial<WorkspaceMcpConfig>;
				
				// Merge with defaults
				this.workspaceConfig = {
					...DEFAULT_WORKSPACE_MCP_CONFIG,
					...parsed,
					autoStart: {
						...DEFAULT_WORKSPACE_MCP_CONFIG.autoStart,
						...parsed.autoStart,
					},
					autoDiscovery: {
						...DEFAULT_WORKSPACE_MCP_CONFIG.autoDiscovery,
						...parsed.autoDiscovery,
					},
				};
				
				console.log("[McpManager] Loaded workspace config");
			}
		} catch (error) {
			console.warn("[McpManager] Failed to load workspace config:", error);
		}
	}

	/**
	 * Save workspace-specific MCP configuration
	 */
	private async saveworkspaceConfig(): Promise<void> {
		const configPath = this.getworkspaceConfigPath();
		
		try {
			const content = JSON.stringify(this.workspaceConfig, null, 2);
			const dir = path.dirname(configPath);
			
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			
			fs.writeFileSync(configPath, content, "utf-8");
			console.log("[McpManager] Saved workspace config");
		} catch (error) {
			console.error("[McpManager] Failed to save workspace config:", error);
		}
	}

	/**
	 * Add a manual HTTP MCP server
	 */
	async addManualServer(config: McpServerConfig): Promise<void> {
		// Add to workspace config
		this.workspaceConfig.servers.push(config);
		await this.saveworkspaceConfig();

		// Add to discovered servers
		const status: McpServerStatus = {
			id: config.id,
			status: "disconnected",
		};

		this.servers.set(config.id, {
			config,
			status,
		});

		// Enable auto-start by default for manually added servers
		await this.setServerAutoStart(config.id, true);

		console.log(`[McpManager] Added manual server: ${config.name}`);
	}

	/**
	 * Remove a manual server
	 */
	async removeManualServer(id: string): Promise<void> {
		// Stop the server if running
		if (this.clients.has(id)) {
			await this.stopServer(id);
		}

		// Remove from workspace config
		this.workspaceConfig.servers = this.workspaceConfig.servers.filter(s => s.id !== id);
		await this.saveworkspaceConfig();

		// Remove from discovered servers
		this.servers.delete(id);

		console.log(`[McpManager] Removed manual server: ${id}`);
	}
}

// Re-export helpers for use in settings UI
export { getSourceLabel, getSourceIcon };

