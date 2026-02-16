/**
 * @module TaskOperations
 * @description Shared task parsing and manipulation utilities for Obsidian Tasks format.
 * 
 * This module provides pure utility functions for working with Obsidian Tasks:
 * - **Parsing**: Extract structured data from task markdown lines
 * - **Building**: Create properly formatted task lines from options
 * - **Filtering**: Query and filter task collections
 * 
 * Supports the full Obsidian Tasks emoji format:
 * - Priority: 🔺 (highest), ⏫ (high), 🔼 (medium), 🔽 (low), ⏬ (lowest)
 * - Dates: 📅 (due), ⏳ (scheduled), 🛫 (start), ➕ (created), ✅ (done), ❌ (cancelled)
 * - Recurrence: 🔁 (e.g., "every day", "every week")
 * 
 * @example
 * ```typescript
 * import { parseTaskLine, buildTaskLine, filterTasks } from './TaskOperations';
 * 
 * // Parse a task line
 * const task = parseTaskLine('- [x] Complete report 📅 2026-02-04 ⏫');
 * console.log(task?.description); // "Complete report"
 * console.log(task?.priority);    // "high"
 * console.log(task?.isComplete);  // true
 * 
 * // Build a new task
 * const line = buildTaskLine({
 *   description: 'Review PR',
 *   priority: 'high',
 *   dueDate: '2026-02-05'
 * });
 * // "- [ ] Review PR ⏫ 📅 2026-02-05 ➕ 2026-02-04"
 * ```
 * 
 * @see {@link ParsedTask} for the parsed task structure
 * @see {@link CreateTaskOptions} for task creation options
 * @see {@link TaskFilter} for filtering options
 * 
 * @since 0.0.14
 */

// ============================================================================
// Task Parsing Types
// ============================================================================

/** Task priority levels matching Obsidian Tasks emoji format */
export type TaskPriority = 
	| "highest"    // 🔺
	| "high"       // ⏫
	| "medium"     // 🔼
	| "low"        // 🔽
	| "lowest"     // ⏬
	| "none";

/** Task status character */
export type TaskStatus = " " | "x" | "X" | "/" | "-" | ">" | "<" | "!" | "?" | "*";

/** Parsed task with full Obsidian Tasks metadata */
export interface ParsedTask {
	/** Original full line of text */
	originalLine: string;
	/** The task description text (without checkbox and metadata) */
	description: string;
	/** Task status character (space = incomplete, x = complete, etc.) */
	status: TaskStatus;
	/** Whether the task is completed (status is 'x' or 'X') */
	isComplete: boolean;
	/** Priority level (derived from emoji) */
	priority: TaskPriority;
	/** Due date (📅) - ISO string or undefined */
	dueDate?: string;
	/** Scheduled date (⏳) - ISO string or undefined */
	scheduledDate?: string;
	/** Start date (🛫) - ISO string or undefined */
	startDate?: string;
	/** Created date (➕) - ISO string or undefined */
	createdDate?: string;
	/** Done/Completion date (✅) - ISO string or undefined */
	doneDate?: string;
	/** Cancelled date (❌) - ISO string or undefined */
	cancelledDate?: string;
	/** Recurrence rule (🔁) - e.g., "every day", "every week" */
	recurrence?: string;
	/** Tags found in the task (without #) */
	tags: string[];
	/** Line number in the source file (1-indexed, if known) */
	lineNumber?: number;
	/** Path to the note containing this task */
	notePath?: string;
}

/** Options for creating a new task */
export interface CreateTaskOptions {
	/** Task description text */
	description: string;
	/** Priority level */
	priority?: TaskPriority;
	/** Due date (ISO string or Date) */
	dueDate?: string | Date;
	/** Scheduled date (ISO string or Date) */
	scheduledDate?: string | Date;
	/** Start date (ISO string or Date) */
	startDate?: string | Date;
	/** Recurrence rule */
	recurrence?: string;
	/** Tags to add (without #) */
	tags?: string[];
	/** Initial status (default: " " for incomplete) */
	status?: TaskStatus;
}

/** Filter options for listing tasks */
export interface TaskFilter {
	/** Filter by completion status */
	completed?: boolean;
	/** Filter by priority */
	priority?: TaskPriority | TaskPriority[];
	/** Filter tasks due before this date (inclusive) */
	dueBefore?: string | Date;
	/** Filter tasks due after this date (inclusive) */
	dueAfter?: string | Date;
	/** Filter tasks due on this date */
	dueOn?: string | Date;
	/** Filter by tags (any match) */
	tags?: string[];
	/** Limit number of results */
	limit?: number;
	/** Search query in description */
	query?: string;
}

/** Result from task operations */
export interface TaskOperationResult {
	success: boolean;
	tasks?: ParsedTask[];
	tasksModified?: number;
	path?: string;
	error?: string;
}

