/**
 * MCP Config Discovery Service
 * 
 * Discovers MCP server configurations from external tools:
 * - Claude Desktop
 * - VS Code / VS Code Insiders
 * - Cursor
 * - GitHub Copilot CLI
 */

import { Platform } from "../../platform/utils/platform";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
	McpServerConfig,
	McpServerSource,
	RawMcpServerEntry,
	StdioMcpServerConfig,
	HttpMcpServerConfig,
} from "./McpTypes";

/**
 * Discovery result for a single source
 */
export interface DiscoveryResult {
	source: McpServerSource;
	sourcePath: string;
	servers: McpServerConfig[];
	error?: string;
}

/**
 * Safely read environment variables in renderer contexts where `process`
 * may be unavailable.
 */
function getEnvValue(name: string): string {
	const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	return env?.[name] || "";
}

/**
 * Best-effort config home path fallback when env variables are missing.
 */
function getConfigHome(): string {
	return getEnvValue("XDG_CONFIG_HOME") || path.join(os.homedir(), ".config");
}

/**
 * Best-effort APPDATA path for Windows.
 */
function getAppDataPath(): string {
	return getEnvValue("APPDATA") || path.join(os.homedir(), "AppData", "Roaming");
}

/**
 * Get the config file path for Claude Desktop
 */
function getClaudeDesktopConfigPath(): string {
	if (Platform.isWin) {
		return path.join(getAppDataPath(), "Claude", "claude_desktop_config.json");
	} else if (Platform.isMacOS) {
		return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
	} else {
		// Linux - try XDG config or fallback
		const xdgConfig = getConfigHome();
		return path.join(xdgConfig, "Claude", "claude_desktop_config.json");
	}
}

/**
 * Get the VS Code settings path
 */
function getVSCodeSettingsPath(insiders: boolean = false): string {
	const folder = insiders ? "Code - Insiders" : "Code";
	
	if (Platform.isWin) {
		return path.join(getAppDataPath(), folder, "User", "settings.json");
	} else if (Platform.isMacOS) {
		return path.join(os.homedir(), "Library", "Application Support", folder, "User", "settings.json");
	} else {
		const xdgConfig = getConfigHome();
		return path.join(xdgConfig, folder, "User", "settings.json");
	}
}

/**
 * Get the Cursor config paths
 */
function getCursorConfigPaths(): string[] {
	const paths: string[] = [];
	
	if (Platform.isWin) {
		// Main settings
		paths.push(path.join(getAppDataPath(), "Cursor", "User", "settings.json"));
		// MCP-specific config
		paths.push(path.join(getAppDataPath(), "Cursor", "User", "globalStorage", "cursor.mcp", "mcp.json"));
	} else if (Platform.isMacOS) {
		paths.push(path.join(os.homedir(), "Library", "Application Support", "Cursor", "User", "settings.json"));
		paths.push(path.join(os.homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "cursor.mcp", "mcp.json"));
	} else {
		const xdgConfig = getConfigHome();
		paths.push(path.join(xdgConfig, "Cursor", "User", "settings.json"));
	}
	
	// Also check ~/.cursor for possible config
	paths.push(path.join(os.homedir(), ".cursor", "mcp.json"));
	
	return paths;
}

/**
 * Get the GitHub Copilot CLI base path
 */
function getCopilotCliBasePath(): string {
	return path.join(os.homedir(), ".copilot");
}

/**
 * Get the GitHub Copilot CLI installed plugins path
 */
function getCopilotCliPluginsPath(): string {
	return path.join(getCopilotCliBasePath(), "installed-plugins");
}

/**
 * Parse raw MCP server entries into typed configs
 */
function parseRawServers(
	raw: Record<string, RawMcpServerEntry>,
	source: McpServerSource,
	sourcePath: string
): McpServerConfig[] {
	const configs: McpServerConfig[] = [];
	
	for (const [id, entry] of Object.entries(raw)) {
		if (entry.command) {
			// stdio-based server
			const config: StdioMcpServerConfig = {
				id: `${source}:${id}`,
				name: id,
				enabled: true,
				source,
				sourcePath,
				transport: "stdio",
				command: entry.command,
				args: entry.args,
				env: entry.env,
			};
			configs.push(config);
		} else if (entry.url) {
			// HTTP-based server
			const config: HttpMcpServerConfig = {
				id: `${source}:${id}`,
				name: id,
				enabled: true,
				source,
				sourcePath,
				transport: "http",
				url: entry.url,
				apiKey: entry.apiKey,
			};
			configs.push(config);
		}
	}
	
	return configs;
}

