/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module extensions/types
 * @description Type definitions for Torqena Extension Marketplace
 * 
 * This module defines the complete type system for managing extensions in Torqena.
 * Extensions can be agents, voice agents, prompts, skills, or MCP servers that extend
 * the capabilities of the plugin.
 */

/**
 * Supported extension categories in the marketplace.
 * Each extension must be tagged with at least one category for discoverability.
 */
export type VaultExtensionKind = 
	| "agent" 
	| "voice-agent" 
	| "prompt" 
	| "skill" 
	| "mcp-server"
	| "automation";

/**
 * Creator information for an extension.
 * Used to attribute and link back to the extension author.
 * 
 * @example
 * ```typescript
 * const creator: ExtensionCreator = {
 *   displayName: "John Doe",
 *   profileLink: "https://github.com/johndoe",
 *   contactEmail: "john@example.com"
 * };
 * ```
 */
export interface ExtensionCreator {
	/** Display name of the extension creator */
	displayName: string;
	
	/** Optional URL to creator's profile (GitHub, website, etc.) */
	profileLink?: string;
	
	/** Optional contact email for support */
	contactEmail?: string;
}

/**
 * Represents a downloadable file that is part of an extension package.
 * Each file knows its source location, where to download from, and where to install.
 * 
 * @example
 * ```typescript
 * const file: PackagedFile = {
 *   relativePath: "daily-notes.agent.md",
 *   downloadSource: "https://raw.githubusercontent.com/.../daily-notes.agent.md",
 *   targetLocation: "Reference/Agents/daily-notes.agent.md"
 * };
 * ```
 */
export interface PackagedFile {
	/** Original filename in the extension package */
	relativePath: string;
	
	/** Full URL to download this file */
	downloadSource: string;
	
	/** Destination path relative to vault root */
	targetLocation: string;
}

/**
 * Complete metadata for a marketplace extension.
 * This structure matches the catalog format and contains all information
 * needed to display, search, and install an extension.
 * 
 * @example
 * ```typescript
 * const extension: MarketplaceExtension = {
 *   uniqueId: "daily-journal-helper",
 *   displayTitle: "Daily Journal Helper",
 *   kind: "agent",
 *   semanticVersion: "1.2.0",
 *   briefSummary: "Assists with creating structured daily journal entries",
 *   creator: { displayName: "Jane Smith", profileLink: "https://github.com/janesmith" },
 *   classificationTags: ["Productivity", "Journaling"],
 *   searchKeywords: ["journal", "daily", "notes"],
 *   downloadMetrics: 142,
 *   communityRating: 4.5,
 *   publishTimestamp: "2026-01-15T10:00:00Z",
 *   lastModifiedTimestamp: "2026-02-01T14:30:00Z",
 *   totalSizeBytes: "2345",
 *   requiredPluginVersion: "0.1.0",
 *   sourceRepository: "https://github.com/janesmith/daily-journal-helper",
 *   webDetailPage: "https://danielshue.github.io/vault-copilot-extensions/agents/daily-journal-helper",
 *   packageContents: [{
 *     relativePath: "daily-journal.agent.md",
 *     downloadSource: "https://raw.githubusercontent.com/.../daily-journal.agent.md",
 *     targetLocation: "Reference/Agents/daily-journal.agent.md"
 *   }],
 *   requiredCapabilities: ["create_note", "read_note", "list_files"],
 *   dependsOnExtensions: [],
 *   previewImageUrl: "https://raw.githubusercontent.com/.../preview.png"
 * };
 * ```
 */
export interface MarketplaceExtension {
	/** Unique identifier for this extension (lowercase-with-hyphens) */
	uniqueId: string;
	
	/** Human-readable name displayed in the UI */
	displayTitle: string;
	
	/** Type of extension */
	kind: VaultExtensionKind;
	
	/** Semantic version (e.g., "1.2.0") */
	semanticVersion: string;
	
	/** Short description (max 200 characters) */
	briefSummary: string;
	
	/** Extension author information */
	creator: ExtensionCreator;
	
	/** Category tags for organization */
	classificationTags: string[];
	
