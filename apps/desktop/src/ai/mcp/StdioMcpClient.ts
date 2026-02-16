/**
 * @module StdioMcpClient
 * @description Stdio-based MCP client for local process communication.
 *
 * This client spawns and manages local MCP server processes, communicating
 * via stdin/stdout using newline-delimited JSON-RPC 2.0 (ndjson).
 *
 * ## Desktop Only
 *
 * This client requires Node.js `child_process` and is only available on desktop.
 * For mobile platforms, use {@link HttpMcpClient} instead.
 *
 * ## Protocol
 *
 * Uses JSON-RPC 2.0 over stdio:
 * - Writes JSON requests to process stdin
 * - Reads JSON responses from process stdout
 * - Messages are newline-delimited (ndjson)
 *
 * ## Lifecycle
 *
 * 1. `connect()` - Spawns child process and initializes MCP session
 * 2. `getTools()` - Returns discovered tools from the server
 * 3. `callTool()` - Executes a tool and returns the result
 * 4. `disconnect()` - Gracefully terminates the process
 *
 * ## Usage
 *
 * ```typescript
 * const client = new StdioMcpClient({
 *   id: 'my-server',
 *   name: 'My MCP Server',
 *   transport: 'stdio',
 *   command: 'npx',
 *   args: ['@my-org/mcp-server'],
 *   enabled: true,
 *   source: 'copilot-cli',
 * });
 *
 * await client.connect();
 * const tools = client.getTools();
 * const result = await client.callTool('my_tool', { arg: 'value' });
 * await client.disconnect();
 * ```
 *
 * @see {@link HttpMcpClient} for HTTP-based MCP (mobile compatible)
 * @see {@link McpManager} for orchestration
 * @since 0.0.1
 */

import { spawn, ChildProcess } from "child_process";
import { Platform } from "../../platform/utils/platform";
import { StdioMcpServerConfig, McpTool, McpConnectionStatus } from "./McpTypes";
import { expandHomePath } from "../../utils/pathUtils";

/**
 * JSON-RPC 2.0 message types
 */
interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: number | string;
	method: string;
	params?: Record<string, unknown>;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
}

interface JsonRpcNotification {
	jsonrpc: "2.0";
	method: string;
	params?: Record<string, unknown>;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

/**
 * Pending request tracking
 */
interface PendingRequest {
	resolve: (result: unknown) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

/**
 * MCP Initialize result
 */
interface InitializeResult {
	protocolVersion: string;
	capabilities: {
		tools?: Record<string, unknown>;
		resources?: Record<string, unknown>;
		prompts?: Record<string, unknown>;
	};
	serverInfo?: {
		name: string;
		version: string;
	};
}

/**
 * MCP Tools list result
 */
interface ToolsListResult {
	tools: Array<{
		name: string;
		description?: string;
		inputSchema?: Record<string, unknown>;
	}>;
}

/**
 * MCP Tool call result
 */
interface ToolCallResult {
	content: Array<{
		type: string;
		text?: string;
		data?: string;
		mimeType?: string;
	}>;
	isError?: boolean;
}

/**
 * Event listener type
 */
type StdioMcpClientEvent = 
	| { type: "connected" }
	| { type: "disconnected"; error?: string }
	| { type: "error"; error: string }
	| { type: "tools"; tools: McpTool[] };

type EventListener = (event: StdioMcpClientEvent) => void;

/**
 * StdioMcpClient - manages a single stdio MCP server connection
 */
export class StdioMcpClient {
	private config: StdioMcpServerConfig;
	private process: ChildProcess | null = null;
	private status: McpConnectionStatus = "disconnected";
	private error: string | undefined;
	private tools: McpTool[] = [];
	private requestId = 0;
	private pendingRequests = new Map<number | string, PendingRequest>();
	private buffer = "";
	private listeners = new Set<EventListener>();
	private readonly REQUEST_TIMEOUT = 30000; // 30 seconds

	constructor(config: StdioMcpServerConfig) {
		this.config = config;
	}

	/**
	 * Get current connection status
	 */
	getStatus(): McpConnectionStatus {
		return this.status;
	}

