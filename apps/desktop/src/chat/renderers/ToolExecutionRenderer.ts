import { Component } from "obsidian";
import { 
	McpAppContainer, 
	UIResourceContent,
	MCP_APP_MIME_TYPE,
	ToolCallResult
} from "../../ui/mcp-apps";

/**
 * Callback for executing tools from MCP Apps
 */
export type ToolExecutionCallback = (
	toolName: string, 
	args: Record<string, unknown>
) => Promise<Record<string, unknown>>;

/**
 * Handles rendering of tool execution indicators and MCP Apps
 */
export class ToolExecutionRenderer {
	private parentComponent: Component;
	private executeToolCallback: ToolExecutionCallback;

	constructor(parentComponent: Component, executeToolCallback: ToolExecutionCallback) {
		this.parentComponent = parentComponent;
		this.executeToolCallback = executeToolCallback;
	}

	/**
	 * Render an MCP App inline in the chat
	 * 
	 * @param containerEl - The container element to render the app into
	 * @param resource - The UI resource content (HTML)
	 * @param toolInfo - Optional tool information for context
	 * @returns The McpAppContainer component instance
	 */
	renderMcpApp(
		containerEl: HTMLElement,
		resource: UIResourceContent,
		toolInfo?: { id?: string | number; tool: { name: string; description: string } }
	): McpAppContainer {
		// Create header
		const headerEl = containerEl.createDiv({ cls: "vc-mcp-app-header" });
		
		const headerLeft = headerEl.createDiv({ cls: "vc-mcp-app-header-left" });
		const iconEl = headerLeft.createDiv({ cls: "vc-mcp-app-header-icon" });
		iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`;
		
		// Extract server name from URI
		const serverName = resource.uri.replace(/^ui:\/\//, "").split("/")[0] || "MCP App";
		headerLeft.createDiv({ cls: "vc-mcp-app-header-title", text: toolInfo?.tool.name || "Interactive App" });
		headerLeft.createDiv({ cls: "vc-mcp-app-header-server", text: serverName });
		
		// Actions (future: fullscreen, reload, etc.)
		const headerActions = headerEl.createDiv({ cls: "vc-mcp-app-header-actions" });
		const reloadBtn = headerActions.createEl("button", { cls: "vc-mcp-app-action-btn", attr: { "aria-label": "Reload app" } });
		reloadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
		
		// Create app container element
		const appContainerEl = containerEl.createDiv({ cls: "vc-mcp-app-content" });
		
		// Determine theme from Obsidian
		const isDarkTheme = document.body.classList.contains("theme-dark");
		
		// Create the McpAppContainer
		const appContainer = new McpAppContainer({
			containerEl: appContainerEl,
			resource,
			toolInfo,
			theme: isDarkTheme ? "dark" : "light",
			displayMode: "inline",
			maxHeight: 500,
			onToolCall: async (request) => {
				// Proxy tool calls back through the Copilot service
				console.log("[VC] MCP App tool call:", request);
				try {
					const result = await this.executeToolCallback(request.name, request.arguments);
					return {
						content: [{ type: "text", text: JSON.stringify(result) }],
						structuredContent: result,
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: `Error: ${error}` }],
						isError: true,
					};
				}
			},
			onOpenLink: (url) => {
				window.open(url, "_blank");
			},
			onLog: (level, data, logger) => {
				const prefix = logger ? `[MCP:${logger}]` : "[MCP App]";
				switch (level) {
					case "error": console.error(prefix, data); break;
					case "warning": console.warn(prefix, data); break;
					case "debug": console.debug(prefix, data); break;
					default: console.log(prefix, data);
				}
			},
			onSizeChanged: (width, height) => {
				// Update container dimensions if needed
				if (height) {
					const iframe = appContainerEl.querySelector("iframe");
					if (iframe) {
						iframe.style.height = `${Math.min(height, 500)}px`;
					}
				}
			},
		});
		
		// Register component for cleanup using Obsidian's Component pattern
		this.parentComponent.addChild(appContainer);
		appContainer.load();
		
		// Reload button handler
		reloadBtn.addEventListener("click", () => {
			appContainer.unload();
			appContainerEl.empty();
			appContainer.load();
		});
		
		return appContainer;
	}

	/**
	 * Render a tool execution indicator with optional MCP App UI
	 * 
	 * @param messagesContainer - The messages container element
	 * @param toolName - The name of the tool being executed
	 * @param toolArgs - The arguments passed to the tool
	 * @param uiResourceUri - Optional URI to a UI resource for rendering results
	 */
	renderToolExecution(
		messagesContainer: HTMLElement,
		toolName: string,
		toolArgs: Record<string, unknown>,
		uiResourceUri?: string
	): HTMLElement {
		const containerEl = messagesContainer.createDiv({ cls: "vc-tool-execution vc-tool-execution-running" });
		
		// Icon
		const iconEl = containerEl.createDiv({ cls: "vc-tool-execution-icon" });
		iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
		
		// Tool name
		containerEl.createDiv({ cls: "vc-tool-execution-name", text: toolName });
		
		// Status
		containerEl.createDiv({ cls: "vc-tool-execution-status", text: "Running..." });
		
		// If there's a UI resource, store it for later
		if (uiResourceUri) {
			containerEl.setAttribute("data-ui-resource", uiResourceUri);
		}
		
		return containerEl;
	}

	/**
	 * Update a tool execution indicator with the result
	 * 
	 * @param messagesContainer - The messages container element
	 * @param containerEl - The tool execution container element
	 * @param result - The tool result
	 * @param uiResource - Optional UI resource for rendering the result
	 */
	async updateToolExecutionComplete(
		messagesContainer: HTMLElement,
		containerEl: HTMLElement,
		result: ToolCallResult,
		uiResource?: UIResourceContent
	): Promise<void> {
		containerEl.removeClass("vc-tool-execution-running");
		
		if (result.isError) {
			containerEl.addClass("vc-tool-execution-error");
			const statusEl = containerEl.querySelector(".vc-tool-execution-status");
			if (statusEl) {
				statusEl.textContent = "Error";
			}
			const iconEl = containerEl.querySelector(".vc-tool-execution-icon");
			if (iconEl) {
				iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
			}
		} else {
			containerEl.addClass("vc-tool-execution-complete");
			const statusEl = containerEl.querySelector(".vc-tool-execution-status");
			if (statusEl) {
				statusEl.textContent = "Complete";
			}
			const iconEl = containerEl.querySelector(".vc-tool-execution-icon");
			if (iconEl) {
				iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/></svg>`;
			}
		}
		
		// If there's a UI resource, render the MCP App
		if (uiResource && !result.isError) {
			const resultContainer = messagesContainer.createDiv({ cls: "vc-mcp-app-result" });
			
			// Header showing tool completed
			const headerEl = resultContainer.createDiv({ cls: "vc-mcp-app-result-header" });
			const headerIcon = headerEl.createDiv({ cls: "vc-mcp-app-result-header-icon" });
			headerIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
			
			const toolName = containerEl.querySelector(".vc-tool-execution-name")?.textContent || "Tool";
			headerEl.createDiv({ cls: "vc-mcp-app-result-header-text" }).innerHTML = 
				`<span class="vc-mcp-app-result-header-tool">${toolName}</span> completed`;
			
			// Render the MCP App
			const appContainer = resultContainer.createDiv({ cls: "vc-mcp-app" });
			this.renderMcpApp(appContainer, uiResource, {
				tool: { name: toolName, description: "" }
			});
			
			// Remove the original tool execution indicator
			containerEl.remove();
		}
	}

	/**
	 * Create a sample MCP App for testing/demonstration
	 * This renders a simple HTML app inline
	 */
	renderSampleMcpApp(messagesContainer: HTMLElement): void {
		const sampleResource: UIResourceContent = {
			uri: "ui://sample-server/demo",
			mimeType: MCP_APP_MIME_TYPE,
			text: `<!DOCTYPE html>
<html>
<head>
	<style>
		body {
			font-family: var(--font-sans, system-ui);
			background: var(--color-background-primary, #1e1e1e);
			color: var(--color-text-primary, #dcddde);
			margin: 0;
			padding: 16px;
		}
		h2 { margin-top: 0; }
		button {
			padding: 8px 16px;
			background: #7c3aed;
			color: white;
			border: none;
			border-radius: 6px;
			cursor: pointer;
			font-size: 14px;
		}
		button:hover { background: #6d28d9; }
		.result {
			margin-top: 12px;
			padding: 12px;
			background: var(--color-background-secondary, #252525);
			border-radius: 6px;
		}
	</style>
</head>
<body>
	<h2>🤖 MCP App Demo</h2>
	<p>This is an interactive MCP App running inside Obsidian!</p>
	<button onclick="callTool()">Search Vault Notes</button>
	<div id="result" class="result" style="display: none;"></div>
	<script>
		let initialized = false;
		
		// Initialize JSON-RPC communication
		window.addEventListener('message', (e) => {
			const msg = JSON.parse(e.data);
			if (msg.result && msg.result.protocolVersion) {
				initialized = true;
				console.log('MCP App initialized');
			}
			if (msg.id === 'toolcall' && msg.result) {
				document.getElementById('result').style.display = 'block';
				document.getElementById('result').innerHTML = '<pre>' + JSON.stringify(msg.result, null, 2) + '</pre>';
			}
		});
		
		// Send initialize request
		parent.postMessage(JSON.stringify({
			jsonrpc: '2.0',
			id: 'init',
			method: 'ui/initialize',
			params: {}
		}), '*');
		
		function callTool() {
			parent.postMessage(JSON.stringify({
				jsonrpc: '2.0',
				id: 'toolcall',
				method: 'tools/call',
				params: { name: 'search_notes', arguments: { query: 'project', limit: 5 } }
			}), '*');
		}
	</script>
</body>
</html>`,
		};
		
		const containerEl = messagesContainer.createDiv({ cls: "vc-mcp-app" });
		this.renderMcpApp(containerEl, sampleResource);
	}
}
