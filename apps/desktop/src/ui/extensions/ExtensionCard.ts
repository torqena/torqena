/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ui/extensions/ExtensionCard
 * @description Reusable card component for displaying extension metadata in lists
 * 
 * This component renders a compact card showing key information about an extension,
 * including its icon, name, description, categories, and action buttons.
 */

import { setIcon } from "../../platform/utils/icons";
import { MarketplaceExtension, VaultExtensionKind } from "../../extensions/types";
import { ExtensionHoverPopup } from "./ExtensionHoverPopup";

/**
 * Configuration for rendering an extension card.
 */
export interface ExtensionCardConfig {
	/** The extension data to display */
	extensionData: MarketplaceExtension;
	
	/** Whether this extension is currently installed */
	isCurrentlyInstalled: boolean;
	
	/** Whether an update is available for this extension */
	hasAvailableUpdate: boolean;
	
	/** Callback when user clicks the card body */
	onCardClick: (ext: MarketplaceExtension) => void;
	
	/** Callback when user clicks install button */
	onInstallClick: (ext: MarketplaceExtension) => void;
	
	/** Callback when user clicks update button */
	onUpdateClick: (ext: MarketplaceExtension) => void;
	
	/** Callback when user clicks remove button */
	onRemoveClick: (ext: MarketplaceExtension) => void;
	
	/** Callback when user clicks the rate button */
	onRateClick?: (ext: MarketplaceExtension) => void;
}

/**
 * Extension card component for the marketplace browser.
 * Creates a visually appealing card with metadata and action buttons.
 * 
 * @example
 * ```typescript
 * const card = new ExtensionCardComponent({
 *   extensionData: myExtension,
 *   isCurrentlyInstalled: false,
 *   hasAvailableUpdate: false,
 *   onCardClick: (ext) => showDetailModal(ext),
 *   onInstallClick: (ext) => installExtension(ext),
 *   onUpdateClick: (ext) => updateExtension(ext),
 *   onRemoveClick: (ext) => removeExtension(ext)
 * });
 * 
 * const element = card.buildElement();
 * containerEl.appendChild(element);
 * ```
 */
export class ExtensionCardComponent {
	private config: ExtensionCardConfig;
	private hoverPopup: ExtensionHoverPopup | null = null;
	private hoverTimeout: number | null = null;
	
	constructor(config: ExtensionCardConfig) {
		this.config = config;
		
		// Create hover popup
		this.hoverPopup = new ExtensionHoverPopup({
			extension: config.extensionData,
			isInstalled: config.isCurrentlyInstalled,
			hasUpdate: config.hasAvailableUpdate
		});
	}
	
