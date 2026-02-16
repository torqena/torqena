/**
 * @module AddHttpMcpServerModal
 * @description Modal for manually adding HTTP MCP servers.
 *
 * Provides a UI for configuring HTTP-based MCP (Model Context Protocol)
 * servers with URL validation based on platform security requirements.
 *
 * ## Platform Security
 *
 * - **Mobile**: HTTPS is strictly required for security
 * - **Desktop**: HTTPS recommended, HTTP allowed only for localhost/local network
 *
 * @example
 * ```typescript
 * const modal = new AddHttpMcpServerModal(app, plugin, () => {
 *   // Refresh MCP server list after adding
 *   refreshServerList();
 * });
 * modal.open();
 * ```
 *
 * @see {@link McpManager} for MCP server management
 * @since 0.0.1
 */

import { App, Modal, Setting } from "obsidian";
import type { AIServiceManager as CopilotPlugin } from "../../../app/AIServiceManager";
import { isMobile } from "../../../utils/platform";
import type { McpServerSource } from "../../../ai/mcp/McpTypes";

/**
 * Modal for manually adding HTTP MCP servers.
 *
 * This modal provides a user-friendly interface for adding HTTP-based
 * MCP servers with proper URL validation. It enforces security
 * requirements based on the platform:
 *
 * - **Mobile platforms**: HTTPS is strictly required
 * - **Desktop platforms**: HTTP allowed only for localhost addresses
 *
 * @example
 * ```typescript
 * const modal = new AddHttpMcpServerModal(app, plugin, () => {
 *   console.log('Server added successfully');
 * });
 * modal.open();
 * ```
 */
export class AddHttpMcpServerModal extends Modal {
	private plugin: CopilotPlugin;
	private onSuccess: () => void;
	private name: string = '';
	private url: string = '';
	private apiKey: string = '';
	private validationError: HTMLElement | null = null;

	/**
	 * Creates a new AddHttpMcpServerModal.
	 *
	 * @param app - The Obsidian App instance
	 * @param plugin - The CopilotPlugin instance for accessing McpManager
	 * @param onSuccess - Callback invoked when server is successfully added
	 */
	constructor(app: App, plugin: CopilotPlugin, onSuccess: () => void) {
		super(app);
		this.plugin = plugin;
		this.onSuccess = onSuccess;
	}

	/**
	 * Called when the modal is opened. Renders the UI.
	 */
	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('vc-add-http-mcp-modal');

		contentEl.createEl('h2', { text: 'Add HTTP MCP Server' });

		// Platform-specific help text
		const helpText = contentEl.createDiv({ cls: 'vc-http-mcp-help' });
		if (isMobile) {
			helpText.createEl('p', {
				text: '⚠️ Mobile: HTTPS is strictly required for security. HTTP URLs will be rejected.',
				cls: 'vc-http-mcp-warning'
			});
		} else {
			helpText.createEl('p', {
				text: 'ℹ️ Desktop: HTTPS is recommended. HTTP is only allowed for localhost/127.0.0.1.',
				cls: 'vc-http-mcp-info'
			});
		}

		// Server name
		new Setting(contentEl)
			.setName('Server Name')
			.setDesc('A descriptive name for this MCP server')
			.addText((text) => {
				text.setPlaceholder('My MCP Server');
				text.onChange((value) => {
					this.name = value;
				});
			});

		// Server URL
		new Setting(contentEl)
			.setName('Server URL')
			.setDesc('The HTTPS URL of the MCP server (e.g., https://api.example.com/mcp)')
			.addText((text) => {
				text.setPlaceholder('https://api.example.com/mcp');
				text.onChange((value) => {
					this.url = value;
					this.clearValidationError();
				});
			});

		// API Key (optional)
		new Setting(contentEl)
			.setName('API Key (Optional)')
			.setDesc('Authentication token if required by the server')
			.addText((text) => {
				text.setPlaceholder('Bearer token or API key');
				text.inputEl.type = 'password';
				text.inputEl.autocomplete = 'off';
				text.onChange((value) => {
					this.apiKey = value;
				});
			});

		// Validation error area
		this.validationError = contentEl.createDiv({ cls: 'vc-validation-error' });
		this.validationError.style.display = 'none';

		// Buttons
		const buttonRow = contentEl.createDiv({ cls: 'vc-modal-buttons' });

