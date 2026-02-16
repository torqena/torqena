/**
 * Unit tests for realtime-agent/types.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	REALTIME_MODEL,
	DEFAULT_TOOL_CONFIG,
	VAULT_READ_TOOLS,
	VAULT_WRITE_TOOLS,
	WEB_TOOLS,
	logger,
	setLogLevel,
	getLogLevel,
	type LogLevel,
	type RealtimeVoice,
	type TurnDetectionMode,
	type RealtimeAgentState,
	type RealtimeToolName,
	type RealtimeToolConfig,
	type RealtimeAgentConfig,
	type RealtimeHistoryItem,
	type ToolExecutionCallback,
} from "../../src/ai/realtime-agent/types";

describe("types.ts", () => {
	describe("REALTIME_MODEL constant", () => {
		it("should be the correct model string", () => {
			expect(REALTIME_MODEL).toBe("gpt-4o-realtime-preview");
		});

		it("should be a const type", () => {
			const model: typeof REALTIME_MODEL = REALTIME_MODEL;
			expect(model).toBe("gpt-4o-realtime-preview");
		});
	});

	describe("DEFAULT_TOOL_CONFIG", () => {
		it("should have all categories enabled by default", () => {
			expect(DEFAULT_TOOL_CONFIG.vaultRead).toBe(true);
			expect(DEFAULT_TOOL_CONFIG.vaultWrite).toBe(true);
			expect(DEFAULT_TOOL_CONFIG.webAccess).toBe(true);
			expect(DEFAULT_TOOL_CONFIG.mcpTools).toBe(true);
		});

		it("should not have individual tool overrides by default", () => {
			expect(DEFAULT_TOOL_CONFIG.enabled).toBeUndefined();
		});
	});

	describe("Tool category arrays", () => {
		describe("VAULT_READ_TOOLS", () => {
			it("should contain all vault read tool names", () => {
				expect(VAULT_READ_TOOLS).toContain("read_note");
				expect(VAULT_READ_TOOLS).toContain("search_notes");
				expect(VAULT_READ_TOOLS).toContain("get_active_note");
				expect(VAULT_READ_TOOLS).toContain("list_notes");
			});

			it("should have exactly 11 tools", () => {
				expect(VAULT_READ_TOOLS).toHaveLength(11);
			});

			it("should not contain write tools", () => {
				expect(VAULT_READ_TOOLS).not.toContain("create_note");
				expect(VAULT_READ_TOOLS).not.toContain("append_to_note");
			});
		});

		describe("VAULT_WRITE_TOOLS", () => {
			it("should contain all vault write tool names", () => {
				expect(VAULT_WRITE_TOOLS).toContain("create_note");
				expect(VAULT_WRITE_TOOLS).toContain("append_to_note");
				expect(VAULT_WRITE_TOOLS).toContain("update_note");
				expect(VAULT_WRITE_TOOLS).toContain("replace_note");
				expect(VAULT_WRITE_TOOLS).toContain("mark_tasks_complete");
				expect(VAULT_WRITE_TOOLS).toContain("mark_tasks");
				expect(VAULT_WRITE_TOOLS).toContain("create_task");
			});

			it("should have exactly 7 tools", () => {
				expect(VAULT_WRITE_TOOLS).toHaveLength(7);
			});

			it("should not contain read tools", () => {
				expect(VAULT_WRITE_TOOLS).not.toContain("read_note");
				expect(VAULT_WRITE_TOOLS).not.toContain("search_notes");
			});
		});

		describe("WEB_TOOLS", () => {
			it("should contain all web tool names", () => {
				expect(WEB_TOOLS).toContain("fetch_web_page");
				expect(WEB_TOOLS).toContain("web_search");
			});

			it("should have exactly 2 tools", () => {
				expect(WEB_TOOLS).toHaveLength(2);
			});
		});

		it("should have no overlap between categories", () => {
			const allTools = [...VAULT_READ_TOOLS, ...VAULT_WRITE_TOOLS, ...WEB_TOOLS];
			const uniqueTools = new Set(allTools);
			expect(uniqueTools.size).toBe(allTools.length);
		});

		it("should cover all 20 tool names (including task tools)", () => {
			const allTools = [...VAULT_READ_TOOLS, ...VAULT_WRITE_TOOLS, ...WEB_TOOLS];
			// 11 read + 7 write + 2 web = 20
			expect(allTools).toHaveLength(20);
		});
	});

	describe("Logger utility", () => {
		beforeEach(() => {
			setLogLevel("info");
		});

		describe("setLogLevel / getLogLevel", () => {
			it("should default to info level", () => {
				setLogLevel("info");
				expect(getLogLevel()).toBe("info");
			});

			it("should set and get debug level", () => {
				setLogLevel("debug");
				expect(getLogLevel()).toBe("debug");
			});

			it("should set and get warn level", () => {
				setLogLevel("warn");
				expect(getLogLevel()).toBe("warn");
			});

			it("should set and get error level", () => {
				setLogLevel("error");
				expect(getLogLevel()).toBe("error");
			});

			it("should set and get none level", () => {
				setLogLevel("none");
				expect(getLogLevel()).toBe("none");
			});
		});

		describe("logger methods exist", () => {
			it("should have debug method", () => {
				expect(typeof logger.debug).toBe("function");
			});

			it("should have info method", () => {
				expect(typeof logger.info).toBe("function");
			});

			it("should have warn method", () => {
				expect(typeof logger.warn).toBe("function");
			});

			it("should have error method", () => {
				expect(typeof logger.error).toBe("function");
			});
		});

		describe("log level filtering", () => {
			it("should not throw when calling debug at debug level", () => {
				setLogLevel("debug");
				expect(() => logger.debug("test message")).not.toThrow();
			});

			it("should not throw when calling info at info level", () => {
				setLogLevel("info");
				expect(() => logger.info("test message")).not.toThrow();
			});

			it("should not throw when calling warn at warn level", () => {
				setLogLevel("warn");
				expect(() => logger.warn("test message")).not.toThrow();
			});

			it("should not throw when calling error at error level", () => {
				setLogLevel("error");
				expect(() => logger.error("test message")).not.toThrow();
			});

			it("should not throw when level is none", () => {
				setLogLevel("none");
				expect(() => logger.debug("test")).not.toThrow();
				expect(() => logger.info("test")).not.toThrow();
				expect(() => logger.warn("test")).not.toThrow();
				expect(() => logger.error("test")).not.toThrow();
			});
		});

		describe("logger accepts additional arguments", () => {
			it("should accept multiple arguments", () => {
				setLogLevel("debug");
				expect(() => logger.debug("message", { key: "value" }, 123)).not.toThrow();
			});

			it("should accept arrays", () => {
				setLogLevel("debug");
				expect(() => logger.info("items:", [1, 2, 3])).not.toThrow();
			});

			it("should accept null and undefined", () => {
				setLogLevel("debug");
				expect(() => logger.debug("value:", null, undefined)).not.toThrow();
			});
		});
	});

	describe("Type definitions (compile-time checks)", () => {
		it("should accept valid RealtimeVoice values", () => {
			const voices: RealtimeVoice[] = [
				"alloy", "ash", "ballad", "coral", "echo",
				"fable", "onyx", "nova", "sage", "shimmer", "verse",
			];
			expect(voices).toHaveLength(11);
		});

		it("should accept valid TurnDetectionMode values", () => {
			const modes: TurnDetectionMode[] = ["semantic_vad", "server_vad"];
			expect(modes).toHaveLength(2);
		});

		it("should accept valid RealtimeAgentState values", () => {
			const states: RealtimeAgentState[] = [
				"idle", "connecting", "connected", "speaking", "listening", "error",
			];
			expect(states).toHaveLength(6);
		});

		it("should accept valid RealtimeToolName values", () => {
			const toolNames: RealtimeToolName[] = [
				"read_note", "search_notes", "get_active_note", "list_notes",
				"create_note", "append_to_note", "update_note", "replace_note",
				"mark_tasks_complete", "fetch_web_page", "web_search",
			];
			expect(toolNames).toHaveLength(11);
		});

		it("should accept valid LogLevel values", () => {
			const levels: LogLevel[] = ["debug", "info", "warn", "error", "none"];
			expect(levels).toHaveLength(5);
		});
	});

	describe("RealtimeToolConfig interface", () => {
		it("should allow empty config", () => {
			const config: RealtimeToolConfig = {};
			expect(config).toBeDefined();
		});

		it("should allow partial category config", () => {
			const config: RealtimeToolConfig = {
				vaultRead: true,
				vaultWrite: false,
			};
			expect(config.vaultRead).toBe(true);
			expect(config.vaultWrite).toBe(false);
		});

		it("should allow per-tool overrides", () => {
			const config: RealtimeToolConfig = {
				enabled: {
					read_note: false,
					create_note: true,
				},
			};
			expect(config.enabled?.read_note).toBe(false);
			expect(config.enabled?.create_note).toBe(true);
		});

		it("should allow combined category and per-tool config", () => {
			const config: RealtimeToolConfig = {
				vaultRead: true,
				vaultWrite: false,
				webAccess: true,
				mcpTools: false,
				enabled: {
					create_note: true, // Override vaultWrite=false for this one
				},
			};
			expect(config.vaultWrite).toBe(false);
			expect(config.enabled?.create_note).toBe(true);
		});
	});

	describe("RealtimeHistoryItem interface", () => {
		it("should accept message type", () => {
			const item: RealtimeHistoryItem = {
				type: "message",
				role: "user",
				content: "Hello",
			};
			expect(item.type).toBe("message");
		});

		it("should accept function_call type", () => {
			const item: RealtimeHistoryItem = {
				type: "function_call",
				name: "read_note",
				arguments: '{"path": "test.md"}',
			};
			expect(item.type).toBe("function_call");
		});

		it("should accept function_call_output type", () => {
			const item: RealtimeHistoryItem = {
				type: "function_call_output",
				output: '{"success": true}',
			};
			expect(item.type).toBe("function_call_output");
		});

		it("should allow transcript field", () => {
			const item: RealtimeHistoryItem = {
				type: "message",
				role: "user",
				transcript: "Hello, how are you?",
			};
			expect(item.transcript).toBe("Hello, how are you?");
		});
	});

	describe("ToolExecutionCallback type", () => {
		it("should accept valid callback function", () => {
			const callback: ToolExecutionCallback = (toolName, args, result) => {
				expect(toolName).toBe("read_note");
				expect(args).toEqual({ path: "test.md" });
				expect(result).toEqual({ success: true });
			};
			callback("read_note", { path: "test.md" }, { success: true });
		});
	});
});