// ============================================================================
// Task Emoji Constants
// ============================================================================

/** Obsidian Tasks emoji mappings */
const PRIORITY_EMOJIS: Record<TaskPriority, string> = {
	highest: "🔺",
	high: "⏫",
	medium: "🔼",
	low: "🔽",
	lowest: "⏬",
	none: "",
};

const EMOJI_TO_PRIORITY: Record<string, TaskPriority> = {
	"🔺": "highest",
	"⏫": "high",
	"🔼": "medium",
	"🔽": "low",
	"⏬": "lowest",
};

const DATE_EMOJIS = {
	due: "📅",
	scheduled: "⏳",
	start: "🛫",
	created: "➕",
	done: "✅",
	cancelled: "❌",
	recurrence: "🔁",
} as const;

// ============================================================================
// Task Parsing Functions
// ============================================================================

/**
 * Parse a date string from Obsidian Tasks format (YYYY-MM-DD).
 * 
 * Extracts the date portion from strings that may contain additional content.
 * 
 * @param dateStr - String potentially containing a date in YYYY-MM-DD format
 * @returns The extracted date string or undefined if no valid date found
 * 
 * @example
 * ```typescript
 * parseDateString('2026-02-04');           // '2026-02-04'
 * parseDateString('📅 2026-02-04 extra');  // '2026-02-04'
 * parseDateString('no date here');         // undefined
 * ```
 * 
 * @internal
 */
function parseDateString(dateStr: string): string | undefined {
	const match = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
	return match?.[1];
}

/**
 * Format a date for Obsidian Tasks (YYYY-MM-DD).
 * 
 * Accepts either a Date object or a string, extracting/formatting
 * to the YYYY-MM-DD format required by Obsidian Tasks.
 * 
 * @param date - Date object or string containing a date
 * @returns Formatted date string in YYYY-MM-DD format
 * 
 * @example
 * ```typescript
 * formatDate(new Date('2026-02-04'));  // '2026-02-04'
 * formatDate('2026-02-04T12:00:00Z');  // '2026-02-04'
 * formatDate('2026-02-04');            // '2026-02-04'
 * ```
 * 
 * @internal
 */
function formatDate(date: string | Date): string {
	if (typeof date === "string") {
		// Already formatted or extract date portion
		const match = date.match(/(\d{4}-\d{2}-\d{2})/);
		return match?.[1] ?? date;
	}
	return date.toISOString().split("T")[0] ?? "";
}

/**
 * Parse a single task line into structured data.
 * 
 * Extracts all Obsidian Tasks metadata from a markdown task line including:
 * - Status (checkbox state)
 * - Priority (emoji-based)
 * - All date types (due, scheduled, start, created, done, cancelled)
 * - Recurrence rules
 * - Tags
 * 
 * @param line - The markdown line containing the task (e.g., "- [x] Task text 📅 2026-02-04")
 * @param lineNumber - Optional 1-indexed line number in the source file
 * @param notePath - Optional path to the source note for context
 * @returns Parsed task object with all extracted metadata, or null if line is not a valid task
 * 
 * @example
 * ```typescript
 * const task = parseTaskLine('- [x] Complete report 📅 2026-02-04 ⏫ #work');
 * if (task) {
 *   console.log(task.description);  // 'Complete report'
 *   console.log(task.isComplete);   // true
 *   console.log(task.priority);     // 'high'
 *   console.log(task.dueDate);      // '2026-02-04'
 *   console.log(task.tags);         // ['work']
 * }
 * 
 * // Non-task lines return null
 * parseTaskLine('Regular text');  // null
 * parseTaskLine('# Heading');     // null
 * ```
 * 
 * @see {@link ParsedTask} for the complete structure of returned objects
 * @see {@link parseTasksFromContent} for parsing entire note content
 */
