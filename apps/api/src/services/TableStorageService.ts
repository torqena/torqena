/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module TableStorageService
 * @description Azure Table Storage service for the analytics API.
 *
 * Manages three tables — **Installs**, **Ratings**, and **MetricsCache** — and
 * exposes high-level CRUD helpers consumed by the HTTP function handlers.
 *
 * Authentication uses `DefaultAzureCredential` (Managed Identity / AZ CLI)
 * because the storage account has `allowSharedKeyAccess: false`.
 *
 * @example
 * ```typescript
 * const svc = TableStorageService.getInstance();
 * await svc.ensureTablesExist();
 * await svc.trackInstall({ extensionId: "my-ext", ... });
 * ```
 *
 * @since 1.0.0
 */

import { TableClient, TableEntity, odata, AzureNamedKeyCredential } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

// ---------------------------------------------------------------------------
// Entity interfaces
// ---------------------------------------------------------------------------

/** Shape of a row in the Installs table. */
export interface InstallEntity extends TableEntity {
    partitionKey: string; // extensionId
    rowKey: string;       // `${userHash}_${sanitizedTimestamp}`
    UserHash: string;
    Version: string;
    Platform: string;
    VaultCopilotVersion: string;
    InstallDate: string;
    IsActive: boolean;
    UninstallDate?: string;
}

/** Shape of a row in the Ratings table. */
export interface RatingEntity extends TableEntity {
    partitionKey: string; // extensionId
    rowKey: string;       // userHash
    Rating: number;
    Comment?: string;
    Version: string;
    SubmittedDate: string;
    UpdatedDate: string;
}

