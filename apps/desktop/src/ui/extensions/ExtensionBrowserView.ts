/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ui/extensions/ExtensionBrowserView
 * @description Main UI for browsing and managing extensions
 * 
 * This view provides a complete interface for discovering, installing, and managing
 * extensions from the marketplace catalog.
 */

import { ItemView, WorkspaceLeaf, Menu, ViewStateResult } from "obsidian";
import { setIcon } from "../../platform/utils/icons";
import type { AIServiceManager as CopilotPlugin } from "../../app/AIServiceManager";
import { ExtensionCatalogService } from "../../extensions/ExtensionCatalogService";
import { ExtensionManager } from "../../extensions/ExtensionManager";
import { MarketplaceExtension, VaultExtensionKind, BrowseFilter } from "../../extensions/types";
import { ExtensionCardComponent } from "./ExtensionCard";
import { ExtensionWebView, EXTENSION_WEB_VIEW_TYPE } from "./ExtensionWebView";
import { RatingModal } from "./RatingModal";

export const EXTENSION_BROWSER_VIEW_TYPE = "extension-browser-view";

/**
 * Extension Browser View - Main UI for the extension marketplace.
 * Extends ItemView to support pop-out windows on desktop.
 */
export class ExtensionBrowserView extends ItemView {
	private plugin: CopilotPlugin;
	private catalogService: ExtensionCatalogService;
	private extensionManager: ExtensionManager;
	private catalogUrl: string;
	
	private searchInput: HTMLInputElement | null = null;
	private refreshBtn: HTMLElement | null = null;
	
	private installedSection: HTMLElement | null = null;
	private recommendedSection: HTMLElement | null = null;
	
	private allExtensions: MarketplaceExtension[] = [];
	private installedExtensionIds: Set<string> = new Set();
	private availableUpdates: Map<string, string> = new Map();
	
	constructor(leaf: WorkspaceLeaf, plugin: CopilotPlugin) {
		super(leaf);
		this.plugin = plugin;
		
		this.catalogUrl = plugin.settings.extensionCatalogUrl || 
			"https://danielshue.github.io/torqena-extensions/catalog/catalog.json";
		
		this.catalogService = new ExtensionCatalogService(this.app, {
			catalogEndpoint: this.catalogUrl,
			cacheTTLMillis: 300000,
		});
		
		this.extensionManager = new ExtensionManager(this.app, {
			enableAnalytics: plugin.settings.enableAnalytics !== false,
			analyticsEndpoint: plugin.settings.analyticsEndpoint || 'https://torqena-api.purpleocean-69a206db.eastus.azurecontainerapps.io',
			githubUsername: plugin.settings.githubUsername || '',
			anonymousId: plugin.settings.anonymousId || '',
			pluginVersion: plugin.manifest.version,
		});
	}
	
	getViewType(): string {
		return EXTENSION_BROWSER_VIEW_TYPE;
	}
	
	getDisplayText(): string {
		return "Extensions";
	}
	
	getIcon(): string {
		return "puzzle";
	}
	
	async onOpen(): Promise<void> {
		await this.extensionManager.initialize();
		this.render();
		await this.loadExtensions();
	}
	
	async onClose(): Promise<void> {
		// Cleanup handled by parent class
	}

	/**
	 * Returns the current view state including active filter.
	 */
	getState(): Record<string, unknown> {
		return {
			filterByKind: this.activeTypeFilter || undefined,
		};
	}

