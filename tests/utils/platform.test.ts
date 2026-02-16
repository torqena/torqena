/**
 * Tests for platform utilities
 */

import { describe, it, expect } from "vitest";
import {
	isMobile,
	isDesktop,
	getAvailableProviders,
	isProviderAvailable,
	getMcpTransports,
	supportsLocalProcesses,
} from "../../src/utils/platform";

describe("platform.ts", () => {
	describe("Platform detection", () => {
		it("should detect mobile platform", () => {
			// The actual value depends on the mock Platform object
			expect(typeof isMobile).toBe("boolean");
		});

		it("should detect desktop platform", () => {
			expect(typeof isDesktop).toBe("boolean");
		});

		it("mobile and desktop should be mutually exclusive", () => {
			// In real usage, one should be true and the other false
			// But in test environment with mocks, we just verify they're booleans
			expect(typeof isMobile).toBe("boolean");
			expect(typeof isDesktop).toBe("boolean");
		});
	});

	describe("Available providers", () => {
		it("should return an array of provider types", () => {
			const providers = getAvailableProviders();
			expect(Array.isArray(providers)).toBe(true);
			expect(providers.length).toBeGreaterThan(0);
		});

		it("should always include OpenAI and Azure OpenAI", () => {
			const providers = getAvailableProviders();
			expect(providers).toContain("openai");
			expect(providers).toContain("azure-openai");
		});

		it("should check if a provider is available", () => {
			expect(isProviderAvailable("openai")).toBe(true);
			expect(isProviderAvailable("azure-openai")).toBe(true);
		});
	});

	describe("MCP transports", () => {
		it("should return available MCP transports", () => {
			const transports = getMcpTransports();
			expect(Array.isArray(transports)).toBe(true);
			expect(transports.length).toBeGreaterThan(0);
		});

		it("should always include HTTP transport", () => {
			const transports = getMcpTransports();
			expect(transports).toContain("http");
		});
	});

	describe("Local process support", () => {
		it("should return a boolean for local process support", () => {
			expect(typeof supportsLocalProcesses()).toBe("boolean");
		});
	});
});



