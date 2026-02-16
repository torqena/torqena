/**
 * MCP Client Factory
 * Creates appropriate MCP client instances based on transport type and platform
 */

import { Platform } from "../../platform/utils/platform";
import { McpServerConfig, McpConnectionStatus, McpTool, isStdioConfig, isHttpConfig } from "./McpTypes";
import { HttpMcpClient } from "./HttpMcpClient";

/**
 * Event listener type for stdio MCP clients
 */
export type StdioMcpClientEvent = 
	| { type: "connected" }
	| { type: "disconnected"; error?: string }
	| { type: "error"; error: string }
	| { type: "tools"; tools: McpTool[] };

/**
 * Common interface for all MCP clients
 */
export interface McpClient {
	start(): Promise<void>;
	stop(): Promise<void>;
	callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
	getTools(): McpTool[];
	getStatus(): McpConnectionStatus;
	getError?(): string | undefined;
}

/**
 * Extended interface for stdio-based MCP clients with additional methods
 */
export interface StdioMcpClientInterface extends McpClient {
	on(listener: (event: StdioMcpClientEvent) => void): void;
	getPid(): number | undefined;
}

/**
 * Type guard to check if a client is a stdio-based client
 */
export function isStdioMcpClient(client: McpClient): client is StdioMcpClientInterface {
	return "on" in client && typeof (client as unknown as StdioMcpClientInterface).on === "function";
}

/**
 * Create an MCP client instance based on server config
 * Throws if transport type is not supported on current platform
 */
export async function createMcpClient(config: McpServerConfig): Promise<McpClient> {
	if (isHttpConfig(config)) {
		// HTTP transport works on all platforms
		return new HttpMcpClient(config);
	}

	if (isStdioConfig(config)) {
		if (Platform.isMobile) {
			throw new Error(
				`Stdio MCP server "${config.name}" cannot run on mobile. ` +
				`Only HTTP-based MCP servers are supported on mobile platforms.`
			);
		}
		
		// Dynamic import to avoid loading child_process on mobile
		try {
			const { StdioMcpClient } = await import("./StdioMcpClient");
			return new StdioMcpClient(config);
		} catch (error) {
			throw new Error(
				`Failed to load stdio MCP client for "${config.name}": ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	throw new Error(`Unknown MCP transport: ${(config as unknown as { transport: string }).transport}`);
}