		const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const addBtn = buttonRow.createEl('button', { text: 'Add Server', cls: 'mod-cta' });
		addBtn.addEventListener('click', () => this.addServer());
	}

	/**
	 * Clears any displayed validation error.
	 */
	private clearValidationError(): void {
		if (this.validationError) {
			this.validationError.style.display = 'none';
			this.validationError.empty();
		}
	}

	/**
	 * Displays a validation error message.
	 *
	 * @param message - The error message to display
	 */
	private showValidationError(message: string): void {
		if (this.validationError) {
			this.validationError.style.display = 'block';
			this.validationError.empty();
			this.validationError.createEl('span', {
				text: `⚠️ ${message}`,
				cls: 'vc-error-text'
			});
		}
	}

	/**
	 * Validates the server URL based on platform requirements.
	 *
	 * @param url - The URL to validate
	 * @returns Object with valid flag and optional error message
	 *
	 * @example
	 * ```typescript
	 * const result = this.validateUrl('http://localhost:8080');
	 * // Desktop: { valid: true }
	 * // Mobile: { valid: false, error: 'Mobile platforms require HTTPS...' }
	 * ```
	 */
	private validateUrl(url: string): { valid: boolean; error?: string } {
		// Check if URL is empty
		if (!url || !url.trim()) {
			return { valid: false, error: 'Server URL is required' };
		}

		// Try to parse the URL
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(url.trim());
		} catch (e) {
			return { valid: false, error: 'Invalid URL format' };
		}

		// Check protocol
		const isHttps = parsedUrl.protocol === 'https:';
		const isHttp = parsedUrl.protocol === 'http:';

		if (!isHttps && !isHttp) {
			return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
		}

		// Mobile: HTTPS strictly required
		if (isMobile && !isHttps) {
			return { valid: false, error: 'Mobile platforms require HTTPS. HTTP is not allowed.' };
		}

		// Desktop: HTTP only allowed for localhost
		if (!isMobile && !isHttps) {
			const hostname = parsedUrl.hostname.toLowerCase();
			// Check for various localhost representations
			const isLocalhost =
				hostname === 'localhost' ||
				hostname === '127.0.0.1' ||
				hostname === '::1' ||
				hostname === '::ffff:127.0.0.1' ||
				// Local network ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
				hostname.startsWith('10.') ||
				/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
				hostname.startsWith('192.168.');

			if (!isLocalhost) {
				return { valid: false, error: 'HTTP is only allowed for localhost and local network addresses. Use HTTPS for remote servers.' };
			}
		}

		return { valid: true };
	}

	/**
	 * Validates and adds the server configuration.
	 */
	private async addServer(): Promise<void> {
		// Validate name
		if (!this.name || !this.name.trim()) {
			this.showValidationError('Server name is required');
			return;
		}

		// Validate URL
		const validation = this.validateUrl(this.url);
		if (!validation.valid) {
			this.showValidationError(validation.error!);
			return;
		}

		try {
			// Create HTTP MCP server config with robust ID generation
			let id: string;
			if (typeof crypto !== 'undefined' && crypto.randomUUID) {
				// Best: Use crypto.randomUUID() (available in modern browsers and Node 19+)
				id = `manual-http-${crypto.randomUUID()}`;
			} else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
				// Good: Use crypto.getRandomValues() for cryptographically secure random
				const array = new Uint32Array(4);
				crypto.getRandomValues(array);
				id = `manual-http-${Array.from(array).map(n => n.toString(36)).join('-')}`;
			} else {
				// Fallback: timestamp + Math.random (less secure but works everywhere)
				console.warn('[AddHttpMcpServerModal] crypto API not available, using Math.random() for ID generation');
				id = `manual-http-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
			}

			const config = {
				id,
				name: this.name.trim(),
				enabled: true,
				source: 'manual' as McpServerSource,
				transport: 'http' as const,
				url: this.url.trim(),
				apiKey: this.apiKey.trim() || undefined,
			};

			// Add to McpManager
			await this.plugin.mcpManager.addManualServer(config);

			console.log(`Added MCP server: ${config.name}`);
			this.onSuccess();
			this.close();
		} catch (error) {
			this.showValidationError(`Failed to add server: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Called when the modal is closed. Cleans up the UI.
	 */
	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
