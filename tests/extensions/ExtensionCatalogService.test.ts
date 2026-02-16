/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/extensions/ExtensionCatalogService.test
 * @description Unit tests for ExtensionCatalogService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExtensionCatalogService } from "../../src/extensions/ExtensionCatalogService";
import { RawCatalogResponse, RawCatalogExtension, CatalogManifest, transformRawCatalog } from "../../src/extensions/types";
import * as http from "../../src/utils/http";

// Mock the http module
vi.mock("../../utils/http");

// Mock Obsidian Notice
vi.mock("obsidian", () => ({
	Notice: vi.fn(),
	App: vi.fn(),
}));

describe("ExtensionCatalogService", () => {
	let service: ExtensionCatalogService;
	let mockApp: any;
	
	const mockRawExtension1: RawCatalogExtension = {
		id: "test-agent-1",
		name: "Test Agent 1",
		type: "agent",
		version: "1.0.0",
		description: "A test agent for testing",
		author: { name: "Test Author" },
		categories: ["Productivity", "Testing"],
		tags: ["test", "agent"],
		publishedAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		size: "1024",
		minVaultCopilotVersion: "0.1.0",
		detailPageUrl: "https://example.com/test-agent-1",
		files: [],
		tools: [],
		dependencies: [],
	};
	
	const mockRawExtension2: RawCatalogExtension = {
		id: "journal-prompt",
		name: "Daily Journal Prompt",
		type: "prompt",
		version: "2.0.0",
		description: "Journal prompts for daily reflection",
		author: { name: "Journal Author" },
		categories: ["Journaling", "Productivity"],
		tags: ["journal", "daily", "reflection"],
		publishedAt: "2026-01-15T00:00:00Z",
		updatedAt: "2026-02-01T00:00:00Z",
		size: "512",
		minVaultCopilotVersion: "0.1.0",
		detailPageUrl: "https://example.com/journal-prompt",
		files: [],
		tools: [],
		dependencies: [],
	};
	
	const mockRawCatalog: RawCatalogResponse = {
		version: "1.0",
		generated: "2026-02-05T20:00:00Z",
		totalExtensions: 2,
		extensions: [mockRawExtension1, mockRawExtension2],
		categories: ["Productivity", "Journaling", "Testing"],
		featured: ["test-agent-1"],
	};
	
	// Expected transformed catalog (what the service actually returns)
	const mockTransformedCatalog: CatalogManifest = transformRawCatalog(mockRawCatalog);
	
	beforeEach(() => {
		mockApp = {};
		service = new ExtensionCatalogService(mockApp, {
			catalogEndpoint: "https://example.com/catalog.json",
			cacheTTLMillis: 300000,
		});
		
		// Reset all mocks
		vi.clearAllMocks();
	});
	
	afterEach(() => {
		vi.restoreAllMocks();
	});
	
	describe("fetchCatalog", () => {
		it("should fetch catalog from remote endpoint", async () => {
			const mockHttpRequest = vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: mockRawCatalog,
				headers: {},
			});
			
			const result = await service.fetchCatalog();
			
			expect(mockHttpRequest).toHaveBeenCalledWith({
				url: "https://example.com/catalog.json",
				method: "GET",
				timeout: 30000,
			});
			// Service returns transformed catalog, not raw
			expect(result).toEqual(mockTransformedCatalog);
			expect(result.availableExtensions).toHaveLength(2);
		});
		
		it("should use cached data if fresh", async () => {
			const mockHttpRequest = vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: mockRawCatalog,
				headers: {},
			});
			
			// First fetch - should hit network
			await service.fetchCatalog();
			expect(mockHttpRequest).toHaveBeenCalledTimes(1);
			
			// Second fetch - should use cache
			await service.fetchCatalog();
			expect(mockHttpRequest).toHaveBeenCalledTimes(1); // Still 1, not 2
		});
		
		it("should refetch if cache is stale", async () => {
			// Create service with very short TTL
			const shortTTLService = new ExtensionCatalogService(mockApp, {
				catalogEndpoint: "https://example.com/catalog.json",
				cacheTTLMillis: 10, // 10ms TTL
			});
			
			const mockHttpRequest = vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: mockRawCatalog,
				headers: {},
			});
			
			// First fetch
			await shortTTLService.fetchCatalog();
			expect(mockHttpRequest).toHaveBeenCalledTimes(1);
			
			// Wait for cache to expire
			await new Promise(resolve => setTimeout(resolve, 20));
			
			// Second fetch - cache is stale, should refetch
			await shortTTLService.fetchCatalog();
			expect(mockHttpRequest).toHaveBeenCalledTimes(2);
		});
		
		it("should use stale cache on network error", async () => {
			const mockHttpRequest = vi.spyOn(http, "httpRequest")
				.mockResolvedValueOnce({
					status: 200,
					data: mockRawCatalog,
					headers: {},
				})
				.mockRejectedValueOnce(new Error("Network error"));
			
			// First fetch - successful
			const firstResult = await service.fetchCatalog();
			expect(firstResult).toEqual(mockTransformedCatalog);
			
			// Clear cache to force refetch
			service.clearCache();
			
			// Manually set stale cache for testing fallback
			(service as any).cachedData = {
				manifestData: mockTransformedCatalog,
				fetchedAtTimestamp: Date.now() - 400000, // Stale (beyond TTL)
			};
			
			// Second fetch - network fails, should use stale cache
			const secondResult = await service.fetchCatalog();
			expect(secondResult).toEqual(mockTransformedCatalog);
		});
		
		it("should throw error if network fails and no cache available", async () => {
			vi.spyOn(http, "httpRequest").mockRejectedValue(new Error("Network error"));
			
			await expect(service.fetchCatalog()).rejects.toThrow("Failed to fetch catalog and no cache available");
		});
		
		it("should throw error if catalog format is invalid", async () => {
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: { invalid: "format" },
				headers: {},
			});
			
			await expect(service.fetchCatalog()).rejects.toThrow("Invalid catalog format");
		});
	});
	
	describe("searchExtensions", () => {
		beforeEach(async () => {
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: mockRawCatalog,
				headers: {},
			});
			await service.fetchCatalog(); // Prime the cache
		});
		
		it("should return all extensions with empty filter", async () => {
			const results = await service.searchExtensions({});
			expect(results).toHaveLength(2);
		});
		
		it("should filter by text query in title", async () => {
			const results = await service.searchExtensions({
				textQuery: "journal",
			});
			expect(results).toHaveLength(1);
			expect(results[0]?.uniqueId).toBe("journal-prompt");
		});
		
		it("should filter by text query in description", async () => {
			const results = await service.searchExtensions({
				textQuery: "reflection",
			});
			expect(results).toHaveLength(1);
			expect(results[0]?.uniqueId).toBe("journal-prompt");
		});
		
		it("should filter by text query in keywords", async () => {
			const results = await service.searchExtensions({
				textQuery: "daily",
			});
			expect(results).toHaveLength(1);
			expect(results[0]?.uniqueId).toBe("journal-prompt");
		});
		
		it("should filter by text query in categories", async () => {
			const results = await service.searchExtensions({
				textQuery: "testing",
			});
			expect(results).toHaveLength(1);
			expect(results[0]?.uniqueId).toBe("test-agent-1");
		});
		
		it("should filter by extension kind", async () => {
			const results = await service.searchExtensions({
				filterByKind: "agent",
			});
			expect(results).toHaveLength(1);
			expect(results[0]?.kind).toBe("agent");
		});
		
		it("should filter by category", async () => {
			const results = await service.searchExtensions({
				filterByCategories: ["Journaling"],
			});
			expect(results).toHaveLength(1);
			expect(results[0]?.uniqueId).toBe("journal-prompt");
		});
		
		it("should apply multiple filters together", async () => {
			const results = await service.searchExtensions({
				textQuery: "test",
				filterByKind: "agent",
				filterByCategories: ["Productivity"],
			});
			expect(results).toHaveLength(1);
			expect(results[0]?.uniqueId).toBe("test-agent-1");
		});
		
		it("should return empty array if no matches", async () => {
			const results = await service.searchExtensions({
				textQuery: "nonexistent",
			});
			expect(results).toHaveLength(0);
		});
	});
	
	describe("getExtension", () => {
		beforeEach(async () => {
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: mockRawCatalog,
				headers: {},
			});
			await service.fetchCatalog();
		});
		
		it("should return extension by ID", async () => {
			const result = await service.getExtension("test-agent-1");
			expect(result).not.toBeNull();
			expect(result?.uniqueId).toBe("test-agent-1");
		});
		
		it("should return null for non-existent extension", async () => {
			const result = await service.getExtension("non-existent");
			expect(result).toBeNull();
		});
	});
	
	describe("getFeatured", () => {
		beforeEach(async () => {
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: mockRawCatalog,
				headers: {},
			});
			await service.fetchCatalog();
		});
		
		it("should return featured extensions", async () => {
			const results = await service.getFeatured();
			expect(results).toHaveLength(1);
		expect(results[0]?.uniqueId).toBe("test-agent-1");
		});
	});
	
	describe("getCategories", () => {
		beforeEach(async () => {
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: mockRawCatalog,
				headers: {},
			});
			await service.fetchCatalog();
		});
		
		it("should return all categories", async () => {
			const results = await service.getCategories();
			expect(results).toHaveLength(3);
			expect(results).toContain("Productivity");
			expect(results).toContain("Journaling");
			expect(results).toContain("Testing");
		});
	});
	
	describe("clearCache", () => {
		it("should clear cached data", async () => {
			const mockHttpRequest = vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: mockRawCatalog,
				headers: {},
			});
			
			// First fetch
			await service.fetchCatalog();
			expect(mockHttpRequest).toHaveBeenCalledTimes(1);
			
			// Clear cache
			service.clearCache();
			
			// Second fetch should hit network again
			await service.fetchCatalog();
			expect(mockHttpRequest).toHaveBeenCalledTimes(2);
		});
	});
	
	describe("getCacheStatus", () => {
		it("should return null status when no cache", () => {
			const status = service.getCacheStatus();
			expect(status.lastFetchedAt).toBeNull();
			expect(status.isStale).toBe(true);
		});
		
		it("should return cache status when cache exists", async () => {
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: mockRawCatalog,
				headers: {},
			});
			
			const beforeFetch = Date.now();
			await service.fetchCatalog();
			const afterFetch = Date.now();
			
			const status = service.getCacheStatus();
			expect(status.lastFetchedAt).not.toBeNull();
			expect(status.lastFetchedAt!.getTime()).toBeGreaterThanOrEqual(beforeFetch);
			expect(status.lastFetchedAt!.getTime()).toBeLessThanOrEqual(afterFetch);
			expect(status.isStale).toBe(false);
		});
	});
});



