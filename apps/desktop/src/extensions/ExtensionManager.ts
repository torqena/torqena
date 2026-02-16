/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module extensions/ExtensionManager
 * @description Manages installation, updates, and tracking of extensions
 * 
 * This service orchestrates all extension lifecycle operations:
 * - Installation with dependency resolution
 * - Uninstallation with cleanup
 * - Updates with version checking
 * - Rollback on failures
 * - MCP server configuration merging
 */

import { App, TFile, Vault } from "obsidian";
import { httpRequest } from "../utils/http";
import { FileConflictModal, FileConflictResolution } from "./FileConflictModal";
import { ExtensionAnalyticsService } from "./ExtensionAnalyticsService";
import { isMobile } from "../utils/platform";
import {
	MarketplaceExtension,
	LocalExtensionRecord,
	InstallationOutcome,
	UpdateNotification,
} from "./types";

/**
 * Structure of the tracking file stored in .obsidian/torqena-extensions.json
 */
interface TrackingFileData {
	/** Version of the tracking file format */
	formatVersion: string;
	
	/** Map of extension ID to installation record */
	installedExtensions: Record<string, LocalExtensionRecord>;
}

/**
 * Manages the lifecycle of extensions in the vault.
 * Handles installation, uninstallation, updates, and tracking.
 * 
 * @example
 * ```typescript
 * const manager = new ExtensionManager(app, plugin);
 * await manager.initialize();
 * 
 * // Install an extension
 * const result = await manager.installExtension(extensionManifest);
 * if (result.operationSucceeded) {
 *   console.log("Extension installed successfully");
 * }
 * 
 * // Check for updates
 * const updates = await manager.checkForUpdates(catalogService);
 * console.log(`Found ${updates.length} updates available`);
 * ```
 */
export class ExtensionManager {
	private app: App;
	private plugin: any; // VaultCopilotPlugin - using any to avoid circular dependency
	private trackingFilePath: string;
	private installedExtensionsMap: Map<string, LocalExtensionRecord>;
	/** Analytics service for tracking installs/uninstalls/ratings */
	private analyticsService: ExtensionAnalyticsService | null = null;
	/** Whether analytics is enabled */
	private analyticsEnabled: boolean;
	/** User hash for analytics (cached) */
	private cachedUserHash: string | null = null;
	/** Plugin version for analytics */
	private pluginVersion: string;
	
	/**
	 * Creates a new ExtensionManager.
	 * 
	 * @param app - Obsidian App instance
	 * @param options - Optional configuration for analytics and plugin reference
	 */
	constructor(app: App, options?: {
		plugin?: any; // VaultCopilotPlugin
		enableAnalytics?: boolean;
		analyticsEndpoint?: string;
		githubUsername?: string;
		anonymousId?: string;
		pluginVersion?: string;
	}) {
		this.app = app;
		this.plugin = options?.plugin;
		this.trackingFilePath = ".obsidian/torqena-extensions.json";
		this.installedExtensionsMap = new Map();
		this.analyticsEnabled = options?.enableAnalytics !== false;
		this.pluginVersion = options?.pluginVersion || '0.0.0';
		
		if (this.analyticsEnabled && options?.analyticsEndpoint) {
			this.analyticsService = new ExtensionAnalyticsService(options.analyticsEndpoint);
		}
		
		// Pre-compute user hash if username provided
		if (options?.githubUsername) {
			this.computeUserHash(options.githubUsername).then(hash => {
				this.cachedUserHash = hash;
				// Set authenticated user in analytics service
				if (this.analyticsService) {
					this.analyticsService.setAuthenticatedUser(hash);
				}
			});
		} else if (options?.anonymousId) {
			this.cachedUserHash = options.anonymousId;
			// Set authenticated user in analytics service
			if (this.analyticsService) {
				this.analyticsService.setAuthenticatedUser(options.anonymousId);
			}
		} else if (this.analyticsEnabled) {
			// Auto-generate anonymous ID if analytics is enabled but no user identifier provided
			this.cachedUserHash = this.generateAnonymousId();
			console.log('[ExtensionManager] Auto-generated anonymous ID for analytics');
			// Set authenticated user in analytics service
			if (this.analyticsService) {
				this.analyticsService.setAuthenticatedUser(this.cachedUserHash);
			}
		}
	}
	