/** Shape of a row in the MetricsCache table. */
export interface MetricsCacheEntity extends TableEntity {
    partitionKey: string; // extensionId
    rowKey: string;       // "summary"
    TotalInstalls: number;
    ActiveInstalls: number;
    AverageRating: number;
    RatingCount: number;
    LastUpdated: string;
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

/** Payload accepted by {@link TableStorageService.trackInstall}. */
export interface TrackInstallEvent {
    extensionId: string;
    userHash: string;
    version: string;
    platform: string;
    vaultCopilotVersion: string;
}

/** Payload accepted by {@link TableStorageService.submitRating}. */
export interface RatingSubmission {
    extensionId: string;
    userHash: string;
    rating: number;
    comment?: string;
    version: string;
}

/** Aggregated metrics returned to the client. */
export interface ExtensionMetrics {
    extensionId: string;
    totalInstalls: number;
    activeInstalls: number;
    averageRating: number;
    ratingCount: number;
    lastUpdated: string;
}

/** Data belonging to a single user (for GDPR export). */
export interface UserData {
    userHash: string;
    installs: InstallEntity[];
    ratings: RatingEntity[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Singleton service that wraps Azure Table Storage operations.
 *
 * All public methods are `async` and throw on unrecoverable errors; callers
 * are expected to catch and map to HTTP responses.
 */
export class TableStorageService {
    private static instance: TableStorageService | null = null;

    private readonly installsClient: TableClient;
    private readonly ratingsClient: TableClient;
    private readonly metricsCacheClient: TableClient;

    /**
     * Construct a new service instance.
     *
     * Supports dual-mode authentication:
     * - Local development: HTTP endpoint to Azurite with AzureNamedKeyCredential
     * - Production: HTTPS endpoint with DefaultAzureCredential (Managed Identity)
     *
     * @internal – use {@link getInstance} instead.
     */
    private constructor() {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

        if (connectionString) {
            // Parse connection string for local Azurite development
            const accountMatch = connectionString.match(/AccountName=([^;]+)/);
            const keyMatch = connectionString.match(/AccountKey=([^;]+)/);
            const endpointMatch = connectionString.match(/TableEndpoint=([^;]+)/);
            
            if (!accountMatch || !keyMatch || !endpointMatch) {
                throw new Error("Invalid AZURE_STORAGE_CONNECTION_STRING format");
            }
            
            const accountName = accountMatch[1];
            const accountKey = keyMatch[1];
            let tableEndpoint = endpointMatch[1];
            
            // Ensure endpoint doesn't have trailing slash  
            if (tableEndpoint.endsWith("/")) {
                tableEndpoint = tableEndpoint.slice(0, -1);
            }
            
            // Add account name to path if not already there (for Azurite)
            if (!tableEndpoint.includes(accountName)) {
                tableEndpoint = `${tableEndpoint}/${accountName}`;
            }
            
            const credential = new AzureNamedKeyCredential(accountName, accountKey);
            
            this.installsClient = new TableClient(tableEndpoint, "Installs", credential, {
                allowInsecureConnection: true,
            });
            this.ratingsClient = new TableClient(tableEndpoint, "Ratings", credential, {
                allowInsecureConnection: true,
            });
            this.metricsCacheClient = new TableClient(tableEndpoint, "MetricsCache", credential, {
                allowInsecureConnection: true,
            });
        } else {
            // Production: use DefaultAzureCredential (Managed Identity)
            const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
            if (!accountName) {
                throw new Error("Either AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME must be set");
            }

            const endpoint = `https://${accountName}.table.core.windows.net`;
            const credential = new DefaultAzureCredential();

            this.installsClient = new TableClient(endpoint, "Installs", credential);
            this.ratingsClient = new TableClient(endpoint, "Ratings", credential);
            this.metricsCacheClient = new TableClient(endpoint, "MetricsCache", credential);
        }
    }

    /**
     * Return the singleton instance, creating it on first call.
     *
     * @returns The shared {@link TableStorageService}.
     *
     * @example
     * ```typescript
     * const svc = TableStorageService.getInstance();
     * ```
     */
    public static getInstance(): TableStorageService {
        if (!TableStorageService.instance) {
            TableStorageService.instance = new TableStorageService();
        }
        return TableStorageService.instance;
    }

    /**
     * Reset the singleton (for testing purposes).
     * @internal
     */
    public static resetInstance(): void {
        TableStorageService.instance = null;
    }

    // -----------------------------------------------------------------------
    // Table bootstrapping
    // -----------------------------------------------------------------------

    /**
     * Create the backing tables if they do not already exist.
     *
     * Safe to call multiple times — Azure Table Storage ignores duplicate
     * create requests.
     *
     * @example
     * ```typescript
     * await svc.ensureTablesExist();
     * ```
     */
    public async ensureTablesExist(): Promise<void> {
        await Promise.all([
            this.installsClient.createTable(),
            this.ratingsClient.createTable(),
            this.metricsCacheClient.createTable(),
        ]);
    }

    // -----------------------------------------------------------------------
    // Installs
    // -----------------------------------------------------------------------

    /**
     * Record a new extension installation.
     *
     * Inserts a row into the **Installs** table and refreshes the metrics
     * cache for the extension.
     *
     * @param event - The install event payload.
     *
     * @example
     * ```typescript
     * await svc.trackInstall({
     *     extensionId: "my-ext",
     *     userHash: "abc...def",
     *     version: "1.0.0",
     *     platform: "desktop",
     *     vaultCopilotVersion: "0.1.0",
     * });
     * ```
     */
    public async trackInstall(event: TrackInstallEvent): Promise<void> {
        const now = new Date().toISOString();
        const sanitizedTimestamp = now.replace(/:/g, "-");

        const entity: InstallEntity = {
            partitionKey: event.extensionId,
            rowKey: `${event.userHash}_${sanitizedTimestamp}`,
            UserHash: event.userHash,
            Version: event.version,
            Platform: event.platform,
            VaultCopilotVersion: event.vaultCopilotVersion,
            InstallDate: now,
            IsActive: true,
        };

        await this.installsClient.createEntity(entity);
        await this.refreshMetricsCache(event.extensionId);
    }

    /**
     * Mark the most recent active install for a user as inactive (uninstall).
     *
     * Scans the Installs partition for the extension, finds the latest
     * active row for the given user, and updates it.
     *
     * @param extensionId - The extension being uninstalled.
     * @param userHash    - The user performing the uninstall.
     *
     * @example
     * ```typescript
     * await svc.trackUninstall("my-ext", "abc...def");
     * ```
     */
    public async trackUninstall(extensionId: string, userHash: string): Promise<void> {
        const now = new Date().toISOString();

        // Find all installs for this user+extension
        const entities: InstallEntity[] = [];
        const query = this.installsClient.listEntities<InstallEntity>({
            queryOptions: {
                filter: odata`PartitionKey eq ${extensionId} and IsActive eq true and UserHash eq ${userHash}`,
            },
        });

        for await (const entity of query) {
            entities.push(entity);
        }

        if (entities.length === 0) {
            return; // nothing to uninstall
        }

        // Sort by InstallDate descending, mark the latest one inactive
        entities.sort((a, b) => (b.InstallDate ?? "").localeCompare(a.InstallDate ?? ""));
        const latest = entities[0];

        await this.installsClient.updateEntity(
            {
                partitionKey: latest.partitionKey,
                rowKey: latest.rowKey,
                IsActive: false,
                UninstallDate: now,
            },
            "Merge",
        );

        await this.refreshMetricsCache(extensionId);
    }

    // -----------------------------------------------------------------------
    // Ratings
    // -----------------------------------------------------------------------

    /**
     * Submit or update a rating for an extension.
     *
     * Uses an upsert so each user can have at most one rating per extension.
     * After writing, the metrics cache is refreshed.
     *
     * @param submission - The rating payload.
     * @returns The updated aggregate rating and count.
     *
     * @example
     * ```typescript
     * const { averageRating, ratingCount } = await svc.submitRating({
     *     extensionId: "my-ext",
     *     userHash: "abc...def",
     *     rating: 5,
     *     comment: "Great!",
     *     version: "1.0.0",
     * });
     * ```
     */
    public async submitRating(
        submission: RatingSubmission,
    ): Promise<{ averageRating: number; ratingCount: number }> {
        const now = new Date().toISOString();

        // Check if rating already exists to preserve SubmittedDate
        let submittedDate = now;
        try {
            const existing = await this.ratingsClient.getEntity<RatingEntity>(
                submission.extensionId,
                submission.userHash,
            );
            submittedDate = (existing.SubmittedDate as string) ?? now;
        } catch {
            // Entity doesn't exist yet — first rating
        }

        const entity: RatingEntity = {
            partitionKey: submission.extensionId,
            rowKey: submission.userHash,
            Rating: submission.rating,
            Comment: submission.comment ?? "",
            Version: submission.version,
            SubmittedDate: submittedDate,
            UpdatedDate: now,
        };

        await this.ratingsClient.upsertEntity(entity, "Replace");
        await this.refreshMetricsCache(submission.extensionId);

        const metrics = await this.getMetrics(submission.extensionId);
        return {
            averageRating: metrics.averageRating,
            ratingCount: metrics.ratingCount,
        };
    }

    /**
     * Delete a specific rating for an extension from a user.
     *
     * @param extensionId - The extension whose rating should be removed.
     * @param userHash    - The user whose rating should be removed.
     *
     * @example
     * ```typescript
     * await svc.deleteRating("my-ext", "abc...def");
     * ```
     */
    public async deleteRating(extensionId: string, userHash: string): Promise<void> {
        try {
            await this.ratingsClient.deleteEntity(extensionId, userHash);
        } catch (err: unknown) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status !== 404) {
                throw err;
            }
        }
        await this.refreshMetricsCache(extensionId);
    }