	/**
	 * Get error message if any
	 */
	getError(): string | undefined {
		return this.error;
	}

	/**
	 * Get available tools
	 */
	getTools(): McpTool[] {
		return this.tools;
	}

	/**
	 * Get process ID if running
	 */
	getPid(): number | undefined {
		return this.process?.pid;
	}

	/**
	 * Add event listener
	 */
	on(listener: EventListener): void {
		this.listeners.add(listener);
	}

	/**
	 * Remove event listener
	 */
	off(listener: EventListener): void {
		this.listeners.delete(listener);
	}

	/**
	 * Emit event to all listeners
	 */
	private emit(event: StdioMcpClientEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (e) {
				console.error("[StdioMcpClient] Listener error:", e);
			}
		}
	}

	/**
	 * Start the MCP server process and initialize
	 */
	async start(): Promise<void> {
		if (this.status === "connected" || this.status === "connecting") {
			return;
		}

		this.status = "connecting";
		this.error = undefined;

		try {
			await this.spawnProcess();
			await this.initialize();
			await this.listTools();
			
			this.status = "connected";
			this.emit({ type: "connected" });
		} catch (error) {
			this.status = "error";
			this.error = error instanceof Error ? error.message : String(error);
			this.emit({ type: "error", error: this.error });
			this.cleanup();
			throw error;
		}
	}

	/**
	 * Stop the MCP server process
	 */
	async stop(): Promise<void> {
		if (this.status === "disconnected") {
			return;
		}

		try {
			// Send shutdown request if connected
			if (this.status === "connected" && this.process) {
				try {
					await this.sendRequest("shutdown", {});
				} catch {
					// Ignore shutdown errors
				}
			}
		} finally {
			this.cleanup();
			this.status = "disconnected";
			this.emit({ type: "disconnected" });
		}
	}

	/**
	 * Call a tool on the MCP server
	 */
	async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
		if (this.status !== "connected") {
			throw new Error("MCP server not connected");
		}

		const result = await this.sendRequest("tools/call", {
			name,
			arguments: args,
		});

		return result as ToolCallResult;
	}

	/**
	 * Spawn the MCP server process
	 */
	private async spawnProcess(): Promise<void> {
		return new Promise((resolve, reject) => {
			const { command, args = [], env, cwd } = this.config;

			// Expand ~/... in paths (cross-platform home directory support)
			const expandedCommand = expandHomePath(command);
			const expandedArgs = args.map(a => expandHomePath(a));
			const expandedCwd = cwd ? expandHomePath(cwd) : undefined;
			const expandedEnv = env
				? Object.fromEntries(Object.entries(env).map(([k, v]) => [k, expandHomePath(v)]))
				: undefined;

			// Prepare environment
			const processEnv = {
				...process.env,
				...expandedEnv,
			};

			// Determine shell based on platform
			const spawnOptions: Parameters<typeof spawn>[2] = {
				env: processEnv,
				cwd: expandedCwd || process.cwd(),
				stdio: ["pipe", "pipe", "pipe"],
			};

			// On Windows, we may need to use shell for commands like npx
			if (Platform.isWin) {
				spawnOptions.shell = true;
			}

			console.log(`[StdioMcpClient] Spawning: ${expandedCommand} ${expandedArgs.join(" ")}`);

			try {
				this.process = spawn(expandedCommand, expandedArgs, spawnOptions);
			} catch (error) {
				reject(new Error(`Failed to spawn process: ${error}`));
				return;
			}

			// Handle process errors
			this.process.on("error", (err) => {
				console.error(`[StdioMcpClient] Process error:`, err);
				this.status = "error";
				this.error = err.message;
				this.emit({ type: "error", error: err.message });
			});

			// Handle process exit
			this.process.on("exit", (code, signal) => {
				console.log(`[StdioMcpClient] Process exited: code=${code}, signal=${signal}`);
				if (this.status === "connected") {
					this.status = "disconnected";
					this.emit({ type: "disconnected", error: code ? `Exit code ${code}` : undefined });
				}
				this.cleanup();
			});

			// Handle stdout (JSON-RPC responses)
			this.process.stdout?.on("data", (data: Buffer) => {
				this.handleStdout(data.toString());
			});

			// Handle stderr (logs/errors)
			this.process.stderr?.on("data", (data: Buffer) => {
				console.warn(`[StdioMcpClient:${this.config.name}] stderr:`, data.toString());
			});

			// Give the process a moment to start
			setTimeout(() => {
				if (this.process && !this.process.killed) {
					resolve();
				} else {
					reject(new Error("Process failed to start"));
				}
			}, 100);
		});
	}