	/**
	 * Initializes the extension manager.
	 * Loads the tracking file and populates the installed extensions map.
	 * 
	 * @example
	 * ```typescript
	 * const manager = new ExtensionManager(app);
	 * await manager.initialize();
	 * ```
	 */
	async initialize(): Promise<void> {
		await this.loadTrackingFile();
	}
	
	/**
	 * Gets all currently installed extensions.
	 * 
	 * @returns Map of extension ID to installation record
	 * 
	 * @example
	 * ```typescript
	 * const installed = await manager.getInstalledExtensions();
	 * for (const [id, record] of installed) {
	 *   console.log(`${id}: v${record.installedVersion}`);
	 * }
	 * ```
	 */
	async getInstalledExtensions(): Promise<Map<string, LocalExtensionRecord>> {
		return new Map(this.installedExtensionsMap);
	}
	
	/**
	 * Checks if an extension is installed.
	 * 
	 * @param extensionId - Unique identifier of the extension
	 * @returns True if installed, false otherwise
	 * 
	 * @example
	 * ```typescript
	 * if (manager.isInstalled("daily-journal-helper")) {
	 *   console.log("Extension is already installed");
	 * }
	 * ```
	 */
	isInstalled(extensionId: string): boolean {
		return this.installedExtensionsMap.has(extensionId);
	}
	
	/**
	 * Gets the installed version of an extension.
	 * 
	 * @param extensionId - Unique identifier of the extension
	 * @returns Version string if installed, null otherwise
	 * 
	 * @example
	 * ```typescript
	 * const version = manager.getInstalledVersion("daily-journal-helper");
	 * console.log(`Installed version: ${version}`);
	 * ```
	 */
	getInstalledVersion(extensionId: string): string | null {
		const record = this.installedExtensionsMap.get(extensionId);
		return record ? record.installedVersion : null;
	}
	
