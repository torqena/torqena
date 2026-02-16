/**
 * Workaround utilities for handling edge cases in the Realtime API
 * 
 * The realtime model sometimes outputs JSON/code text instead of calling functions.
 * These utilities detect and handle such cases.
 */

import { App, TFile } from "obsidian";
import type { RealtimeHistoryItem, ToolExecutionCallback } from "./types";
import { logger } from "./types";

/** Context passed to individual handlers */
interface HandlerContext {
	app: App;
	content: string;
	activeFile: TFile | null;
	onToolExecution: ToolExecutionCallback | null;
}

/**
 * Escape regex special characters in a string
 */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Execute task completion on a file
 */
export async function executeTaskCompletion(
	app: App,
	file: TFile,
	tasks: string[],
	onToolExecution: ToolExecutionCallback | null
): Promise<void> {
	let content = await app.vault.read(file);
	let modified = false;
	let count = 0;

	for (const task of tasks) {
		if (!task) continue;

		const escapedTask = task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const taskRegex = new RegExp(`- \\[ \\] ${escapedTask}`, "g");
		const newContent = content.replace(taskRegex, `- [x] ${task}`);

		if (newContent !== content) {
			content = newContent;
			modified = true;
			count++;
		}
	}

	if (modified) {
		await app.vault.modify(file, content);
		logger.info(`Workaround: Marked ${count} tasks complete`);
		onToolExecution?.("mark_tasks_complete", { tasks }, { success: true, count });
	} else {
		logger.warn("Workaround: No matching tasks found");
	}
}

/**
 * Handle function-call-like text output (e.g., "update_checklist_item(...)")
 */
