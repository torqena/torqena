/**
 * MCP Apps Extension Types (SEP-1865)
 * 
 * These types define the interfaces for the MCP Apps protocol extension,
 * enabling interactive HTML UIs to be rendered inline in chat.
 */

/**
 * MIME type for MCP App HTML content
 */
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

/**
 * Extension identifier for MCP Apps capability negotiation
 */
export const MCP_APPS_EXTENSION_ID = "io.modelcontextprotocol/ui";

/**
 * CSP configuration for UI resources
 */
export interface McpUiResourceCsp {
	/** Origins for network requests (fetch/XHR/WebSocket) */
	connectDomains?: string[];
	/** Origins for static resources (images, scripts, stylesheets, fonts, media) */
	resourceDomains?: string[];
	/** Origins for nested iframes */
	frameDomains?: string[];
	/** Allowed base URIs for the document */
	baseUriDomains?: string[];
}

/**
 * Permission requests for UI sandbox
 */
export interface McpUiPermissions {
	camera?: Record<string, never>;
	microphone?: Record<string, never>;
	geolocation?: Record<string, never>;
	clipboardWrite?: Record<string, never>;
}

/**
 * Metadata for UI resources
 */
export interface UIResourceMeta {
	/** Content Security Policy configuration */
	csp?: McpUiResourceCsp;
	/** Sandbox permissions requested by the UI */
	permissions?: McpUiPermissions;
	/** Dedicated origin for view (host-dependent) */
	domain?: string;
	/** Visual boundary preference */
	prefersBorder?: boolean;
}

/**
 * UI Resource declaration
 */
export interface UIResource {
	/** Unique identifier using ui:// scheme */
	uri: string;
	/** Human-readable display name */
	name: string;
	/** Description of the UI resource */
	description?: string;
	/** MIME type - must be text/html;profile=mcp-app */
	mimeType: typeof MCP_APP_MIME_TYPE;
}

/**
 * UI Resource content from resources/read
 */
export interface UIResourceContent {
	uri: string;
	mimeType: typeof MCP_APP_MIME_TYPE;
	/** HTML content as string */
	text?: string;
	/** OR base64-encoded HTML */
	blob?: string;
	_meta?: {
		ui?: UIResourceMeta;
	};
}

/**
 * Tool metadata for UI linkage
 */
export interface McpUiToolMeta {
	/** URI of UI resource for rendering tool results */
	resourceUri?: string;
	/** Who can access this tool */
	visibility?: Array<"model" | "app">;
}

/**
 * Extended tool definition with UI metadata
 */
export interface UILinkedTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	_meta?: {
		ui?: McpUiToolMeta;
		/** @deprecated Use ui.resourceUri instead */
		"ui/resourceUri"?: string;
	};
}

/**
 * Display modes for MCP Apps
 */
export type McpUiDisplayMode = "inline" | "fullscreen" | "pip";

/**
 * CSS variable keys available to Views for theming
 */
export type McpUiStyleVariableKey =
	// Background colors
	| "--color-background-primary"
	| "--color-background-secondary"
	| "--color-background-tertiary"
	| "--color-background-inverse"
	| "--color-background-ghost"
	// Text colors
	| "--color-text-primary"
	| "--color-text-secondary"
	| "--color-text-tertiary"
	| "--color-text-inverse"
	// Border colors
	| "--color-border-primary"
	| "--color-border-secondary"
	// Typography
	| "--font-sans"
	| "--font-mono"
	// Border radius
	| "--border-radius-sm"
	| "--border-radius-md"
	| "--border-radius-lg";

/**
 * Host context sent to View during initialization
 */
export interface HostContext {
	/** Metadata of the tool call that instantiated the View */
	toolInfo?: {
		id?: string | number;
		tool: UILinkedTool;
	};
	/** Current color theme preference */
	theme?: "light" | "dark";
	/** Style configuration for theming */
	styles?: {
		variables?: Partial<Record<McpUiStyleVariableKey, string>>;
		css?: {
			fonts?: string;
		};
	};
	/** How the View is currently displayed */
	displayMode?: McpUiDisplayMode;
	/** Display modes the host supports */
	availableDisplayModes?: McpUiDisplayMode[];
	/** Container dimensions for the iframe */
	containerDimensions?: {
		width?: number;
		maxWidth?: number;
		height?: number;
		maxHeight?: number;
	};
	/** User's language/region preference (BCP 47) */
	locale?: string;
	/** User's timezone (IANA) */
	timeZone?: string;
	/** Host application identifier */
	userAgent?: string;
	/** Platform type */
	platform?: "web" | "desktop" | "mobile";
}

/**
 * Capabilities the app declares during initialization
 */
export interface McpUiAppCapabilities {
	experimental?: Record<string, unknown>;
	tools?: {
		listChanged?: boolean;
	};
	availableDisplayModes?: McpUiDisplayMode[];
}

