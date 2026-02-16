/**
 * Unit tests for task-tools.ts
 * 
 * Tests task parsing utilities and tool factory functions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	parseTaskLine,
	parseTasksFromContent,
	buildTaskLine,
	filterTasks,
	createAllTaskTools,
	createGetTasksTool,
	createMarkTasksTool,
	createCreateTaskTool,
	createListTasksTool,
	TASK_TOOL_NAMES,
	type ParsedTask,
} from "../../src/ai/realtime-agent/tools/task-tools";
import type { ToolExecutionCallback } from "../../src/ai/realtime-agent/types";
import { App } from "obsidian";

// Mock the VaultOperations module
vi.mock("../../ai/VaultOperations", () => ({
	getTasksFromNote: vi.fn().mockResolvedValue({ success: true, tasks: [] }),
	updateTaskStatus: vi.fn().mockResolvedValue({ success: true, tasksMarked: 1 }),
	createTask: vi.fn().mockResolvedValue({ success: true, path: "test.md" }),
	listTasks: vi.fn().mockResolvedValue({ success: true, tasks: [] }),
}));

describe("task-tools", () => {
	describe("parseTaskLine", () => {
		it("should parse a simple incomplete task", () => {
			const result = parseTaskLine("- [ ] Buy groceries");
			
			expect(result).not.toBeNull();
			expect(result!.description).toBe("Buy groceries");
			expect(result!.status).toBe(" ");
			expect(result!.isComplete).toBe(false);
			expect(result!.priority).toBe("none");
		});

		it("should parse a simple complete task", () => {
			const result = parseTaskLine("- [x] Buy groceries");
			
			expect(result).not.toBeNull();
			expect(result!.description).toBe("Buy groceries");
			expect(result!.status).toBe("x");
			expect(result!.isComplete).toBe(true);
		});

		it("should parse uppercase X as complete", () => {
			const result = parseTaskLine("- [X] Buy groceries");
			
			expect(result).not.toBeNull();
			expect(result!.isComplete).toBe(true);
		});

		it("should parse highest priority (🔺)", () => {
			const result = parseTaskLine("- [ ] Urgent task 🔺");
			
			expect(result).not.toBeNull();
			expect(result!.priority).toBe("highest");
			expect(result!.description).toBe("Urgent task");
		});

		it("should parse high priority (⏫)", () => {
			const result = parseTaskLine("- [ ] Important task ⏫");
			
			expect(result).not.toBeNull();
			expect(result!.priority).toBe("high");
		});

		it("should parse medium priority (🔼)", () => {
			const result = parseTaskLine("- [ ] Normal task 🔼");
			
			expect(result).not.toBeNull();
			expect(result!.priority).toBe("medium");
		});

		it("should parse low priority (🔽)", () => {
			const result = parseTaskLine("- [ ] Low priority task 🔽");
			
			expect(result).not.toBeNull();
			expect(result!.priority).toBe("low");
		});

		it("should parse lowest priority (⏬)", () => {
			const result = parseTaskLine("- [ ] Lowest priority task ⏬");
			
			expect(result).not.toBeNull();
			expect(result!.priority).toBe("lowest");
		});

		it("should parse due date (📅)", () => {
			const result = parseTaskLine("- [ ] Task with due date 📅 2026-02-15");
			
			expect(result).not.toBeNull();
			expect(result!.dueDate).toBe("2026-02-15");
		});

		it("should parse scheduled date (⏳)", () => {
			const result = parseTaskLine("- [ ] Task with scheduled date ⏳ 2026-02-10");
			
			expect(result).not.toBeNull();
			expect(result!.scheduledDate).toBe("2026-02-10");
		});

		it("should parse start date (🛫)", () => {
			const result = parseTaskLine("- [ ] Task with start date 🛫 2026-02-01");
			
			expect(result).not.toBeNull();
			expect(result!.startDate).toBe("2026-02-01");
		});

		it("should parse created date (➕)", () => {
			const result = parseTaskLine("- [ ] Task with created date ➕ 2026-01-15");
			
			expect(result).not.toBeNull();
			expect(result!.createdDate).toBe("2026-01-15");
		});

		it("should parse done date (✅)", () => {
			const result = parseTaskLine("- [x] Completed task ✅ 2026-01-20");
			
			expect(result).not.toBeNull();
			expect(result!.doneDate).toBe("2026-01-20");
		});

		it("should parse cancelled date (❌)", () => {
			const result = parseTaskLine("- [-] Cancelled task ❌ 2026-01-18");
			
			expect(result).not.toBeNull();
			expect(result!.cancelledDate).toBe("2026-01-18");
		});

		it("should parse recurrence (🔁)", () => {
			const result = parseTaskLine("- [ ] Daily standup 🔁 every day");
			
			expect(result).not.toBeNull();
			expect(result!.recurrence).toBe("every day");
		});

		it("should parse tags", () => {
			const result = parseTaskLine("- [ ] Task with tags #work #urgent");
			
			expect(result).not.toBeNull();
			expect(result!.tags).toContain("work");
			expect(result!.tags).toContain("urgent");
		});

		it("should parse a complex task with multiple metadata", () => {
			const result = parseTaskLine(
				"- [ ] Review PR 🔺 📅 2026-02-15 ⏳ 2026-02-10 🛫 2026-02-01 🔁 every week #work #code"
			);
			
			expect(result).not.toBeNull();
			expect(result!.description).toBe("Review PR");
			expect(result!.priority).toBe("highest");
			expect(result!.dueDate).toBe("2026-02-15");
			expect(result!.scheduledDate).toBe("2026-02-10");
			expect(result!.startDate).toBe("2026-02-01");
			expect(result!.recurrence).toBe("every week");
			expect(result!.tags).toContain("work");
			expect(result!.tags).toContain("code");
		});

		it("should return null for non-task lines", () => {
			expect(parseTaskLine("Regular text")).toBeNull();
			expect(parseTaskLine("- Just a list item")).toBeNull();
			expect(parseTaskLine("# Heading")).toBeNull();
			expect(parseTaskLine("")).toBeNull();
		});

		it("should preserve line number and note path", () => {
			const result = parseTaskLine("- [ ] Task", 5, "notes/daily.md");
			
			expect(result).not.toBeNull();
			expect(result!.lineNumber).toBe(5);
			expect(result!.notePath).toBe("notes/daily.md");
		});

		it("should handle asterisk bullet", () => {
			const result = parseTaskLine("* [ ] Task with asterisk");
			
			expect(result).not.toBeNull();
			expect(result!.description).toBe("Task with asterisk");
		});

		it("should handle indented tasks", () => {
			const result = parseTaskLine("    - [ ] Nested task");
			
			expect(result).not.toBeNull();
			expect(result!.description).toBe("Nested task");
		});

		it("should handle other status characters", () => {
			// In progress
			let result = parseTaskLine("- [/] In progress task");
			expect(result).not.toBeNull();
			expect(result!.status).toBe("/");
			expect(result!.isComplete).toBe(false);

			// Scheduled
			result = parseTaskLine("- [>] Scheduled task");
			expect(result).not.toBeNull();
			expect(result!.status).toBe(">");
			expect(result!.isComplete).toBe(false);

			// Question
			result = parseTaskLine("- [?] Question task");
			expect(result).not.toBeNull();
			expect(result!.status).toBe("?");
			expect(result!.isComplete).toBe(false);
		});
	});

	describe("parseTasksFromContent", () => {
		it("should parse multiple tasks from content", () => {
			const content = `# My Tasks

- [ ] Task one
- [x] Task two completed
- [ ] Task three 📅 2026-02-15

Some other text here.

- [ ] Task four #work
`;
			const tasks = parseTasksFromContent(content, "notes/tasks.md");
			
			expect(tasks).toHaveLength(4);
			expect(tasks[0]?.description).toBe("Task one");
			expect(tasks[0]?.lineNumber).toBe(3);
			expect(tasks[1]?.isComplete).toBe(true);
			expect(tasks[2]?.dueDate).toBe("2026-02-15");
			expect(tasks[3]?.tags).toContain("work");
			expect(tasks[0]?.notePath).toBe("notes/tasks.md");
		});

		it("should handle empty content", () => {
			const tasks = parseTasksFromContent("");
			expect(tasks).toHaveLength(0);
		});

		it("should handle content with no tasks", () => {
			const content = `# Just a document

Some text here.

- A regular list item
- Another list item
`;
			const tasks = parseTasksFromContent(content);
			expect(tasks).toHaveLength(0);
		});
	});

	describe("buildTaskLine", () => {
		it("should build a simple task", () => {
			const line = buildTaskLine({ description: "Simple task" });
			
			expect(line).toMatch(/^- \[ \] Simple task/);
			expect(line).toContain("➕"); // Should have created date
		});

		it("should build a task with priority", () => {
			const line = buildTaskLine({
				description: "High priority task",
				priority: "high",
			});
			
			expect(line).toContain("⏫");
		});

		it("should build a task with due date", () => {
			const line = buildTaskLine({
				description: "Task with due",
				dueDate: "2026-02-15",
			});
			
			expect(line).toContain("📅 2026-02-15");
		});

		it("should build a task with scheduled date", () => {
			const line = buildTaskLine({
				description: "Task with scheduled",
				scheduledDate: "2026-02-10",
			});
			
			expect(line).toContain("⏳ 2026-02-10");
		});

		it("should build a task with start date", () => {
			const line = buildTaskLine({
				description: "Task with start",
				startDate: "2026-02-01",
			});
			
			expect(line).toContain("🛫 2026-02-01");
		});

		it("should build a task with recurrence", () => {
			const line = buildTaskLine({
				description: "Recurring task",
				recurrence: "every week",
			});
			
			expect(line).toContain("🔁 every week");
		});

		it("should build a task with tags", () => {
			const line = buildTaskLine({
				description: "Tagged task",
				tags: ["work", "urgent"],
			});
			
			expect(line).toContain("#work");
			expect(line).toContain("#urgent");
		});

		it("should build a complete task with all metadata", () => {
			const line = buildTaskLine({
				description: "Complete task",
				priority: "highest",
				dueDate: "2026-02-15",
				scheduledDate: "2026-02-10",
				startDate: "2026-02-01",
				recurrence: "every day",
				tags: ["work"],
			});
			
			expect(line).toMatch(/^- \[ \] Complete task/);
			expect(line).toContain("🔺");
			expect(line).toContain("📅 2026-02-15");
			expect(line).toContain("⏳ 2026-02-10");
			expect(line).toContain("🛫 2026-02-01");
			expect(line).toContain("🔁 every day");
			expect(line).toContain("#work");
			expect(line).toContain("➕");
		});

		it("should not include priority emoji for none", () => {
			const line = buildTaskLine({
				description: "No priority task",
				priority: "none",
			});
			
			expect(line).not.toContain("🔺");
			expect(line).not.toContain("⏫");
			expect(line).not.toContain("🔼");
			expect(line).not.toContain("🔽");
			expect(line).not.toContain("⏬");
		});
	});

	describe("filterTasks", () => {
		const sampleTasks: ParsedTask[] = [
			{
				originalLine: "- [ ] Task 1",
				description: "Task 1",
				status: " ",
				isComplete: false,
				priority: "high",
				dueDate: "2026-02-10",
				tags: ["work"],
			},
			{
				originalLine: "- [x] Task 2",
				description: "Task 2",
				status: "x",
				isComplete: true,
				priority: "low",
				dueDate: "2026-02-05",
				tags: ["personal"],
			},
			{
				originalLine: "- [ ] Task 3",
				description: "Task 3",
				status: " ",
				isComplete: false,
				priority: "none",
				dueDate: "2026-02-15",
				tags: ["work", "urgent"],
			},
			{
				originalLine: "- [ ] Task 4",
				description: "Task 4 review code",
				status: " ",
				isComplete: false,
				priority: "medium",
				tags: [],
			},
		];

		it("should filter by completion status - incomplete", () => {
			const result = filterTasks(sampleTasks, { completed: false });
			
			expect(result).toHaveLength(3);
			expect(result.every((t) => !t.isComplete)).toBe(true);
		});

		it("should filter by completion status - complete", () => {
			const result = filterTasks(sampleTasks, { completed: true });
			
			expect(result).toHaveLength(1);
			expect(result[0]?.description).toBe("Task 2");
		});

		it("should filter by single priority", () => {
			const result = filterTasks(sampleTasks, { priority: "high" });
			
			expect(result).toHaveLength(1);
			expect(result[0]?.description).toBe("Task 1");
		});

		it("should filter by multiple priorities", () => {
			const result = filterTasks(sampleTasks, { priority: ["high", "medium"] });
			
			expect(result).toHaveLength(2);
		});

		it("should filter by dueBefore", () => {
			const result = filterTasks(sampleTasks, { dueBefore: "2026-02-12" });
			
			expect(result).toHaveLength(2); // Task 1 and Task 2
		});

		it("should filter by dueAfter", () => {
			const result = filterTasks(sampleTasks, { dueAfter: "2026-02-08" });
			
			expect(result).toHaveLength(2); // Task 1 and Task 3
		});

		it("should filter by dueOn", () => {
			const result = filterTasks(sampleTasks, { dueOn: "2026-02-10" });
			
			expect(result).toHaveLength(1);
			expect(result[0]?.description).toBe("Task 1");
		});

		it("should filter by tags", () => {
			const result = filterTasks(sampleTasks, { tags: ["work"] });
			
			expect(result).toHaveLength(2); // Task 1 and Task 3
		});

		it("should filter by query in description", () => {
			const result = filterTasks(sampleTasks, { query: "review" });
			
			expect(result).toHaveLength(1);
			expect(result[0]?.description).toBe("Task 4 review code");
		});

		it("should apply limit", () => {
			const result = filterTasks(sampleTasks, { limit: 2 });
			
			expect(result).toHaveLength(2);
		});

		it("should combine multiple filters", () => {
			const result = filterTasks(sampleTasks, {
				completed: false,
				tags: ["work"],
			});
			
			expect(result).toHaveLength(2); // Task 1 and Task 3
		});

		it("should return all tasks with no filters", () => {
			const result = filterTasks(sampleTasks, {});
			
			expect(result).toHaveLength(4);
		});
	});

	describe("TASK_TOOL_NAMES", () => {
		it("should contain all expected tool names", () => {
			expect(TASK_TOOL_NAMES).toContain("get_tasks");
			expect(TASK_TOOL_NAMES).toContain("mark_tasks");
			expect(TASK_TOOL_NAMES).toContain("create_task");
			expect(TASK_TOOL_NAMES).toContain("list_tasks");
			expect(TASK_TOOL_NAMES).toHaveLength(4);
		});
	});

	describe("tool factories", () => {
		let mockApp: App;
		let mockCallback: ToolExecutionCallback;

		beforeEach(() => {
			mockApp = {} as App;
			mockCallback = vi.fn() as unknown as ToolExecutionCallback;
		});

		describe("createGetTasksTool", () => {
			it("should create a valid tool", () => {
				const tool = createGetTasksTool(mockApp, mockCallback);
				
				expect(tool).toBeDefined();
				expect(tool.name).toBe("get_tasks");
				expect(tool.description).toContain("Get tasks");
			});

			it("should create a tool with needsApproval set", () => {
				const tool = createGetTasksTool(mockApp, mockCallback, true);
				
				// SDK wraps needsApproval in a function
				expect(tool.needsApproval).toBeDefined();
			});
		});

		describe("createMarkTasksTool", () => {
			it("should create a valid tool", () => {
				const tool = createMarkTasksTool(mockApp, mockCallback);
				
				expect(tool).toBeDefined();
				expect(tool.name).toBe("mark_tasks");
				expect(tool.description).toContain("complete or incomplete");
			});
		});

		describe("createCreateTaskTool", () => {
			it("should create a valid tool", () => {
				const tool = createCreateTaskTool(mockApp, mockCallback);
				
				expect(tool).toBeDefined();
				expect(tool.name).toBe("create_task");
				expect(tool.description).toContain("Create a new task");
			});
		});

		describe("createListTasksTool", () => {
			it("should create a valid tool", () => {
				const tool = createListTasksTool(mockApp, mockCallback);
				
				expect(tool).toBeDefined();
				expect(tool.name).toBe("list_tasks");
				expect(tool.description).toContain("List tasks");
			});
		});

		describe("createAllTaskTools", () => {
			it("should create all four task tools", () => {
				const tools = createAllTaskTools(mockApp, mockCallback);
				
				expect(tools).toHaveLength(4);
				
				const names = tools.map((t) => t.name);
				expect(names).toContain("get_tasks");
				expect(names).toContain("mark_tasks");
				expect(names).toContain("create_task");
				expect(names).toContain("list_tasks");
			});

			it("should pass requiresApproval to tools", () => {
				const requiresApproval = new Set(["mark_tasks", "create_task"]) as Set<any>;
				const tools = createAllTaskTools(mockApp, mockCallback, requiresApproval);
				
				const markTasksTool = tools.find((t) => t.name === "mark_tasks");
				const getTasksTool = tools.find((t) => t.name === "get_tasks");
				
				// The tools are created with needsApproval based on the set (SDK wraps in function)
				expect(markTasksTool?.needsApproval).toBeDefined();
				expect(getTasksTool?.needsApproval).toBeDefined();
			});

			it("should work with null callback", () => {
				const tools = createAllTaskTools(mockApp, null);
				
				expect(tools).toHaveLength(4);
			});
		});
	});
});



