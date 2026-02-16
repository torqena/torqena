/**
 * Tests for HTTP MCP Client
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HttpMcpClient } from "../../src/ai/mcp/HttpMcpClient";
import { HttpMcpServerConfig } from "../../src/ai/mcp/McpTypes";

describe("HttpMcpClient", () => {
	let config: HttpMcpServerConfig;

	beforeEach(() => {
		config = {
			id: "test-server",
			name: "Test HTTP MCP Server",
			enabled: true,
			source: "manual",
			transport: "http",
			url: "https://example.com/mcp",
			apiKey: "test-api-key",
		};
	});

	describe("Constructor", () => {
		it("should create an instance with config", () => {
			const client = new HttpMcpClient(config);
			expect(client).toBeDefined();
			expect(client.getStatus()).toBe("disconnected");
		});

		it("should initialize with empty tools list", () => {
			const client = new HttpMcpClient(config);
			expect(client.getTools()).toEqual([]);
		});
	});

	describe("Status management", () => {
		it("should start with disconnected status", () => {
			const client = new HttpMcpClient(config);
			expect(client.getStatus()).toBe("disconnected");
		});

		it("should return empty tools when disconnected", () => {
			const client = new HttpMcpClient(config);
			expect(client.getTools()).toHaveLength(0);
		});
	});

	describe("Configuration", () => {
		it("should accept config without API key", () => {
			const configNoKey: HttpMcpServerConfig = {
				id: "test-server-no-key",
				name: "Test Server No Key",
				enabled: true,
				source: "manual",
				transport: "http",
				url: "https://example.com/mcp",
			};
			const client = new HttpMcpClient(configNoKey);
			expect(client).toBeDefined();
		});

		it("should accept config with API key", () => {
			const client = new HttpMcpClient(config);
			expect(client).toBeDefined();
		});
	});

	describe("Type validation", () => {
		it("should enforce transport type as http", () => {
			expect(config.transport).toBe("http");
		});

		it("should have required fields", () => {
			expect(config.id).toBeDefined();
			expect(config.name).toBeDefined();
			expect(config.url).toBeDefined();
			expect(config.transport).toBe("http");
		});
	});
});



