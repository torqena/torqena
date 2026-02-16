/**
 * @module NoProviderPlaceholder
 * @description Placeholder component shown when no AI provider is configured.
 * 
 * This component replaces the chat input area when the user hasn't configured
 * any working AI provider. It displays:
 * - A warning message explaining what's needed
 * - Action buttons to help set up a provider
 * 
 * @example
 * ```typescript
 * const placeholder = new NoProviderPlaceholder(containerEl, app, {
 *   onOpenSettings: () => openSettingsTab(),
 *   onInstallCli: () => openCliInstallDocs(),
 * });
 * 
 * // Later, to clean up:
 * placeholder.destroy();
 * ```
 * 
 * @see {@link checkAnyProviderAvailable} for provider availability checking
 * @since 0.1.0
 */

import type { App } from "obsidian";
import { setIcon } from "../../platform/utils/icons";
import { isDesktop } from "../../utils/platform";

/**
 * Callbacks for NoProviderPlaceholder actions.
 */
export interface NoProviderPlaceholderCallbacks {
	/** Called when user clicks "Open Settings" */
	onOpenSettings: () => void;
	/** Called when user clicks "Install Copilot CLI" (desktop only) */
	onInstallCli?: () => void;
}

/**
 * Placeholder component shown when no AI provider is configured.
 * 
 * Renders a warning message with action buttons to help users set up
 * an AI provider before they can use the chat.
 */
export class NoProviderPlaceholder {
	private containerEl: HTMLElement;
	private element: HTMLElement;
	private app: App;
	private callbacks: NoProviderPlaceholderCallbacks;

	constructor(
		containerEl: HTMLElement,
		app: App,
		callbacks: NoProviderPlaceholderCallbacks
	) {
		this.containerEl = containerEl;
		this.app = app;
		this.callbacks = callbacks;
		this.element = this.render();
	}

	/**
	 * Render the placeholder UI.
	 */
	private render(): HTMLElement {
		const wrapper = this.containerEl.createDiv({ cls: "vc-no-provider" });
		
		// Warning icon and title row
		const header = wrapper.createDiv({ cls: "vc-no-provider-header" });
		const iconEl = header.createSpan({ cls: "vc-no-provider-icon" });
		setIcon(iconEl, "alert-triangle");
		header.createSpan({ 
			cls: "vc-no-provider-title",
			text: "No AI Provider Configured" 
		});

		// Description
		const description = wrapper.createDiv({ cls: "vc-no-provider-description" });
		description.createSpan({ text: "To use chat, set up one of these:" });
		
		// Provider options list
		const optionsList = wrapper.createEl("ul", { cls: "vc-no-provider-options" });
		
		if (isDesktop) {
			optionsList.createEl("li", { text: "GitHub Copilot CLI" });
		}
		optionsList.createEl("li", { text: "OpenAI API key" });
		optionsList.createEl("li", { text: "Azure OpenAI API key" });

		// Action buttons
		const actions = wrapper.createDiv({ cls: "vc-no-provider-actions" });
		
		// Open Settings button
		const settingsBtn = actions.createEl("button", {
			cls: "vc-no-provider-btn vc-no-provider-btn-primary",
			text: "Open Settings"
		});
		settingsBtn.addEventListener("click", () => {
			this.callbacks.onOpenSettings();
		});

		// Install GitHub Copilot CLI button (desktop only)
		if (isDesktop && this.callbacks.onInstallCli) {
			const installBtn = actions.createEl("button", {
				cls: "vc-no-provider-btn vc-no-provider-btn-secondary",
				text: "Install GitHub Copilot CLI"
			});
			installBtn.addEventListener("click", () => {
				this.callbacks.onInstallCli?.();
			});
		}

		return wrapper;
	}

	/**
	 * Show the placeholder (unhide).
	 */
	show(): void {
		this.element.style.display = "";
	}

	/**
	 * Hide the placeholder.
	 */
	hide(): void {
		this.element.style.display = "none";
	}

	/**
	 * Check if the placeholder is currently visible.
	 */
	isVisible(): boolean {
		return this.element.style.display !== "none";
	}

	/**
	 * Clean up and remove the placeholder from DOM.
	 */
	destroy(): void {
		this.element.remove();
	}

	/**
	 * Get the underlying DOM element.
	 */
	getElement(): HTMLElement {
		return this.element;
	}
}