	/** Keywords for search functionality */
	searchKeywords: string[];
	
	/** Number of times this extension has been downloaded */
	downloadMetrics?: number;
	
	/** Average community rating (1-5) */
	communityRating?: number;
	
	/** ISO 8601 timestamp when first published */
	publishTimestamp: string;
	
	/** ISO 8601 timestamp of last update */
	lastModifiedTimestamp: string;
	
	/** Total size of all files in the package */
	totalSizeBytes: string;
	
	/** Minimum Torqena version required */
	requiredPluginVersion: string;
	
	/** Optional link to source code repository */
	sourceRepository?: string;
	
	/** URL to the extension's detail page on GitHub Pages */
	webDetailPage: string;
	
	/** List of files included in this extension */
	packageContents: PackagedFile[];
	
	/** List of Torqena tool names this extension uses */
	requiredCapabilities: string[];
	
	/** Other extension IDs that must be installed first */
	dependsOnExtensions: string[];
	
	/** Optional preview screenshot URL */
	previewImageUrl?: string;
}

/**
 * Raw extension data as received from the catalog JSON file.
 * This is the actual structure from GitHub Pages, which differs from our internal format.
 */
export interface RawCatalogExtension {
	id: string;
	name: string;
	type: string;
	version: string;
	description: string;
	author: {
		name: string;
		url?: string;
		email?: string;
	};
	categories: string[];
	tags: string[];
	downloads?: number;
	rating?: number;
	publishedAt?: string;
	updatedAt?: string;
	size?: string;
	minVaultCopilotVersion?: string;
	repository?: string;
	detailPageUrl?: string;
	files: Array<{
		source: string;
		downloadUrl: string;
		installPath: string;
		size?: string;
	}>;
	tools?: string[];
	dependencies?: string[];
	preview?: string;
	featured?: boolean;
}

/**
 * Raw catalog response structure as received from catalog.json.
 * This is the actual JSON structure from danielshue.github.io/vault-copilot-extensions.
 */
export interface RawCatalogResponse {
	version: string;
	generated: string;
	totalExtensions: number;
	extensions: RawCatalogExtension[];
	categories: string[];
	featured: string[];
	stats?: {
		totalDownloads?: number;
		totalExtensions?: number;
		byType?: Record<string, number>;
	};
}

/**
 * Response structure from the catalog.json endpoint.
 * Contains the complete catalog of available extensions plus metadata.
 * 
 * @example
 * ```typescript
 * const catalog: CatalogManifest = {
 *   schemaVersion: "1.0",
 *   buildTimestamp: "2026-02-05T20:00:00Z",
 *   availableExtensions: [...],
 *   knownCategories: ["Productivity", "Journaling", "Research"],
 *   highlightedExtensions: ["daily-journal-helper", "meeting-transcriber"]
 * };
 * ```
 */
export interface CatalogManifest {
	/** Version of the catalog schema */
	schemaVersion: string;
	
	/** ISO 8601 timestamp when catalog was generated */
	buildTimestamp: string;
	
	/** Complete list of all available extensions */
	availableExtensions: MarketplaceExtension[];
	
	/** All valid category names */
	knownCategories: string[];
	
	/** Extension IDs to feature prominently */
	highlightedExtensions: string[];
}

/**
 * Tracks a locally installed extension.
 * Stored in .obsidian/obsidian-vault-copilot-extensions.json for each installation.
 * 
 * @example
 * ```typescript
 * const installed: LocalExtensionRecord = {
 *   extensionId: "daily-journal-helper",
 *   installedVersion: "1.2.0",
 *   installationTimestamp: "2026-02-05T15:00:00Z",
 *   installedFilePaths: ["Reference/Agents/daily-journal.agent.md"],
 *   linkedDependencies: []
 * };
 * ```
 */
export interface LocalExtensionRecord {
	/** ID of the installed extension */
	extensionId: string;
	
	/** Type of extension (agent, voice-agent, prompt, skill, mcp-server, automation) */
	extensionKind: VaultExtensionKind;
	
	/** Version currently installed */
	installedVersion: string;
	
	/** ISO 8601 timestamp of installation */
	installationTimestamp: string;
	