	/**
	 * Installs an extension from the marketplace.
	 * Downloads files, resolves dependencies, and updates tracking.
	 * 
	 * @param manifest - Extension manifest from catalog
	 * @returns Promise resolving to installation outcome
	 * 
	 * @example
	 * ```typescript
	 * const result = await manager.installExtension(extension);
	 * if (!result.operationSucceeded) {
	 *   console.error(`Installation failed: ${result.errorDetails}`);
	 * }
	 * ```
	 */
	async installExtension(manifest: MarketplaceExtension): Promise<InstallationOutcome> {
		try {
			console.log(`[ExtensionManager] Starting installation of ${manifest.uniqueId}`);
			
			// Check if already installed
			if (this.isInstalled(manifest.uniqueId)) {
				return {
					operationSucceeded: false,
					affectedExtensionId: manifest.uniqueId,
					modifiedFilePaths: [],
					errorDetails: "Extension is already installed. Use update instead.",
				};
			}
			
			// Check for dependency circular references FIRST
			const circularDeps = this.detectCircularDependencies(manifest.uniqueId, manifest.dependsOnExtensions);
			if (circularDeps.length > 0) {
				return {
					operationSucceeded: false,
					affectedExtensionId: manifest.uniqueId,
					modifiedFilePaths: [],
					errorDetails: `Circular dependency detected: ${circularDeps.join(" → ")}`,
				};
			}
			
			// Then check and validate dependencies
			for (const depId of manifest.dependsOnExtensions) {
				if (!this.isInstalled(depId)) {
					return {
						operationSucceeded: false,
						affectedExtensionId: manifest.uniqueId,
						modifiedFilePaths: [],
						errorDetails: `Missing dependency: ${depId}. Please install it first.`,
					};
				}
			}
			
			// Download all files
			const downloadedFiles: Array<{ content: string; targetPath: string }> = [];
			for (const file of manifest.packageContents) {
				console.log(`[ExtensionManager] Downloading ${file.relativePath} from ${file.downloadSource}`);
				try {
					const content = await this.downloadFile(file.downloadSource);
					console.log(`[ExtensionManager] Successfully downloaded ${file.relativePath} (${content.length} bytes)`);
					downloadedFiles.push({
						content,
						targetPath: file.targetLocation,
					});
				} catch (downloadError) {
					const errorMsg = downloadError instanceof Error ? downloadError.message : String(downloadError);
					console.error(`[ExtensionManager] Download failed for ${file.relativePath}:`, downloadError);
					throw new Error(`Failed to download ${file.relativePath}: ${errorMsg}`);
				}
			}
			
			// Install files to vault (with conflict resolution)
			const installedPaths: string[] = [];
			for (const file of downloadedFiles) {
				try {
					console.log(`[ExtensionManager] Installing to: ${file.targetPath}`);
					
					// Validate path is not a directory
					if (file.targetPath.endsWith('/')) {
						throw new Error(`Invalid file path (appears to be a directory): ${file.targetPath}`);
					}
					
					// Check if file already exists
					const existing = this.app.vault.getAbstractFileByPath(file.targetPath);
					let finalPath = file.targetPath;
					
					if (existing) {
						if (existing instanceof TFile) {
							// File exists - ask user what to do
							console.log(`[ExtensionManager] File already exists: ${file.targetPath}, showing conflict resolution modal`);
							const resolution = await FileConflictModal.show(this.app, file.targetPath);
							
							if (resolution.action === "cancel") {
								throw new Error(`Installation cancelled by user (file conflict at ${file.targetPath})`);
							} else if (resolution.action === "rename") {
								finalPath = resolution.newPath;
								console.log(`[ExtensionManager] User chose to rename to: ${finalPath}`);
							} else {
								console.log(`[ExtensionManager] User chose to override existing file`);
							}
						} else {
							// Path exists but is not a file (probably a folder)
							throw new Error(`Path exists as a folder, not a file: ${file.targetPath}`);
						}
					}
					
					await this.writeFileToVault(finalPath, file.content);
					console.log(`[ExtensionManager] Successfully wrote file: ${finalPath}`);
					installedPaths.push(finalPath);
				} catch (writeError) {
					console.error(`[ExtensionManager] Failed to write ${file.targetPath}:`, writeError);
					throw new Error(`Failed to write ${file.targetPath}: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
				}
			}
			
			console.log(`[ExtensionManager] Successfully downloaded and installed ${installedPaths.length} file(s)`);
			
			// Update tracking file
			const record: LocalExtensionRecord = {
				extensionId: manifest.uniqueId,
				extensionKind: manifest.kind,
				installedVersion: manifest.semanticVersion,
				installationTimestamp: new Date().toISOString(),
				installedFilePaths: installedPaths,
				linkedDependencies: manifest.dependsOnExtensions,
			};
			
			this.installedExtensionsMap.set(manifest.uniqueId, record);
			await this.saveTrackingFile();
			
			console.log(`[ExtensionManager] Installation of ${manifest.uniqueId} completed successfully`);
			
			// Handle automation extension registration
			if (manifest.kind === 'automation' && this.plugin) {
				try {
					const { handleAutomationInstall } = await import('../automation/AutomationIntegration');
					await handleAutomationInstall(this.app, this.plugin, manifest);
				} catch (error) {
					console.error(`[ExtensionManager] Failed to register automation:`, error);
					// Don't fail the installation, but warn the user
				}
			}
			
			// Track install analytics (fire-and-forget, don't fail installation)
			this.trackInstallAnalytics(manifest.uniqueId, manifest.semanticVersion)
				.catch(err => console.log('[ExtensionManager] Analytics tracking failed:', err));
			
			return {
				operationSucceeded: true,
				affectedExtensionId: manifest.uniqueId,
				modifiedFilePaths: installedPaths,
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`[ExtensionManager] Installation of ${manifest.uniqueId} failed:`, error);
			
			return {
				operationSucceeded: false,
				affectedExtensionId: manifest.uniqueId,
				modifiedFilePaths: [],
				errorDetails: errorMsg,
			};
		}
	}
	
	/**
	 * Uninstalls an extension from the vault.
	 * Removes files and updates tracking.
	 * 
	 * @param extensionId - Unique identifier of the extension to uninstall
	 * @returns Promise resolving to uninstallation outcome
	 * 
	 * @example
	 * ```typescript
	 * const result = await manager.uninstallExtension("daily-journal-helper");
	 * if (result.operationSucceeded) {
	 *   console.log("Extension removed successfully");
	 * }
	 * ```
	 */
	async uninstallExtension(extensionId: string): Promise<InstallationOutcome> {
		try {
			console.log(`[ExtensionManager] Starting uninstall of ${extensionId}`);
			
			// Check if installed
			const record = this.installedExtensionsMap.get(extensionId);
			if (!record) {
				console.log(`[ExtensionManager] Extension not installed: ${extensionId}`);
				return {
					operationSucceeded: false,
					affectedExtensionId: extensionId,
					modifiedFilePaths: [],
					errorDetails: "Extension is not installed",
				};
			}
			
			// Check if other extensions depend on this one
			const dependents = this.findDependentExtensions(extensionId);
			if (dependents.length > 0) {
				console.log(`[ExtensionManager] Cannot uninstall ${extensionId}: required by ${dependents.join(", ")}`);
				return {
					operationSucceeded: false,
					affectedExtensionId: extensionId,
					modifiedFilePaths: [],
					errorDetails: `Cannot uninstall: Required by ${dependents.join(", ")}`,
				};
			}
			
			// Handle automation extension unregistration BEFORE removing files
			if (record.extensionKind === 'automation' && this.plugin) {
				try {
					const { handleAutomationUninstall } = await import('../automation/AutomationIntegration');
					await handleAutomationUninstall(this.app, this.plugin, extensionId);
				} catch (error) {
					console.error(`[ExtensionManager] Failed to unregister automation:`, error);
					// Continue with uninstall even if unregistration fails
				}
			}
			
			// Remove all installed files
			const removedPaths: string[] = [];
			for (const filePath of record.installedFilePaths) {
				console.log(`[ExtensionManager] Deleting file: ${filePath}`);
				await this.deleteFileFromVault(filePath);
				removedPaths.push(filePath);
			}
			
			console.log(`[ExtensionManager] Deleted ${removedPaths.length} file(s)`);
			
			// Update tracking file
			this.installedExtensionsMap.delete(extensionId);
			console.log(`[ExtensionManager] Updating tracking file...`);
			await this.saveTrackingFile();
			console.log(`[ExtensionManager] Tracking file updated successfully`);
			
			// Track uninstall analytics (fire-and-forget)
			this.trackUninstallAnalytics(extensionId)
				.catch(err => console.log('[ExtensionManager] Analytics tracking failed:', err));
			
			return {
				operationSucceeded: true,
				affectedExtensionId: extensionId,
				modifiedFilePaths: removedPaths,
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`[ExtensionManager] Uninstall of ${extensionId} failed:`, error);
			
			return {
				operationSucceeded: false,
				affectedExtensionId: extensionId,
				modifiedFilePaths: [],
				errorDetails: errorMsg,
			};
		}
	}
	
	/**
	 * Updates an extension to a new version.
	 * Uninstalls old version and installs new version.
	 * 
	 * @param extensionId - Unique identifier of the extension
	 * @param newManifest - New version manifest from catalog
	 * @returns Promise resolving to update outcome
	 * 
	 * @example
	 * ```typescript
	 * const result = await manager.updateExtension("daily-journal-helper", newManifest);
	 * ```
	 */
	async updateExtension(
		extensionId: string,
		newManifest: MarketplaceExtension
	): Promise<InstallationOutcome> {
		try {
			// Check if installed
			if (!this.isInstalled(extensionId)) {
				return {
					operationSucceeded: false,
					affectedExtensionId: extensionId,
					modifiedFilePaths: [],
					errorDetails: "Extension is not installed. Use install instead.",
				};
			}
			
			// Backup current installation for rollback
			const backupRecord = this.installedExtensionsMap.get(extensionId)!;
			
			// Uninstall old version
			const uninstallResult = await this.uninstallExtension(extensionId);
			if (!uninstallResult.operationSucceeded) {
				return uninstallResult;
			}
			
			// Install new version
			const installResult = await this.installExtension(newManifest);
			
			// If installation failed, attempt rollback
			if (!installResult.operationSucceeded) {
				// Restore backup
				this.installedExtensionsMap.set(extensionId, backupRecord);
				await this.saveTrackingFile();
				
				return {
					operationSucceeded: false,
					affectedExtensionId: extensionId,
					modifiedFilePaths: [],
					errorDetails: `Update failed: ${installResult.errorDetails}. Old version restored.`,
				};
			}
			
			console.log(`Extension "${newManifest.displayTitle}" updated successfully`);
			
			return {
				operationSucceeded: true,
				affectedExtensionId: extensionId,
				modifiedFilePaths: installResult.modifiedFilePaths,
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			
			console.error(`Failed to update extension: ${errorMsg}`);
			
			return {
				operationSucceeded: false,
				affectedExtensionId: extensionId,
				modifiedFilePaths: [],
				errorDetails: errorMsg,
			};
		}
	}
	
	/**
	 * Checks for available updates by comparing installed versions with catalog.
	 * 
	 * @param catalogExtensions - Array of extensions from the catalog
	 * @returns Promise resolving to array of available updates
	 * 
	 * @example
	 * ```typescript
	 * const catalog = await catalogService.fetchCatalog();
	 * const updates = await manager.checkForUpdates(catalog.availableExtensions);
	 * console.log(`${updates.length} updates available`);
	 * ```
	 */
	async checkForUpdates(catalogExtensions: MarketplaceExtension[]): Promise<UpdateNotification[]> {
		const updates: UpdateNotification[] = [];
		
		for (const [extensionId, record] of this.installedExtensionsMap) {
			const catalogVersion = catalogExtensions.find((ext) => ext.uniqueId === extensionId);
			
			if (catalogVersion && catalogVersion.semanticVersion !== record.installedVersion) {
				// Simple version comparison (assumes semver format)
				if (this.isNewerVersion(catalogVersion.semanticVersion, record.installedVersion)) {
					updates.push({
						extensionId,
						currentlyInstalledVersion: record.installedVersion,
						availableNewerVersion: catalogVersion.semanticVersion,
					});
				}
			}
		}
		
		return updates;
	}
	
	/**
	 * Gets the analytics service for external use (e.g., rating modal).
	 * 
	 * @returns The analytics service, or null if analytics is disabled.
	 */
	getAnalyticsService(): ExtensionAnalyticsService | null {
		return this.analyticsService;
	}
	
	/**
	 * Gets the cached user hash for analytics.
	 * 
	 * @returns The user hash string, or null if not available.
	 */
	getUserHash(): string | null {
		return this.cachedUserHash;
	}
	
	/**
	 * Returns whether analytics is enabled.
	 */
	isAnalyticsEnabled(): boolean {
		return this.analyticsEnabled && this.analyticsService !== null;
	}
	
	/**
	 * Performs cleanup operations on shutdown.
	 */
	async cleanup(): Promise<void> {
		// No-op for now, but available for future cleanup needs
	}
	
	// ===== Analytics Helpers =====
	
	/**
	 * Tracks an install event via the analytics service.
	 * @param extensionId - Extension that was installed
	 * @param version - Version that was installed
	 * @internal
	 */
	private async trackInstallAnalytics(extensionId: string, version: string): Promise<void> {
		if (!this.analyticsService || !this.analyticsEnabled) return;
		
		const userHash = await this.ensureUserHash();
		if (!userHash) return;
		
		await this.analyticsService.trackInstall({
			extensionId,
			version,
			userHash,
			platform: isMobile ? 'mobile' : 'desktop',
			vaultCopilotVersion: this.pluginVersion,
			timestamp: new Date().toISOString(),
		});
	}
	
	/**
	 * Tracks an uninstall event via the analytics service.
	 * @param extensionId - Extension that was uninstalled
	 * @internal
	 */
	private async trackUninstallAnalytics(extensionId: string): Promise<void> {
		if (!this.analyticsService || !this.analyticsEnabled) return;
		
		const userHash = await this.ensureUserHash();
		if (!userHash) return;
		
		await this.analyticsService.trackUninstall({
			extensionId,
			userHash,
			timestamp: new Date().toISOString(),
		});
	}
	
	/**
	 * Ensures we have a user hash, generating an anonymous one if needed.
	 * @returns The user hash, or null if we can't generate one.
	 * @internal
	 */
	private async ensureUserHash(): Promise<string | null> {
		if (this.cachedUserHash) return this.cachedUserHash;
		
		// Generate anonymous ID
		const anonymousId = this.generateAnonymousId();
		this.cachedUserHash = anonymousId;
		return anonymousId;
	}
	
	/**
	 * Computes a SHA-256 hash of a username for privacy.
	 * @param username - The GitHub username to hash
	 * @returns The hex-encoded SHA-256 hash
	 * @internal
	 */
	private async computeUserHash(username: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(username.toLowerCase());
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
	}
	
	/**
	 * Generates a random anonymous ID (64-char hex string matching userHash format).
	 * @returns A random 64-character hex string
	 * @internal
	 */
	private generateAnonymousId(): string {
		const array = new Uint8Array(32);
		crypto.getRandomValues(array);
		return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
	}
	
	// ===== Private Helper Methods =====
	
	/**
	 * Loads the tracking file from disk.
	 * Uses vault adapter for direct file system access (works with .obsidian folder).
	 */
	private async loadTrackingFile(): Promise<void> {
		console.log(`[ExtensionManager] Loading tracking file from: ${this.trackingFilePath}`);
		try {
			// Use adapter for direct file access (getAbstractFileByPath doesn't work for .obsidian)
			const exists = await this.app.vault.adapter.exists(this.trackingFilePath);
			
			if (!exists) {
				console.log(`[ExtensionManager] Tracking file does not exist yet`);
				this.installedExtensionsMap.clear();
				return;
			}
			
			console.log(`[ExtensionManager] Tracking file found, reading...`);
			const content = await this.app.vault.adapter.read(this.trackingFilePath);
			
			// Validate content before parsing
			if (!content || content.trim().length === 0) {
				console.warn("[ExtensionManager] Tracking file is empty, starting fresh");
				this.installedExtensionsMap.clear();
				return;
			}
			
			try {
				const data: TrackingFileData = JSON.parse(content);
				
				// Validate structure
				if (!data || typeof data !== 'object' || !data.installedExtensions) {
					console.warn("[ExtensionManager] Tracking file has invalid structure, starting fresh");
					this.installedExtensionsMap.clear();
					return;
				}
				
				// Populate map from tracking file
				const extensionCount = Object.keys(data.installedExtensions).length;
				console.log(`[ExtensionManager] Found ${extensionCount} installed extensions in tracking file`);
				for (const [id, record] of Object.entries(data.installedExtensions)) {
					this.installedExtensionsMap.set(id, record);
					console.log(`[ExtensionManager] Loaded extension: ${id} (v${record.installedVersion})`);
				}
				console.log(`[ExtensionManager] Successfully loaded ${this.installedExtensionsMap.size} extensions`);
			} catch (parseError) {
				console.error("[ExtensionManager] Failed to parse tracking file:", parseError);
				console.error("[ExtensionManager] Content preview:", content.substring(0, 100));
				// Delete corrupted file and start fresh
				await this.app.vault.adapter.remove(this.trackingFilePath);
				this.installedExtensionsMap.clear();
			}
		} catch (error) {
			// Tracking file doesn't exist or other error - start fresh
			console.warn("[ExtensionManager] Error loading tracking file:", error);
			this.installedExtensionsMap.clear();
		}
	}
	
	/**
	 * Saves the tracking file to disk.
	 * Uses vault adapter for direct file system access (works with .obsidian folder).
	 */
	private async saveTrackingFile(): Promise<void> {
		const data: TrackingFileData = {
			formatVersion: "1.0",
			installedExtensions: Object.fromEntries(this.installedExtensionsMap),
		};
		
		const content = JSON.stringify(data, null, 2);
		
		try {
			// Use adapter for direct file access (works with .obsidian folder)
			console.log(`[ExtensionManager] Saving tracking file with ${this.installedExtensionsMap.size} extensions...`);
			await this.app.vault.adapter.write(this.trackingFilePath, content);
			console.log(`[ExtensionManager] Tracking file saved successfully`);
		} catch (error) {
			console.error(`[ExtensionManager] saveTrackingFile error:`, error);
		}
	}
	
	/**
	 * Downloads a file from a URL.
	 */
	private async downloadFile(url: string): Promise<string> {
		try {
			console.log(`[ExtensionManager] HTTP GET ${url}`);
			const response = await httpRequest<string>({
				url,
				method: "GET",
				timeout: 30000,
			});
			
			console.log(`[ExtensionManager] HTTP ${response.status} from ${url}`);
			
			// Check for non-200 status codes
			if (response.status < 200 || response.status >= 300) {
				throw new Error(`HTTP ${response.status}: Failed to download from ${url}`);
			}
			
			if (typeof response.data === "string") {
				// Validate that we didn't get an HTML error page
				const trimmed = response.data.trim();
				if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE')) {
					throw new Error(`Received HTML instead of file content from ${url}. The extension files may not be published yet.`);
				}
				return response.data;
			}
			
			// If response is JSON, stringify it
			return JSON.stringify(response.data);
		} catch (error) {
			console.error(`[ExtensionManager] Download error for ${url}:`, error);
			if (error instanceof Error) {
				throw error;
			}
			throw new Error(`Failed to download ${url}: ${String(error)}`);
		}
	}
	
	/**
	 * Writes a file to the vault, creating parent folders if needed.
	 */
	private async writeFileToVault(path: string, content: string): Promise<void> {
		console.log(`[ExtensionManager] writeFileToVault called with path: "${path}"`);
		
		const existing = this.app.vault.getAbstractFileByPath(path);
		
		if (existing instanceof TFile) {
			// File exists, overwrite it
			console.log(`[ExtensionManager] File exists, modifying: ${path}`);
			await this.app.vault.modify(existing, content);
		} else if (existing) {
			// Path exists but is not a file (probably a folder)
			throw new Error(`Path exists but is not a file: ${path}`);
		} else {
			// Create new file
			console.log(`[ExtensionManager] Creating new file: ${path}`);
			// Ensure parent directories exist.
			// Use adapter.exists() instead of vault.getAbstractFileByPath() because
			// the vault API doesn't see hidden folders like .obsidian/.
			const pathParts = path.split('/');
			const parentPath = pathParts.slice(0, -1).join('/');
			if (parentPath) {
				const exists = await this.app.vault.adapter.exists(parentPath);
				if (!exists) {
					console.log(`[ExtensionManager] Creating parent folders: ${parentPath}`);
					try {
						await this.app.vault.createFolder(parentPath);
					} catch {
						// Folder may have been created concurrently — ignore
					}
				}
			}

			if (path.startsWith('.obsidian/')) {
				// Hidden config paths – write via adapter to avoid vault API issues
				await this.app.vault.adapter.write(path, content);
			} else {
				await this.app.vault.create(path, content);
			}
		}
	}
	
	/**
	 * Deletes a file from the vault.
	 */
	private async deleteFileFromVault(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		
		if (file instanceof TFile) {
			await this.app.vault.delete(file);
		}
	}
	
	/**
	 * Detects circular dependencies in the dependency tree.
	 */
	private detectCircularDependencies(
		extensionId: string,
		dependencies: string[],
		visitedChain: string[] = []
	): string[] {
		// Check if this extension is already in the visited chain
		if (visitedChain.includes(extensionId)) {
			return [...visitedChain, extensionId]; // Circular dependency found
		}
		
		const newChain = [...visitedChain, extensionId];
		
		// Check each dependency
		for (const depId of dependencies) {
			const depRecord = this.installedExtensionsMap.get(depId);
			if (depRecord && depRecord.linkedDependencies.length > 0) {
				const circular = this.detectCircularDependencies(
					depId,
					depRecord.linkedDependencies,
					newChain
				);
				if (circular.length > 0) {
					return circular;
				}
			}
		}
		
		return []; // No circular dependency
	}
	
	/**
	 * Finds all extensions that depend on a given extension.
	 */
	private findDependentExtensions(extensionId: string): string[] {
		const dependents: string[] = [];
		
		for (const [id, record] of this.installedExtensionsMap) {
			if (record.linkedDependencies.includes(extensionId)) {
				dependents.push(id);
			}
		}
		
		return dependents;
	}
	
	/**
	 * Compares two semantic versions.
	 * 
	 * @returns True if newVersion is newer than currentVersion
	 */
	private isNewerVersion(newVersion: string, currentVersion: string): boolean {
		const parseVersion = (v: string) => {
			const parts = v.split(".").map(Number);
			return {
				major: parts[0] || 0,
				minor: parts[1] || 0,
				patch: parts[2] || 0,
			};
		};
		
		const newVer = parseVersion(newVersion);
		const curVer = parseVersion(currentVersion);
		
		if (newVer.major !== curVer.major) return newVer.major > curVer.major;
		if (newVer.minor !== curVer.minor) return newVer.minor > curVer.minor;
		return newVer.patch > curVer.patch;
	}
}