export function parseTaskLine(
	line: string,
	lineNumber?: number,
	notePath?: string
): ParsedTask | null {
	// Match task checkbox pattern: - [ ], - [x], - [/], etc.
	const taskMatch = line.match(/^(\s*[-*]\s*)\[(.)\]\s*(.*)$/);
	if (!taskMatch) {
		return null;
	}

	const statusChar = taskMatch[2] as TaskStatus;
	let content = taskMatch[3] || "";
	const originalLine = line;

	// Extract priority
	let priority: TaskPriority = "none";
	for (const [emoji, p] of Object.entries(EMOJI_TO_PRIORITY)) {
		if (content.includes(emoji)) {
			priority = p;
			content = content.replace(emoji, "").trim();
			break;
		}
	}

	// Extract dates
	let dueDate: string | undefined;
	let scheduledDate: string | undefined;
	let startDate: string | undefined;
	let createdDate: string | undefined;
	let doneDate: string | undefined;
	let cancelledDate: string | undefined;
	let recurrence: string | undefined;

	// Due date: 📅 YYYY-MM-DD
	const dueMatch = content.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
	if (dueMatch?.[1]) {
		dueDate = parseDateString(dueMatch[1]);
		content = content.replace(dueMatch[0], "").trim();
	}

	// Scheduled date: ⏳ YYYY-MM-DD
	const scheduledMatch = content.match(/⏳\s*(\d{4}-\d{2}-\d{2})/);
	if (scheduledMatch?.[1]) {
		scheduledDate = parseDateString(scheduledMatch[1]);
		content = content.replace(scheduledMatch[0], "").trim();
	}

	// Start date: 🛫 YYYY-MM-DD
	const startMatch = content.match(/🛫\s*(\d{4}-\d{2}-\d{2})/);
	if (startMatch?.[1]) {
		startDate = parseDateString(startMatch[1]);
		content = content.replace(startMatch[0], "").trim();
	}

	// Created date: ➕ YYYY-MM-DD
	const createdMatch = content.match(/➕\s*(\d{4}-\d{2}-\d{2})/);
	if (createdMatch?.[1]) {
		createdDate = parseDateString(createdMatch[1]);
		content = content.replace(createdMatch[0], "").trim();
	}

	// Done date: ✅ YYYY-MM-DD
	const doneMatch = content.match(/✅\s*(\d{4}-\d{2}-\d{2})/);
	if (doneMatch?.[1]) {
		doneDate = parseDateString(doneMatch[1]);
		content = content.replace(doneMatch[0], "").trim();
	}

	// Cancelled date: ❌ YYYY-MM-DD
	const cancelledMatch = content.match(/❌\s*(\d{4}-\d{2}-\d{2})/);
	if (cancelledMatch?.[1]) {
		cancelledDate = parseDateString(cancelledMatch[1]);
		content = content.replace(cancelledMatch[0], "").trim();
	}

	// Recurrence: 🔁 every day/week/month/year
	const recurrenceMatch = content.match(/🔁\s*([^📅⏳🛫➕✅❌🔺⏫🔼🔽⏬#]+)/);
	if (recurrenceMatch?.[1]) {
		recurrence = recurrenceMatch[1].trim();
		content = content.replace(recurrenceMatch[0], "").trim();
	}

	// Extract tags
	const tags: string[] = [];
	const tagMatches = content.matchAll(/#([^\s#]+)/g);
	for (const match of tagMatches) {
		if (match[1]) tags.push(match[1]);
	}
	// Remove tags from description for cleaner output
	const description = content.replace(/#[^\s#]+/g, "").trim();

	return {
		originalLine,
		description,
		status: statusChar,
		isComplete: statusChar === "x" || statusChar === "X",
		priority,
		dueDate,
		scheduledDate,
		startDate,
		createdDate,
		doneDate,
		cancelledDate,
		recurrence,
		tags,
		lineNumber,
		notePath,
	};
}

/**
 * Parse all tasks from note content.
 * 
 * Scans through all lines of markdown content and extracts every valid task,
 * preserving line numbers for later reference or modification.
 * 
 * @param content - The full markdown content of a note
 * @param notePath - Optional path to the source note (attached to each parsed task)
 * @returns Array of parsed tasks with line numbers, empty array if no tasks found
 * 
 * @example
 * ```typescript
 * const content = `# My Tasks
 * - [x] Completed task
 * - [ ] Pending task 📅 2026-02-05
 * 
 * Some other text
 * `;
 * 
 * const tasks = parseTasksFromContent(content, 'Projects/tasks.md');
 * console.log(tasks.length);           // 2
 * console.log(tasks[0].lineNumber);    // 2
 * console.log(tasks[0].notePath);      // 'Projects/tasks.md'
 * console.log(tasks[1].dueDate);       // '2026-02-05'
 * ```
 * 
 * @see {@link parseTaskLine} for parsing individual lines
 * @see {@link filterTasks} for filtering the returned tasks
 */
export function parseTasksFromContent(
	content: string,
	notePath?: string
): ParsedTask[] {
	const tasks: ParsedTask[] = [];
	const lines = content.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line !== undefined) {
			const task = parseTaskLine(line, i + 1, notePath);
			if (task) {
				tasks.push(task);
			}
		}
	}

	return tasks;
}

/**
 * Build a task line from options.
 * 
 * Creates a properly formatted Obsidian Tasks markdown line with all
 * specified metadata. Automatically adds a created date (➕) with today's date.
 * 
 * @param options - Configuration options for the task
 * @returns Formatted task markdown line ready to be inserted into a note
 * 
 * @example
 * ```typescript
 * // Simple task
 * buildTaskLine({ description: 'Buy groceries' });
 * // '- [ ] Buy groceries ➕ 2026-02-04'
 * 
 * // Task with priority and due date
 * buildTaskLine({
 *   description: 'Submit report',
 *   priority: 'high',
 *   dueDate: '2026-02-10'
 * });
 * // '- [ ] Submit report ⏫ 📅 2026-02-10 ➕ 2026-02-04'
 * 
 * // Completed task with recurrence
 * buildTaskLine({
 *   description: 'Weekly review',
 *   status: 'x',
 *   recurrence: 'every week',
 *   tags: ['work', 'routine']
 * });
 * // '- [x] Weekly review 🔁 every week #work #routine ➕ 2026-02-04'
 * ```
 * 
 * @see {@link CreateTaskOptions} for all available options
 * @see {@link parseTaskLine} for the inverse operation
 */
export function buildTaskLine(options: CreateTaskOptions): string {
	const status = options.status || " ";
	let line = `- [${status}] ${options.description}`;

	// Add priority emoji
	if (options.priority && options.priority !== "none") {
		line += ` ${PRIORITY_EMOJIS[options.priority]}`;
	}

	// Add due date
	if (options.dueDate) {
		line += ` ${DATE_EMOJIS.due} ${formatDate(options.dueDate)}`;
	}

	// Add scheduled date
	if (options.scheduledDate) {
		line += ` ${DATE_EMOJIS.scheduled} ${formatDate(options.scheduledDate)}`;
	}

	// Add start date
	if (options.startDate) {
		line += ` ${DATE_EMOJIS.start} ${formatDate(options.startDate)}`;
	}

	// Add recurrence
	if (options.recurrence) {
		line += ` ${DATE_EMOJIS.recurrence} ${options.recurrence}`;
	}

	// Add tags
	if (options.tags && options.tags.length > 0) {
		for (const tag of options.tags) {
			line += ` #${tag}`;
		}
	}

	// Add created date
	const today = new Date().toISOString().split("T")[0];
	line += ` ${DATE_EMOJIS.created} ${today}`;

	return line;
}

/**
 * Filter tasks based on criteria.
 * 
 * Applies multiple filter conditions to a task collection. All specified
 * conditions must match (AND logic). Returns a new array without modifying
 * the original.
 * 
 * @param tasks - Array of parsed tasks to filter
 * @param filter - Filter criteria to apply
 * @returns Filtered array of tasks matching all specified criteria
 * 
 * @example
 * ```typescript
 * const tasks = parseTasksFromContent(noteContent);
 * 
 * // Get incomplete high-priority tasks
 * const urgent = filterTasks(tasks, {
 *   completed: false,
 *   priority: 'high'
 * });
 * 
 * // Get tasks due this week
 * const thisWeek = filterTasks(tasks, {
 *   dueAfter: '2026-02-03',
 *   dueBefore: '2026-02-09'
 * });
 * 
 * // Get work-related tasks, limit to 5
 * const work = filterTasks(tasks, {
 *   tags: ['work'],
 *   limit: 5
 * });
 * 
 * // Search in descriptions
 * const reports = filterTasks(tasks, {
 *   query: 'report'
 * });
 * ```
 * 
 * @see {@link TaskFilter} for all available filter options
 * @see {@link parseTasksFromContent} for getting tasks to filter
 */
export function filterTasks(
	tasks: ParsedTask[],
	filter: TaskFilter
): ParsedTask[] {
	let result = [...tasks];

	// Filter by completion status
	if (filter.completed !== undefined) {
		result = result.filter((t) => t.isComplete === filter.completed);
	}

	// Filter by priority
	if (filter.priority !== undefined) {
		const priorities = Array.isArray(filter.priority)
			? filter.priority
			: [filter.priority];
		result = result.filter((t) => priorities.includes(t.priority));
	}

	// Filter by due date
	if (filter.dueBefore) {
		const before = formatDate(filter.dueBefore);
		result = result.filter((t) => t.dueDate && t.dueDate <= before);
	}
	if (filter.dueAfter) {
		const after = formatDate(filter.dueAfter);
		result = result.filter((t) => t.dueDate && t.dueDate >= after);
	}
	if (filter.dueOn) {
		const on = formatDate(filter.dueOn);
		result = result.filter((t) => t.dueDate === on);
	}

	// Filter by tags
	if (filter.tags && filter.tags.length > 0) {
		result = result.filter((t) =>
			filter.tags!.some((tag) => t.tags.includes(tag))
		);
	}

	// Filter by query in description
	if (filter.query) {
		const lowerQuery = filter.query.toLowerCase();
		result = result.filter((t) =>
			t.description.toLowerCase().includes(lowerQuery)
		);
	}

	// Apply limit
	if (filter.limit && filter.limit > 0) {
		result = result.slice(0, filter.limit);
	}

	return result;
}
