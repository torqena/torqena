/**
 * @module HttpMcpClient
 * @description HTTP-based MCP client for remote server communication.
 *
 * This client enables cross-platform MCP server connections using HTTP/HTTPS.
 * Unlike stdio-based clients, HTTP clients work on both desktop and mobile.
 *
 * ## Protocol
 *
 * Uses JSON-RPC 2.0 over HTTP for request/response communication:
 * - `initialize` - Establish connection and exchange capabilities
 * - `tools/list` - Discover available tools
 * - `tools/call` - Execute a tool with arguments
 *
 * ## Security
 *
 * - Supports API key authentication via headers
 * - Warns when using HTTP (non-HTTPS) with credentials
 * - Uses Obsidian's `requestUrl` for secure cross-platform HTTP
 *
 * ## Usage
 *
 * ```typescript
 * const client = new HttpMcpClient({
 *   id: 'weather',
 *   name: 'Weather Server',
 *   transport: 'http',
 *   url: 'https://api.example.com/mcp',
 *   apiKey: 'secret',
 *   enabled: true,
 *   source: 'manual',
 * });
 *
 * await client.connect();
 * const tools = client.getTools();
 * const result = await client.callTool('get_weather', { city: 'NYC' });
 * ```
 *
 * @see {@link StdioMcpClient} for local process-based MCP
 * @see {@link McpManager} for orchestration
 * @since 0.0.1
 */

import { HttpMcpServerConfig, McpTool, McpConnectionStatus } from "./McpTypes";
import { httpRequest } from "../../utils/http";

/**
 * Tool call result structure
 */
interface ToolCallResult {
	content?: unknown;
	isError?: boolean;
}

/**
 * JSON-RPC 2.0 request structure
 */
interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: number | string;
	method: string;
	params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 response structure
 */
interface JsonRpcResponse<T = unknown> {
	jsonrpc: "2.0";
	id: number | string;
	result?: T;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
}

/**
 * HTTP-based MCP client that works on both desktop and mobile
 * Communicates with remote MCP servers via HTTP using JSON-RPC 2.0
 */
export class HttpMcpClient {
	private config: HttpMcpServerConfig;
	private status: McpConnectionStatus = "disconnected";
	private tools: McpTool[] = [];
	private error?: string;
	private requestId = 0;

	constructor(config: HttpMcpServerConfig) {
		this.config = config;
		
		// Warn if URL is not HTTPS (when API key is present)
		if (config.apiKey && !config.url.startsWith("https://")) {
			console.warn(
				`[HttpMcpClient] Warning: MCP server "${config.name}" uses HTTP instead of HTTPS. ` +
				`API credentials may be transmitted insecurely. Consider using HTTPS for production.`
			);
		}
	}

	/**
	 * Start the HTTP MCP client and initialize connection
	 */
	async start(): Promise<void> {
		this.status = "connecting";
		
		try {
			// Initialize connection and fetch available tools
			const response = await this.sendRequest<{ tools: McpTool[] }>(
				"tools/list",
				{}
			);

			this.tools = response.tools || [];
			this.status = "connected";
			console.log(`[HttpMcpClient] Connected to ${this.config.name}, found ${this.tools.length} tools`);
		} catch (error) {
			this.status = "error";
			this.error = error instanceof Error ? error.message : String(error);
			console.error(`[HttpMcpClient] Failed to connect to ${this.config.name}:`, error);
			throw error;
		}
	}

	/**
	 * Stop the HTTP MCP client
	 */
	async stop(): Promise<void> {
		this.status = "disconnected";
		this.tools = [];
		console.log(`[HttpMcpClient] Disconnected from ${this.config.name}`);
	}

	/**
	 * Call a tool on the MCP server
	 */
	async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
		if (this.status !== "connected") {
			throw new Error("MCP client not connected");
		}

		try {
			const response = await this.sendRequest<{ result: ToolCallResult }>(
				"tools/call",
				{ name, arguments: args }
			);

			return response.result;
		} catch (error) {
			console.error(`[HttpMcpClient] Tool call failed (${name}):`, error);
			return {
				content: { error: error instanceof Error ? error.message : String(error) },
				isError: true,
			};
		}
	}

	/**
	 * Get list of available tools
	 */
	getTools(): McpTool[] {
		return [...this.tools];
	}

	/**
	 * Get current connection status
	 */
	getStatus(): McpConnectionStatus {
		return this.status;
	}

	/**
	 * Get error message if status is "error"
	 */
	getError(): string | undefined {
		return this.error;
	}

	/**
	 * Send a JSON-RPC request to the MCP server
	 */
	private async sendRequest<T = unknown>(
		method: string,
		params: Record<string, unknown>
	): Promise<T> {
		const request: JsonRpcRequest = {
			jsonrpc: "2.0",
			id: ++this.requestId,
			method,
			params,
		};

		const response = await httpRequest<JsonRpcResponse<T>>({
			url: this.config.url,
			method: "POST",
			headers: this.getHeaders(),
			body: request,
		});

		if (response.status !== 200) {
			throw new Error(`HTTP ${response.status}: Request failed`);
		}

		const jsonRpcResponse = response.data;

		if (jsonRpcResponse.error) {
			throw new Error(
				`JSON-RPC Error ${jsonRpcResponse.error.code}: ${jsonRpcResponse.error.message}`
			);
		}

		if (jsonRpcResponse.result === undefined) {
			throw new Error("No result in JSON-RPC response");
		}

		return jsonRpcResponse.result;
	}

	/**
	 * Get HTTP headers for requests
	 */
	private getHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		if (this.config.apiKey) {
			headers["Authorization"] = `Bearer ${this.config.apiKey}`;
		}

		return headers;
	}
}