    /**
     * Retrieve all ratings (with comments) for an extension, sorted by most
     * recent first.
     *
     * @param extensionId - The extension to query.
     * @returns Array of rating objects with user hash, rating, comment, and dates.
     *
     * @example
     * ```typescript
     * const reviews = await svc.getExtensionRatings("my-ext");
     * ```
     */
    public async getExtensionRatings(
        extensionId: string,
    ): Promise<Array<{
        rating: number;
        comment: string;
        version: string;
        submittedDate: string;
        updatedDate: string;
    }>> {
        const ratings: Array<{
            rating: number;
            comment: string;
            version: string;
            submittedDate: string;
            updatedDate: string;
        }> = [];

        const query = this.ratingsClient.listEntities<RatingEntity>({
            queryOptions: {
                filter: odata`PartitionKey eq ${extensionId}`,
            },
        });

        for await (const entity of query) {
            ratings.push({
                rating: entity.Rating as number,
                comment: (entity.Comment as string) ?? "",
                version: (entity.Version as string) ?? "",
                submittedDate: (entity.SubmittedDate as string) ?? "",
                updatedDate: (entity.UpdatedDate as string) ?? "",
            });
        }

        // Sort by most recently updated first
        ratings.sort((a, b) => b.updatedDate.localeCompare(a.updatedDate));

        return ratings;
    }