	/** Absolute vault paths where files were placed */
	installedFilePaths: string[];
	
	/** IDs of extensions this one depends on */
	linkedDependencies: string[];
}

/**
 * Filter criteria for searching and browsing extensions.
 * All fields are optional - omitted fields mean no filtering on that dimension.
 * 
 * @example
 * ```typescript
 * const filter: BrowseFilter = {
 *   textQuery: "journal",
 *   filterByKind: "agent",
 *   filterByCategories: ["Productivity"],
 *   showOnlyInstalled: false
 * };
 * ```
 */
export interface BrowseFilter {
	/** Free-text search query (searches name, description, tags) */
	textQuery?: string;
	
	/** Filter to specific extension type */
	filterByKind?: VaultExtensionKind;
	
	/** Filter to extensions with any of these categories */
	filterByCategories?: string[];
	
	/** Show only installed extensions */
	showOnlyInstalled?: boolean;
}

/**
 * Result of an installation, update, or uninstallation operation.
 * Contains success/failure status and details about what happened.
 * 
 * @example
 * ```typescript
 * const result: InstallationOutcome = {
 *   operationSucceeded: true,
 *   affectedExtensionId: "daily-journal-helper",
 *   modifiedFilePaths: ["Reference/Agents/daily-journal.agent.md"],
 *   errorDetails: undefined
 * };
 * ```
 */
export interface InstallationOutcome {
	/** Whether the operation completed successfully */
	operationSucceeded: boolean;
	
	/** ID of the extension that was operated on */
	affectedExtensionId: string;
	
	/** List of file paths that were created, modified, or deleted */
	modifiedFilePaths: string[];
	
	/** Error message if operation failed */
	errorDetails?: string;
}

/**
 * Information about an available update for an installed extension.
 * 
 * @example
 * ```typescript
 * const update: UpdateNotification = {
 *   extensionId: "daily-journal-helper",
 *   currentlyInstalledVersion: "1.1.0",
 *   availableNewerVersion: "1.2.0",
 *   updateDescription: "Adds new reflection prompts"
 * };
 * ```
 */
export interface UpdateNotification {
	/** ID of the extension with an update */
	extensionId: string;
	
	/** Version currently installed */
	currentlyInstalledVersion: string;
	
	/** Newer version available in catalog */
	availableNewerVersion: string;
	
	/** Optional description of what changed */
	updateDescription?: string;
}

/**
 * Type guard to check if a value is a valid VaultExtensionKind.
 * 
 * @param value - Value to check
 * @returns True if value is a valid extension kind
 * 
 * @example
 * ```typescript
 * if (isValidExtensionKind(someValue)) {
 *   // TypeScript knows someValue is VaultExtensionKind
 *   const kind: VaultExtensionKind = someValue;
 * }
 * ```
 */
export function isValidExtensionKind(value: unknown): value is VaultExtensionKind {
	return typeof value === "string" && 
		["agent", "voice-agent", "prompt", "skill", "mcp-server"].includes(value);
}

/**
 * Type guard to validate a MarketplaceExtension object.
 * Checks that all required fields are present and have correct types.
 * 
 * @param obj - Object to validate
 * @returns True if object is a valid MarketplaceExtension
 * 
 * @example
 * ```typescript
 * const data = JSON.parse(response);
 * if (isValidMarketplaceExtension(data)) {
 *   // Safe to use as MarketplaceExtension
 *   const ext: MarketplaceExtension = data;
 * }
 * ```
 */
export function isValidMarketplaceExtension(obj: unknown): obj is MarketplaceExtension {
	if (typeof obj !== "object" || obj === null) return false;
	
	const candidate = obj as Record<string, unknown>;
	
	return typeof candidate.uniqueId === "string" &&
		typeof candidate.displayTitle === "string" &&
		isValidExtensionKind(candidate.kind) &&
		typeof candidate.semanticVersion === "string" &&
		typeof candidate.briefSummary === "string" &&
		typeof candidate.creator === "object" &&
		Array.isArray(candidate.classificationTags) &&
		Array.isArray(candidate.searchKeywords) &&
		typeof candidate.publishTimestamp === "string" &&
		typeof candidate.lastModifiedTimestamp === "string" &&
		typeof candidate.totalSizeBytes === "string" &&
		typeof candidate.requiredPluginVersion === "string" &&
		typeof candidate.webDetailPage === "string" &&
		Array.isArray(candidate.packageContents) &&
		Array.isArray(candidate.requiredCapabilities) &&
		Array.isArray(candidate.dependsOnExtensions);
}

