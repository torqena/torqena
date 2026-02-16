/**
 * Unit tests for realtime-agent/workarounds.ts
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	escapeRegex,
	executeTaskCompletion,
	handlePossibleJsonToolCall,
	mightBeJsonToolCall,
} from "../../src/ai/realtime-agent/workarounds";
import { App, TFile, Notice, Vault, Workspace } from "../../src/__mocks__/platform";
import type { RealtimeHistoryItem, ToolExecutionCallback } from "../../src/ai/realtime-agent/types";
import { setLogLevel } from "../../src/ai/realtime-agent/types";

// Mock the obsidian module
vi.mock("obsidian", () => import("../../__mocks__/platform"));

describe("workarounds.ts", () => {
	let app: App;
	let mockCallback: ToolExecutionCallback;

	beforeEach(() => {
		// Reset log level to suppress logs during tests
		setLogLevel("none");
		
		// Create fresh app instance
		app = new App();
		
		// Clear notices
		Notice._clear();
		
		// Create mock callback
		mockCallback = vi.fn();
	});

	describe("escapeRegex", () => {
		it("should escape basic regex special characters", () => {
			expect(escapeRegex("hello.world")).toBe("hello\\.world");
			expect(escapeRegex("a*b+c?")).toBe("a\\*b\\+c\\?");
		});

		it("should escape brackets", () => {
			expect(escapeRegex("[test]")).toBe("\\[test\\]");
			expect(escapeRegex("(group)")).toBe("\\(group\\)");
			expect(escapeRegex("{curly}")).toBe("\\{curly\\}");
		});

		it("should escape caret and dollar", () => {
			expect(escapeRegex("^start")).toBe("\\^start");
			expect(escapeRegex("end$")).toBe("end\\$");
		});

		it("should escape pipe and backslash", () => {
			expect(escapeRegex("a|b")).toBe("a\\|b");
			expect(escapeRegex("path\\to\\file")).toBe("path\\\\to\\\\file");
		});

		it("should handle empty string", () => {
			expect(escapeRegex("")).toBe("");
		});

		it("should handle string with no special characters", () => {
			expect(escapeRegex("hello world")).toBe("hello world");
		});

		it("should handle multiple special characters together", () => {
			expect(escapeRegex(".*+?^${}()|[]\\")).toBe(
				"\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\"
			);
		});
	});

	describe("executeTaskCompletion", () => {
		it("should mark single task as complete", async () => {
			const file = new TFile("test.md");
			(app.vault as Vault)._setFile(
				"test.md",
				"# Tasks\n- [ ] Task one\n- [ ] Task two"
			);

			await executeTaskCompletion(
				app as unknown as import("obsidian").App,
				file as unknown as import("obsidian").TFile,
				["Task one"],
				mockCallback
			);

			const content = (app.vault as Vault)._getFile("test.md");
			expect(content).toContain("- [x] Task one");
			expect(content).toContain("- [ ] Task two");
		});

		it("should mark multiple tasks as complete", async () => {
			const file = new TFile("test.md");
			(app.vault as Vault)._setFile(
				"test.md",
				"# Tasks\n- [ ] Task one\n- [ ] Task two\n- [ ] Task three"
			);

			await executeTaskCompletion(
				app as unknown as import("obsidian").App,
				file as unknown as import("obsidian").TFile,
				["Task one", "Task three"],
				mockCallback
			);

			const content = (app.vault as Vault)._getFile("test.md");
			expect(content).toContain("- [x] Task one");
			expect(content).toContain("- [ ] Task two");
			expect(content).toContain("- [x] Task three");
		});

		it("should call onToolExecution callback when tasks are completed", async () => {
			const file = new TFile("test.md");
			(app.vault as Vault)._setFile("test.md", "- [ ] Task one");

			await executeTaskCompletion(
				app as unknown as import("obsidian").App,
				file as unknown as import("obsidian").TFile,
				["Task one"],
				mockCallback
			);

			expect(mockCallback).toHaveBeenCalledWith(
				"mark_tasks_complete",
				{ tasks: ["Task one"] },
				{ success: true, count: 1 }
			);
		});

		it("should not call callback when no tasks match", async () => {
			const file = new TFile("test.md");
			(app.vault as Vault)._setFile("test.md", "- [ ] Different task");

			await executeTaskCompletion(
				app as unknown as import("obsidian").App,
				file as unknown as import("obsidian").TFile,
				["Non-existent task"],
				mockCallback
			);

			expect(mockCallback).not.toHaveBeenCalled();
		});

		it("should skip empty task strings", async () => {
			const file = new TFile("test.md");
			(app.vault as Vault)._setFile("test.md", "- [ ] Task one");

			await executeTaskCompletion(
				app as unknown as import("obsidian").App,
				file as unknown as import("obsidian").TFile,
				["", "Task one", ""],
				mockCallback
			);

			expect(mockCallback).toHaveBeenCalledWith(
				"mark_tasks_complete",
				{ tasks: ["", "Task one", ""] },
				{ success: true, count: 1 }
			);
		});

		it("should handle tasks with special regex characters", async () => {
			const file = new TFile("test.md");
			(app.vault as Vault)._setFile("test.md", "- [ ] Task (with) [brackets]");

			await executeTaskCompletion(
				app as unknown as import("obsidian").App,
				file as unknown as import("obsidian").TFile,
				["Task (with) [brackets]"],
				mockCallback
			);

			const content = (app.vault as Vault)._getFile("test.md");
			expect(content).toContain("- [x] Task (with) [brackets]");
		});

		it("should call onToolExecution callback when tasks are completed", async () => {
			const file = new TFile("test.md");
			(app.vault as Vault)._setFile("test.md", "- [ ] Task one\n- [ ] Task two");

			await executeTaskCompletion(
				app as unknown as import("obsidian").App,
				file as unknown as import("obsidian").TFile,
				["Task one", "Task two"],
				mockCallback
			);

			expect(mockCallback).toHaveBeenCalledWith(
				"mark_tasks_complete",
				{ tasks: ["Task one", "Task two"] },
				{ success: true, count: 2 }
			);
		});
	});

	describe("mightBeJsonToolCall", () => {
		it("should return true for JSON object starting with {", () => {
			const item: RealtimeHistoryItem = {
				type: "message",
				role: "assistant",
				content: '{"path": "test.md", "content": "Hello"}',
			};
			expect(mightBeJsonToolCall(item)).toBe(true);
		});

		it("should return true for JSON array starting with [", () => {
			const item: RealtimeHistoryItem = {
				type: "message",
				role: "assistant",
				content: '[{"task": "one"}]',
			};
			expect(mightBeJsonToolCall(item)).toBe(true);
		});

		it("should return true for function-call-like syntax", () => {
			const item: RealtimeHistoryItem = {
				type: "message",
				role: "assistant",
				content: 'update_checklist("task1": completed)',
			};
			expect(mightBeJsonToolCall(item)).toBe(true);
		});

		it("should return false for user messages", () => {
			const item: RealtimeHistoryItem = {
				type: "message",
				role: "user",
				content: '{"some": "json"}',
			};
			expect(mightBeJsonToolCall(item)).toBe(false);
		});

		it("should return false for regular text", () => {
			const item: RealtimeHistoryItem = {
				type: "message",
				role: "assistant",
				content: "Hello, how can I help you?",
			};
			expect(mightBeJsonToolCall(item)).toBe(false);
		});

		it("should handle transcript field", () => {
			const item: RealtimeHistoryItem = {
				type: "message",
				role: "assistant",
				transcript: '{"path": "test.md"}',
			};
			expect(mightBeJsonToolCall(item)).toBe(true);
		});

		it("should handle whitespace in content", () => {
			const item: RealtimeHistoryItem = {
				type: "message",
				role: "assistant",
				content: '  {"path": "test.md"}  ',
			};
			expect(mightBeJsonToolCall(item)).toBe(true);
		});

		it("should return false for empty content", () => {
			const item: RealtimeHistoryItem = {
				type: "message",
				role: "assistant",
				content: "",
			};
			expect(mightBeJsonToolCall(item)).toBe(false);
		});

		it("should return false for undefined content", () => {
			const item: RealtimeHistoryItem = {
				type: "message",
				role: "assistant",
			};
			expect(mightBeJsonToolCall(item)).toBe(false);
		});
	});

	describe("handlePossibleJsonToolCall", () => {
		describe("function-call syntax handling", () => {
			it("should handle Python-like function call with completed tasks", async () => {
				const file = new TFile("active.md");
				(app.vault as Vault)._setFile(
					"active.md",
					"- [ ] Buy groceries\n- [ ] Walk dog"
				);
				(app.workspace as Workspace)._setActiveFile(file);

				await handlePossibleJsonToolCall(
					app as unknown as import("obsidian").App,
					'update_checklist("Buy groceries": completed, "Walk dog": done)',
					mockCallback
				);

				const content = (app.vault as Vault)._getFile("active.md");
				expect(content).toContain("- [x] Buy groceries");
				expect(content).toContain("- [x] Walk dog");
			});

			it("should handle True boolean style", async () => {
				const file = new TFile("active.md");
				(app.vault as Vault)._setFile("active.md", "- [ ] Task A");
				(app.workspace as Workspace)._setActiveFile(file);

				await handlePossibleJsonToolCall(
					app as unknown as import("obsidian").App,
					'mark_complete("Task A": True)',
					mockCallback
				);

				const content = (app.vault as Vault)._getFile("active.md");
				expect(content).toContain("- [x] Task A");
			});
		});

		describe("replace_note JSON handling", () => {
			it("should handle replace_note JSON format", async () => {
				(app.vault as Vault)._setFile("notes/test.md", "Old content");

				await handlePossibleJsonToolCall(
					app as unknown as import("obsidian").App,
					JSON.stringify({ path: "notes/test.md", content: "New content" }),
					mockCallback
				);

				const content = (app.vault as Vault)._getFile("notes/test.md");
				expect(content).toBe("New content");
			});

			it("should add .md extension if missing", async () => {
				(app.vault as Vault)._setFile("test.md", "Old content");

				await handlePossibleJsonToolCall(
					app as unknown as import("obsidian").App,
					JSON.stringify({ path: "test", content: "New content" }),
					mockCallback
				);

				const content = (app.vault as Vault)._getFile("test.md");
				expect(content).toBe("New content");
			});

			it("should normalize backslashes to forward slashes", async () => {
				(app.vault as Vault)._setFile("folder/test.md", "Old content");

				await handlePossibleJsonToolCall(
					app as unknown as import("obsidian").App,
					JSON.stringify({ path: "folder\\test.md", content: "New content" }),
					mockCallback
				);

				const content = (app.vault as Vault)._getFile("folder/test.md");
				expect(content).toBe("New content");
			});

			it("should call onToolExecution for replace_note", async () => {
				(app.vault as Vault)._setFile("test.md", "Old content");

				await handlePossibleJsonToolCall(
					app as unknown as import("obsidian").App,
					JSON.stringify({ path: "test.md", content: "New content" }),
					mockCallback
				);

				expect(mockCallback).toHaveBeenCalledWith(
					"replace_note",
					{ path: "test.md" },
					{ success: true }
				);
			});
		});

		describe("checklist JSON handling", () => {
			it("should handle checklist array format", async () => {
				const file = new TFile("active.md");
				(app.vault as Vault)._setFile(
					"active.md",
					"- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3"
				);
				(app.workspace as Workspace)._setActiveFile(file);

				await handlePossibleJsonToolCall(
					app as unknown as import("obsidian").App,
					JSON.stringify({
						checklist: [
							{ task: "Task 1", completed: true },
							{ task: "Task 2", completed: false },
							{ task: "Task 3", completed: true },
						],
					}),
					mockCallback
				);

				const content = (app.vault as Vault)._getFile("active.md");
				expect(content).toContain("- [x] Task 1");
				expect(content).toContain("- [ ] Task 2");
				expect(content).toContain("- [x] Task 3");
			});

			it("should require active file for checklist format", async () => {
				(app.workspace as Workspace)._setActiveFile(null);

				await handlePossibleJsonToolCall(
					app as unknown as import("obsidian").App,
					JSON.stringify({
						checklist: [{ task: "Task 1", completed: true }],
					}),
					mockCallback
				);

				// Should not call callback when no active file
				expect(mockCallback).not.toHaveBeenCalled();
			});
		});

		describe("updates array JSON handling", () => {
			it("should handle pattern/replacement format", async () => {
				(app.vault as Vault)._setFile(
					"test.md",
					"Status: pending\nOther content"
				);

				await handlePossibleJsonToolCall(
					app as unknown as import("obsidian").App,
					JSON.stringify({
						path: "test.md",
						updates: [{ pattern: "Status: pending", replacement: "Status: done" }],
					}),
					mockCallback
				);

				const content = (app.vault as Vault)._getFile("test.md");
				expect(content).toContain("Status: done");
			});

			it("should use active file when no path provided", async () => {
				const file = new TFile("active.md");
				(app.vault as Vault)._setFile("active.md", "Status: pending");
				(app.workspace as Workspace)._setActiveFile(file);

				await handlePossibleJsonToolCall(
					app as unknown as import("obsidian").App,
					JSON.stringify({
						updates: [{ pattern: "Status: pending", replacement: "Status: done" }],
					}),
					mockCallback
				);

				const content = (app.vault as Vault)._getFile("active.md");
				expect(content).toContain("Status: done");
			});

			it("should call onToolExecution for update_note", async () => {
				(app.vault as Vault)._setFile("test.md", "Status: pending");

				await handlePossibleJsonToolCall(
					app as unknown as import("obsidian").App,
					JSON.stringify({
						path: "test.md",
						updates: [{ pattern: "Status: pending", replacement: "Status: done" }],
					}),
					mockCallback
				);

				expect(mockCallback).toHaveBeenCalledWith(
					"update_note",
					{ path: "test.md" },
					{ success: true }
				);
			});
		});

		describe("error handling", () => {
			it("should not throw on invalid JSON", async () => {
				await expect(
					handlePossibleJsonToolCall(
						app as unknown as import("obsidian").App,
						"not valid json {",
						mockCallback
					)
				).resolves.not.toThrow();
			});

			it("should not throw on empty content", async () => {
				await expect(
					handlePossibleJsonToolCall(
						app as unknown as import("obsidian").App,
						"",
						mockCallback
					)
				).resolves.not.toThrow();
			});

			it("should handle null callback gracefully", async () => {
				(app.vault as Vault)._setFile("test.md", "Old content");

				await expect(
					handlePossibleJsonToolCall(
						app as unknown as import("obsidian").App,
						JSON.stringify({ path: "test.md", content: "New content" }),
						null
					)
				).resolves.not.toThrow();
			});

			it("should handle file not found gracefully", async () => {
				await expect(
					handlePossibleJsonToolCall(
						app as unknown as import("obsidian").App,
						JSON.stringify({ path: "nonexistent.md", content: "Content" }),
						mockCallback
					)
				).resolves.not.toThrow();

				// Callback should not be called for missing file
				expect(mockCallback).not.toHaveBeenCalled();
			});
		});
	});
});




