/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ui/extensions/ExtensionHoverPopup
 * @description Hover popup component for showing detailed extension information
 * 
 * Creates a VS Code-style popup that appears when hovering over extension cards,
 * showing detailed information like full description, publisher, links, and categories.
 */

import { setIcon } from "../../platform/utils/icons";
import { MarketplaceExtension } from "../../extensions/types";

/**
 * Configuration for the hover popup.
 */
export interface HoverPopupConfig {
	/** The extension data to display */
	extension: MarketplaceExtension;
	
	/** Whether this extension is currently installed */
	isInstalled: boolean;
	
	/** Whether an update is available */
	hasUpdate: boolean;
}

/**
 * Extension hover popup component.
 * Shows detailed information about an extension when hovering over its card.
 * 
 * @example
 * ```typescript
 * const popup = new ExtensionHoverPopup({
 *   extension: myExtension,
 *   isInstalled: false,
 *   hasUpdate: false
 * });
 * 
 * popup.show(cardElement, mouseEvent);
 * // Later...
 * popup.hide();
 * ```
 */
export class ExtensionHoverPopup {
	private config: HoverPopupConfig;
	private popupElement: HTMLElement | null = null;
	private hideTimeout: number | null = null;
	
	constructor(config: HoverPopupConfig) {
		this.config = config;
	}
	
	/**
	 * Shows the popup positioned near the target element.
	 * @param targetElement The element to position the popup relative to
	 * @param mouseEvent Optional mouse event for precise positioning
	 */
	public show(targetElement: HTMLElement, mouseEvent?: MouseEvent): void {
		// Clear any pending hide timeout
		if (this.hideTimeout !== null) {
			window.clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}
		
		// Create popup if it doesn't exist
		if (!this.popupElement) {
			this.popupElement = this.buildPopup();
			document.body.appendChild(this.popupElement);
		}
		
		// Position the popup
		this.positionPopup(targetElement, mouseEvent);
		
		// Show it
		this.popupElement.style.display = "block";
		
		// Add event listeners for hover behavior
		this.setupHoverHandlers();
	}
	
	/**
	 * Hides the popup with a delay.
	 * @param immediate If true, hides immediately without delay
	 */
	public hide(immediate = false): void {
		if (!this.popupElement) return;
		
		if (immediate) {
			this.popupElement.style.display = "none";
			if (this.hideTimeout !== null) {
				window.clearTimeout(this.hideTimeout);
				this.hideTimeout = null;
			}
		} else {
			// Delay hiding to allow moving mouse to popup
			this.hideTimeout = window.setTimeout(() => {
				if (this.popupElement) {
					this.popupElement.style.display = "none";
				}
				this.hideTimeout = null;
			}, 200);
		}
	}
	
	/**
	 * Destroys the popup and cleans up resources.
	 */
	public destroy(): void {
		if (this.hideTimeout !== null) {
			window.clearTimeout(this.hideTimeout);
		}
		
		if (this.popupElement) {
			this.popupElement.remove();
			this.popupElement = null;
		}
	}
	