/**
 * Type guard to validate a CatalogManifest object.
 * 
 * @param obj - Object to validate
 * @returns True if object is a valid CatalogManifest
 */
export function isValidCatalogManifest(obj: unknown): obj is CatalogManifest {
	if (typeof obj !== "object" || obj === null) return false;
	
	const candidate = obj as Record<string, unknown>;
	
	return typeof candidate.schemaVersion === "string" &&
		typeof candidate.buildTimestamp === "string" &&
		Array.isArray(candidate.availableExtensions) &&
		Array.isArray(candidate.knownCategories) &&
		Array.isArray(candidate.highlightedExtensions);
}

/**
 * Transforms a raw catalog extension to the internal MarketplaceExtension format.
 * Maps field names from the GitHub Pages catalog structure to our internal schema.
 * 
 * @param raw - Raw extension data from catalog.json
 * @returns Transformed MarketplaceExtension object
 * 
 * @example
 * ```typescript
 * const rawExt = { id: "my-agent", name: "My Agent", type: "agent", ... };
 * const transformed = transformRawExtension(rawExt);
 * console.log(transformed.uniqueId); // "my-agent"
 * console.log(transformed.displayTitle); // "My Agent"
 * ```
 */
export function transformRawExtension(raw: RawCatalogExtension): MarketplaceExtension {
	return {
		uniqueId: raw.id,
		displayTitle: raw.name,
		kind: raw.type as VaultExtensionKind,
		semanticVersion: raw.version,
		briefSummary: raw.description,
		creator: {
			displayName: raw.author.name,
			profileLink: raw.author.url,
			contactEmail: raw.author.email,
		},
		classificationTags: raw.categories,
		searchKeywords: raw.tags,
		downloadMetrics: raw.downloads,
		communityRating: raw.rating,
		publishTimestamp: raw.publishedAt || new Date().toISOString(),
		lastModifiedTimestamp: raw.updatedAt || new Date().toISOString(),
		totalSizeBytes: raw.size || "0",
		requiredPluginVersion: raw.minVaultCopilotVersion || "0.0.0",
		sourceRepository: raw.repository,
		webDetailPage: raw.detailPageUrl || `https://danielshue.github.io/vault-copilot-extensions/extensions/${raw.type}s/${raw.id}/`,
		packageContents: raw.files.map(file => {
			// If installPath is a directory (ends with /), append the source filename
			let targetLocation = file.installPath;
			if (targetLocation.endsWith('/')) {
				targetLocation = targetLocation + file.source;
			}
			return {
				relativePath: file.source,
				downloadSource: file.downloadUrl,
				targetLocation,
			};
		}),
		requiredCapabilities: raw.tools || [],
		dependsOnExtensions: raw.dependencies || [],
		previewImageUrl: raw.preview,
	};
}

/**
 * Transforms a raw catalog response to the internal CatalogManifest format.
 * Maps field names and transforms all extensions in the catalog.
 * 
 * @param raw - Raw catalog data from catalog.json
 * @returns Transformed CatalogManifest object
 * 
 * @example
 * ```typescript
 * const response = await fetch("catalog.json");
 * const rawData = await response.json() as RawCatalogResponse;
 * const catalog = transformRawCatalog(rawData);
 * console.log(catalog.availableExtensions.length);
 * ```
 */
export function transformRawCatalog(raw: RawCatalogResponse): CatalogManifest {
	return {
		schemaVersion: raw.version,
		buildTimestamp: raw.generated,
		availableExtensions: raw.extensions.map(transformRawExtension),
		knownCategories: raw.categories,
		highlightedExtensions: raw.featured,
	};
}