    // -----------------------------------------------------------------------
    // Metrics
    // -----------------------------------------------------------------------

    /**
     * Retrieve cached metrics for a single extension.
     *
     * If the cache row does not yet exist the metrics are computed from raw
     * data and persisted for future reads.
     *
     * @param extensionId - The extension to query.
     * @returns Aggregated {@link ExtensionMetrics}.
     *
     * @example
     * ```typescript
     * const metrics = await svc.getMetrics("my-ext");
     * ```
     */
    public async getMetrics(extensionId: string): Promise<ExtensionMetrics> {
        try {
            const cached = await this.metricsCacheClient.getEntity<MetricsCacheEntity>(
                extensionId,
                "summary",
            );
            return {
                extensionId,
                totalInstalls: cached.TotalInstalls as number,
                activeInstalls: cached.ActiveInstalls as number,
                averageRating: cached.AverageRating as number,
                ratingCount: cached.RatingCount as number,
                lastUpdated: cached.LastUpdated as string,
            };
        } catch {
            // Cache miss — compute from source data
            await this.refreshMetricsCache(extensionId);
            return this.getMetrics(extensionId);
        }
    }

    /**
     * Retrieve cached metrics for multiple extensions in one call.
     *
     * @param extensionIds - Array of extension identifiers (max 50).
     * @returns A map of extensionId → {@link ExtensionMetrics}.
     *
     * @example
     * ```typescript
     * const batch = await svc.getBatchMetrics(["ext-a", "ext-b"]);
     * ```
     */
    public async getBatchMetrics(
        extensionIds: string[],
    ): Promise<Record<string, ExtensionMetrics>> {
        const results: Record<string, ExtensionMetrics> = {};

        await Promise.all(
            extensionIds.map(async (id) => {
                try {
                    results[id] = await this.getMetrics(id);
                } catch {
                    // Extension has no data yet — return zeroes
                    results[id] = {
                        extensionId: id,
                        totalInstalls: 0,
                        activeInstalls: 0,
                        averageRating: 0,
                        ratingCount: 0,
                        lastUpdated: new Date().toISOString(),
                    };
                }
            }),
        );

        return results;
    }

    // -----------------------------------------------------------------------
    // User data (GDPR)
    // -----------------------------------------------------------------------

