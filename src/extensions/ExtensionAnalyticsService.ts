/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ExtensionAnalyticsService
 * @description Service for communicating with the Azure Functions API endpoints that power
 * extension analytics — install/uninstall tracking, ratings, aggregate metrics, and
 * user-data management.
 *
 * All HTTP requests are issued through Obsidian's cross-platform `requestUrl` helper so
 * they work on both desktop and mobile.
 *
 * @example
 * ```typescript
 * import { ExtensionAnalyticsService } from './ExtensionAnalyticsService';
 *
 * const analytics = new ExtensionAnalyticsService('https://vault-copilot-api.purpleocean-69a206db.eastus.azurecontainerapps.io');
 * await analytics.trackInstall({
 *     extensionId: 'my-extension',
 *     version: '1.0.0',
 *     userHash: 'abc123',
 *     platform: 'desktop',
 *     vaultCopilotVersion: '0.1.0',
 *     timestamp: new Date().toISOString(),
 * });
 * ```
 *
 * @since 0.1.0
 */

import { httpRequest } from '../utils/http';

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

/**
 * Payload sent when a user installs an extension.
 */
export interface InstallTrackingEvent {
    /** Unique identifier of the installed extension. */
    extensionId: string;
    /** Semantic version string of the installed extension. */
    version: string;
    /** Anonymised hash that identifies the user without revealing identity. */
    userHash: string;
    /** Platform the user is running on. */
    platform: 'desktop' | 'mobile';
    /** Version of the Vault Copilot plugin itself. */
    vaultCopilotVersion: string;
    /** ISO-8601 timestamp of the event. */
    timestamp: string;
}

/**
 * Payload sent when a user uninstalls an extension.
 */
export interface UninstallTrackingEvent {
    /** Unique identifier of the uninstalled extension. */
    extensionId: string;
    /** Anonymised user hash. */
    userHash: string;
    /** ISO-8601 timestamp of the event. */
    timestamp: string;
}

/**
 * Payload for submitting or updating a rating.
 */
export interface RatingSubmission {
    /** Extension being rated. */
    extensionId: string;
    /** Star rating (1–5). */
    rating: 1 | 2 | 3 | 4 | 5;
    /** Anonymised user hash. */
    userHash: string;
    /** Optional free-text comment. */
    comment?: string;
    /** Optional version the user is rating. */
    version?: string;
}

/**
 * Response returned after a rating is submitted.
 */
export interface RatingResponse {
    /** Whether the submission was accepted. */
    success: boolean;
    /** Human-readable status message. */
    message: string;
    /** Updated aggregate average rating for the extension. */
    aggregateRating: number;
    /** Updated total number of ratings for the extension. */
    ratingCount: number;
}

/**
 * Aggregate metrics for a single extension.
 */
export interface ExtensionMetrics {
    /** Extension identifier. */
    extensionId: string;
    /** Lifetime install count. */
    totalInstalls: number;
    /** Number of currently active installs. */
    activeInstalls: number;
    /** Weighted average rating. */
    averageRating: number;
    /** Total number of ratings. */
    ratingCount: number;
    /** Optional breakdown of ratings by star level (e.g. `{ "5": 42, "4": 18 }`). */
    ratingBreakdown?: Record<string, number>;
    /** Optional per-version install and rating breakdown. */
    versionBreakdown?: Record<string, {
        installs: number;
        activeInstalls: number;
        rating: number;
    }>;
    /** ISO-8601 timestamp of the last metrics refresh. */
    lastUpdated: string;
}

/**
 * A single rating left by a user.
 */
export interface UserRating {
    /** Extension that was rated. */
    extensionId: string;
    /** Numeric star rating. */
    rating: number;
    /** Optional free-text comment. */
    comment?: string;
    /** ISO-8601 date the rating was first submitted. */
    submittedDate: string;
    /** ISO-8601 date the rating was last modified. */
    updatedDate: string;
}

/**
 * Aggregated user data including installs and ratings.
 */
export interface UserDataResponse {
    /** Extensions the user has installed. */
    installs: Array<{
        extensionId: string;
        version: string;
        installDate: string;
        isActive: boolean;
    }>;
    /** Ratings the user has submitted. */
    ratings: UserRating[];
}

/* ------------------------------------------------------------------ */
/*  Service                                                           */
/* ------------------------------------------------------------------ */

/**
 * Client for the extension-analytics Azure Functions API.
 *
 * Every public method maps to a single REST endpoint and returns a typed
 * promise.  Errors are normalised into standard `Error` instances whose
 * message contains either the server-provided error string or the HTTP
 * status code.
 *
 * @example
 * ```typescript
 * const svc = new ExtensionAnalyticsService('https://analytics.example.com');
 * const metrics = await svc.getMetrics('my-extension');
 * console.log(metrics.totalInstalls);
 * ```
 *
 * @since 0.1.0
 */