	/**
	 * Restores view state, applying any initial type filter.
	 * @param state - Persisted state with optional filterByKind
	 */
	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = state as Record<string, unknown> | null;
		if (s?.filterByKind && typeof s.filterByKind === "string") {
			this.activeTypeFilter = s.filterByKind;
			await this.renderSections();
		}
		await super.setState(state, result);
	}
	
	/**
	 * Renders the VS Code-style extension sidebar layout.
	 */
	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("vc-extension-browser");
		
		// Header bar: "EXTENSIONS" title + action icons
		const header = container.createDiv({ cls: "vc-extension-browser-header" });
		header.createSpan({ text: "EXTENSIONS", cls: "vc-extension-browser-header-title" });
		
		const headerActions = header.createDiv({ cls: "vc-extension-browser-header-actions" });
		
		// Refresh button
		this.refreshBtn = headerActions.createEl("button", {
			cls: "vc-extension-browser-btn",
			attr: { "aria-label": "Refresh catalog", title: "Refresh" }
		});
		setIcon(this.refreshBtn, "refresh-cw");
		this.refreshBtn.addEventListener("click", () => this.handleRefresh());
		
		// Ellipsis menu button
		const menuBtn = headerActions.createEl("button", {
			cls: "vc-extension-browser-btn",
			attr: { "aria-label": "More actions", title: "More Actions..." }
		});
		setIcon(menuBtn, "more-horizontal");
		menuBtn.addEventListener("click", (evt) => this.showActionsMenu(evt));
		
		// Search bar with inline action buttons (VS Code style)
		const searchContainer = container.createDiv({ cls: "vc-extension-browser-search" });
		const searchIcon = searchContainer.createDiv({ cls: "vc-extension-browser-search-icon" });
		setIcon(searchIcon, "search");
		
		this.searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "Search Extensions in ...",
			cls: "vc-extension-browser-search-input"
		});
		this.searchInput.addEventListener("input", () => this.handleFilterChange());
		
		// Inline search actions (clear + filter) inside the search box
		const searchActions = searchContainer.createDiv({ cls: "vc-extension-browser-search-actions" });
		
		// Clear button — hidden when search is empty
		const clearBtn = searchActions.createEl("button", {
			cls: "vc-extension-browser-search-btn",
			attr: { "aria-label": "Clear search", title: "Clear search" }
		});
		setIcon(clearBtn, "x");
		clearBtn.classList.add("vc-hidden");
		clearBtn.addEventListener("click", () => {
			if (this.searchInput) {
				this.searchInput.value = "";
				this.handleFilterChange();
			}
		});
		
		// Show/hide clear button based on input
		this.searchInput.addEventListener("input", () => {
			clearBtn.classList.toggle("vc-hidden", !this.searchInput?.value);
		});
		
		// Filter button
		const filterBtn = searchActions.createEl("button", {
			cls: "vc-extension-browser-search-btn",
			attr: { "aria-label": "Filter extensions", title: "Filter" }
		});
		setIcon(filterBtn, "filter");
		filterBtn.addEventListener("click", (evt) => this.showFilterMenu(evt));
		
		// Sections container
		const sectionsContainer = container.createDiv({ cls: "vc-extension-browser-sections" });
		
		// Installed section
		this.installedSection = this.createSection(sectionsContainer, "INSTALLED", "installed");
		
		// Recommended section (renamed from Featured)
		this.recommendedSection = this.createSection(sectionsContainer, "RECOMMENDED", "recommended");
	}
	
	/**
	 * Shows the ellipsis (...) actions menu using Obsidian's native Menu API.
	 */
	private showActionsMenu(evt: MouseEvent): void {
		const menu = new Menu();
		
		menu.addItem((item) => {
			item.setTitle("Check for Extension Updates");
			item.setIcon("refresh-cw");
			item.onClick(() => this.handleRefresh());
		});
		
		menu.addSeparator();
		
		menu.addItem((item) => {
			item.setTitle("Submit Extension...");
			item.setIcon("upload");
			item.onClick(() => this.plugin.openExtensionSubmissionModal());
		});
		
		menu.showAtMouseEvent(evt);
	}
	
	/**
	 * Shows the filter menu for filtering by type/category.
	 */
	private showFilterMenu(evt: MouseEvent): void {
		const menu = new Menu();
		
		const types: { label: string; value: string; icon: string }[] = [
			{ label: "All Types", value: "", icon: "list" },
			{ label: "Agents", value: "agent", icon: "bot" },
			{ label: "Automations", value: "automation", icon: "timer" },
			{ label: "Voice Agents", value: "voice-agent", icon: "mic" },
			{ label: "Prompts", value: "prompt", icon: "file-text" },
			{ label: "Skills", value: "skill", icon: "wrench" },
			{ label: "MCP Servers", value: "mcp-server", icon: "plug" }
		];
		
		for (const t of types) {
			menu.addItem((item) => {
				item.setTitle(t.label);
				item.setIcon(t.icon);
				item.onClick(async () => {
					// Re-filter with selected type
					await this.applyTypeFilter(t.value);
				});
			});
		}
		
		menu.showAtMouseEvent(evt);
	}
	
	/** Active type filter value */
	private activeTypeFilter: string = "";
	
	/**
	 * Applies a type filter and re-renders sections.
	 */
	private async applyTypeFilter(typeValue: string): Promise<void> {
		this.activeTypeFilter = typeValue;
		await this.renderSections();
	}
	
	/**
	 * Creates a collapsible section with VS Code-style header.
	 */
	private createSection(parent: HTMLElement, title: string, id: string): HTMLElement {
		const section = parent.createDiv({ cls: "vc-extension-browser-section" });
		section.setAttribute("data-section-id", id);
		
		const header = section.createDiv({ cls: "vc-extension-browser-section-header" });
		header.addEventListener("click", () => this.toggleSection(section));
		
		const headerLeft = header.createDiv({ cls: "vc-extension-browser-section-title" });
		const icon = headerLeft.createSpan({ cls: "vc-extension-browser-section-icon" });
		setIcon(icon, "chevron-down");
		headerLeft.createSpan({ text: title, cls: "vc-extension-browser-section-text" });
		
		header.createSpan({ cls: "vc-extension-browser-section-count", text: "0" });
		
		const content = section.createDiv({ cls: "vc-extension-browser-section-content" });
		
		return section;
	}
	
	/**
	 * Toggles a section's expanded/collapsed state.
	 */
	private toggleSection(section: HTMLElement): void {
		const isCollapsed = section.hasClass("collapsed");
		section.toggleClass("collapsed", !isCollapsed);
	}
	
	/**
	 * Loads extensions from the catalog
	 */
	private async loadExtensions(): Promise<void> {
		try {
			const catalog = await this.catalogService.fetchCatalog();
			this.allExtensions = catalog.availableExtensions;
			
			// Load installed extensions
			const installed = await this.extensionManager.getInstalledExtensions();
			this.installedExtensionIds = new Set(installed.keys());
			
			// Check for updates
			const updates = await this.extensionManager.checkForUpdates(catalog.availableExtensions);
			this.availableUpdates.clear();
			for (const update of updates) {
				this.availableUpdates.set(update.extensionId, update.availableNewerVersion);
			}
			
			// Clear any error messages on success
			const sectionsContainer = this.contentEl.querySelector(".vc-extension-browser-sections") as HTMLElement;
			if (sectionsContainer) {
				const existingErrors = sectionsContainer.querySelectorAll(".vc-extension-browser-error");
				existingErrors.forEach(el => el.remove());
			}
			
			await this.renderSections();
		} catch (error) {
			console.error("Failed to load extensions:", error);
			this.showCatalogError(error);
			
			// Still try to show installed extensions
			try {
				const installed = await this.extensionManager.getInstalledExtensions();
				this.installedExtensionIds = new Set(installed.keys());
				await this.renderSections();
			} catch (e) {
				console.error("Failed to load installed extensions:", e);
			}
		}
	}
	
	/**
	 * Display a friendly error message when catalog is unavailable
	 */
	private showCatalogError(error: unknown): void {
		// Find sections container
		const sectionsContainer = this.contentEl.querySelector(".vc-extension-browser-sections") as HTMLElement;
		
		if (!sectionsContainer) {
			// If no sections container exists, something is wrong with initialization
			return;
		}
		
		// Remove any existing error messages
		const existingErrors = sectionsContainer.querySelectorAll(".vc-extension-browser-error");
		existingErrors.forEach(el => el.remove());
		
		// Create error display at the top of sections container
		const errorContainer = sectionsContainer.createDiv({ cls: "vc-extension-browser-error" });
		
		// Move error to the top
		sectionsContainer.insertBefore(errorContainer, sectionsContainer.firstChild);
		
		const iconEl = errorContainer.createDiv({ cls: "vc-extension-browser-error-icon" });
		setIcon(iconEl, "cloud-off");
		
		const titleEl = errorContainer.createEl("h3", { 
			text: "Extension Catalog Unavailable",
			cls: "vc-extension-browser-error-title"
		});
		
		const messageEl = errorContainer.createEl("p", { 
			text: "The extension marketplace is not yet available.",
			cls: "vc-extension-browser-error-message"
		});
		
		// Show the URL being accessed
		const urlEl = errorContainer.createEl("p", {
			cls: "vc-extension-browser-error-url"
		});
		urlEl.createSpan({ text: "Catalog URL: ", cls: "vc-extension-browser-error-url-label" });
		urlEl.createEl("code", { text: this.catalogUrl });
		
		const detailsEl = errorContainer.createEl("p", {
			text: "You can still manage any installed extensions below.",
			cls: "vc-extension-browser-error-details"
		});
		
		if (error instanceof Error && error.message.includes("not valid JSON")) {
			const technicalEl = errorContainer.createEl("details", { cls: "vc-extension-browser-error-technical" });
			const summaryEl = technicalEl.createEl("summary", { text: "Technical details" });
			const codeEl = technicalEl.createEl("code", { 
				text: `The catalog URL returned HTML instead of JSON. This usually means the endpoint doesn't exist yet or returned an error page.`
			});
		}
	}
	
	/**
	 * Loads categories into the filter dropdown
	 */
	private async loadCategories(_categories: string[]): Promise<void> {
		// Categories are now handled via the filter menu
	}
	
	/**
	 * Renders all sections based on current filter.
	 */
	private async renderSections(): Promise<void> {
		const filteredExtensions = await this.applyFilters();
		
		// Get installed extensions (filtered)
		const installedExtensions = filteredExtensions.filter(ext => 
			this.installedExtensionIds.has(ext.uniqueId)
		);
		
		// Get recommended extensions (non-installed, featured first then all)
		const recommendedExtensions = filteredExtensions.filter(ext =>
			!this.installedExtensionIds.has(ext.uniqueId)
		);
		
		// Render each section
		this.renderExtensionList(this.installedSection!, installedExtensions, "installed");
		this.renderExtensionList(this.recommendedSection!, recommendedExtensions, "recommended");
	}
	
	/**
	 * Applies current filters to extension list
	 */
	private async applyFilters(): Promise<MarketplaceExtension[]> {
		const filter: BrowseFilter = {};
		
		if (this.searchInput?.value) {
			filter.textQuery = this.searchInput.value;
		}
		
		if (this.activeTypeFilter) {
			filter.filterByKind = this.activeTypeFilter as VaultExtensionKind;
		}
		
		return await this.catalogService.searchExtensions(filter);
	}
	
	/**
	 * Renders a list of extensions in a section
	 */
	private renderExtensionList(
		section: HTMLElement,
		extensions: MarketplaceExtension[],
		sectionType: string
	): void {
		const content = section.querySelector(".vc-extension-browser-section-content") as HTMLElement;
		if (!content) return;
		
		// Update count badge
		const countEl = section.querySelector(".vc-extension-browser-section-count");
		if (countEl) {
			countEl.textContent = `${extensions.length}`;
		}
		
		// Clear content
		content.empty();
		
		// Render cards
		if (extensions.length === 0) {
			content.createDiv({ 
				cls: "vc-extension-browser-empty", 
				text: "No extensions found" 
			});
			return;
		}
		
		for (const ext of extensions) {
			const isInstalled = this.installedExtensionIds.has(ext.uniqueId);
			const hasUpdate = this.availableUpdates.has(ext.uniqueId);
			
			const card = new ExtensionCardComponent({
				extensionData: ext,
				isCurrentlyInstalled: isInstalled,
				hasAvailableUpdate: hasUpdate,
				onCardClick: (ext) => this.handleCardClick(ext),
				onInstallClick: (ext) => this.handleInstall(ext),
				onUpdateClick: (ext) => this.handleUpdate(ext),
				onRemoveClick: (ext) => this.handleRemove(ext),
				onRateClick: this.extensionManager.isAnalyticsEnabled()
					? (ext) => this.handleRate(ext)
					: undefined,
			});
			
			content.appendChild(card.buildElement());
		}
	}
	
	/**
	 * Handles filter changes
	 */
	private async handleFilterChange(): Promise<void> {
		await this.renderSections();
	}
	
	/**
	 * Handles refresh button click
	 */
	private async handleRefresh(): Promise<void> {
		// Add refreshing class for animation
		if (this.refreshBtn) {
			this.refreshBtn.addClass("refreshing");
			this.refreshBtn.setAttribute("disabled", "true");
		}
		
		try {
			this.catalogService.clearCache();
			this.availableUpdates.clear();
			await this.loadExtensions();
		} finally {
			// Remove refreshing class after a minimum animation duration
			setTimeout(() => {
				if (this.refreshBtn) {
					this.refreshBtn.removeClass("refreshing");
					this.refreshBtn.removeAttribute("disabled");
				}
			}, 500); // Ensure at least half a rotation completes
		}
	}
	
	/**
	 * Handles card click to show details
	 */
	private async handleCardClick(ext: MarketplaceExtension): Promise<void> {
		// Open extension's detail page in Obsidian web view
		if (ext.webDetailPage) {
			const leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({
				type: EXTENSION_WEB_VIEW_TYPE,
				active: true,
				state: {
					url: ext.webDetailPage,
					extensionName: ext.displayTitle
				}
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}
	
	/**
	 * Handles extension installation
	 */
	private async handleInstall(ext: MarketplaceExtension): Promise<void> {
		try {
			const result = await this.extensionManager.installExtension(ext);
			
			if (result.operationSucceeded) {
				console.log(`Extension "${ext.displayTitle}" installed successfully`);
				this.installedExtensionIds.add(ext.uniqueId);
				this.availableUpdates.delete(ext.uniqueId); // Remove from updates if present
				await this.renderSections();
			} else {
				console.error(`Installation failed: ${result.errorDetails || 'Unknown error'}`);
			}
		} catch (error) {
			console.error("Installation failed:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`Installation failed: ${errorMsg}`);
		}
	}
	
	/**
	 * Handles extension update
	 */
	private async handleUpdate(ext: MarketplaceExtension): Promise<void> {
		try {
			const result = await this.extensionManager.updateExtension(ext.uniqueId, ext);
			
			if (result.operationSucceeded) {
				// Note: updateExtension already logs success
				this.availableUpdates.delete(ext.uniqueId); // Remove from updates after successful update
				await this.renderSections();
			} else {
				console.error(`Update failed: ${result.errorDetails || 'Unknown error'}`);
			}
		} catch (error) {
			console.error("Update failed:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`Update failed: ${errorMsg}`);
		}
	}
	
	/**
	 * Handles extension removal
	 */
	private async handleRemove(ext: MarketplaceExtension): Promise<void> {
		try {
			const result = await this.extensionManager.uninstallExtension(ext.uniqueId);
			
			if (result.operationSucceeded) {
				console.log(`Extension "${ext.displayTitle}" removed successfully`);
				this.installedExtensionIds.delete(ext.uniqueId);
				this.availableUpdates.delete(ext.uniqueId);
				await this.renderSections();
			} else {
				console.error(`Removal failed: ${result.errorDetails || 'Unknown error'}`);
			}
		} catch (error) {
			console.error("Removal failed:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`Removal failed: ${errorMsg}`);
		}
	}
	
	/**
	 * Handles rating an extension via the RatingModal.
	 */
	private async handleRate(ext: MarketplaceExtension): Promise<void> {
		const analyticsService = this.extensionManager.getAnalyticsService();
		const userHash = this.extensionManager.getUserHash();
		
		// Analytics service is required for ratings (userHash is auto-generated if not set)
		if (!analyticsService) {
			console.log('Analytics is not enabled. Enable it in Settings → Extension Analytics.');
			return;
		}
		
		// userHash should always be available when analytics is enabled, but check just in case
		if (!userHash) {
			console.error('Unable to submit rating: user identification not available.');
			return;
		}
		
		// Fetch the user's existing rating for this extension so the modal
		// opens in edit mode (preventing unintentional duplicate submissions).
		let existingRating: number | undefined;
		let existingComment: string | undefined;
		try {
			const userRatings = await analyticsService.getUserRatings(userHash);
			const match = userRatings.find(r => r.extensionId === ext.uniqueId);
			if (match) {
				existingRating = match.rating;
				existingComment = match.comment;
			}
		} catch {
			// If the lookup fails, fall through and let the user submit a new rating.
		}
		
		RatingModal.show({
			app: this.app,
			extensionId: ext.uniqueId,
			extensionName: ext.displayTitle,
			extensionVersion: ext.semanticVersion,
			userHash,
			analyticsService,
			existingRating,
			existingComment,
			onRatingSubmitted: async (rating, _comment, response) => {
				// Update the in-memory catalog cache so the UI reflects the new rating immediately
				this.catalogService.updateCachedRating(
					ext.uniqueId,
					response.aggregateRating,
					response.ratingCount,
				);
				await this.renderSections();
			},
		});
	}
}