	/**
	 * Builds the popup DOM element.
	 */
	private buildPopup(): HTMLElement {
		const popup = document.createElement("div");
		popup.addClass("vc-extension-hover-popup");
		
		// Header with icon, title, version
		const header = popup.createDiv({ cls: "vc-extension-hover-popup__header" });
		
		const icon = header.createDiv({ cls: "vc-extension-hover-popup__icon" });
		setIcon(icon, this.getIconForKind());
		
		const titleContainer = header.createDiv({ cls: "vc-extension-hover-popup__title-container" });
		titleContainer.createDiv({ 
			cls: "vc-extension-hover-popup__title", 
			text: this.config.extension.displayTitle 
		});
		titleContainer.createDiv({ 
			cls: "vc-extension-hover-popup__version", 
			text: `v${this.config.extension.semanticVersion}` 
		});
		
		// Publisher
		const publisher = popup.createDiv({ cls: "vc-extension-hover-popup__publisher" });
		const publisherIcon = publisher.createSpan({ cls: "vc-extension-hover-popup__publisher-icon" });
		setIcon(publisherIcon, "user");
		publisher.createSpan({ text: this.config.extension.creator.displayName });
		
		// Description
		popup.createDiv({ 
			cls: "vc-extension-hover-popup__description", 
			text: this.config.extension.briefSummary 
		});
		
		// Categories
		if (this.config.extension.classificationTags.length > 0) {
			const categories = popup.createDiv({ cls: "vc-extension-hover-popup__categories" });
			categories.createDiv({ 
				cls: "vc-extension-hover-popup__section-title", 
				text: "Categories" 
			});
			const categoryList = categories.createDiv({ cls: "vc-extension-hover-popup__category-list" });
			
			this.config.extension.classificationTags.forEach(tag => {
				const badge = categoryList.createSpan({ 
					cls: "vc-extension-hover-popup__category-badge", 
					text: tag 
				});
				badge.setAttribute("data-category", tag);
			});
		}
		
		// Links section
		const links = popup.createDiv({ cls: "vc-extension-hover-popup__links" });
		
		if (this.config.extension.sourceRepository) {
			const repoLink = this.createLinkButton("Repository", "github", this.config.extension.sourceRepository);
			links.appendChild(repoLink);
		}
		
		if (this.config.extension.webDetailPage) {
			const homeLink = this.createLinkButton("Details", "info", this.config.extension.webDetailPage);
			links.appendChild(homeLink);
		}
		
		return popup;
	}
	
	/**
	 * Creates a link button with icon.
	 */
	private createLinkButton(label: string, iconName: string, url: string): HTMLElement {
		const button = document.createElement("a");
		button.addClass("vc-extension-hover-popup__link-btn");
		button.href = url;
		button.target = "_blank";
		button.rel = "noopener noreferrer";
		
		const icon = document.createElement("span");
		setIcon(icon, iconName);
		button.appendChild(icon);
		
		const text = document.createElement("span");
		text.textContent = label;
		button.appendChild(text);
		
		return button;
	}
	
	/**
	 * Gets the icon name for the extension kind.
	 */
	private getIconForKind(): string {
		const iconMapping: Record<string, string> = {
			"agent": "bot",
			"voice-agent": "microphone",
			"prompt": "file-text",
			"skill": "zap",
			"mcp-server": "plug"
		};
		
		return iconMapping[this.config.extension.kind] || "file";
	}
	
	/**
	 * Positions the popup relative to the target element.
	 */
	private positionPopup(targetElement: HTMLElement, mouseEvent?: MouseEvent): void {
		if (!this.popupElement) return;
		
		const targetRect = targetElement.getBoundingClientRect();
		const popupRect = this.popupElement.getBoundingClientRect();
		
		// Try to position to the right of the target
		let left = targetRect.right + 12;
		let top = targetRect.top;
		
		// Check if it would overflow the viewport
		if (left + popupRect.width > window.innerWidth - 20) {
			// Position to the left instead
			left = targetRect.left - popupRect.width - 12;
		}
		
		// Ensure it doesn't overflow vertically
		if (top + popupRect.height > window.innerHeight - 20) {
			top = window.innerHeight - popupRect.height - 20;
		}
		
		// Ensure it doesn't go above the viewport
		if (top < 20) {
			top = 20;
		}
		
		this.popupElement.style.left = `${left}px`;
		this.popupElement.style.top = `${top}px`;
	}
	
	/**
	 * Sets up hover handlers to keep popup visible when hovering over it.
	 */
	private setupHoverHandlers(): void {
		if (!this.popupElement) return;
		
		// Cancel hide when mouse enters popup
		this.popupElement.addEventListener("mouseenter", () => {
			if (this.hideTimeout !== null) {
				window.clearTimeout(this.hideTimeout);
				this.hideTimeout = null;
			}
		});
		
		// Schedule hide when mouse leaves popup
		this.popupElement.addEventListener("mouseleave", () => {
			this.hide();
		});
	}
}