/**
/**
 * Strip JSONC (JSON with Comments) features to make it valid JSON
 * Removes single-line comments, multi-line comments, and trailing commas
 */
function stripJsonc(content: string): string {
	// Remove multi-line comments
	let result = content.replace(/\/\*[\s\S]*?\*\//g, "");
	
	// Remove single-line comments (but preserve URLs like https://)
	result = result.replace(/(?<!:)\/\/.*$/gm, "");
	
	// Remove trailing commas before closing brackets/braces
	result = result.replace(/,(\s*[}\]])/g, "$1");
	
	return result;
}

/**
 * Safely read and parse a JSON file (supports JSONC for VS Code/Cursor configs)
 */
function readJsonFile(filePath: string): unknown | null {
	try {
		if (!fs.existsSync(filePath)) {
			return null;
		}
		const content = fs.readFileSync(filePath, "utf-8");
		
		// Strip JSONC features (comments, trailing commas) if this is a settings file
		const isSettingsFile = filePath.includes("settings.json") || filePath.includes(".cursor");
		const jsonContent = isSettingsFile ? stripJsonc(content) : content;
		
		return JSON.parse(jsonContent);
	} catch (error) {
		console.warn(`[McpDiscovery] Failed to read ${filePath}:`, error);
		return null;
	}
}

/**
 * Discover MCP servers from Claude Desktop
 */
