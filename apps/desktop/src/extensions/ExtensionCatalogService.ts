/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module extensions/ExtensionCatalogService
 * @description Service for fetching, caching, and searching the extension catalog
 * 
 * This service manages the remote catalog of available extensions, providing:
 * - Catalog fetching with automatic caching
 * - Search and filter capabilities
 * - Offline fallback with stale cache
 * - Cross-platform HTTP handling
 */

import { App } from "obsidian";
import { httpRequest } from "../utils/http";
import {
	CatalogManifest,
	MarketplaceExtension,
	BrowseFilter,
	RawCatalogResponse,
	transformRawCatalog,
} from "./types";

/**
 * Cache entry for the extension catalog.
 * Tracks both the catalog data and when it was fetched.
 */
interface CatalogCacheEntry {
	/** The cached catalog data */
	manifestData: CatalogManifest;
	
	/** Timestamp when this cache entry was created */
	fetchedAtTimestamp: number;
}

/**
 * Configuration options for the catalog service.
 */
export interface CatalogServiceConfig {
	/** URL to the catalog.json file */
	catalogEndpoint: string;
	
	/** Cache time-to-live in milliseconds (default: 5 minutes) */
	cacheTTLMillis?: number;
}

/**
 * Service for managing the extension catalog.
 * Handles fetching, caching, and searching extensions from the remote catalog.
 * 
 * @example
 * ```typescript
 * const service = new ExtensionCatalogService(app, {
 *   catalogEndpoint: "https://danielshue.github.io/torqena-extensions/catalog/catalog.json",
 *   cacheTTLMillis: 300000 // 5 minutes
 * });
 * 
 * // Fetch catalog (will use cache if fresh)
 * const catalog = await service.fetchCatalog();
 * console.log(`Found ${catalog.availableExtensions.length} extensions`);
 * 
 * // Search for extensions
 * const results = await service.searchExtensions({
 *   textQuery: "journal",
 *   filterByKind: "agent"
 * });
 * 
 * // Get a specific extension
 * const extension = await service.getExtension("daily-journal-helper");
 * ```
 */
export class ExtensionCatalogService {
	private app: App;
	private config: CatalogServiceConfig;
	private cachedData: CatalogCacheEntry | null = null;
	
	/**
	 * Creates a new ExtensionCatalogService.
	 * 
	 * @param app - Obsidian App instance
	 * @param config - Service configuration
	 */
	constructor(app: App, config: CatalogServiceConfig) {
		this.app = app;
		this.config = {
			...config,
			cacheTTLMillis: config.cacheTTLMillis || 300000, // Default 5 minutes
		};
	}
	
	/**
	 * Fetches the extension catalog from the remote endpoint.
	 * Uses cached data if available and fresh, otherwise downloads fresh catalog.
	 * 
	 * @returns Promise resolving to the catalog manifest
	 * @throws Error if catalog cannot be fetched and no cache is available
	 * 
	 * @example
	 * ```typescript
	 * try {
	 *   const catalog = await service.fetchCatalog();
	 *   console.log(`Catalog has ${catalog.availableExtensions.length} extensions`);
	 * } catch (error) {
	 *   console.error("Failed to fetch catalog:", error.message);
	 * }
	 * ```
	 */
	async fetchCatalog(): Promise<CatalogManifest> {
		// Check if we have a fresh cache
		if (this.cachedData && this.isCacheFresh()) {
			return this.cachedData.manifestData;
		}
		
		try {
			// Fetch fresh catalog from remote
			const response = await httpRequest<RawCatalogResponse>({
				url: this.config.catalogEndpoint,
				method: "GET",
				timeout: 30000, // 30 second timeout
			});
			
			// Validate that we got a response with proper structure
			if (!response.data || typeof response.data !== "object") {
				throw new Error("Invalid catalog format received from server");
			}
			
			// Validate required fields exist
			const data = response.data as any;
			if (!data.version || !Array.isArray(data.extensions) || !Array.isArray(data.categories)) {
				throw new Error("Invalid catalog format: missing required fields");
			}
			
			// Transform raw catalog to internal format
			const transformedCatalog = transformRawCatalog(response.data);
			
			// Cache the transformed data
			this.cachedData = {
				manifestData: transformedCatalog,
				fetchedAtTimestamp: Date.now(),
			};
			
			return transformedCatalog;
		} catch (error) {
			// Network or validation error occurred
			const errorMsg = error instanceof Error ? error.message : String(error);
			
			// If we have stale cache, use it as fallback
			if (this.cachedData) {
				return this.cachedData.manifestData;
			}
			
			// No cache available, propagate error
			throw new Error(`Failed to fetch catalog and no cache available: ${errorMsg}`);
		}
	}
	
