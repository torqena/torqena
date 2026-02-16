/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/extensions/types.test
 * @description Unit tests for extension type definitions and type guards
 */

import { describe, it, expect } from "vitest";
import {
	VaultExtensionKind,
	ExtensionCreator,
	PackagedFile,
	MarketplaceExtension,
	CatalogManifest,
	LocalExtensionRecord,
	BrowseFilter,
	InstallationOutcome,
	UpdateNotification,
	isValidExtensionKind,
	isValidMarketplaceExtension,
	isValidCatalogManifest,
} from "../../extensions/types";

describe("ExtensionTypes", () => {
	describe("Type Guards", () => {
		describe("isValidExtensionKind", () => {
			it("should return true for valid extension kinds", () => {
				expect(isValidExtensionKind("agent")).toBe(true);
				expect(isValidExtensionKind("voice-agent")).toBe(true);
				expect(isValidExtensionKind("prompt")).toBe(true);
				expect(isValidExtensionKind("skill")).toBe(true);
				expect(isValidExtensionKind("mcp-server")).toBe(true);
			});

			it("should return false for invalid extension kinds", () => {
				expect(isValidExtensionKind("invalid-kind")).toBe(false);
				expect(isValidExtensionKind("plugin")).toBe(false);
				expect(isValidExtensionKind("")).toBe(false);
				expect(isValidExtensionKind(null)).toBe(false);
				expect(isValidExtensionKind(undefined)).toBe(false);
				expect(isValidExtensionKind(123)).toBe(false);
				expect(isValidExtensionKind({})).toBe(false);
			});
		});

		describe("isValidMarketplaceExtension", () => {
			const validExtension: MarketplaceExtension = {
				uniqueId: "test-extension",
				displayTitle: "Test Extension",
				kind: "agent",
				semanticVersion: "1.0.0",
				briefSummary: "A test extension for unit testing",
				creator: {
					displayName: "Test Author",
					profileLink: "https://github.com/test",
				},
				classificationTags: ["Testing"],
				searchKeywords: ["test", "example"],
				publishTimestamp: "2026-01-01T00:00:00Z",
				lastModifiedTimestamp: "2026-01-02T00:00:00Z",
				totalSizeBytes: "1024",
				requiredPluginVersion: "0.1.0",
				webDetailPage: "https://example.com/test-extension",
				packageContents: [
					{
						relativePath: "test.agent.md",
						downloadSource: "https://example.com/test.agent.md",
						targetLocation: "Reference/Agents/test.agent.md",
					},
				],
				requiredCapabilities: ["create_note"],
				dependsOnExtensions: [],
			};

			it("should return true for a valid marketplace extension", () => {
				expect(isValidMarketplaceExtension(validExtension)).toBe(true);
			});

			it("should return true for valid extension with optional fields", () => {
				const extWithOptionals: MarketplaceExtension = {
					...validExtension,
					downloadMetrics: 100,
					communityRating: 4.5,
					sourceRepository: "https://github.com/test/repo",
					previewImageUrl: "https://example.com/preview.png",
				};
				expect(isValidMarketplaceExtension(extWithOptionals)).toBe(true);
			});

			it("should return false for null or non-object values", () => {
				expect(isValidMarketplaceExtension(null)).toBe(false);
				expect(isValidMarketplaceExtension(undefined)).toBe(false);
				expect(isValidMarketplaceExtension("string")).toBe(false);
				expect(isValidMarketplaceExtension(123)).toBe(false);
				expect(isValidMarketplaceExtension([])).toBe(false);
			});

			it("should return false when required fields are missing", () => {
				const missingId = { ...validExtension };
				delete (missingId as any).uniqueId;
				expect(isValidMarketplaceExtension(missingId)).toBe(false);

				const missingTitle = { ...validExtension };
				delete (missingTitle as any).displayTitle;
				expect(isValidMarketplaceExtension(missingTitle)).toBe(false);

				const missingKind = { ...validExtension };
				delete (missingKind as any).kind;
				expect(isValidMarketplaceExtension(missingKind)).toBe(false);

				const missingVersion = { ...validExtension };
				delete (missingVersion as any).semanticVersion;
				expect(isValidMarketplaceExtension(missingVersion)).toBe(false);
			});

			it("should return false when fields have wrong types", () => {
				const wrongTypeId = { ...validExtension, uniqueId: 123 };
				expect(isValidMarketplaceExtension(wrongTypeId)).toBe(false);

				const wrongTypeKind = { ...validExtension, kind: "invalid" };
				expect(isValidMarketplaceExtension(wrongTypeKind)).toBe(false);

				const wrongTypeTags = { ...validExtension, classificationTags: "not-array" };
				expect(isValidMarketplaceExtension(wrongTypeTags)).toBe(false);

				const wrongTypeContents = { ...validExtension, packageContents: "not-array" };
				expect(isValidMarketplaceExtension(wrongTypeContents)).toBe(false);
			});
		});

		describe("isValidCatalogManifest", () => {
			const validCatalog: CatalogManifest = {
				schemaVersion: "1.0",
				buildTimestamp: "2026-02-05T20:00:00Z",
				availableExtensions: [],
				knownCategories: ["Productivity", "Writing"],
				highlightedExtensions: ["ext-1", "ext-2"],
			};

			it("should return true for a valid catalog manifest", () => {
				expect(isValidCatalogManifest(validCatalog)).toBe(true);
			});

			it("should return true for catalog with extensions", () => {
				const validExtension: MarketplaceExtension = {
					uniqueId: "test-ext",
					displayTitle: "Test",
					kind: "agent",
					semanticVersion: "1.0.0",
					briefSummary: "Test extension",
					creator: { displayName: "Author" },
					classificationTags: [],
					searchKeywords: [],
					publishTimestamp: "2026-01-01T00:00:00Z",
					lastModifiedTimestamp: "2026-01-01T00:00:00Z",
					totalSizeBytes: "100",
					requiredPluginVersion: "0.1.0",
					webDetailPage: "https://example.com",
					packageContents: [],
					requiredCapabilities: [],
					dependsOnExtensions: [],
				};

				const catalogWithExtensions = {
					...validCatalog,
					availableExtensions: [validExtension],
				};
				expect(isValidCatalogManifest(catalogWithExtensions)).toBe(true);
			});

			it("should return false for null or non-object values", () => {
				expect(isValidCatalogManifest(null)).toBe(false);
				expect(isValidCatalogManifest(undefined)).toBe(false);
				expect(isValidCatalogManifest("string")).toBe(false);
				expect(isValidCatalogManifest(123)).toBe(false);
			});

			it("should return false when required fields are missing", () => {
				const missingVersion = { ...validCatalog };
				delete (missingVersion as any).schemaVersion;
				expect(isValidCatalogManifest(missingVersion)).toBe(false);

				const missingTimestamp = { ...validCatalog };
				delete (missingTimestamp as any).buildTimestamp;
				expect(isValidCatalogManifest(missingTimestamp)).toBe(false);

				const missingExtensions = { ...validCatalog };
				delete (missingExtensions as any).availableExtensions;
				expect(isValidCatalogManifest(missingExtensions)).toBe(false);
			});

			it("should return false when fields have wrong types", () => {
				const wrongTypeVersion = { ...validCatalog, schemaVersion: 1.0 };
				expect(isValidCatalogManifest(wrongTypeVersion)).toBe(false);

				const wrongTypeExtensions = { ...validCatalog, availableExtensions: "not-array" };
				expect(isValidCatalogManifest(wrongTypeExtensions)).toBe(false);

				const wrongTypeCategories = { ...validCatalog, knownCategories: {} };
				expect(isValidCatalogManifest(wrongTypeCategories)).toBe(false);
			});
		});
	});

	describe("Interface Structures", () => {
		it("should create a valid ExtensionCreator", () => {
			const creator: ExtensionCreator = {
				displayName: "John Doe",
				profileLink: "https://github.com/johndoe",
				contactEmail: "john@example.com",
			};

			expect(creator.displayName).toBe("John Doe");
			expect(creator.profileLink).toBe("https://github.com/johndoe");
			expect(creator.contactEmail).toBe("john@example.com");
		});

		it("should create a valid PackagedFile", () => {
			const file: PackagedFile = {
				relativePath: "test.agent.md",
				downloadSource: "https://raw.githubusercontent.com/user/repo/main/test.agent.md",
				targetLocation: "Reference/Agents/test.agent.md",
			};

			expect(file.relativePath).toBe("test.agent.md");
			expect(file.downloadSource).toContain("githubusercontent.com");
			expect(file.targetLocation).toContain("Reference/Agents");
		});

		it("should create a valid LocalExtensionRecord", () => {
			const record: LocalExtensionRecord = {
				extensionId: "my-agent",
				installedVersion: "1.2.0",
				installationTimestamp: "2026-02-05T15:00:00Z",
				installedFilePaths: ["Reference/Agents/my-agent.agent.md"],
				linkedDependencies: ["dependency-1"],
			};

			expect(record.extensionId).toBe("my-agent");
			expect(record.installedVersion).toBe("1.2.0");
			expect(record.installedFilePaths).toHaveLength(1);
			expect(record.linkedDependencies).toContain("dependency-1");
		});

		it("should create a valid BrowseFilter", () => {
			const filter: BrowseFilter = {
				textQuery: "journal",
				filterByKind: "agent",
				filterByCategories: ["Productivity"],
				showOnlyInstalled: false,
			};

			expect(filter.textQuery).toBe("journal");
			expect(filter.filterByKind).toBe("agent");
			expect(filter.filterByCategories).toContain("Productivity");
			expect(filter.showOnlyInstalled).toBe(false);
		});

		it("should create a valid InstallationOutcome for success", () => {
			const outcome: InstallationOutcome = {
				operationSucceeded: true,
				affectedExtensionId: "test-extension",
				modifiedFilePaths: ["Reference/Agents/test.agent.md"],
			};

			expect(outcome.operationSucceeded).toBe(true);
			expect(outcome.affectedExtensionId).toBe("test-extension");
			expect(outcome.modifiedFilePaths).toHaveLength(1);
			expect(outcome.errorDetails).toBeUndefined();
		});

		it("should create a valid InstallationOutcome for failure", () => {
			const outcome: InstallationOutcome = {
				operationSucceeded: false,
				affectedExtensionId: "failed-extension",
				modifiedFilePaths: [],
				errorDetails: "Network error: Failed to download file",
			};

			expect(outcome.operationSucceeded).toBe(false);
			expect(outcome.errorDetails).toContain("Network error");
		});

		it("should create a valid UpdateNotification", () => {
			const notification: UpdateNotification = {
				extensionId: "my-extension",
				currentlyInstalledVersion: "1.0.0",
				availableNewerVersion: "1.1.0",
				updateDescription: "Bug fixes and performance improvements",
			};

			expect(notification.extensionId).toBe("my-extension");
			expect(notification.currentlyInstalledVersion).toBe("1.0.0");
			expect(notification.availableNewerVersion).toBe("1.1.0");
			expect(notification.updateDescription).toContain("Bug fixes");
		});
	});

	describe("Type Assignments", () => {
		it("should allow all valid VaultExtensionKind values", () => {
			const kinds: VaultExtensionKind[] = [
				"agent",
				"voice-agent",
				"prompt",
				"skill",
				"mcp-server",
			];

			expect(kinds).toHaveLength(5);
			kinds.forEach(kind => {
				expect(isValidExtensionKind(kind)).toBe(true);
			});
		});

		it("should create BrowseFilter with all optional fields omitted", () => {
			const emptyFilter: BrowseFilter = {};

			expect(emptyFilter.textQuery).toBeUndefined();
			expect(emptyFilter.filterByKind).toBeUndefined();
			expect(emptyFilter.filterByCategories).toBeUndefined();
			expect(emptyFilter.showOnlyInstalled).toBeUndefined();
		});

		it("should create ExtensionCreator with only required field", () => {
			const minimalCreator: ExtensionCreator = {
				displayName: "Minimal Author",
			};

			expect(minimalCreator.displayName).toBe("Minimal Author");
			expect(minimalCreator.profileLink).toBeUndefined();
			expect(minimalCreator.contactEmail).toBeUndefined();
		});
	});
});