export function discoverClaudeDesktop(): DiscoveryResult {
	const sourcePath = getClaudeDesktopConfigPath();
	const result: DiscoveryResult = {
		source: "claude-desktop",
		sourcePath,
		servers: [],
	};
	
	try {
		const config = readJsonFile(sourcePath) as { mcpServers?: Record<string, RawMcpServerEntry> } | null;
		if (config?.mcpServers) {
			result.servers = parseRawServers(config.mcpServers, "claude-desktop", sourcePath);
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}
	
	return result;
}

/**
 * Discover MCP servers from VS Code settings
 */
export function discoverVSCode(insiders: boolean = false): DiscoveryResult {
	const source: McpServerSource = insiders ? "vscode-insiders" : "vscode";
	const sourcePath = getVSCodeSettingsPath(insiders);
	const result: DiscoveryResult = {
		source,
		sourcePath,
		servers: [],
	};
	
	try {
		const settings = readJsonFile(sourcePath) as { 
			mcp?: { servers?: Record<string, RawMcpServerEntry> };
			"mcp.servers"?: Record<string, RawMcpServerEntry>;
		} | null;
		
		// Try different VS Code MCP settings formats
		const mcpServers = settings?.mcp?.servers || settings?.["mcp.servers"];
		if (mcpServers) {
			result.servers = parseRawServers(mcpServers, source, sourcePath);
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}
	
	return result;
}

/**
 * Discover MCP servers from Cursor
 */
export function discoverCursor(): DiscoveryResult {
	const result: DiscoveryResult = {
		source: "cursor",
		sourcePath: "",
		servers: [],
	};
	
	const paths = getCursorConfigPaths();
	
	for (const configPath of paths) {
		try {
			const config = readJsonFile(configPath);
			if (!config) continue;
			
			result.sourcePath = configPath;
			
			// Handle different Cursor config formats
			if (typeof config === "object" && config !== null) {
				const configObj = config as Record<string, unknown>;
				
				// Direct mcpServers object
				if (configObj.mcpServers && typeof configObj.mcpServers === "object") {
					const servers = parseRawServers(
						configObj.mcpServers as Record<string, RawMcpServerEntry>,
						"cursor",
						configPath
					);
					result.servers.push(...servers);
				}
				
				// VS Code-style mcp.servers
				const mcpSection = configObj.mcp as { servers?: Record<string, RawMcpServerEntry> } | undefined;
				if (mcpSection?.servers) {
					const servers = parseRawServers(mcpSection.servers, "cursor", configPath);
					result.servers.push(...servers);
				}
			}
		} catch (error) {
			if (!result.error) {
				result.error = error instanceof Error ? error.message : String(error);
			}
		}
	}
	
	return result;
}

/**
 * Discover MCP servers from GitHub Copilot CLI installed plugins
 * 
 * Copilot CLI stores MCP configs in .mcp.json files within each installed plugin:
 * ~/.copilot/installed-plugins/<marketplace>/<plugin>/.mcp.json
 */
export function discoverCopilotCli(): DiscoveryResult {
	const basePath = getCopilotCliBasePath();
	const pluginsPath = getCopilotCliPluginsPath();
	const result: DiscoveryResult = {
		source: "copilot-cli",
		sourcePath: pluginsPath,
		servers: [],
	};
	
	try {
		// Check if the plugins directory exists
		if (!fs.existsSync(pluginsPath)) {
			return result;
		}
		
		// Read the main config to get list of installed plugins
		const configPath = path.join(basePath, "config.json");
		const config = readJsonFile(configPath) as {
			installed_plugins?: Array<{
				name: string;
				marketplace: string;
				enabled?: boolean;
			}>;
		} | null;
		
		// Scan marketplace directories
		const marketplaces = fs.readdirSync(pluginsPath, { withFileTypes: true })
			.filter(entry => entry.isDirectory())
			.map(entry => entry.name);
		
		for (const marketplace of marketplaces) {
			const marketplacePath = path.join(pluginsPath, marketplace);
			
			// Scan plugin directories within each marketplace
			const plugins = fs.readdirSync(marketplacePath, { withFileTypes: true })
				.filter(entry => entry.isDirectory())
				.map(entry => entry.name);
			
			for (const pluginName of plugins) {
				const pluginPath = path.join(marketplacePath, pluginName);
				const mcpConfigPath = path.join(pluginPath, ".mcp.json");
				
				// Check if plugin is enabled in main config
				const pluginConfig = config?.installed_plugins?.find(
					p => p.name === pluginName && p.marketplace === marketplace
				);
				const isEnabled = pluginConfig?.enabled !== false; // Default to true if not specified
				
				// Read .mcp.json if it exists
				const mcpConfig = readJsonFile(mcpConfigPath) as {
					mcpServers?: Record<string, RawMcpServerEntry>;
				} | null;
				
				if (mcpConfig?.mcpServers) {
					const servers = parseRawServers(mcpConfig.mcpServers, "copilot-cli", mcpConfigPath);
					// Apply enabled state from main config
					for (const server of servers) {
						server.enabled = isEnabled;
					}
					result.servers.push(...servers);
				}
			}
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}
	
	return result;
}

/**
 * Get Docker Desktop MCP config path
 */
function getDockerMcpPath(): string {
	return path.join(os.homedir(), ".docker", "mcp");
}

/**
 * Discover MCP servers from Docker Desktop
 * 
 * Docker stores MCP configs in ~/.docker/mcp/
 * - registry.yaml: enabled servers from the catalog
 * - config.yaml: custom server definitions
 */
export function discoverDocker(): DiscoveryResult {
	const mcpPath = getDockerMcpPath();
	const result: DiscoveryResult = {
		source: "docker",
		sourcePath: mcpPath,
		servers: [],
	};
	
	try {
		// Check if Docker MCP directory exists
		if (!fs.existsSync(mcpPath)) {
			return result;
		}
		
		// Read registry.yaml for enabled servers
		const registryPath = path.join(mcpPath, "registry.yaml");
		if (fs.existsSync(registryPath)) {
			const content = fs.readFileSync(registryPath, "utf-8");
			// Parse simple YAML format - Docker uses "registry:" with server entries
			// Format: registry:\n  servername:\n    command: ...\n    args: [...]
			const lines = content.split("\n");
			let currentServer: string | null = null;
			let serverData: RawMcpServerEntry = {};
			
			for (const line of lines) {
				const trimmed = line.trim();
				
				// Skip registry: header and empty lines
				if (trimmed === "registry:" || trimmed === "registry: {}" || trimmed === "") {
					continue;
				}
				
				// Check for server name (2 space indent)
				if (line.startsWith("  ") && !line.startsWith("    ") && trimmed.endsWith(":")) {
					// Save previous server if exists
					if (currentServer && serverData.command) {
						const servers = parseRawServers(
							{ [currentServer]: serverData },
							"docker",
							registryPath
						);
						result.servers.push(...servers);
					}
					currentServer = trimmed.slice(0, -1);
					serverData = {};
				}
				
				// Parse server properties (4 space indent)
				if (line.startsWith("    ") && currentServer) {
					const match = trimmed.match(/^(\w+):\s*(.*)$/);
					if (match) {
						const [, key, value] = match;
						if (key === "command" && value) {
							serverData.command = value;
						} else if (key === "args" && value) {
							// Parse YAML array format [item1, item2]
							try {
								serverData.args = JSON.parse(value.replace(/'/g, '"'));
							} catch {
								serverData.args = [];
							}
						}
					}
				}
			}
			
			// Don't forget the last server
			if (currentServer && serverData.command) {
				const servers = parseRawServers(
					{ [currentServer]: serverData },
					"docker",
					registryPath
				);
				result.servers.push(...servers);
			}
		}
		
		// Also check config.yaml for custom servers
		const configPath = path.join(mcpPath, "config.yaml");
		if (fs.existsSync(configPath)) {
			const content = fs.readFileSync(configPath, "utf-8");
			// Similar YAML parsing for custom server definitions
			if (content.trim()) {
				// Parse servers section if present
				const lines = content.split("\n");
				let inServers = false;
				let currentServer: string | null = null;
				let serverData: RawMcpServerEntry = {};
				
				for (const line of lines) {
					const trimmed = line.trim();
					
					if (trimmed === "servers:" || trimmed === "mcpServers:") {
						inServers = true;
						continue;
					}
					
					if (!inServers) continue;
					
					// Check for server name
					if (line.startsWith("  ") && !line.startsWith("    ") && trimmed.endsWith(":")) {
						if (currentServer && serverData.command) {
							const servers = parseRawServers(
								{ [currentServer]: serverData },
								"docker",
								configPath
							);
							result.servers.push(...servers);
						}
						currentServer = trimmed.slice(0, -1);
						serverData = {};
					}
					
					// Parse server properties
					if (line.startsWith("    ") && currentServer) {
						const match = trimmed.match(/^(\w+):\s*(.*)$/);
						if (match) {
							const [, key, value] = match;
							if (key === "command" && value) {
								serverData.command = value;
							} else if (key === "args" && value) {
								try {
									serverData.args = JSON.parse(value.replace(/'/g, '"'));
								} catch {
									serverData.args = [];
								}
							}
						}
					}
				}
				
				if (currentServer && serverData.command) {
					const servers = parseRawServers(
						{ [currentServer]: serverData },
						"docker",
						configPath
					);
					result.servers.push(...servers);
				}
			}
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}
	
	return result;
}

/**
 * Discover all MCP servers from all sources
 */
export function discoverAllMcpServers(): DiscoveryResult[] {
	const results: DiscoveryResult[] = [];
	
	// Claude Desktop
	results.push(discoverClaudeDesktop());
	
	// VS Code (regular and Insiders)
	results.push(discoverVSCode(false));
	results.push(discoverVSCode(true));
	
	// Cursor
	results.push(discoverCursor());
	
	// Copilot CLI
	results.push(discoverCopilotCli());
	
	// Docker Desktop
	results.push(discoverDocker());
	
	return results;
}

/**
 * Get a human-readable label for the source
 */
export function getSourceLabel(source: McpServerSource): string {
	switch (source) {
		case "claude-desktop":
			return "Claude Desktop";
		case "vscode":
			return "VS Code";
		case "vscode-insiders":
			return "VS Code Insiders";
		case "cursor":
			return "Cursor";
		case "copilot-cli":
			return "Copilot CLI";
		case "docker":
			return "Docker Desktop";
		case "vault":
			return "Vault Config";
		case "manual":
			return "Manual";
		default:
			return source;
	}
}

/**
 * Get an icon for the source
 */
export function getSourceIcon(source: McpServerSource): string {
	switch (source) {
		case "claude-desktop":
			return "🤖";
		case "vscode":
		case "vscode-insiders":
			return "💻";
		case "cursor":
			return "📝";
		case "copilot-cli":
			return "🐙";
		case "docker":
			return "🐳";
		case "vault":
			return "📁";
		case "manual":
			return "⚙️";
		default:
			return "❓";
	}
}