export class ExtensionAnalyticsService {
    /** Base URL of the Azure Functions API (no trailing slash). */
    private readonly baseUrl: string;
    /** Authenticated user hash for authorization (optional). */
    private authenticatedUserHash?: string;

    /**
     * Create a new analytics service instance.
     *
     * @param baseUrl - Root URL of the analytics API (e.g. `https://vault-copilot-api.purpleocean-69a206db.eastus.azurecontainerapps.io`).
     *                  A trailing slash is stripped automatically.
     * @param authenticatedUserHash - Optional user hash for authenticated requests.
     */
    constructor(baseUrl: string, authenticatedUserHash?: string) {
        // Strip trailing slashes and a trailing "/api" segment to prevent
        // double-prefixing (each endpoint path already includes "/api/…").
        this.baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/api$/i, '');
        this.authenticatedUserHash = authenticatedUserHash;
    }

    /**
     * Set the authenticated user hash for authorization.
     *
     * @param userHash - The authenticated user's hash.
     */
    setAuthenticatedUser(userHash: string): void {
        this.authenticatedUserHash = userHash;
    }

    /* -------------------------------------------------------------- */
    /*  Install / Uninstall tracking                                  */
    /* -------------------------------------------------------------- */

    /**
     * Record an extension install event.
     *
     * @param event - Install event payload.
     * @returns Resolves when the server has acknowledged the event.
     *
     * @example
     * ```typescript
     * await svc.trackInstall({
     *     extensionId: 'my-ext',
     *     version: '1.2.0',
     *     userHash: 'hash',
     *     platform: 'desktop',
     *     vaultCopilotVersion: '0.1.0',
     *     timestamp: new Date().toISOString(),
     * });
     * ```
     *
     * @throws {Error} If the server responds with a status >= 400.
     */
    async trackInstall(event: InstallTrackingEvent): Promise<void> {
        await this.request<void>('/api/installs', {
            method: 'POST',
            body: JSON.stringify(event),
        });
    }

    /**
     * Record an extension uninstall event.
     *
     * @param event - Uninstall event payload.
     * @returns Resolves when the server has acknowledged the event.
     *
     * @example
     * ```typescript
     * await svc.trackUninstall({
     *     extensionId: 'my-ext',
     *     userHash: 'hash',
     *     timestamp: new Date().toISOString(),
     * });
     * ```
     *
     * @throws {Error} If the server responds with a status >= 400.
     */
    async trackUninstall(event: UninstallTrackingEvent): Promise<void> {
        await this.request<void>('/api/uninstalls', {
            method: 'POST',
            body: JSON.stringify(event),
        });
    }

    /* -------------------------------------------------------------- */
    /*  Ratings                                                       */
    /* -------------------------------------------------------------- */

    /**
     * Submit or update a rating for an extension.
     *
     * @param submission - Rating payload.
     * @returns The server response including the updated aggregate rating.
     *
     * @example
     * ```typescript
     * const res = await svc.submitRating({
     *     extensionId: 'my-ext',
     *     rating: 5,
     *     userHash: 'hash',
     *     comment: 'Great extension!',
     * });
     * console.log(res.aggregateRating);
     * ```
     *
     * @throws {Error} If the server responds with a status >= 400.
     */
    async submitRating(submission: RatingSubmission): Promise<RatingResponse> {
        return this.request<RatingResponse>('/api/ratings', {
            method: 'POST',
            body: JSON.stringify(submission),
        });
    }

    /**
     * Delete a previously submitted rating.
     *
     * @param extensionId - The extension whose rating should be removed.
     * @param userHash    - Anonymised user hash that owns the rating.
     * @returns Resolves with updated aggregate rating and count after deletion.
     *
     * @example
     * ```typescript
     * const { averageRating, ratingCount } = await svc.deleteRating('my-ext', 'hash');
     * ```
     *
     * @throws {Error} If the server responds with a status >= 400.
     */
    async deleteRating(extensionId: string, userHash: string): Promise<{ averageRating: number; ratingCount: number }> {
        const response = await this.request<RatingResponse>(
            `/api/ratings/${encodeURIComponent(extensionId)}/${encodeURIComponent(userHash)}`,
            { method: 'DELETE' },
        );
        return {
            averageRating: response.aggregateRating,
            ratingCount: response.ratingCount,
        };
    }

    /* -------------------------------------------------------------- */
    /*  Metrics                                                       */
    /* -------------------------------------------------------------- */

    /**
     * Retrieve aggregate metrics for a single extension.
     *
     * @param extensionId - The extension to query.
     * @returns Metrics object for the requested extension.
     *
     * @example
     * ```typescript
     * const m = await svc.getMetrics('my-ext');
     * console.log(m.totalInstalls, m.averageRating);
     * ```
     *
     * @throws {Error} If the server responds with a status >= 400.
     */
    async getMetrics(extensionId: string): Promise<ExtensionMetrics> {
        return this.request<ExtensionMetrics>(
            `/api/metrics/${encodeURIComponent(extensionId)}`,
            { method: 'GET' },
        );
    }

    /**
     * Retrieve aggregate metrics for multiple extensions in a single request.
     *
     * @param extensionIds - Array of extension identifiers.
     * @returns A map from extension ID to its metrics.
     *
     * @example
     * ```typescript
     * const batch = await svc.getBatchMetrics(['ext-a', 'ext-b']);
     * console.log(batch['ext-a'].totalInstalls);
     * ```
     *
     * @throws {Error} If the server responds with a status >= 400.
     */
    async getBatchMetrics(extensionIds: string[]): Promise<Record<string, ExtensionMetrics>> {
        const ids = extensionIds.map(encodeURIComponent).join(',');
        return this.request<Record<string, ExtensionMetrics>>(
            `/api/metrics?ids=${ids}`,
            { method: 'GET' },
        );
    }

    /* -------------------------------------------------------------- */
    /*  User data                                                     */
    /* -------------------------------------------------------------- */

    /**
     * Retrieve all ratings submitted by a user.
     *
     * @param userHash - Anonymised user hash.
     * @returns Array of the user's ratings.
     *
     * @example
     * ```typescript
     * const ratings = await svc.getUserRatings('hash');
     * ratings.forEach(r => console.log(r.extensionId, r.rating));
     * ```
     *
     * @throws {Error} If the server responds with a status >= 400.
     */
    async getUserRatings(userHash: string): Promise<UserRating[]> {
        return this.request<UserRating[]>(
            `/api/user/${encodeURIComponent(userHash)}/ratings`,
            { method: 'GET' },
        );
    }

    /**
     * Retrieve all tracked data for a user (installs and ratings).
     *
     * @param userHash - Anonymised user hash.
     * @returns Combined install and rating data for the user.
     *
     * @example
     * ```typescript
     * const data = await svc.getUserData('hash');
     * console.log(data.installs.length, data.ratings.length);
     * ```
     *
     * @throws {Error} If the server responds with a status >= 400.
     */
    async getUserData(userHash: string): Promise<UserDataResponse> {
        return this.request<UserDataResponse>(
            `/api/user/${encodeURIComponent(userHash)}/data`,
            { method: 'GET' },
        );
    }

    /**
     * Delete all tracked data for a user (GDPR / privacy compliance).
     *
     * @param userHash - Anonymised user hash whose data should be purged.
     * @returns Resolves when the data has been deleted.
     *
     * @example
     * ```typescript
     * await svc.deleteUserData('hash');
     * ```
     *
     * @throws {Error} If the server responds with a status >= 400.
     */
    async deleteUserData(userHash: string): Promise<void> {
        await this.request<void>(
            `/api/user/${encodeURIComponent(userHash)}`,
            { method: 'DELETE' },
        );
    }

    /* -------------------------------------------------------------- */
    /*  Internal HTTP helper                                          */
    /* -------------------------------------------------------------- */

    /**
     * Send an HTTP request to the analytics API and return the parsed response.
     *
     * Uses Obsidian's `requestUrl` with `throw: false` so that non-2xx responses
     * are returned rather than thrown, allowing normalised error handling.
     *
     * @typeParam T - Expected shape of the JSON response body.
     * @param endpoint - Path relative to the base URL (must start with `/`).
     * @param options  - HTTP method and optional JSON-encoded body.
     * @returns Parsed JSON response cast to `T`.
     *
     * @throws {Error} If the response status is >= 400.  The error message
     *                 contains the server's `error` field when available, or
     *                 falls back to the HTTP status code.
     *
     * @internal
     */
    private async request<T>(
        endpoint: string,
        options: { method: string; body?: string },
    ): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };

        // Add authenticated user hash for authorization
        if (this.authenticatedUserHash) {
            headers['X-User-Hash'] = this.authenticatedUserHash;
        }

        const response = await fetch(url, {
            method: options.method,
            headers,
            body: options.body,
        });

        if (response.status >= 400) {
            let errorMessage: string;
            try {
                const body = await response.json();
                errorMessage = body?.error ?? `HTTP ${response.status}`;
            } catch {
                errorMessage = `HTTP ${response.status}`;
            }
            throw new Error(errorMessage);
        }

        // For void-returning endpoints the server may return 204 No Content.
        // In that case there is no JSON body to parse.
        if (response.status === 204) {
            return undefined as unknown as T;
        }

        const text = await response.text();
        if (!text) {
            return undefined as unknown as T;
        }

        return JSON.parse(text) as T;
    }
}
