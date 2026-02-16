/**
 * MCP App Container Component
 * 
 * Manages sandboxed iframe rendering and JSON-RPC communication
 * between the host (Obsidian) and MCP App (UI resource).
 */

import { Component } from "obsidian";
import {
	JsonRpcMessage,
	HostContext,
	HostCapabilities,
	McpUiInitializeResult,
	McpUiAppCapabilities,
	ToolCallRequest,
	ToolCallResult,
	ToolInputNotification,
	ToolResultNotification,
	SizeChangedNotification,
	UIResourceContent,
	UIResourceMeta,
	buildSandboxAttribute,
	buildAllowAttribute,
	buildCspHeader,
	MCP_APP_MIME_TYPE,
} from "./types";

const PROTOCOL_VERSION = "2025-01-01";

export interface McpAppContainerOptions {
	/** The container element to render the iframe into */
	containerEl: HTMLElement;
	/** The UI resource content */
	resource: UIResourceContent;
	/** Tool information for context */
	toolInfo?: {
		id?: string | number;
		tool: { name: string; description: string };
	};
	/** Callback when app requests a tool call */
	onToolCall?: (request: ToolCallRequest) => Promise<ToolCallResult>;
	/** Callback when app requests to open a link */
	onOpenLink?: (url: string, target?: string) => void;
	/** Callback when app logs a message */
	onLog?: (level: string, data: unknown, logger?: string) => void;
	/** Callback when app resizes */
	onSizeChanged?: (width: number, height: number) => void;
	/** Current theme */
	theme?: "light" | "dark";
	/** Display mode */
	displayMode?: "inline" | "fullscreen" | "pip";
	/** Maximum dimensions */
	maxWidth?: number;
	maxHeight?: number;
}

/**
 * Container component for rendering MCP Apps in sandboxed iframes
 */
export class McpAppContainer extends Component {
	private iframe: HTMLIFrameElement | null = null;
	private boundMessageHandler: (event: MessageEvent) => void;
	private pendingRequests: Map<string | number, {
		resolve: (result: unknown) => void;
		reject: (error: Error) => void;
	}> = new Map();
	private nextRequestId = 1;
	private initialized = false;
	private appCapabilities: McpUiAppCapabilities | null = null;
	
	constructor(private options: McpAppContainerOptions) {
		super();
		this.boundMessageHandler = this.handleMessage.bind(this);
	}
	
	onload(): void {
		this.createIframe();
		window.addEventListener("message", this.boundMessageHandler);
	}
	
	onunload(): void {
		window.removeEventListener("message", this.boundMessageHandler);
		if (this.iframe) {
			this.iframe.remove();
			this.iframe = null;
		}
		this.pendingRequests.clear();
	}
	
	/**
	 * Create and configure the sandboxed iframe
	 */
	private createIframe(): void {
		const { containerEl, resource, maxWidth, maxHeight } = this.options;
		const meta = resource._meta?.ui;
		
		// Create wrapper
		const wrapper = containerEl.createDiv({ cls: "vc-mcp-app" });
		
		// Create iframe
		this.iframe = wrapper.createEl("iframe", {
			cls: "vc-mcp-app-iframe",
		});
		
		// Configure sandbox and permissions
		this.iframe.setAttribute("sandbox", buildSandboxAttribute(meta?.permissions));
		
		const allowAttr = buildAllowAttribute(meta?.permissions);
		if (allowAttr) {
			this.iframe.setAttribute("allow", allowAttr);
		}
		
		// Set dimensions
		this.iframe.style.width = "100%";
		this.iframe.style.border = meta?.prefersBorder === false ? "none" : "";
		if (maxWidth) this.iframe.style.maxWidth = `${maxWidth}px`;
		if (maxHeight) this.iframe.style.maxHeight = `${maxHeight}px`;
		
		// Build HTML content with CSP meta tag
		const htmlContent = this.buildHtmlWithCsp(resource, meta);
		
		// Load content via srcdoc (inline HTML)
		this.iframe.srcdoc = htmlContent;
		
		// Wait for iframe to load before sending initialize
		this.iframe.addEventListener("load", () => {
			// Small delay to ensure scripts have executed
			setTimeout(() => this.waitForAppInitialize(), 100);
		});
	}
	
	/**
	 * Build HTML content with CSP and initialization script
	 */
	private buildHtmlWithCsp(resource: UIResourceContent, meta?: UIResourceMeta): string {
		let html = resource.text || "";
		
		if (resource.blob) {
			html = atob(resource.blob);
		}
		
		// Build CSP meta tag
		const cspContent = buildCspHeader(meta?.csp);
		const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${cspContent}">`;
		
		// Inject CSP into head (or create head if missing)
		if (html.includes("<head>")) {
			html = html.replace("<head>", `<head>\n${cspMeta}`);
		} else if (html.includes("<html>")) {
			html = html.replace("<html>", `<html>\n<head>${cspMeta}</head>`);
		} else {
			html = `<!DOCTYPE html>\n<html>\n<head>${cspMeta}</head>\n<body>${html}</body>\n</html>`;
		}
		
		return html;
	}
	
