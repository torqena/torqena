/**
 * Unit tests for realtime-agent/tool-manager.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { isToolEnabled, getToolNames } from "../../src/ai/realtime-agent/tools/tool-manager";
import {
	VAULT_READ_TOOLS,
	VAULT_WRITE_TOOLS,
	WEB_TOOLS,
	setLogLevel,
	type RealtimeToolConfig,
	type RealtimeToolName,
} from "../../src/ai/realtime-agent/types";

describe("tool-manager.ts", () => {
	beforeEach(() => {
		// Suppress logs during tests
		setLogLevel("none");
	});

	describe("isToolEnabled", () => {
		describe("with empty config", () => {
			it("should enable all tools by default", () => {
				const config: RealtimeToolConfig = {};
				
				// Test vault read tools
				for (const tool of VAULT_READ_TOOLS) {
					expect(isToolEnabled(tool, config)).toBe(true);
				}
				
				// Test vault write tools
				for (const tool of VAULT_WRITE_TOOLS) {
					expect(isToolEnabled(tool, config)).toBe(true);
				}
				
				// Test web tools
				for (const tool of WEB_TOOLS) {
					expect(isToolEnabled(tool, config)).toBe(true);
				}
			});
		});

		describe("with category-level settings", () => {
			it("should disable all vault read tools when vaultRead is false", () => {
				const config: RealtimeToolConfig = { vaultRead: false };
				
				for (const tool of VAULT_READ_TOOLS) {
					expect(isToolEnabled(tool, config)).toBe(false);
				}
			});

			it("should enable all vault read tools when vaultRead is true", () => {
				const config: RealtimeToolConfig = { vaultRead: true };
				
				for (const tool of VAULT_READ_TOOLS) {
					expect(isToolEnabled(tool, config)).toBe(true);
				}
			});

			it("should disable all vault write tools when vaultWrite is false", () => {
				const config: RealtimeToolConfig = { vaultWrite: false };
				
				for (const tool of VAULT_WRITE_TOOLS) {
					expect(isToolEnabled(tool, config)).toBe(false);
				}
			});

			it("should enable all vault write tools when vaultWrite is true", () => {
				const config: RealtimeToolConfig = { vaultWrite: true };
				
				for (const tool of VAULT_WRITE_TOOLS) {
					expect(isToolEnabled(tool, config)).toBe(true);
				}
			});

			it("should disable all web tools when webAccess is false", () => {
				const config: RealtimeToolConfig = { webAccess: false };
				
				for (const tool of WEB_TOOLS) {
					expect(isToolEnabled(tool, config)).toBe(false);
				}
			});

			it("should enable all web tools when webAccess is true", () => {
				const config: RealtimeToolConfig = { webAccess: true };
				
				for (const tool of WEB_TOOLS) {
					expect(isToolEnabled(tool, config)).toBe(true);
				}
			});

			it("should not affect other categories", () => {
				const config: RealtimeToolConfig = { 
					vaultRead: false,
					vaultWrite: true,
					webAccess: true,
				};
				
				// Vault read should be disabled
				expect(isToolEnabled("read_note", config)).toBe(false);
				
				// Vault write should be enabled
				expect(isToolEnabled("create_note", config)).toBe(true);
				
				// Web should be enabled
				expect(isToolEnabled("web_search", config)).toBe(true);
			});
		});

		describe("with per-tool overrides", () => {
			it("should override category setting for specific tool", () => {
				const config: RealtimeToolConfig = {
					vaultRead: false,
					enabled: {
						read_note: true,  // Override category setting
					},
				};
				
				// read_note should be enabled despite vaultRead=false
				expect(isToolEnabled("read_note", config)).toBe(true);
				
				// Other vault read tools should still be disabled
				expect(isToolEnabled("search_notes", config)).toBe(false);
				expect(isToolEnabled("list_notes", config)).toBe(false);
			});

			it("should allow disabling specific tool when category is enabled", () => {
				const config: RealtimeToolConfig = {
					vaultWrite: true,
					enabled: {
						create_note: false,  // Disable this specific tool
					},
				};
				
				// create_note should be disabled
				expect(isToolEnabled("create_note", config)).toBe(false);
				
				// Other vault write tools should be enabled
				expect(isToolEnabled("append_to_note", config)).toBe(true);
				expect(isToolEnabled("update_note", config)).toBe(true);
			});

			it("should prioritize per-tool setting over category", () => {
				const config: RealtimeToolConfig = {
					webAccess: false,
					enabled: {
						web_search: true,
					},
				};
				
				expect(isToolEnabled("web_search", config)).toBe(true);
				expect(isToolEnabled("fetch_web_page", config)).toBe(false);
			});
		});

		describe("with mixed configuration", () => {
			it("should handle complex configurations correctly", () => {
				const config: RealtimeToolConfig = {
					vaultRead: true,
					vaultWrite: false,
					webAccess: true,
					enabled: {
						search_notes: false,  // Disable one read tool
						create_note: true,    // Enable one write tool
						web_search: false,    // Disable one web tool
					},
				};
				
				// Vault read: enabled except search_notes
				expect(isToolEnabled("read_note", config)).toBe(true);
				expect(isToolEnabled("search_notes", config)).toBe(false);
				expect(isToolEnabled("list_notes", config)).toBe(true);
				
				// Vault write: disabled except create_note
				expect(isToolEnabled("create_note", config)).toBe(true);
				expect(isToolEnabled("append_to_note", config)).toBe(false);
				expect(isToolEnabled("update_note", config)).toBe(false);
				
				// Web: enabled except web_search
				expect(isToolEnabled("fetch_web_page", config)).toBe(true);
				expect(isToolEnabled("web_search", config)).toBe(false);
			});
		});

		describe("edge cases", () => {
			it("should handle undefined in enabled map", () => {
				const config: RealtimeToolConfig = {
					enabled: {
						read_note: undefined as unknown as boolean,
					},
				};
				
				// Should fall through to default (enabled)
				expect(isToolEnabled("read_note", config)).toBe(true);
			});

			it("should work with all tool names", () => {
				const allTools: RealtimeToolName[] = [
					...VAULT_READ_TOOLS,
					...VAULT_WRITE_TOOLS,
					...WEB_TOOLS,
				];
				
				const config: RealtimeToolConfig = {};
				
				for (const tool of allTools) {
					expect(() => isToolEnabled(tool, config)).not.toThrow();
					expect(typeof isToolEnabled(tool, config)).toBe("boolean");
				}
			});
		});
	});

	describe("getToolNames", () => {
		it("should return empty array for empty tools list", () => {
			expect(getToolNames([])).toEqual([]);
		});

		it("should extract names from tools array", () => {
			const mockTools = [
				{ name: "tool_a" },
				{ name: "tool_b" },
				{ name: "tool_c" },
			];
			
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const names = getToolNames(mockTools as any);
			expect(names).toEqual(["tool_a", "tool_b", "tool_c"]);
		});

		it("should preserve order", () => {
			const mockTools = [
				{ name: "z_tool" },
				{ name: "a_tool" },
				{ name: "m_tool" },
			];
			
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const names = getToolNames(mockTools as any);
			expect(names).toEqual(["z_tool", "a_tool", "m_tool"]);
		});

		it("should handle single tool", () => {
			const mockTools = [{ name: "single_tool" }];
			
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const names = getToolNames(mockTools as any);
			expect(names).toEqual(["single_tool"]);
		});
	});

	describe("Tool categories consistency", () => {
		it("should have VAULT_READ_TOOLS contain only read operations", () => {
			const readToolNames = VAULT_READ_TOOLS;
			
			// All names should suggest reading, not writing
			expect(readToolNames.every(name => 
				!name.includes("create") && 
				!name.includes("append") && 
				!name.includes("update") && 
				!name.includes("replace") &&
				!name.includes("mark")
			)).toBe(true);
		});

		it("should have VAULT_WRITE_TOOLS contain only write operations", () => {
			const writeToolNames = VAULT_WRITE_TOOLS;
			
			// All names should suggest writing
			expect(writeToolNames.every(name => 
				name.includes("create") || 
				name.includes("append") || 
				name.includes("update") || 
				name.includes("replace") ||
				name.includes("mark")
			)).toBe(true);
		});

		it("should have WEB_TOOLS contain only web operations", () => {
			const webToolNames = WEB_TOOLS;
			
			// All names should suggest web operations
			expect(webToolNames.every(name => 
				name.includes("web") || 
				name.includes("fetch")
			)).toBe(true);
		});
	});
});