	/**
	 * Searches and filters extensions based on criteria.
	 * Always fetches the latest catalog first to ensure up-to-date results.
	 * 
	 * @param filter - Search and filter criteria
	 * @returns Promise resolving to array of matching extensions
	 * 
	 * @example
	 * ```typescript
	 * // Find all productivity agents
	 * const agents = await service.searchExtensions({
	 *   filterByKind: "agent",
	 *   filterByCategories: ["Productivity"]
	 * });
	 * 
	 * // Text search across all extensions
	 * const journalExts = await service.searchExtensions({
	 *   textQuery: "journal"
	 * });
	 * ```
	 */
	async searchExtensions(filter: BrowseFilter): Promise<MarketplaceExtension[]> {
		const catalog = await this.fetchCatalog();
		let results = [...catalog.availableExtensions];
		
		// Apply text query filter
		if (filter.textQuery && filter.textQuery.trim().length > 0) {
			const queryLower = filter.textQuery.toLowerCase();
			results = results.filter((ext) => {
				// Search in name, description, keywords, and categories
				return (
					ext.displayTitle.toLowerCase().includes(queryLower) ||
					ext.briefSummary.toLowerCase().includes(queryLower) ||
					ext.searchKeywords.some((kw) => kw.toLowerCase().includes(queryLower)) ||
					ext.classificationTags.some((tag) => tag.toLowerCase().includes(queryLower))
				);
			});
		}
		
		// Apply extension kind filter
		if (filter.filterByKind) {
			results = results.filter((ext) => ext.kind === filter.filterByKind);
		}
		
		// Apply category filter (extension must have at least one matching category)
		if (filter.filterByCategories && filter.filterByCategories.length > 0) {
			results = results.filter((ext) =>
				ext.classificationTags.some((tag) =>
					filter.filterByCategories!.includes(tag)
				)
			);
		}
		
		return results;
	}
	
	/**
	 * Retrieves a specific extension by its unique ID.
	 * 
	 * @param extensionId - Unique identifier of the extension
	 * @returns Promise resolving to the extension, or null if not found
	 * 
	 * @example
	 * ```typescript
	 * const ext = await service.getExtension("daily-journal-helper");
	 * if (ext) {
	 *   console.log(`Found extension: ${ext.displayTitle}`);
	 * } else {
	 *   console.log("Extension not found");
	 * }
	 * ```
	 */
	async getExtension(extensionId: string): Promise<MarketplaceExtension | null> {
		const catalog = await this.fetchCatalog();
		return catalog.availableExtensions.find((ext) => ext.uniqueId === extensionId) || null;
	}
	
	/**
	 * Retrieves the list of featured extensions from the catalog.
	 * 
	 * @returns Promise resolving to array of featured extensions
	 * 
	 * @example
	 * ```typescript
	 * const featured = await service.getFeatured();
	 * console.log(`Showing ${featured.length} featured extensions`);
	 * ```
	 */
	async getFeatured(): Promise<MarketplaceExtension[]> {
		const catalog = await this.fetchCatalog();
		
		// Filter extensions to only those in the featured list
		return catalog.availableExtensions.filter((ext) =>
			catalog.highlightedExtensions.includes(ext.uniqueId)
		);
	}
	
	/**
	 * Retrieves the list of all available categories.
	 * 
	 * @returns Promise resolving to array of category names
	 * 
	 * @example
	 * ```typescript
	 * const categories = await service.getCategories();
	 * // Display in dropdown: ["Productivity", "Journaling", "Research", ...]
	 * ```
	 */
	async getCategories(): Promise<string[]> {
		const catalog = await this.fetchCatalog();
		return [...catalog.knownCategories];
	}
	
	/**
	 * Updates the cached community rating for a specific extension.
	 *
	 * Call this after a successful rating submission so the UI reflects the
	 * new aggregate without waiting for a full catalog re-fetch.
	 *
	 * @param extensionId - Unique identifier of the extension
	 * @param averageRating - Updated aggregate average rating
	 * @param ratingCount - Updated total number of ratings
	 *
	 * @example
	 * ```typescript
	 * service.updateCachedRating('my-ext', 4.3, 12);
	 * ```
	 *
	 * @since 0.1.0
	 */
	updateCachedRating(extensionId: string, averageRating: number, ratingCount: number): void {
		if (!this.cachedData) return;

		const ext = this.cachedData.manifestData.availableExtensions
			.find(e => e.uniqueId === extensionId);
		if (ext) {
			ext.communityRating = averageRating;
			ext.downloadMetrics = ext.downloadMetrics ?? 0;
			// Store rating count on the extension for display purposes.
			// The field doesn't exist on the type yet, but the card renderer
			// can read it when available.
			(ext as any).ratingCount = ratingCount;
		}
	}
	
	/**
	 * Clears the cached catalog data.
	 * Next fetch will download fresh data from the remote endpoint.
	 * 
	 * @example
	 * ```typescript
	 * // User clicks "Refresh" button
	 * service.clearCache();
	 * const freshCatalog = await service.fetchCatalog();
	 * ```
	 */
	clearCache(): void {
		this.cachedData = null;
	}
	
	/**
	 * Gets the current cache status.
	 * 
	 * @returns Object containing cache metadata
	 * 
	 * @example
	 * ```typescript
	 * const status = service.getCacheStatus();
	 * if (status.lastFetchedAt) {
	 *   console.log(`Catalog last updated: ${status.lastFetchedAt.toLocaleString()}`);
	 *   console.log(`Cache is fresh: ${!status.isStale}`);
	 * }
	 * ```
	 */
	getCacheStatus(): { 
		lastFetchedAt: Date | null; 
		isStale: boolean;
	} {
		if (!this.cachedData) {
			return {
				lastFetchedAt: null,
				isStale: true,
			};
		}
		
		return {
			lastFetchedAt: new Date(this.cachedData.fetchedAtTimestamp),
			isStale: !this.isCacheFresh(),
		};
	}
	
	/**
	 * Checks if the current cache is fresh (within TTL).
	 * 
	 * @returns True if cache exists and is fresh, false otherwise
	 */
	private isCacheFresh(): boolean {
		if (!this.cachedData) return false;
		
		const ageMillis = Date.now() - this.cachedData.fetchedAtTimestamp;
		return ageMillis < (this.config.cacheTTLMillis || 300000);
	}
}
