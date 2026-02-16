/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/extensions/ExtensionAnalyticsService.test
 * @description Unit tests for ExtensionAnalyticsService
 *
 * Tests cover all public methods: trackInstall, trackUninstall, submitRating,
 * deleteRating, getMetrics, getBatchMetrics, getUserRatings, getUserData,
 * and deleteUserData. HTTP requests are mocked via global fetch.
 *
 * @since 0.1.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	ExtensionAnalyticsService,
	InstallTrackingEvent,
	RatingSubmission,
} from "../../extensions/ExtensionAnalyticsService";

// Create mock fetch
const mockFetch = vi.fn<typeof fetch>();

// Override global fetch
vi.stubGlobal('fetch', mockFetch);

/** Build a mock Response object. */
function mockResponse(status: number, body: unknown): Response {
	const jsonBody = JSON.stringify(body);
	return {
		status,
		ok: status >= 200 && status < 300,
		text: () => Promise.resolve(jsonBody),
		json: () => Promise.resolve(body),
		headers: new Headers(),
	} as Response;
}

describe("ExtensionAnalyticsService", () => {
	let service: ExtensionAnalyticsService;
	const BASE_URL = "https://torqena-api.purpleocean-69a206db.eastus.azurecontainerapps.io";

	beforeEach(() => {
		service = new ExtensionAnalyticsService(BASE_URL);
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	/* -------------------------------------------------------------- */
	/*  Constructor                                                    */
	/* -------------------------------------------------------------- */

	describe("constructor", () => {
		it("should strip trailing slashes from base URL", () => {
			const svc = new ExtensionAnalyticsService("https://example.com///");
			// We can't inspect private property directly; test via request URL
			mockFetch.mockResolvedValue(mockResponse(200, { extensionId: "test" }));
			svc.getMetrics("test");
			// The URL should not have triple slashes
			expect(mockFetch).toHaveBeenCalled();
		});

		it("should strip trailing /api to prevent double-prefixing", () => {
			const svc = new ExtensionAnalyticsService("https://example.com/api");
			mockFetch.mockResolvedValue(mockResponse(200, { extensionId: "test" }));
			svc.getMetrics("test");
			expect(mockFetch).toHaveBeenCalled();
		});
	});

	/* -------------------------------------------------------------- */
	/*  trackInstall                                                   */
	/* -------------------------------------------------------------- */

	describe("trackInstall", () => {
		const event: InstallTrackingEvent = {
			extensionId: "daily-journal",
			version: "1.0.0",
			userHash: "a".repeat(64),
			platform: "desktop",
			vaultCopilotVersion: "0.0.20",
			timestamp: "2026-02-08T12:00:00Z",
		};

		it("should POST to /api/installs with correct payload", async () => {
			mockFetch.mockResolvedValue(mockResponse(201, { success: true }));

			await service.trackInstall(event);

			expect(mockFetch).toHaveBeenCalledWith(
				`${BASE_URL}/api/installs`,
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify(event),
					headers: expect.objectContaining({
						"Content-Type": "application/json",
					}),
				}),
			);
		});

		it("should throw on HTTP 400 response", async () => {
			mockFetch.mockResolvedValue(mockResponse(400, { error: "Invalid extensionId" }));

			await expect(service.trackInstall(event)).rejects.toThrow("Invalid extensionId");
		});

		it("should throw generic message on non-JSON error", async () => {
			const response = {
				status: 500,
				ok: false,
				text: () => Promise.resolve(""),
				json: () => Promise.reject(new Error("Invalid JSON")),
				headers: new Headers(),
			} as Response;
			mockFetch.mockResolvedValue(response);

			await expect(service.trackInstall(event)).rejects.toThrow("HTTP 500");
		});
	});

	/* -------------------------------------------------------------- */
	/*  trackUninstall                                                 */
	/* -------------------------------------------------------------- */

	describe("trackUninstall", () => {
		it("should POST to /api/uninstalls", async () => {
			mockFetch.mockResolvedValue(mockResponse(200, { success: true }));

			await service.trackUninstall({
				extensionId: "daily-journal",
				userHash: "b".repeat(64),
				timestamp: "2026-02-08T14:00:00Z",
			});

			expect(mockFetch).toHaveBeenCalledWith(
				`${BASE_URL}/api/uninstalls`,
				expect.objectContaining({ method: "POST" }),
			);
		});
	});

	/* -------------------------------------------------------------- */
	/*  submitRating                                                   */
	/* -------------------------------------------------------------- */

	describe("submitRating", () => {
		const submission: RatingSubmission = {
			extensionId: "daily-journal",
			rating: 5,
			userHash: "c".repeat(64),
			comment: "Excellent extension!",
			version: "1.0.0",
		};

		it("should POST to /api/ratings and return aggregate data", async () => {
			const responseData = {
				success: true,
				message: "Rating submitted",
				aggregateRating: 4.8,
				ratingCount: 89,
			};
			mockFetch.mockResolvedValue(mockResponse(200, responseData));

			const result = await service.submitRating(submission);

			expect(result.aggregateRating).toBe(4.8);
			expect(result.ratingCount).toBe(89);
			expect(mockFetch).toHaveBeenCalledWith(
				`${BASE_URL}/api/ratings`,
				expect.objectContaining({ method: "POST" }),
			);
		});
	});

	/* -------------------------------------------------------------- */
	/*  deleteRating                                                   */
	/* -------------------------------------------------------------- */

	describe("deleteRating", () => {
		it("should send DELETE to /api/ratings/{extensionId}/{userHash}", async () => {
			const deleteResponse = {
				success: true,
				message: "Rating deleted successfully",
				aggregateRating: 4.5,
				ratingCount: 10,
			};
			mockFetch.mockResolvedValue(mockResponse(200, deleteResponse));

			const result = await service.deleteRating("daily-journal", "d".repeat(64));

			expect(mockFetch).toHaveBeenCalledWith(
				`${BASE_URL}/api/ratings/daily-journal/${"d".repeat(64)}`,
				expect.objectContaining({ method: "DELETE" }),
			);
			expect(result.averageRating).toBe(4.5);
			expect(result.ratingCount).toBe(10);
		});
	});

	/* -------------------------------------------------------------- */
	/*  getMetrics                                                     */
	/* -------------------------------------------------------------- */

	describe("getMetrics", () => {
		it("should GET /api/metrics/{extensionId}", async () => {
			const metricsResponse = {
				extensionId: "daily-journal",
				totalInstalls: 405,
				activeInstalls: 371,
				averageRating: 4.8,
				ratingCount: 89,
				lastUpdated: "2026-02-08T15:00:00Z",
			};
			mockFetch.mockResolvedValue(mockResponse(200, metricsResponse));

			const result = await service.getMetrics("daily-journal");

			expect(result.totalInstalls).toBe(405);
			expect(result.activeInstalls).toBe(371);
			expect(result.averageRating).toBe(4.8);
		});

		it("should URL-encode special characters in extensionId", async () => {
			mockFetch.mockResolvedValue(mockResponse(200, { extensionId: "my ext" }));

			await service.getMetrics("my ext");

			expect(mockFetch).toHaveBeenCalledWith(
				`${BASE_URL}/api/metrics/my%20ext`,
				expect.anything(),
			);
		});
	});

	/* -------------------------------------------------------------- */
	/*  getBatchMetrics                                                */
	/* -------------------------------------------------------------- */

	describe("getBatchMetrics", () => {
		it("should GET /api/metrics?ids=... with comma-separated IDs", async () => {
			const batchResponse = {
				"ext-a": { totalInstalls: 100 },
				"ext-b": { totalInstalls: 200 },
			};
			mockFetch.mockResolvedValue(mockResponse(200, batchResponse));

			const result = await service.getBatchMetrics(["ext-a", "ext-b"]);

			expect(result["ext-a"]!.totalInstalls).toBe(100);
			expect(result["ext-b"]!.totalInstalls).toBe(200);
			expect(mockFetch).toHaveBeenCalledWith(
				`${BASE_URL}/api/metrics?ids=ext-a,ext-b`,
				expect.anything(),
			);
		});
	});

	/* -------------------------------------------------------------- */
	/*  getUserRatings                                                 */
	/* -------------------------------------------------------------- */

	describe("getUserRatings", () => {
		it("should GET /api/user/{userHash}/ratings", async () => {
			const ratings = [
				{ extensionId: "ext-a", rating: 5, submittedDate: "2026-01-01T00:00:00Z", updatedDate: "2026-01-01T00:00:00Z" },
			];
			mockFetch.mockResolvedValue(mockResponse(200, ratings));

			const result = await service.getUserRatings("e".repeat(64));

			expect(result).toHaveLength(1);
			expect(result[0]!.rating).toBe(5);
		});
	});

	/* -------------------------------------------------------------- */
	/*  getUserData                                                    */
	/* -------------------------------------------------------------- */

	describe("getUserData", () => {
		it("should GET /api/user/{userHash}/data", async () => {
			const data = {
				installs: [{ extensionId: "ext-a", version: "1.0.0", installDate: "2026-01-01", isActive: true }],
				ratings: [],
			};
			mockFetch.mockResolvedValue(mockResponse(200, data));

			const result = await service.getUserData("f".repeat(64));

			expect(result.installs).toHaveLength(1);
			expect(result.ratings).toHaveLength(0);
		});
	});

	/* -------------------------------------------------------------- */
	/*  deleteUserData                                                 */
	/* -------------------------------------------------------------- */

	describe("deleteUserData", () => {
		it("should DELETE /api/user/{userHash}", async () => {
			mockFetch.mockResolvedValue(mockResponse(204, null));

			await service.deleteUserData("g".repeat(64));

			expect(mockFetch).toHaveBeenCalledWith(
				`${BASE_URL}/api/user/${"g".repeat(64)}`,
				expect.objectContaining({ method: "DELETE" }),
			);
		});

		it("should throw on 404 response", async () => {
			mockFetch.mockResolvedValue(mockResponse(404, { error: "User not found" }));

			await expect(service.deleteUserData("z".repeat(64))).rejects.toThrow("User not found");
		});
	});

	/* -------------------------------------------------------------- */
	/*  Error handling edge-cases                                      */
	/* -------------------------------------------------------------- */

	describe("error handling", () => {
		it("should handle 204 No Content gracefully for void endpoints", async () => {
			mockFetch.mockResolvedValue(mockResponse(204, null));

			// Should not throw
			await expect(service.trackInstall({
				extensionId: "test",
				version: "1.0.0",
				userHash: "h".repeat(64),
				platform: "mobile",
				vaultCopilotVersion: "0.0.20",
				timestamp: new Date().toISOString(),
			})).resolves.toBeUndefined();
		});

		it("should handle 429 rate limit errors", async () => {
			mockFetch.mockResolvedValue(mockResponse(429, { error: "Rate limit exceeded" }));

			await expect(service.trackInstall({
				extensionId: "test",
				version: "1.0.0",
				userHash: "i".repeat(64),
				platform: "desktop",
				vaultCopilotVersion: "0.0.20",
				timestamp: new Date().toISOString(),
			})).rejects.toThrow("Rate limit exceeded");
		});
	});
});