    /**
     * Retrieve all data associated with a user hash.
     *
     * Queries both the Installs and Ratings tables. Used to fulfil GDPR
     * data-export (right of access) requests.
     *
     * @param userHash - The SHA-256 user hash.
     * @returns A {@link UserData} object containing all matching rows.
     *
     * @example
     * ```typescript
     * const data = await svc.getUserData("abc...def");
     * ```
     */
    public async getUserData(userHash: string): Promise<UserData> {
        const installs: InstallEntity[] = [];
        const ratings: RatingEntity[] = [];

        // Installs — UserHash is a column, not the partition key, so we
        // need a table-wide filter.
        const installQuery = this.installsClient.listEntities<InstallEntity>({
            queryOptions: {
                filter: odata`UserHash eq ${userHash}`,
            },
        });
        for await (const entity of installQuery) {
            installs.push(entity);
        }

        // Ratings — RowKey is the userHash, so we query across all partitions.
        const ratingQuery = this.ratingsClient.listEntities<RatingEntity>({
            queryOptions: {
                filter: odata`RowKey eq ${userHash}`,
            },
        });
        for await (const entity of ratingQuery) {
            ratings.push(entity);
        }

        return { userHash, installs, ratings };
    }

    /**
     * Delete all data associated with a user hash (GDPR right to erasure).
     *
     * Removes matching rows from both the Installs and Ratings tables, then
     * refreshes the metrics cache for every affected extension.
     *
     * @param userHash - The SHA-256 user hash whose data should be purged.
     *
     * @example
     * ```typescript
     * await svc.deleteUserData("abc...def");
     * ```
     */
    public async deleteUserData(userHash: string): Promise<void> {
        const affectedExtensions = new Set<string>();

        // Delete installs
        const installQuery = this.installsClient.listEntities<InstallEntity>({
            queryOptions: {
                filter: odata`UserHash eq ${userHash}`,
            },
        });
        for await (const entity of installQuery) {
            affectedExtensions.add(entity.partitionKey);
            await this.installsClient.deleteEntity(entity.partitionKey, entity.rowKey);
        }

        // Delete ratings
        const ratingQuery = this.ratingsClient.listEntities<RatingEntity>({
            queryOptions: {
                filter: odata`RowKey eq ${userHash}`,
            },
        });
        for await (const entity of ratingQuery) {
            affectedExtensions.add(entity.partitionKey);
            await this.ratingsClient.deleteEntity(entity.partitionKey, entity.rowKey);
        }

        // Refresh caches for all affected extensions
        await Promise.all(
            [...affectedExtensions].map((id) => this.refreshMetricsCache(id)),
        );
    }

    // -----------------------------------------------------------------------
    // Cache refresh
    // -----------------------------------------------------------------------

    /**
     * Recompute the MetricsCache row for an extension from raw Installs and
     * Ratings data.
     *
     * @param extensionId - The extension to recalculate.
     *
     * @example
     * ```typescript
     * await svc.refreshMetricsCache("my-ext");
     * ```
     */
    public async refreshMetricsCache(extensionId: string): Promise<void> {
        let totalInstalls = 0;
        let activeInstalls = 0;
        let ratingSum = 0;
        let ratingCount = 0;

        // Count installs
        const installQuery = this.installsClient.listEntities<InstallEntity>({
            queryOptions: {
                filter: odata`PartitionKey eq ${extensionId}`,
            },
        });
        for await (const entity of installQuery) {
            totalInstalls++;
            if (entity.IsActive) {
                activeInstalls++;
            }
        }

        // Aggregate ratings
        const ratingQuery = this.ratingsClient.listEntities<RatingEntity>({
            queryOptions: {
                filter: odata`PartitionKey eq ${extensionId}`,
            },
        });
        for await (const entity of ratingQuery) {
            ratingSum += entity.Rating as number;
            ratingCount++;
        }

        const averageRating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : 0;

        const cacheEntity: MetricsCacheEntity = {
            partitionKey: extensionId,
            rowKey: "summary",
            TotalInstalls: totalInstalls,
            ActiveInstalls: activeInstalls,
            AverageRating: averageRating,
            RatingCount: ratingCount,
            LastUpdated: new Date().toISOString(),
        };

        await this.metricsCacheClient.upsertEntity(cacheEntity, "Replace");
    }
}