	/**
	 * Wait for app to send ui/initialize request
	 */
	private waitForAppInitialize(): void {
		// The app is expected to call ui/initialize - we respond to it
		// This is handled in handleMessage
	}
	
	/**
	 * Handle incoming postMessage from iframe
	 */
	private handleMessage(event: MessageEvent): void {
		// Verify source
		if (!this.iframe || event.source !== this.iframe.contentWindow) {
			return;
		}
		
		let message: JsonRpcMessage;
		try {
			message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
		} catch {
			console.warn("[McpAppContainer] Invalid JSON-RPC message:", event.data);
			return;
		}
		
		if (message.jsonrpc !== "2.0") {
			console.warn("[McpAppContainer] Invalid JSON-RPC version:", message);
			return;
		}
		
		// Handle response (to our requests)
		if (message.id !== undefined && !message.method) {
			this.handleResponse(message);
			return;
		}
		
		// Handle request (from app)
		if (message.method) {
			this.handleRequest(message);
		}
	}
	
	/**
	 * Handle response to our requests
	 */
	private handleResponse(message: JsonRpcMessage): void {
		const pending = this.pendingRequests.get(message.id!);
		if (!pending) {
			console.warn("[McpAppContainer] No pending request for id:", message.id);
			return;
		}
		
		this.pendingRequests.delete(message.id!);
		
		if (message.error) {
			pending.reject(new Error(message.error.message));
		} else {
			pending.resolve(message.result);
		}
	}
	
	/**
	 * Handle request from app
	 */
	private async handleRequest(message: JsonRpcMessage): Promise<void> {
		const { method, params, id } = message;
		
		try {
			let result: unknown;
			
			switch (method) {
				case "ui/initialize":
					result = await this.handleInitialize(params as McpUiAppCapabilities);
					break;
					
				case "tools/call":
					result = await this.handleToolCall(params as unknown as ToolCallRequest);
					break;
					
				case "ui/openLink":
					result = this.handleOpenLink(params as unknown as { url: string; target?: string });
					break;
					
				case "logging/message":
					result = this.handleLogging(params as unknown as { level: string; data: unknown; logger?: string });
					break;
					
				case "ui/notifications/size-changed":
					result = this.handleSizeChanged(params as unknown as SizeChangedNotification);
					break;
					
				default:
					throw { code: -32601, message: `Method not found: ${method}` };
			}
			
			if (id !== undefined) {
				this.sendResponse(id, result);
			}
		} catch (error) {
			if (id !== undefined) {
				this.sendError(id, error as { code?: number; message: string });
			}
		}
	}
	
	/**
	 * Handle ui/initialize request
	 */
	private async handleInitialize(appCapabilities: McpUiAppCapabilities): Promise<McpUiInitializeResult> {
		this.initialized = true;
		this.appCapabilities = appCapabilities;
		
		const { toolInfo, theme, displayMode, maxWidth, maxHeight } = this.options;
		
		const hostCapabilities: HostCapabilities = {
			openLinks: {},
			serverTools: { listChanged: false },
			logging: {},
		};
		
		const hostContext: HostContext = {
			theme: theme || "dark",
			displayMode: displayMode || "inline",
			availableDisplayModes: ["inline"],
			platform: "desktop",
			userAgent: "torqena/1.0.0",
		};
		
		if (toolInfo) {
			hostContext.toolInfo = {
				id: toolInfo.id,
				tool: {
					name: toolInfo.tool.name,
					description: toolInfo.tool.description,
					inputSchema: {},
				},
			};
		}
		
		if (maxWidth || maxHeight) {
			hostContext.containerDimensions = {
				maxWidth,
				maxHeight,
			};
		}
		
		// Add theme-aware styles
		hostContext.styles = this.buildThemeStyles();
		
		return {
			protocolVersion: PROTOCOL_VERSION,
			hostCapabilities,
			hostInfo: {
				name: "torqena",
				version: "1.0.0",
			},
			hostContext,
		};
	}
	
	/**
	 * Build theme styles from Obsidian CSS variables
	 */
	private buildThemeStyles(): HostContext["styles"] {
		// Get computed styles from Obsidian
		const style = getComputedStyle(document.body);
		
		return {
			variables: {
				"--color-background-primary": style.getPropertyValue("--background-primary").trim() || "#1e1e1e",
				"--color-background-secondary": style.getPropertyValue("--background-secondary").trim() || "#252525",
				"--color-text-primary": style.getPropertyValue("--text-normal").trim() || "#dcddde",
				"--color-text-secondary": style.getPropertyValue("--text-muted").trim() || "#a7a7a7",
				"--color-border-primary": style.getPropertyValue("--background-modifier-border").trim() || "#3d3d3d",
				"--font-sans": style.getPropertyValue("--font-interface").trim() || "system-ui",
				"--font-mono": style.getPropertyValue("--font-monospace").trim() || "monospace",
				"--border-radius-sm": "4px",
				"--border-radius-md": "8px",
				"--border-radius-lg": "12px",
			},
		};
	}
	