async function handleFunctionCallSyntax(ctx: HandlerContext): Promise<boolean> {
	const { content, activeFile, app, onToolExecution } = ctx;
	
	logger.debug("handleFunctionCallSyntax checking content:", content.substring(0, 100));
	
	if (!content.match(/^\w+\s*\(/)) {
		logger.debug("Content does not start with function call pattern");
		return false;
	}
	
	logger.debug("Detected function-call-like text output, attempting to parse");
	
	// Handle update_checklist_item format specifically
	// update_checklist_item(note_path="...", item_text="...", checked=True/False)
	// Use matchAll to handle multiple calls in the same message
	const checklistItemMatches = content.matchAll(/update_checklist_item\s*\(\s*note_path\s*=\s*["']([^"']+)["']\s*,\s*item_text\s*=\s*["']([^"']+)["']\s*,\s*checked\s*=\s*(True|False|true|false)/gi);
	
	const tasksToComplete: { path: string; task: string }[] = [];
	const tasksToUncomplete: { path: string; task: string }[] = [];
	
	for (const match of checklistItemMatches) {
		const notePath = match[1];
		const itemText = match[2];
		const checked = match[3]?.toLowerCase() === 'true';
		
		logger.debug("Parsed update_checklist_item:", { notePath, itemText, checked });
		
		if (notePath && itemText) {
			if (checked) {
				tasksToComplete.push({ path: notePath, task: itemText });
			} else {
				tasksToUncomplete.push({ path: notePath, task: itemText });
			}
		}
	}
	
	logger.debug("Tasks to complete:", tasksToComplete.length, "Tasks to uncomplete:", tasksToUncomplete.length);
	
	// Process all tasks grouped by file path
	const tasksByPath = new Map<string, { complete: string[], incomplete: string[] }>();
	
	for (const item of tasksToComplete) {
		if (!tasksByPath.has(item.path)) {
			tasksByPath.set(item.path, { complete: [], incomplete: [] });
		}
		tasksByPath.get(item.path)!.complete.push(item.task);
	}
	
	for (const item of tasksToUncomplete) {
		if (!tasksByPath.has(item.path)) {
			tasksByPath.set(item.path, { complete: [], incomplete: [] });
		}
		tasksByPath.get(item.path)!.incomplete.push(item.task);
	}
	
	let anyProcessed = false;
	
	for (const [notePath, tasks] of tasksByPath) {
		// Find the file
		let targetFile: TFile | null = null;
		const file = app.vault.getAbstractFileByPath(notePath);
		if (file instanceof TFile) {
			targetFile = file;
		} else if (activeFile) {
			targetFile = activeFile;
			logger.debug("Using active file as fallback:", activeFile.path);
		}
		
		if (targetFile) {
			if (tasks.complete.length > 0) {
				logger.debug("Executing task completion for:", tasks.complete);
				await executeTaskCompletion(app, targetFile, tasks.complete, onToolExecution);
				anyProcessed = true;
			}
			if (tasks.incomplete.length > 0) {
				logger.debug("Executing task uncompletion for:", tasks.incomplete);
				await executeTaskUncompletion(app, targetFile, tasks.incomplete, onToolExecution);
				anyProcessed = true;
			}
		} else {
			logger.warn("Could not find target file:", notePath);
		}
	}
	
	if (anyProcessed) {
		return true;
	}
	
	// Fallback: Generic pattern for other function-call formats
	const completedTaskMatches = content.matchAll(
		/["']([^"']+)["']\s*[,:]\s*(?:completed|done|True|true)/gi
	);
	const tasks: string[] = [];
	for (const match of completedTaskMatches) {
		if (match[1]) {
			tasks.push(match[1]);
		}
	}

	if (tasks.length > 0 && activeFile) {
		logger.debug("Extracted tasks to complete (fallback):", tasks);
		await executeTaskCompletion(app, activeFile, tasks, onToolExecution);
		return true;
	}
	return false;
}

/**
 * Execute task uncompletion (mark tasks as incomplete)
 */
async function executeTaskUncompletion(
	app: App,
	file: TFile,
	tasks: string[],
	onToolExecution: ToolExecutionCallback | null
): Promise<void> {
	const noteContent = await app.vault.read(file);
	let modified = false;
	let newContent = noteContent;

	for (const task of tasks) {
		const escapedTask = task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const taskRegex = new RegExp(`- \\[x\\] ${escapedTask}`, "gi");
		const updatedContent = newContent.replace(taskRegex, `- [ ] ${task}`);
		if (updatedContent !== newContent) {
			newContent = updatedContent;
			modified = true;
			logger.debug("Marked task incomplete:", task);
		}
	}

	if (modified) {
		await app.vault.modify(file, newContent);
		logger.info("Workaround: Successfully marked tasks as incomplete");
		onToolExecution?.(
			"update_checklist_item",
			{ path: file.path, tasks, checked: false },
			{ success: true }
		);
	} else {
		logger.warn("Workaround: No matching completed tasks found to uncheck");
	}
}

/**
 * Handle natural language task completion instructions
 * Detects patterns like "Mark the following tasks as completed in the note..."
 */
async function handleNaturalLanguageTaskCompletion(ctx: HandlerContext): Promise<boolean> {
	const { content, app, activeFile, onToolExecution } = ctx;
	
	// First, check for "mark everything done except X" pattern
	const markAllExceptPattern = /(?:mark|check)\s+(?:everything|all|them|these)\s+(?:done|complete|off|finished)\s+except\s+(?:for\s+)?["']?([^"'\n]+?)["']?(?:\.|,|$)|everything\s+(?:checked|marked)\s+off\s+except\s+(?:for\s+)?["']?([^"'\n]+?)["']?(?:\.|,|$)/i;
	const exceptMatch = content.match(markAllExceptPattern);
	
	if (exceptMatch) {
		const exceptionTask = (exceptMatch[1] || exceptMatch[2])?.trim();
		logger.info("[WORKAROUND-DEBUG] Detected 'mark all except' pattern, exception:", exceptionTask);
		
		// Use active file
		if (!activeFile) {
			logger.warn("No active file for 'mark all except' workaround");
			return false;
		}
		
		// Read the file and extract all tasks
		const noteContent = await app.vault.read(activeFile);
		const taskPattern = /^- \[ \] (.+)$/gm;
		const allTasks: string[] = [];
		let match;
		while ((match = taskPattern.exec(noteContent)) !== null) {
			if (match[1]) {
				allTasks.push(match[1].trim());
			}
		}
		
		logger.info("[WORKAROUND-DEBUG] Found tasks in note:", allTasks);
		
		// Filter out the exception
		const tasksToComplete = allTasks.filter(task => {
			const taskLower = task.toLowerCase();
			const exceptionLower = exceptionTask?.toLowerCase() || "";
			// Check if task contains the exception text (fuzzy match)
			return !taskLower.includes(exceptionLower) && !exceptionLower.includes(taskLower);
		});
		
		logger.info("[WORKAROUND-DEBUG] Tasks to mark complete (excluding exception):", tasksToComplete);
		
		if (tasksToComplete.length > 0) {
			await executeTaskCompletion(app, activeFile, tasksToComplete, onToolExecution);
			return true;
		}
		return false;
	}
	
	// Match patterns like:
	// "Mark the following tasks as completed in the note "path":"
	// "Mark these tasks complete in path:"
	const markTasksPattern = /mark\s+(?:the\s+following\s+)?tasks?\s+(?:as\s+)?complet(?:ed|e)\s+(?:in\s+(?:the\s+)?note\s+)?["']?([^"'\n:]+)["']?/i;
	const pathMatch = content.match(markTasksPattern);
	
	if (!pathMatch) {
		return false;
	}
	
	logger.debug("Detected natural language task completion instruction");
	
	// Extract path
	let notePath = pathMatch[1]?.trim() || "";
	// Clean up the path - remove trailing colons and quotes
	notePath = notePath.replace(/[:"']+$/, "").trim();
	if (!notePath.endsWith(".md")) {
		notePath += ".md";
	}
	
	// Find the file
	const file = app.vault.getAbstractFileByPath(notePath);
	if (!file || !(file instanceof TFile)) {
		// Try active file as fallback
		const activeFile = app.workspace.getActiveFile();
		if (!activeFile) {
			logger.warn("Could not find note for task completion:", notePath);
			return false;
		}
		logger.debug("Using active file instead:", activeFile.path);
	}
	const targetFile = (file instanceof TFile ? file : app.workspace.getActiveFile()) as TFile;
	if (!targetFile) return false;
	
	// Extract tasks from numbered list (1. Task, 2. Task) or bullet points
	const tasks: string[] = [];
	const numberedTaskPattern = /^\s*(?:\d+[\.\)]|[-*•])\s+(.+)$/gm;
	let taskMatch;
	while ((taskMatch = numberedTaskPattern.exec(content)) !== null) {
		const task = taskMatch[1]?.trim();
		if (task) {
			tasks.push(task);
		}
	}
	
	// Check for exceptions ("Leave the task X unchecked")
	const exceptionPattern = /leave\s+(?:the\s+)?task\s+["']([^"']+)["']\s+(?:unchecked|incomplete)/gi;
	const exceptions: string[] = [];
	let exMatch;
	while ((exMatch = exceptionPattern.exec(content)) !== null) {
		if (exMatch[1]) {
			exceptions.push(exMatch[1]);
		}
	}
	
	// Remove exceptions from tasks list
	const tasksToComplete = tasks.filter(task => 
		!exceptions.some(ex => task.toLowerCase().includes(ex.toLowerCase()))
	);
	
	if (tasksToComplete.length > 0) {
		logger.debug("Tasks to complete:", tasksToComplete);
		logger.debug("Exceptions (keep unchecked):", exceptions);
		await executeTaskCompletion(app, targetFile, tasksToComplete, onToolExecution);
		return true;
	}
	
	return false;
}

/**
 * Check if content is just a checklist (only task items)
 */
function isChecklistOnly(content: string): boolean {
	const lines = content.trim().split("\n").filter(line => line.trim());
	if (lines.length === 0) return false;
	// All non-empty lines must be task items
	return lines.every(line => /^- \[[x ]\] .+/i.test(line.trim()));
}

/**
 * Handle replace_note JSON format: { path: string, content: string }
 * Smart merge: if content is just checklist items, merge them instead of replacing entire note
 */
async function handleReplaceNoteJson(
	ctx: HandlerContext,
	parsed: { path?: string; content?: string }
): Promise<boolean> {
	const { app, onToolExecution } = ctx;
	
	if (!parsed.path || !parsed.content) {
		return false;
	}
	
	logger.debug("Detected JSON tool output, executing replace_note workaround");

	let normalizedPath = parsed.path.replace(/\\/g, "/").trim();
	if (!normalizedPath.endsWith(".md")) {
		normalizedPath += ".md";
	}

	const file = app.vault.getAbstractFileByPath(normalizedPath);
	if (!(file && file instanceof TFile)) {
		logger.warn("Workaround: Note not found:", normalizedPath);
		return false;
	}
	
	// Check if content is just checklist items - if so, merge instead of replace
	if (isChecklistOnly(parsed.content)) {
		logger.debug("Content is checklist-only, performing smart merge");
		
		const existingContent = await app.vault.read(file);
		let updatedContent = existingContent;
		
		// Parse each task line from the new content
		const taskLines = parsed.content.trim().split("\n");
		for (const taskLine of taskLines) {
			const match = taskLine.match(/^- \[([x ])\] (.+)$/i);
			if (!match || !match[1] || !match[2]) continue;
			
			const isChecked = match[1].toLowerCase() === "x";
			const taskText = match[2].trim();
			const escapedTask = taskText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			
			if (isChecked) {
				// Mark as complete: find unchecked version and replace
				const uncheckedRegex = new RegExp(`- \\[ \\] ${escapedTask}`, "g");
				updatedContent = updatedContent.replace(uncheckedRegex, `- [x] ${taskText}`);
			} else {
				// Mark as incomplete: find checked version and replace
				const checkedRegex = new RegExp(`- \\[x\\] ${escapedTask}`, "gi");
				updatedContent = updatedContent.replace(checkedRegex, `- [ ] ${taskText}`);
			}
		}
		
		if (updatedContent !== existingContent) {
			await app.vault.modify(file, updatedContent);
			logger.info("Workaround: Successfully merged checklist updates");
			onToolExecution?.(
				"mark_tasks_complete",
				{ path: normalizedPath },
				{ success: true }
			);
			return true;
		} else {
			logger.warn("Workaround: No checklist items matched for merge");
			return false;
		}
	}
	
	// Full replacement for non-checklist content
	await app.vault.modify(file, parsed.content);
	logger.info("Workaround: Successfully updated note via JSON intercept");
	onToolExecution?.(
		"replace_note",
		{ path: normalizedPath },
		{ success: true }
	);
	return true;
}

/**
 * Handle updates array JSON format: { path?: string, updates: Array<{pattern, replacement} | {target, content} | {action, content, checked}> }
 * Also supports note_path as alias for path
 */
async function handleUpdatesArrayJson(
	ctx: HandlerContext,
	parsed: { path?: string; note_path?: string; updates?: unknown[] }
): Promise<boolean> {
	const { app, activeFile, onToolExecution } = ctx;
	
	if (!parsed.updates || !Array.isArray(parsed.updates)) {
		return false;
	}
	
	logger.debug("Detected JSON update operation, executing workaround");

	let file: TFile | null = null;
	
	// Support both 'path' and 'note_path' as the path field
	const notePath = parsed.path || parsed.note_path;

	if (notePath) {
		let normalizedPath = notePath.replace(/\\/g, "/").trim();
		if (!normalizedPath.endsWith(".md")) {
			normalizedPath += ".md";
		}
		const abstractFile = app.vault.getAbstractFileByPath(normalizedPath);
		if (abstractFile instanceof TFile) {
			file = abstractFile;
		}
	} else if (activeFile) {
		file = activeFile;
		logger.debug("No path in JSON, using active note:", file.path);
	}

	if (!file) {
		return false;
	}

	let noteContent = await app.vault.read(file);
	let modified = false;
	
	// Collect checklist tasks to complete
	const checklistTasksToComplete: string[] = [];
	const checklistTasksToUncomplete: string[] = [];

	for (const update of parsed.updates as Record<string, unknown>[]) {
		// Handle action: "edit" format with old_content/new_content
		if (update.action === "edit" && typeof update.old_content === "string" && typeof update.new_content === "string") {
			const oldContent = update.old_content as string;
			const newContent = update.new_content as string;
			if (noteContent.includes(oldContent)) {
				noteContent = noteContent.replace(oldContent, newContent);
				modified = true;
				logger.debug("Applied edit replacement:", oldContent.substring(0, 50), "->", newContent.substring(0, 50));
			} else {
				logger.debug("Edit old_content not found:", oldContent.substring(0, 50));
			}
		}
		// Handle action: "update_checklist" format
		else if (update.action === "update_checklist" && typeof update.content === "string") {
			const taskText = update.content as string;
			if (update.checked === true) {
				checklistTasksToComplete.push(taskText);
			} else if (update.checked === false) {
				checklistTasksToUncomplete.push(taskText);
			}
		}
		// Handle pattern/replacement format (regex-style)
		else if (typeof update.pattern === "string" && update.replacement !== undefined) {
			try {
				const patternStr = (update.pattern as string)
					.replace(/\\\[/g, "\\[")
					.replace(/\\\]/g, "\\]");
				const regex = new RegExp(patternStr, "g");
				const newContent = noteContent.replace(regex, update.replacement as string);
				if (newContent !== noteContent) {
					noteContent = newContent;
					modified = true;
					logger.debug("Applied pattern replacement:", (update.pattern as string).substring(0, 50));
				}
			} catch {
				const literal = (update.pattern as string)
					.replace(/\\\[/g, "[")
					.replace(/\\\]/g, "]")
					.replace(/\\\s/g, " ");
				if (noteContent.includes(literal)) {
					noteContent = noteContent.replace(literal, update.replacement as string);
					modified = true;
					logger.debug("Applied literal replacement:", literal.substring(0, 50));
				}
			}
		}
		// Handle target/content format (section-based)
		else if (typeof update.target === "string" && typeof update.content === "string") {
			const headingRegex = new RegExp(
				`^(#{1,6})\\s+${escapeRegex((update.target as string).replace(/^#+\s*/, ""))}\\s*$`,
				"m"
			);
			const match = noteContent.match(headingRegex);

			if (match && match.index !== undefined && match[1]) {
				const headingLevel = match[1].length;
				const headingEnd = match.index + match[0].length;

				const restContent = noteContent.slice(headingEnd);
				const nextHeadingRegex = new RegExp(
					`^#{1,${headingLevel}}\\s+`,
					"m"
				);
				const nextMatch = restContent.match(nextHeadingRegex);
				const sectionEnd =
					nextMatch && nextMatch.index !== undefined
						? headingEnd + nextMatch.index
						: noteContent.length;

				noteContent =
					noteContent.slice(0, headingEnd) +
					"\n\n" +
					update.content +
					"\n\n" +
					noteContent.slice(sectionEnd);
				modified = true;
			}
		}
	}
	
	// Process checklist updates
	if (checklistTasksToComplete.length > 0) {
		for (const task of checklistTasksToComplete) {
			const escapedTask = task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const taskRegex = new RegExp(`- \\[ \\] ${escapedTask}`, "g");
			const newContent = noteContent.replace(taskRegex, `- [x] ${task}`);
			if (newContent !== noteContent) {
				noteContent = newContent;
				modified = true;
				logger.debug("Marked task complete:", task);
			}
		}
	}
	
	if (checklistTasksToUncomplete.length > 0) {
		for (const task of checklistTasksToUncomplete) {
			const escapedTask = task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const taskRegex = new RegExp(`- \\[x\\] ${escapedTask}`, "gi");
			const newContent = noteContent.replace(taskRegex, `- [ ] ${task}`);
			if (newContent !== noteContent) {
				noteContent = newContent;
				modified = true;
				logger.debug("Marked task incomplete:", task);
			}
		}
	}

	if (modified) {
		await app.vault.modify(file, noteContent);
		logger.info("Workaround: Successfully updated note via JSON intercept (updates array)");
		onToolExecution?.(
			"update_note",
			{ path: file.path },
			{ success: true }
		);
		return true;
	} else {
		logger.warn("Workaround: No patterns matched in note");
		return false;
	}
}

/**
 * Handle checklist JSON format: { checklist: Array<{task, completed}> }
 */
async function handleChecklistJson(
	ctx: HandlerContext,
	parsed: { checklist?: Array<{ task?: string; completed?: boolean }> }
): Promise<boolean> {
	const { app, activeFile, onToolExecution } = ctx;
	
	if (!parsed.checklist || !Array.isArray(parsed.checklist) || !activeFile) {
		return false;
	}
	
	logger.debug("Detected checklist update JSON, executing workaround");
	const tasks = parsed.checklist
		.filter((item) => item.completed === true)
		.map((item) => item.task || "");

	if (tasks.length > 0) {
		await executeTaskCompletion(app, activeFile, tasks, onToolExecution);
		return true;
	}
	return false;
}

/**
 * Handle checklist JSON format: { checklist_name: string, items_to_check: string[] }
 * This is a format the model sometimes outputs for task completion
 */
async function handleItemsToCheckJson(
	ctx: HandlerContext,
	parsed: { checklist_name?: string; items_to_check?: string[] }
): Promise<boolean> {
	const { app, activeFile, onToolExecution } = ctx;
	
	if (!parsed.items_to_check || !Array.isArray(parsed.items_to_check)) {
		return false;
	}
	
	logger.debug("Detected items_to_check JSON format, executing workaround");
	
	// Try to find the note by checklist_name if provided
	let targetFile: TFile | null = null;
	
	if (parsed.checklist_name) {
		// Try to find a file matching the checklist name
		const possiblePaths = [
			`${parsed.checklist_name}.md`,
			`Daily Notes/${parsed.checklist_name}.md`,
			parsed.checklist_name
		];
		
		for (const path of possiblePaths) {
			const file = app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				targetFile = file;
				logger.debug("Found target file for checklist:", path);
				break;
			}
		}
	}
	
	// Fall back to active file
	if (!targetFile) {
		targetFile = activeFile;
	}
	
	if (!targetFile) {
		logger.warn("No target file found for items_to_check workaround");
		return false;
	}
	
	const tasks = parsed.items_to_check.filter(t => typeof t === 'string' && t.trim());
	
	if (tasks.length > 0) {
		logger.debug("Completing tasks from items_to_check:", tasks);
		await executeTaskCompletion(app, targetFile, tasks, onToolExecution);
		return true;
	}
	
	return false;
}

/**
 * Handle {"tasks":["task1", "task2"], "status":"completed"} JSON format
 */
async function handleTasksStatusJson(
	ctx: HandlerContext,
	parsed: { tasks?: string[]; status?: string }
): Promise<boolean> {
	const { app, activeFile, onToolExecution } = ctx;
	
	// Check for tasks array
	if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
		return false;
	}
	
	logger.debug("Detected tasks/status JSON format, executing workaround:", {
		taskCount: parsed.tasks.length,
		status: parsed.status
	});
	
	// Use active file as the target
	if (!activeFile) {
		logger.warn("No active file for tasks/status workaround");
		return false;
	}
	
	const tasks = parsed.tasks.filter(t => typeof t === 'string' && t.trim());
	
	if (tasks.length === 0) {
		return false;
	}
	
	// Check if this is a completion or uncompletion
	const isCompletion = parsed.status === "completed" || parsed.status === "complete" || !parsed.status;
	
	if (isCompletion) {
		logger.debug("Completing tasks from tasks/status JSON:", tasks);
		await executeTaskCompletion(app, activeFile, tasks, onToolExecution);
	} else {
		logger.debug("Unchecking tasks from tasks/status JSON:", tasks);
		await executeTaskUncompletion(app, activeFile, tasks, onToolExecution);
	}
	
	return true;
}

/**
 * Handle JSON or function-call-like output that looks like a tool call
 * The realtime model sometimes outputs text instead of calling functions
 */
export async function handlePossibleJsonToolCall(
	app: App,
	content: string,
	onToolExecution: ToolExecutionCallback | null
): Promise<void> {
	const trimmedContent = content.trim();
	const activeFile = app.workspace.getActiveFile();
	
	const ctx: HandlerContext = {
		app,
		content: trimmedContent,
		activeFile,
		onToolExecution,
	};

	// Try function-call syntax first (e.g., "update_checklist(...)")
	if (await handleFunctionCallSyntax(ctx)) {
		return;
	}
	
	// Try natural language task completion ("Mark the following tasks...")
	if (await handleNaturalLanguageTaskCompletion(ctx)) {
		return;
	}

	// Try to parse as JSON
	try {
		const parsed = JSON.parse(trimmedContent);
		
		logger.info("[WORKAROUND-DEBUG] Parsed JSON content, trying handlers:", Object.keys(parsed));
		
		// Try each JSON format handler in order
		if (await handleReplaceNoteJson(ctx, parsed)) return;
		if (await handleUpdatesArrayJson(ctx, parsed)) return;
		if (await handleChecklistJson(ctx, parsed)) return;
		if (await handleItemsToCheckJson(ctx, parsed)) return;
		if (await handleTasksStatusJson(ctx, parsed)) return;
		
	} catch {
		// Not valid JSON - check if it looked like it should be
		if (trimmedContent.startsWith("{") || trimmedContent.startsWith("[")) {
			logger.info("[WORKAROUND-DEBUG] JSON parse failed for apparent JSON content");
		}
	}
}

/**
 * Check if a history item might contain a JSON tool call that needs handling
 */
export function mightBeJsonToolCall(item: RealtimeHistoryItem): boolean {
	const content = item.content || item.transcript || "";
	const trimmed = content.trim();
	
	logger.info("[WORKAROUND-DEBUG] mightBeJsonToolCall check:", {
		role: item.role,
		contentLen: content.length,
		trimmedStart: trimmed.substring(0, 50),
		startsWithBrace: trimmed.startsWith("{"),
		startsWithBracket: trimmed.startsWith("[")
	});
	
	// Must be from assistant role
	if (item.role !== "assistant") {
		logger.info("[WORKAROUND-DEBUG] rejected - role is not assistant, got:", item.role);
		return false;
	}
	
	// Check various patterns that indicate tool-like output
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		logger.info("[WORKAROUND-DEBUG] detected JSON-like content");
		return true;
	}
	
	if (trimmed.match(/^\w+\s*\(/)) {
		logger.info("[WORKAROUND-DEBUG] detected function-call syntax");
		return true;
	}
	
	if (trimmed.match(/mark\s+(?:the\s+following\s+)?tasks?/i)) {
		logger.info("[WORKAROUND-DEBUG] detected natural language task completion");
		return true;
	}
	
	// Detect phrases like "we'll mark everything done except" or "everything checked off except"
	if (trimmed.match(/(?:mark|check)\s+(?:everything|all|them|these)\s+(?:done|complete|off|finished)|everything\s+(?:checked|marked)\s+off/i)) {
		logger.info("[WORKAROUND-DEBUG] detected 'mark everything done' pattern");
		return true;
	}
	
	return false;
}
