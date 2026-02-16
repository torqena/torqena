/**
 * Tests for provider availability utilities
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	checkAnyProviderAvailable,
	hasAnyApiKeyConfigured,
	ProviderAvailabilityStatus,
} from "../../utils/providerAvailability";
import type { CopilotPluginSettings } from "../../ui/settings/types";
import type { App } from "obsidian";

// Mock the secrets module
vi.mock("../../utils/secrets", () => ({
	getSecretValue: vi.fn((app, secretId) => {
		if (secretId === "valid-secret") return "sk-xxx";
		return undefined;
	}),
}));

// Mock the AIProvider module
vi.mock("../../ai/providers/AIProvider", () => ({
	getOpenAIApiKey: vi.fn(() => undefined),
}));

// Mock the platform module
vi.mock("../../utils/platform", () => ({
	isDesktop: true,
}));

describe("providerAvailability.ts", () => {
	let mockApp: App;
	let mockSettings: CopilotPluginSettings;

	beforeEach(() => {
		mockApp = {} as App;
		mockSettings = {
			aiProviderProfiles: [],
		} as unknown as CopilotPluginSettings;
	});

	describe("checkAnyProviderAvailable", () => {
		it("should return not available when no profiles exist and CLI is not installed", async () => {
			const mockCliManager = {
				getStatus: vi.fn().mockResolvedValue({ installed: false }),
			};

			const status = await checkAnyProviderAvailable(
				mockApp,
				mockSettings,
				mockCliManager as any
			);

			expect(status.available).toBe(false);
			expect(status.providers.copilot.available).toBe(false);
			expect(status.providers.openai.available).toBe(false);
			expect(status.providers.azureOpenai.available).toBe(false);
		});

		it("should return available when CLI is installed", async () => {
			const mockCliManager = {
				getStatus: vi.fn().mockResolvedValue({ installed: true, version: "1.0.0" }),
			};

			const status = await checkAnyProviderAvailable(
				mockApp,
				mockSettings,
				mockCliManager as any
			);

			expect(status.available).toBe(true);
			expect(status.providers.copilot.available).toBe(true);
			expect(status.providers.copilot.installed).toBe(true);
		});

		it("should return available when OpenAI profile has API key", async () => {
			mockSettings.aiProviderProfiles = [
				{
					id: "openai-1",
					name: "OpenAI",
					type: "openai",
					apiKeySecretId: "valid-secret",
				},
			];

			const status = await checkAnyProviderAvailable(
				mockApp,
				mockSettings,
				null
			);

			expect(status.available).toBe(true);
			expect(status.providers.openai.available).toBe(true);
			expect(status.providers.openai.hasApiKey).toBe(true);
			expect(status.providers.openai.profileCount).toBe(1);
		});

		it("should return available when Azure profile has API key", async () => {
			mockSettings.aiProviderProfiles = [
				{
					id: "azure-1",
					name: "Azure",
					type: "azure-openai",
					apiKeySecretId: "valid-secret",
					endpoint: "https://example.azure.com",
					deploymentName: "gpt-4",
				},
			];

			const status = await checkAnyProviderAvailable(
				mockApp,
				mockSettings,
				null
			);

			expect(status.available).toBe(true);
			expect(status.providers.azureOpenai.available).toBe(true);
			expect(status.providers.azureOpenai.hasApiKey).toBe(true);
		});

		it("should handle CLI manager errors gracefully", async () => {
			const mockCliManager = {
				getStatus: vi.fn().mockRejectedValue(new Error("CLI error")),
			};

			const status = await checkAnyProviderAvailable(
				mockApp,
				mockSettings,
				mockCliManager as any
			);

			expect(status.providers.copilot.installed).toBe(false);
		});
	});

	describe("hasAnyApiKeyConfigured", () => {
		it("should return false when no profiles exist", () => {
			const result = hasAnyApiKeyConfigured(mockApp, mockSettings);
			expect(result).toBe(false);
		});

		it("should return true when OpenAI profile has valid API key", () => {
			mockSettings.aiProviderProfiles = [
				{
					id: "openai-1",
					name: "OpenAI",
					type: "openai",
					apiKeySecretId: "valid-secret",
				},
			];

			const result = hasAnyApiKeyConfigured(mockApp, mockSettings);
			expect(result).toBe(true);
		});

		it("should return false when profile has no API key", () => {
			mockSettings.aiProviderProfiles = [
				{
					id: "openai-1",
					name: "OpenAI",
					type: "openai",
					apiKeySecretId: "invalid-secret",
				},
			];

			const result = hasAnyApiKeyConfigured(mockApp, mockSettings);
			expect(result).toBe(false);
		});

		it("should return true when Azure profile has valid API key", () => {
			mockSettings.aiProviderProfiles = [
				{
					id: "azure-1",
					name: "Azure",
					type: "azure-openai",
					apiKeySecretId: "valid-secret",
					endpoint: "https://example.azure.com",
					deploymentName: "gpt-4",
				},
			];

			const result = hasAnyApiKeyConfigured(mockApp, mockSettings);
			expect(result).toBe(true);
		});
	});
});



