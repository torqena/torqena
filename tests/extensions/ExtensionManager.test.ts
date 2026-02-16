/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/extensions/ExtensionManager.test
 * @description Unit tests for ExtensionManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExtensionManager } from "../../src/extensions/ExtensionManager";
import { MarketplaceExtension } from "../../src/extensions/types";
import * as http from "../../src/utils/http";

// Mock http module
vi.mock("../../utils/http");

// Mock Obsidian API
vi.mock("obsidian", () => ({
	Notice: vi.fn(),
	TFile: vi.fn(),
	App: vi.fn(),
	Vault: vi.fn(),
}));

describe("ExtensionManager", () => {
	let manager: ExtensionManager;
	let mockApp: any;
	let mockVault: any;
	
	const mockExtension: MarketplaceExtension = {
		uniqueId: "test-extension",
		displayTitle: "Test Extension",
		kind: "agent",
		semanticVersion: "1.0.0",
		briefSummary: "Test extension",
		creator: { displayName: "Test Author" },
		classificationTags: ["Testing"],
		searchKeywords: ["test"],
		publishTimestamp: "2026-01-01T00:00:00Z",
		lastModifiedTimestamp: "2026-01-01T00:00:00Z",
		totalSizeBytes: "100",
		requiredPluginVersion: "0.1.0",
		webDetailPage: "https://example.com/test",
		packageContents: [
			{
				relativePath: "test.agent.md",
				downloadSource: "https://example.com/test.agent.md",
				targetLocation: "Reference/Agents/test.agent.md",
			},
		],
		requiredCapabilities: [],
		dependsOnExtensions: [],
	};
	
	beforeEach(() => {
		const adapterStore = new Map<string, string>();
		const mockAdapter = {
			exists: vi.fn(async (path: string) => adapterStore.has(path)),
			read: vi.fn(async (path: string) => adapterStore.get(path) ?? ""),
			write: vi.fn(async (path: string, content: string) => {
				adapterStore.set(path, content);
			}),
			remove: vi.fn(async (path: string) => {
				adapterStore.delete(path);
			}),
		};

		// Setup mock vault
		mockVault = {
			getAbstractFileByPath: vi.fn().mockReturnValue(null),
			read: vi.fn(),
			create: vi.fn(),
			createFolder: vi.fn(),
			modify: vi.fn(),
			delete: vi.fn(),
			adapter: mockAdapter,
		};
		
		mockApp = {
			vault: mockVault,
		};
		
		manager = new ExtensionManager(mockApp);
		
		vi.clearAllMocks();
	});
	
	afterEach(() => {
		vi.restoreAllMocks();
	});
	
	describe("initialize", () => {
		it("should initialize without tracking file", async () => {
			await manager.initialize();
			
			const installed = await manager.getInstalledExtensions();
			expect(installed.size).toBe(0);
		});
		
		// Skipping TFile mock test as it's complex to mock properly in vitest
		// The functionality is tested in integration tests
	});
	
	describe("installExtension", () => {
		beforeEach(async () => {
			await manager.initialize();
		});
		
		it("should successfully install an extension", async () => {
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: "# Test Agent Content",
				headers: {},
			});
			
			const result = await manager.installExtension(mockExtension);
			
			expect(result.operationSucceeded).toBe(true);
			expect(result.affectedExtensionId).toBe("test-extension");
			expect(result.modifiedFilePaths).toContain("Reference/Agents/test.agent.md");
			expect(manager.isInstalled("test-extension")).toBe(true);
		});
		
		it("should fail if extension already installed", async () => {
			// Install once
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: "# Content",
				headers: {},
			});
			await manager.installExtension(mockExtension);
			
			// Try to install again
			const result = await manager.installExtension(mockExtension);
			
			expect(result.operationSucceeded).toBe(false);
			expect(result.errorDetails).toContain("already installed");
		});
		
		it("should fail if dependency is missing", async () => {
			const extWithDep: MarketplaceExtension = {
				...mockExtension,
				uniqueId: "ext-with-dep",
				dependsOnExtensions: ["missing-dependency"],
			};
			
			const result = await manager.installExtension(extWithDep);
			
			expect(result.operationSucceeded).toBe(false);
			expect(result.errorDetails).toContain("Missing dependency");
		});
		
		it("should fail if dependency is not found (including self-reference)", async () => {
			// An extension that depends on itself is treated as a missing dependency
			// (since it's not installed yet)
			const circularExt: MarketplaceExtension = {
				...mockExtension,
				uniqueId: "circular-ext",
				dependsOnExtensions: ["circular-ext"], // Depends on itself
			};
			
			const result = await manager.installExtension(circularExt);
			
			expect(result.operationSucceeded).toBe(false);
			// Self-dependency is caught as missing dependency
			expect(result.errorDetails).toContain("Missing dependency");
		});
	});
	
	describe("uninstallExtension", () => {
		beforeEach(async () => {
			await manager.initialize();
			
			// Install a test extension first
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: "# Content",
				headers: {},
			});
			await manager.installExtension(mockExtension);
		});
		
		it("should successfully uninstall an extension", async () => {
			const result = await manager.uninstallExtension("test-extension");
			
			expect(result.operationSucceeded).toBe(true);
			expect(result.affectedExtensionId).toBe("test-extension");
			expect(manager.isInstalled("test-extension")).toBe(false);
		});
		
		it("should fail if extension is not installed", async () => {
			const result = await manager.uninstallExtension("non-existent");
			
			expect(result.operationSucceeded).toBe(false);
			expect(result.errorDetails).toContain("not installed");
		});
		
		it("should fail if other extensions depend on it", async () => {
			// Install a dependent extension
			const dependent: MarketplaceExtension = {
				...mockExtension,
				uniqueId: "dependent-ext",
				dependsOnExtensions: ["test-extension"],
			};
			
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: "# Content",
				headers: {},
			});
			await manager.installExtension(dependent);
			
			// Try to uninstall the dependency
			const result = await manager.uninstallExtension("test-extension");
			
			expect(result.operationSucceeded).toBe(false);
			expect(result.errorDetails).toContain("Required by");
		});
	});
	
	describe("updateExtension", () => {
		beforeEach(async () => {
			await manager.initialize();
			
			// Install old version
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: "# Old Content",
				headers: {},
			});
			await manager.installExtension(mockExtension);
		});
		
		it("should successfully update an extension", async () => {
			const newVersion: MarketplaceExtension = {
				...mockExtension,
				semanticVersion: "2.0.0",
			};
			
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: "# New Content",
				headers: {},
			});
			
			const result = await manager.updateExtension("test-extension", newVersion);
			
			expect(result.operationSucceeded).toBe(true);
			expect(manager.getInstalledVersion("test-extension")).toBe("2.0.0");
		});
		
		it("should fail if extension is not installed", async () => {
			const newVersion: MarketplaceExtension = {
				...mockExtension,
				uniqueId: "not-installed",
				semanticVersion: "2.0.0",
			};
			
			const result = await manager.updateExtension("not-installed", newVersion);
			
			expect(result.operationSucceeded).toBe(false);
			expect(result.errorDetails).toContain("not installed");
		});
	});
	
	describe("checkForUpdates", () => {
		beforeEach(async () => {
			await manager.initialize();
			
			// Install version 1.0.0
			vi.spyOn(http, "httpRequest").mockResolvedValue({
				status: 200,
				data: "# Content",
				headers: {},
			});
			await manager.installExtension(mockExtension);
		});
		
		it("should detect available updates", async () => {
			const catalogExtensions: MarketplaceExtension[] = [
				{
					...mockExtension,
					semanticVersion: "2.0.0", // Newer version
				},
			];
			
			const updates = await manager.checkForUpdates(catalogExtensions);
			
			expect(updates).toHaveLength(1);
			expect(updates[0]?.extensionId).toBe("test-extension");
			expect(updates[0]?.currentlyInstalledVersion).toBe("1.0.0");
			expect(updates[0]?.availableNewerVersion).toBe("2.0.0");
		});
		
		it("should not report update for same version", async () => {
			const catalogExtensions: MarketplaceExtension[] = [
				{
					...mockExtension,
					semanticVersion: "1.0.0", // Same version
				},
			];
			
			const updates = await manager.checkForUpdates(catalogExtensions);
			
			expect(updates).toHaveLength(0);
		});
		
		it("should not report update for older version", async () => {
			const catalogExtensions: MarketplaceExtension[] = [
				{
					...mockExtension,
					semanticVersion: "0.9.0", // Older version
				},
			];
			
			const updates = await manager.checkForUpdates(catalogExtensions);
			
			expect(updates).toHaveLength(0);
		});
		
		it("should handle minor and patch version updates", async () => {
			const catalogExtensions: MarketplaceExtension[] = [
				{
					...mockExtension,
					semanticVersion: "1.0.1", // Patch update
				},
			];
			
			const updates = await manager.checkForUpdates(catalogExtensions);
			
			expect(updates).toHaveLength(1);
			expect(updates[0]?.availableNewerVersion).toBe("1.0.1");
		});
	});
	
	describe("version comparison", () => {
		it("should correctly compare semantic versions", async () => {
			await manager.initialize();
			
			// Use reflection to test private method
			const isNewerVersion = (manager as any).isNewerVersion.bind(manager);
			
			// Major version differences
			expect(isNewerVersion("2.0.0", "1.0.0")).toBe(true);
			expect(isNewerVersion("1.0.0", "2.0.0")).toBe(false);
			
			// Minor version differences
			expect(isNewerVersion("1.1.0", "1.0.0")).toBe(true);
			expect(isNewerVersion("1.0.0", "1.1.0")).toBe(false);
			
			// Patch version differences
			expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true);
			expect(isNewerVersion("1.0.0", "1.0.1")).toBe(false);
			
			// Equal versions
			expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
		});
	});
});