	/**
	 * Handle stdout data - parse JSON-RPC messages
	 */
	private handleStdout(data: string): void {
		this.buffer += data;

		// Process complete lines (ndjson)
		const lines = this.buffer.split("\n");
		this.buffer = lines.pop() || ""; // Keep incomplete last line in buffer

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			try {
				const message = JSON.parse(trimmed) as JsonRpcMessage;
				this.handleMessage(message);
			} catch (error) {
				console.warn(`[StdioMcpClient] Failed to parse message:`, trimmed);
			}
		}
	}

	/**
	 * Handle a parsed JSON-RPC message
	 */
	private handleMessage(message: JsonRpcMessage): void {
		// Check if it's a response (has id but no method)
		if ("id" in message && message.id !== null && !("method" in message)) {
			const pending = this.pendingRequests.get(message.id);
			if (pending) {
				clearTimeout(pending.timeout);
				this.pendingRequests.delete(message.id);

				const response = message as JsonRpcResponse;
				if (response.error) {
					pending.reject(new Error(response.error.message));
				} else {
					pending.resolve(response.result);
				}
			}
		}
		// It's a notification or request from server (we don't handle these yet)
	}

	/**
	 * Send a JSON-RPC request and wait for response
	 */
	private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
		return new Promise((resolve, reject) => {
			if (!this.process || !this.process.stdin) {
				reject(new Error("Process not running"));
				return;
			}

			const id = ++this.requestId;
			const request: JsonRpcRequest = {
				jsonrpc: "2.0",
				id,
				method,
				params,
			};

			const timeout = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error(`Request timeout: ${method}`));
			}, this.REQUEST_TIMEOUT);

			this.pendingRequests.set(id, { resolve, reject, timeout });

			const message = JSON.stringify(request) + "\n";
			this.process.stdin.write(message, (err) => {
				if (err) {
					clearTimeout(timeout);
					this.pendingRequests.delete(id);
					reject(err);
				}
			});
		});
	}

	/**
	 * Initialize the MCP connection
	 */
	private async initialize(): Promise<void> {
		const result = await this.sendRequest("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {
				tools: {},
			},
			clientInfo: {
				name: "torqena",
				version: "0.0.2",
			},
		}) as InitializeResult;

		console.log(`[StdioMcpClient] Initialized:`, result.serverInfo);

		// Send initialized notification
		if (this.process?.stdin) {
			const notification: JsonRpcNotification = {
				jsonrpc: "2.0",
				method: "notifications/initialized",
			};
			this.process.stdin.write(JSON.stringify(notification) + "\n");
		}
	}

	/**
	 * List available tools from the server
	 */
	private async listTools(): Promise<void> {
		const result = await this.sendRequest("tools/list", {}) as ToolsListResult;
		
		this.tools = result.tools.map((t) => ({
			name: t.name,
			description: t.description,
			inputSchema: t.inputSchema,
		}));

		console.log(`[StdioMcpClient] Found ${this.tools.length} tools:`, this.tools.map(t => t.name));
		this.emit({ type: "tools", tools: this.tools });
	}

	/**
	 * Cleanup resources
	 */
	private cleanup(): void {
		// Clear pending requests
		for (const [id, pending] of this.pendingRequests) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("Connection closed"));
		}
		this.pendingRequests.clear();

		// Kill process
		if (this.process && !this.process.killed) {
			try {
				this.process.kill();
			} catch (e) {
				console.warn("[StdioMcpClient] Failed to kill process:", e);
			}
		}
		this.process = null;
		this.buffer = "";
	}
}