/**
 * Capabilities the host supports
 */
export interface HostCapabilities {
	experimental?: Record<string, unknown>;
	/** Host supports opening external URLs */
	openLinks?: Record<string, never>;
	/** Host can proxy tool calls to the MCP server */
	serverTools?: {
		listChanged?: boolean;
	};
	/** Host can proxy resource reads to the MCP server */
	serverResources?: {
		listChanged?: boolean;
	};
	/** Host accepts log messages */
	logging?: Record<string, never>;
	/** Sandbox configuration applied by the host */
	sandbox?: {
		permissions?: McpUiPermissions;
		csp?: McpUiResourceCsp;
	};
}

/**
 * Initialize result sent from host to app
 */
export interface McpUiInitializeResult {
	protocolVersion: string;
	hostCapabilities: HostCapabilities;
	hostInfo: {
		name: string;
		version: string;
	};
	hostContext: HostContext;
}

/**
 * JSON-RPC message structure
 */
export interface JsonRpcMessage {
	jsonrpc: "2.0";
	id?: string | number;
	method?: string;
	params?: Record<string, unknown>;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
}

/**
 * Tool call request from app to host
 */
export interface ToolCallRequest {
	name: string;
	arguments: Record<string, unknown>;
}

/**
 * Tool call result
 */
export interface ToolCallResult {
	content?: Array<{ type: string; text?: string }>;
	structuredContent?: Record<string, unknown>;
	_meta?: Record<string, unknown>;
	isError?: boolean;
}

/**
 * Tool input notification params
 */
export interface ToolInputNotification {
	arguments: Record<string, unknown>;
}

/**
 * Tool result notification params
 */
export interface ToolResultNotification extends ToolCallResult {}

/**
 * Size changed notification params
 */
export interface SizeChangedNotification {
	width: number;
	height: number;
}

/**
 * MCP Apps extension capability for negotiation
 */
export interface McpAppsCapability {
	mimeTypes: string[];
}

/**
 * Check if a tool has UI metadata
 */
export function hasUIResource(tool: Record<string, unknown>): boolean {
	const meta = tool._meta as Record<string, unknown> | undefined;
	if (!meta) return false;
	
	// Check new format
	const ui = meta.ui as McpUiToolMeta | undefined;
	if (ui?.resourceUri) return true;
	
	// Check deprecated format
	if (meta["ui/resourceUri"]) return true;
	
	return false;
}

/**
 * Get UI resource URI from tool metadata
 */
export function getUIResourceUri(tool: Record<string, unknown>): string | undefined {
	const meta = tool._meta as Record<string, unknown> | undefined;
	if (!meta) return undefined;
	
	// Check new format first
	const ui = meta.ui as McpUiToolMeta | undefined;
	if (ui?.resourceUri) return ui.resourceUri;
	
	// Fall back to deprecated format
	return meta["ui/resourceUri"] as string | undefined;
}

/**
 * Build CSP header string from metadata
 */
export function buildCspHeader(csp?: McpUiResourceCsp): string {
	const directives: string[] = [
		"default-src 'none'",
		`script-src 'self' 'unsafe-inline' ${csp?.resourceDomains?.join(' ') || ''}`.trim(),
		`style-src 'self' 'unsafe-inline' ${csp?.resourceDomains?.join(' ') || ''}`.trim(),
		`connect-src 'self' ${csp?.connectDomains?.join(' ') || ''}`.trim(),
		`img-src 'self' data: ${csp?.resourceDomains?.join(' ') || ''}`.trim(),
		`font-src 'self' ${csp?.resourceDomains?.join(' ') || ''}`.trim(),
		`media-src 'self' data: ${csp?.resourceDomains?.join(' ') || ''}`.trim(),
		`frame-src ${csp?.frameDomains?.join(' ') || "'none'"}`,
		"object-src 'none'",
		`base-uri ${csp?.baseUriDomains?.join(' ') || "'self'"}`,
	];
	
	return directives.join('; ');
}

/**
 * Build iframe sandbox attribute from permissions
 */
export function buildSandboxAttribute(permissions?: McpUiPermissions): string {
	const attrs = ['allow-scripts'];
	
	// Add same-origin if permissions require it
	if (permissions?.camera || permissions?.microphone || permissions?.geolocation || permissions?.clipboardWrite) {
		attrs.push('allow-same-origin');
	}
	
	return attrs.join(' ');
}

/**
 * Build iframe allow attribute from permissions
 */
export function buildAllowAttribute(permissions?: McpUiPermissions): string {
	const allows: string[] = [];
	
	if (permissions?.camera) allows.push('camera');
	if (permissions?.microphone) allows.push('microphone');
	if (permissions?.geolocation) allows.push('geolocation');
	if (permissions?.clipboardWrite) allows.push('clipboard-write');
	
	return allows.join('; ');
}