	/**
	 * Builds the DOM element for this card.
	 * Returns a fully interactive card element ready to be inserted into the DOM.
	 * 
	 * VS Code-style layout:
	 * ┌──────────────────────────────────────┐
	 * │ [icon]  Title                  ⬇ 5M  │
	 * │         Short description that   ★4.5│
	 * │         can wrap to 2 lines...       │
	 * │         Author                       │
	 * │         [Install]                    │
	 * └──────────────────────────────────────┘
	 */
	public buildElement(): HTMLElement {
		const cardContainer = document.createElement("div");
		cardContainer.addClass("vc-extension-card");
		
		if (this.config.isCurrentlyInstalled) {
			cardContainer.addClass("vc-extension-card--installed");
		}
		if (this.config.hasAvailableUpdate) {
			cardContainer.addClass("vc-extension-card--has-update");
		}
		
		// Make card clickable
		cardContainer.addEventListener("click", (evt) => {
			if ((evt.target as HTMLElement).closest(".vc-extension-card__actions")) {
				return;
			}
			this.config.onCardClick(this.config.extensionData);
		});
		
		// Add hover handlers
		cardContainer.addEventListener("mouseenter", (evt) => {
			this.hoverTimeout = window.setTimeout(() => {
				this.hoverPopup?.show(cardContainer, evt);
			}, 400);
		});
		
		cardContainer.addEventListener("mouseleave", () => {
			if (this.hoverTimeout !== null) {
				window.clearTimeout(this.hoverTimeout);
				this.hoverTimeout = null;
			}
			this.hoverPopup?.hide();
		});
		
		// Icon (left column)
		const icon = document.createElement("div");
		icon.addClass("vc-extension-card__icon");
		icon.setAttribute("data-kind", this.config.extensionData.kind);
		setIcon(icon, this.getIconForExtensionKind(this.config.extensionData.kind));
		cardContainer.appendChild(icon);
		
		// Details (right column)
		const details = document.createElement("div");
		details.addClass("vc-extension-card__details");
		
		// Row 1: title + download count
		const row1 = document.createElement("div");
		row1.addClass("vc-extension-card__row");
		
		const title = document.createElement("span");
		title.addClass("vc-extension-card__title");
		title.textContent = this.config.extensionData.displayTitle;
		row1.appendChild(title);
		
		// Downloads + rating in top-right area
		const stats = document.createElement("span");
		stats.addClass("vc-extension-card__stats");
		
		const ext = this.config.extensionData;
		if (ext.downloadMetrics && ext.downloadMetrics > 0) {
			const downloads = document.createElement("span");
			downloads.addClass("vc-extension-card__downloads");
			downloads.textContent = this.formatCount(ext.downloadMetrics);
			stats.appendChild(downloads);
		}
		
		const rating = ext.communityRating ?? 0;
		if (rating > 0) {
			const ratingEl = document.createElement("span");
			ratingEl.addClass("vc-extension-card__rating-compact");
			ratingEl.textContent = `★${rating.toFixed(1)}`;
			stats.appendChild(ratingEl);
		}
		
		row1.appendChild(stats);
		details.appendChild(row1);
		
		// Row 2: description (2-line clamp)
		const desc = document.createElement("div");
		desc.addClass("vc-extension-card__description");
		desc.textContent = this.config.extensionData.briefSummary;
		details.appendChild(desc);
		
		// Row 3: author + action buttons
		const row3 = document.createElement("div");
		row3.addClass("vc-extension-card__row");
		
		const author = document.createElement("span");
		author.addClass("vc-extension-card__author");
		author.textContent = this.config.extensionData.creator?.displayName || "";
		row3.appendChild(author);
		
		const actions = document.createElement("div");
		actions.addClass("vc-extension-card__actions");
		
		if (this.config.hasAvailableUpdate) {
			const updateBtn = this.createActionButton("Update", "sync");
			updateBtn.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.config.onUpdateClick(this.config.extensionData);
			});
			actions.appendChild(updateBtn);
		} else if (this.config.isCurrentlyInstalled) {
			if (this.config.onRateClick) {
				const rateBtn = this.createActionButton("Rate", "star");
				rateBtn.addEventListener("click", (evt) => {
					evt.stopPropagation();
					this.config.onRateClick!(this.config.extensionData);
				});
				actions.appendChild(rateBtn);
			}
			const removeBtn = this.createActionButton("Remove", "trash");
			removeBtn.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.config.onRemoveClick(this.config.extensionData);
			});
			actions.appendChild(removeBtn);
		} else {
			const installBtn = this.createActionButton("Install", "download");
			installBtn.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.config.onInstallClick(this.config.extensionData);
			});
			actions.appendChild(installBtn);
		}
		
		row3.appendChild(actions);
		details.appendChild(row3);
		
		cardContainer.appendChild(details);
		
		return cardContainer;
	}
	
	/**
	 * Destroys the card and cleans up resources.
	 */
	public destroy(): void {
		if (this.hoverTimeout !== null) {
			window.clearTimeout(this.hoverTimeout);
			this.hoverTimeout = null;
		}
		
		this.hoverPopup?.destroy();
		this.hoverPopup = null;
	}
	
	/**
	 * Creates an action button with icon.
	 */
	private createActionButton(label: string, iconName: string): HTMLElement {
		const button = document.createElement("button");
		button.addClass("vc-extension-card__action-btn");
		button.setAttribute("aria-label", label);
		button.setAttribute("data-action", label.toLowerCase());
		
		const iconEl = document.createElement("span");
		setIcon(iconEl, iconName);
		button.appendChild(iconEl);
		
		const labelEl = document.createElement("span");
		labelEl.textContent = label;
		button.appendChild(labelEl);
		
		return button;
	}
	
	/**
	 * Formats a count number with K/M suffixes for compact display.
	 * @param count - The raw count number
	 * @returns Formatted string (e.g., "1.2K", "3.5M")
	 */
	private formatCount(count: number): string {
		if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
		if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
		return count.toString();
	}
	
	/**
	 * Returns the appropriate icon name for an extension kind.
	 */
	private getIconForExtensionKind(kind: VaultExtensionKind): string {
		const iconMapping: Record<VaultExtensionKind, string> = {
			"agent": "bot",
			"voice-agent": "microphone",
			"prompt": "file-text",
			"skill": "zap",
			"mcp-server": "plug",
			"automation": "clock"
		};
		
		return iconMapping[kind] || "file";
	}
}