	/**
	 * Handle tools/call request
	 */
	private async handleToolCall(request: ToolCallRequest): Promise<ToolCallResult> {
		if (!this.options.onToolCall) {
			throw { code: -32603, message: "Tool calls not supported" };
		}
		
		return this.options.onToolCall(request);
	}
	
	/**
	 * Handle ui/openLink request
	 */
	private handleOpenLink(params: { url: string; target?: string }): Record<string, never> {
		if (this.options.onOpenLink) {
			this.options.onOpenLink(params.url, params.target);
		} else {
			// Default: open in browser
			window.open(params.url, params.target || "_blank");
		}
		return {};
	}
	
	/**
	 * Handle logging/message notification
	 */
	private handleLogging(params: { level: string; data: unknown; logger?: string }): Record<string, never> {
		if (this.options.onLog) {
			this.options.onLog(params.level, params.data, params.logger);
		} else {
			const prefix = params.logger ? `[${params.logger}]` : "[McpApp]";
			switch (params.level) {
				case "error":
					console.error(prefix, params.data);
					break;
				case "warning":
					console.warn(prefix, params.data);
					break;
				case "debug":
					console.debug(prefix, params.data);
					break;
				default:
					console.log(prefix, params.data);
			}
		}
		return {};
	}
	
	/**
	 * Handle size changed notification
	 */
	private handleSizeChanged(params: SizeChangedNotification): Record<string, never> {
		if (this.iframe) {
			if (params.height) {
				this.iframe.style.height = `${params.height}px`;
			}
			if (params.width) {
				this.iframe.style.width = `${params.width}px`;
			}
		}
		
		if (this.options.onSizeChanged) {
			this.options.onSizeChanged(params.width, params.height);
		}
		
		return {};
	}
	
	/**
	 * Send a response to the app
	 */
	private sendResponse(id: string | number, result: unknown): void {
		this.sendMessage({
			jsonrpc: "2.0",
			id,
			result,
		});
	}
	
	/**
	 * Send an error response to the app
	 */
	private sendError(id: string | number, error: { code?: number; message: string }): void {
		this.sendMessage({
			jsonrpc: "2.0",
			id,
			error: {
				code: error.code || -32603,
				message: error.message,
			},
		});
	}
	
	/**
	 * Send a JSON-RPC message to the app
	 */
	private sendMessage(message: JsonRpcMessage): void {
		if (!this.iframe?.contentWindow) {
			console.warn("[McpAppContainer] Cannot send message: iframe not ready");
			return;
		}
		
		this.iframe.contentWindow.postMessage(JSON.stringify(message), "*");
	}
	
	/**
	 * Send a request to the app and wait for response
	 */
	public async sendRequest<T>(method: string, params?: Record<string, unknown>): Promise<T> {
		return new Promise((resolve, reject) => {
			const id = this.nextRequestId++;
			
			this.pendingRequests.set(id, {
				resolve: resolve as (result: unknown) => void,
				reject,
			});
			
			this.sendMessage({
				jsonrpc: "2.0",
				id,
				method,
				params,
			});
			
			// Timeout after 30 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error(`Request timeout: ${method}`));
				}
			}, 30000);
		});
	}
	
	/**
	 * Send a notification to the app (no response expected)
	 */
	public sendNotification(method: string, params?: Record<string, unknown>): void {
		this.sendMessage({
			jsonrpc: "2.0",
			method,
			params,
		});
	}
	
	/**
	 * Send tool input notification to the app
	 */
	public notifyToolInput(args: Record<string, unknown>): void {
		this.sendNotification("ui/notifications/tool-input", {
			arguments: args,
		} as unknown as Record<string, unknown>);
	}
	
	/**
	 * Send tool result notification to the app
	 */
	public notifyToolResult(result: ToolCallResult): void {
		this.sendNotification("ui/notifications/tool-result", result as unknown as Record<string, unknown>);
	}
	
	/**
	 * Check if the app has been initialized
	 */
	public isInitialized(): boolean {
		return this.initialized;
	}
	
	/**
	 * Get app capabilities (available after initialization)
	 */
	public getAppCapabilities(): McpUiAppCapabilities | null {
		return this.appCapabilities;
	}
	
	/**
	 * Update the theme
	 */
	public updateTheme(theme: "light" | "dark"): void {
		this.options.theme = theme;
		
		// Send context update if initialized
		if (this.initialized) {
			this.sendNotification("ui/notifications/context-changed", {
				theme,
				styles: this.buildThemeStyles(),
			});
		}
	}
}
