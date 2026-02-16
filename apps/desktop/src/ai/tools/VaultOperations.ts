// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module VaultOperations
 * @description Core vault operation implementations for AI tool calling.
 *
 * This module provides the implementation layer for all vault-related operations
 * that AI providers can invoke as tools. Functions handle note CRUD, search,
 * periodic notes, task management, and web operations.
 *
 * ## Categories
 *
 * ### Read Operations
 * - `readNote()` - Read note content by path
 * - `getActiveNote()` - Get currently focused note
 * - `searchNotes()` - Search notes by content/regex
 * - `listNotes()` / `listNotesRecursively()` - List notes in folders
 * - `recentChanges()` - Recently modified notes
 *
 * ### Write Operations
 * - `createNote()` / `createOrUpdateNote()` - Create new notes
 * - `appendToNote()` - Append content to existing notes
 * - `patchNote()` - Apply JSON Patch operations
 * - `findReplaceInNote()` - Find and replace text
 *
 * ### Periodic Notes
 * - `getDailyNote()` / `openDailyNote()` - Daily notes
 * - `getPeriodicNote()` / `openPeriodicNote()` - Weekly/monthly/yearly
 *
 * ### Task Operations
 * - Task parsing, filtering, creation via {@link TaskOperations}
 *
 * ### Web Operations
 * - `fetchWebPage()` - Fetch and extract web content
 * - `webSearch()` - Search the web via configured API
 *
 * ## Usage
 *
 * ```typescript
 * import * as VaultOps from './VaultOperations';
 *
 * // Read a note
 * const result = await VaultOps.readNote(app, 'Projects/My Project.md');
 * ```
 *
 * @since 0.0.14
 */

import { App, TAbstractFile, TFile, TFolder } from "obsidian";
import type { PeriodicNoteConfig, PeriodicNotesSettings } from "../../ui/settings";
import type { PatchOperation, PatchTargetType } from "./ToolDefinitions";
import {
	buildTaskLine,
	filterTasks,
	parseTasksFromContent,
	type CreateTaskOptions,
	type ParsedTask,
	type TaskFilter,
	type TaskOperationResult,
	type TaskPriority,
} from "./TaskOperations";

declare global {
	interface Window {
		moment: typeof import("moment");
	}
}

const moment = window.moment;

/** Periodic note granularity/type */
export type PeriodicNoteGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/**
 * Normalize a vault path by removing leading slashes and backslashes
 */
export function normalizeVaultPath(path: string): string {
	// Replace backslashes with forward slashes
	let normalized = path.replace(/\\/g, "/");
	// Remove leading slashes
	normalized = normalized.replace(/^\/+/, "");
	// Ensure .md extension if it looks like a note path
	if (!normalized.endsWith(".md") && !normalized.includes(".")) {
		normalized += ".md";
	}
	return normalized;
}

/**
 * Ensure path has .md extension
 */
export function ensureMarkdownExtension(path: string): string {
	let normalized = path.replace(/\\/g, "/").trim();
	if (!normalized.endsWith(".md")) {
		normalized += ".md";
	}
	return normalized;
}

/**
 * Escape regex special characters
 */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// Vault Read Operations
// ============================================================================

export interface ReadNoteResult {
	success: boolean;
	content?: string;
	path?: string;
	error?: string;
}

export async function readNote(app: App, path: string): Promise<ReadNoteResult> {
	try {
		const normalizedPath = normalizeVaultPath(path);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${path}` };
		}
		const content = await app.vault.read(file);
		return { success: true, content, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to read note: ${error}` };
	}
}

export interface SearchNotesResult {
	success: boolean;
	results: Array<{ path: string; title: string; excerpt: string }>;
}

export async function searchNotes(
	app: App,
	query: string,
	limit = 10
): Promise<SearchNotesResult> {
	const files = app.vault.getMarkdownFiles();
	const results: Array<{ path: string; title: string; excerpt: string }> = [];
	const lowerQuery = query.toLowerCase();

	for (const file of files) {
		if (results.length >= limit) break;

		const titleMatch = file.basename.toLowerCase().includes(lowerQuery);
		let contentMatch = false;
		let excerpt = "";

		try {
			const content = await app.vault.cachedRead(file);
			const lowerContent = content.toLowerCase();
			const queryIndex = lowerContent.indexOf(lowerQuery);

			if (queryIndex !== -1) {
				contentMatch = true;
				const start = Math.max(0, queryIndex - 50);
				const end = Math.min(content.length, queryIndex + query.length + 50);
				excerpt =
					(start > 0 ? "..." : "") +
					content.slice(start, end) +
					(end < content.length ? "..." : "");
			}
		} catch {
			// Skip files that can't be read
		}

		if (titleMatch || contentMatch) {
			results.push({
				path: file.path,
				title: file.basename,
				excerpt: excerpt || file.basename,
			});
		}
	}

	return { success: true, results };
}

export interface GetActiveNoteResult {
	success: boolean;
	hasActiveNote: boolean;
	path?: string;
	title?: string;
	content?: string;
}

export async function getActiveNote(app: App): Promise<GetActiveNoteResult> {
	const activeFile = app.workspace.getActiveFile();
	if (!activeFile) {
		return { success: true, hasActiveNote: false };
	}

	try {
		const content = await app.vault.read(activeFile);
		return {
			success: true,
			hasActiveNote: true,
			path: activeFile.path,
			title: activeFile.basename,
			content,
		};
	} catch {
		return {
			success: true,
			hasActiveNote: true,
			path: activeFile.path,
			title: activeFile.basename,
		};
	}
}

// ============================================================================
// Note Navigation Operations
// ============================================================================

export interface OpenNoteResult {
	success: boolean;
	path?: string;
	error?: string;
}

/**
 * Open a note in the editor by its path
 */
export async function openNote(app: App, path: string): Promise<OpenNoteResult> {
	try {
		const normalizedPath = normalizeVaultPath(path);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${path}` };
		}

		// Open the file in the active leaf
		await app.workspace.getLeaf().openFile(file);
		return { success: true, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to open note: ${error}` };
	}
}

export interface OpenDailyNoteResult {
	success: boolean;
	path?: string;
	created?: boolean;
	error?: string;
	/** When file not found, includes parsed date for clarity */
	requestedDate?: string;
	/** When file not found, lists nearby available daily notes */
	nearbyNotes?: {
		mostRecent?: string;
		available: string[];
	};
}

/**
 * Get the daily notes configuration from Obsidian
 */
function getDailyNotesConfig(app: App): { folder: string; format: string } {
	// Try to get config from daily-notes plugin
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const dailyNotesPlugin = (app as any).internalPlugins?.plugins?.["daily-notes"];
	if (dailyNotesPlugin?.instance?.options) {
		const options = dailyNotesPlugin.instance.options;
		return {
			folder: options.folder || "Daily Notes",
			format: options.format || "YYYY-MM-DD",
		};
	}
	// Default configuration
	return { folder: "Daily Notes", format: "YYYY-MM-DD" };
}

/**
 * Format a date according to a format string using moment.js
 */
function formatDate(date: Date, format: string): string {
	return moment(date).format(format);
}

/**
 * Parse a date string in various formats using moment.js
 */
function parseDate(dateStr: string): Date | null {
	// Handle relative dates
	const lower = dateStr.toLowerCase().trim();
	const today = moment().startOf('day');
	
	if (lower === "today") {
		return today.toDate();
	}
	if (lower === "yesterday") {
		return today.subtract(1, 'day').toDate();
	}
	if (lower === "tomorrow") {
		return today.add(1, 'day').toDate();
	}
	
	// Handle "X days ago"
	const daysAgoMatch = lower.match(/^(\d+)\s*days?\s*ago$/);
	if (daysAgoMatch && daysAgoMatch[1]) {
		return moment().startOf('day').subtract(parseInt(daysAgoMatch[1], 10), 'days').toDate();
	}
	
	// Handle "last monday", "last tuesday", etc.
	const lastDayMatch = lower.match(/^last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
	if (lastDayMatch && lastDayMatch[1]) {
		const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(lastDayMatch[1]);
		let result = moment().startOf('day').day(dayIndex);
		if (result.isSameOrAfter(moment().startOf('day'))) {
			result = result.subtract(1, 'week');
		}
		return result.toDate();
	}
	
	// Handle "next monday", "next tuesday", etc.
	const nextDayMatch = lower.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
	if (nextDayMatch && nextDayMatch[1]) {
		const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(nextDayMatch[1]);
		let result = moment().startOf('day').day(dayIndex);
		if (result.isSameOrBefore(moment().startOf('day'))) {
			result = result.add(1, 'week');
		}
		return result.toDate();
	}
	
	// Try to parse with moment (handles ISO, various date formats)
	const parsed = moment(dateStr, [
		'YYYY-MM-DD',
		'M/D/YYYY',
		'MM/DD/YYYY',
		'D/M/YYYY',
		'DD/MM/YYYY',
		'MMMM D, YYYY',
		'MMM D, YYYY',
		'MMMM DD, YYYY',
		'MMM DD, YYYY',
		'D MMMM YYYY',
		'DD MMMM YYYY',
	], true);
	
	if (parsed.isValid()) {
		return parsed.toDate();
	}
	
	// Fallback: let moment try to parse naturally
	const natural = moment(dateStr);
	if (natural.isValid()) {
		return natural.toDate();
	}
	
	return null;
}

/**
 * Open a daily note for a specific date, creating it if it doesn't exist
 */
export async function openDailyNote(
	app: App,
	dateInput: string,
	createIfMissing = true
): Promise<OpenDailyNoteResult> {
	try {
		const date = parseDate(dateInput);
		if (!date) {
			return { success: false, error: `Could not parse date: ${dateInput}` };
		}
		
		const config = getDailyNotesConfig(app);
		const filename = formatDate(date, config.format);
		const path = `${config.folder}/${filename}.md`;
		const requestedDateStr = moment(date).format('YYYY-MM-DD');
		
		let file = app.vault.getAbstractFileByPath(path);
		let created = false;
		
		// Create the note if it doesn't exist
		if (!file && createIfMissing) {
			// Create parent folder if needed
			const folderExists = app.vault.getAbstractFileByPath(config.folder);
			if (!folderExists) {
				await app.vault.createFolder(config.folder);
			}
			
			// Create with a basic template
			const formattedDate = date.toLocaleDateString("en-US", {
				weekday: "long",
				year: "numeric",
				month: "long",
				day: "numeric",
			});
			const content = `# ${formattedDate}\n\n## Tasks\n\n- [ ] \n\n## Notes\n\n`;
			await app.vault.create(path, content);
			file = app.vault.getAbstractFileByPath(path);
			created = true;
		}
		
		if (!file || !(file instanceof TFile)) {
			// File not found - scan folder for nearby notes
			const nearbyNotes = await findNearbyDailyNotes(app, config.folder, date, config.format);
			return { 
				success: false, 
				error: `Daily note not found for ${requestedDateStr}: ${path}`,
				requestedDate: requestedDateStr,
				nearbyNotes
			};
		}
		
		// Open the file
		await app.workspace.getLeaf().openFile(file);
		return { success: true, path: file.path, created };
	} catch (error) {
		return { success: false, error: `Failed to open daily note: ${error}` };
	}
}

/**
 * Find nearby daily notes when a requested date's note doesn't exist
 */
async function findNearbyDailyNotes(
	app: App,
	folder: string,
	requestedDate: Date,
	format: string
): Promise<{ mostRecent?: string; available: string[] }> {
	const folderObj = app.vault.getAbstractFileByPath(folder);
	if (!folderObj || !(folderObj instanceof TFolder)) {
		return { available: [] };
	}
	
	const requestedMoment = moment(requestedDate);
	const notes: { path: string; date: moment.Moment }[] = [];
	
	// Scan folder for markdown files and try to parse their dates
	for (const child of folderObj.children) {
		if (child instanceof TFile && child.extension === 'md') {
			const basename = child.basename;
			// Try to parse the filename as a date using the configured format
			const parsed = moment(basename, format, true);
			if (parsed.isValid()) {
				notes.push({ path: child.path, date: parsed });
			}
		}
	}
	
	// Sort by date descending (most recent first)
	notes.sort((a, b) => b.date.valueOf() - a.date.valueOf());
	
	// Find the most recent note before or equal to the requested date
	const beforeOrOn = notes.find(n => n.date.isSameOrBefore(requestedMoment, 'day'));
	
	// Return the 5 most recent notes as available
	const available = notes.slice(0, 5).map(n => `${n.path} (${n.date.format('YYYY-MM-DD')})`);
	
	return {
		mostRecent: beforeOrOn ? `${beforeOrOn.path} (${beforeOrOn.date.format('YYYY-MM-DD')})` : undefined,
		available
	};
}

// ============================================================================
// Periodic Notes Operations (Weekly, Monthly, Quarterly, Yearly)
// ============================================================================

export interface OpenPeriodicNoteResult {
	success: boolean;
	path?: string;
	created?: boolean;
	granularity?: PeriodicNoteGranularity;
	error?: string;
}

/**
 * Get the quarter number (1-4) for a date using moment.js
 */
function getQuarter(date: Date): number {
	return moment(date).quarter();
}

/**
 * Format a date according to a moment.js format string
 * Moment.js handles all standard tokens: YYYY, MM, DD, gggg, ww, Q, etc.
 */
function formatDateAdvanced(date: Date, format: string): string {
	return moment(date).format(format);
}

/**
 * Parse a period expression to a date for periodic notes using moment.js
 * Supports expressions like:
 * - "this week", "last week", "next week"
 * - "this month", "last month", "2 months ago"
 * - "this quarter", "Q1 2026", "last quarter"
 * - "this year", "2025", "last year"
 */
function parsePeriodExpression(
	expr: string,
	granularity: PeriodicNoteGranularity
): Date | null {
	const lower = expr.toLowerCase().trim();
	const today = moment().startOf('day');
	
	// Handle "this", "current", "now"
	if (lower === 'this' || lower === 'current' || lower === 'now' || lower === 'today') {
		return today.toDate();
	}
	
	// For daily notes, use the existing parseDate function
	if (granularity === 'daily') {
		return parseDate(expr);
	}
	
	// Weekly expressions
	if (granularity === 'weekly') {
		if (lower === 'this week' || lower === 'current week') {
			return moment().startOf('week').toDate();
		}
		if (lower === 'last week' || lower === 'previous week') {
			return moment().subtract(1, 'week').startOf('week').toDate();
		}
		if (lower === 'next week') {
			return moment().add(1, 'week').startOf('week').toDate();
		}
		// Handle "X weeks ago"
		const weeksAgoMatch = lower.match(/^(\d+)\s*weeks?\s*ago$/);
		if (weeksAgoMatch && weeksAgoMatch[1]) {
			return moment().subtract(parseInt(weeksAgoMatch[1], 10), 'weeks').startOf('week').toDate();
		}
		// Handle "in X weeks"
		const weeksAheadMatch = lower.match(/^in\s*(\d+)\s*weeks?$/);
		if (weeksAheadMatch && weeksAheadMatch[1]) {
			return moment().add(parseInt(weeksAheadMatch[1], 10), 'weeks').startOf('week').toDate();
		}
		// Handle week number like "W05" or "week 5"
		const weekNumMatch = lower.match(/^(?:w|week\s*)(\d{1,2})(?:\s*(\d{4}))?$/);
		if (weekNumMatch && weekNumMatch[1]) {
			const weekNum = parseInt(weekNumMatch[1], 10);
			const year = weekNumMatch[2] ? parseInt(weekNumMatch[2], 10) : moment().year();
			return moment().year(year).week(weekNum).startOf('week').toDate();
		}
	}
	
	// Monthly expressions
	if (granularity === 'monthly') {
		if (lower === 'this month' || lower === 'current month') {
			return moment().startOf('month').toDate();
		}
		if (lower === 'last month' || lower === 'previous month') {
			return moment().subtract(1, 'month').startOf('month').toDate();
		}
		if (lower === 'next month') {
			return moment().add(1, 'month').startOf('month').toDate();
		}
		// Handle "X months ago"
		const monthsAgoMatch = lower.match(/^(\d+)\s*months?\s*ago$/);
		if (monthsAgoMatch && monthsAgoMatch[1]) {
			return moment().subtract(parseInt(monthsAgoMatch[1], 10), 'months').startOf('month').toDate();
		}
		// Handle "in X months"
		const monthsAheadMatch = lower.match(/^in\s*(\d+)\s*months?$/);
		if (monthsAheadMatch && monthsAheadMatch[1]) {
			return moment().add(parseInt(monthsAheadMatch[1], 10), 'months').startOf('month').toDate();
		}
		// Handle month names like "January 2026" or "Jan 2026" or just "January"
		const monthParsed = moment(lower, ['MMMM YYYY', 'MMM YYYY', 'MMMM', 'MMM'], true);
		if (monthParsed.isValid()) {
			// If no year specified, use current year
			if (!lower.match(/\d{4}/)) {
				monthParsed.year(moment().year());
			}
			return monthParsed.startOf('month').toDate();
		}
		// Handle "YYYY-MM" format
		const yymmParsed = moment(lower, 'YYYY-MM', true);
		if (yymmParsed.isValid()) {
			return yymmParsed.startOf('month').toDate();
		}
	}
	
	// Quarterly expressions
	if (granularity === 'quarterly') {
		if (lower === 'this quarter' || lower === 'current quarter') {
			return moment().startOf('quarter').toDate();
		}
		if (lower === 'last quarter' || lower === 'previous quarter') {
			return moment().subtract(1, 'quarter').startOf('quarter').toDate();
		}
		if (lower === 'next quarter') {
			return moment().add(1, 'quarter').startOf('quarter').toDate();
		}
		// Handle "X quarters ago"
		const quartersAgoMatch = lower.match(/^(\d+)\s*quarters?\s*ago$/);
		if (quartersAgoMatch && quartersAgoMatch[1]) {
			return moment().subtract(parseInt(quartersAgoMatch[1], 10), 'quarters').startOf('quarter').toDate();
		}
		// Handle "Q1 2026" or "Q1" or "2026-Q1"
		const qMatch = lower.match(/^q([1-4])(?:\s*(\d{4}))?$/);
		if (qMatch && qMatch[1]) {
			const q = parseInt(qMatch[1], 10);
			const year = qMatch[2] ? parseInt(qMatch[2], 10) : moment().year();
			return moment().year(year).quarter(q).startOf('quarter').toDate();
		}
		const qMatch2 = lower.match(/^(\d{4})-?q([1-4])$/);
		if (qMatch2 && qMatch2[1] && qMatch2[2]) {
			const year = parseInt(qMatch2[1], 10);
			const q = parseInt(qMatch2[2], 10);
			return moment().year(year).quarter(q).startOf('quarter').toDate();
		}
	}
	
	// Yearly expressions
	if (granularity === 'yearly') {
		if (lower === 'this year' || lower === 'current year') {
			return moment().startOf('year').toDate();
		}
		if (lower === 'last year' || lower === 'previous year') {
			return moment().subtract(1, 'year').startOf('year').toDate();
		}
		if (lower === 'next year') {
			return moment().add(1, 'year').startOf('year').toDate();
		}
		// Handle "X years ago"
		const yearsAgoMatch = lower.match(/^(\d+)\s*years?\s*ago$/);
		if (yearsAgoMatch && yearsAgoMatch[1]) {
			return moment().subtract(parseInt(yearsAgoMatch[1], 10), 'years').startOf('year').toDate();
		}
		// Handle plain year "2026"
		const yearMatch = lower.match(/^(\d{4})$/);
		if (yearMatch && yearMatch[1]) {
			return moment().year(parseInt(yearMatch[1], 10)).startOf('year').toDate();
		}
	}
	
	// Fallback: try standard date parsing
	return parseDate(expr);
}

/**
 * Get default template content for a periodic note
 */
function getDefaultPeriodicTemplate(
	granularity: PeriodicNoteGranularity,
	date: Date
): string {
	const m = moment(date);
	switch (granularity) {
		case 'daily': {
			return `# ${m.format('dddd, MMMM D, YYYY')}\n\n## Tasks\n\n- [ ] \n\n## Notes\n\n`;
		}
		case 'weekly': {
			return `# Week ${m.week()}, ${m.weekYear()}\n\n## Goals\n\n- [ ] \n\n## Notes\n\n## Review\n\n`;
		}
		case 'monthly': {
			return `# ${m.format('MMMM YYYY')}\n\n## Goals\n\n- [ ] \n\n## Projects\n\n## Notes\n\n## Review\n\n`;
		}
		case 'quarterly': {
			return `# Q${m.quarter()} ${m.year()}\n\n## Objectives\n\n- [ ] \n\n## Key Results\n\n## Notes\n\n## Review\n\n`;
		}
		case 'yearly': {
			return `# ${m.year()}\n\n## Vision\n\n## Goals\n\n- [ ] \n\n## Themes\n\n## Notes\n\n## Review\n\n`;
		}
	}
}

/**
 * Open a periodic note (weekly, monthly, quarterly, or yearly)
 */
export async function openPeriodicNote(
	app: App,
	periodExpression: string,
	granularity: PeriodicNoteGranularity,
	settings?: PeriodicNotesSettings,
	createIfMissing = true
): Promise<OpenPeriodicNoteResult> {
	try {
		// Get config for this granularity
		const config: PeriodicNoteConfig = settings?.[granularity] ?? getDefaultPeriodicConfig(granularity);
		
		// Check if this type is enabled
		if (!config.enabled && settings) {
			return { 
				success: false, 
				error: `${granularity.charAt(0).toUpperCase() + granularity.slice(1)} notes are not enabled. Enable them in settings.`,
				granularity 
			};
		}
		
		// Parse the period expression to a date
		const date = parsePeriodExpression(periodExpression, granularity);
		if (!date) {
			return { 
				success: false, 
				error: `Could not parse ${granularity} period: ${periodExpression}`,
				granularity 
			};
		}
		
		// Format the filename
		const filename = formatDateAdvanced(date, config.format);
		const path = `${config.folder}/${filename}.md`;
		
		let file = app.vault.getAbstractFileByPath(path);
		let created = false;
		
		// Create the note if it doesn't exist
		if (!file && createIfMissing) {
			// Create parent folder if needed
			const folderExists = app.vault.getAbstractFileByPath(config.folder);
			if (!folderExists) {
				await app.vault.createFolder(config.folder);
			}
			
			// Get template content
			let content: string;
			if (config.templatePath) {
				// Try to load from template
				const templateFile = app.vault.getAbstractFileByPath(config.templatePath);
				if (templateFile instanceof TFile) {
					content = await app.vault.read(templateFile);
					// Replace template variables
					content = content
						.replace(/\{\{date\}\}/g, formatDateAdvanced(date, config.format))
						.replace(/\{\{title\}\}/g, filename);
				} else {
					content = getDefaultPeriodicTemplate(granularity, date);
				}
			} else {
				content = getDefaultPeriodicTemplate(granularity, date);
			}
			
			await app.vault.create(path, content);
			file = app.vault.getAbstractFileByPath(path);
			created = true;
		}
		
		if (!file || !(file instanceof TFile)) {
			return { 
				success: false, 
				error: `${granularity.charAt(0).toUpperCase() + granularity.slice(1)} note not found: ${path}`,
				granularity 
			};
		}
		
		// Open the file
		await app.workspace.getLeaf().openFile(file);
		return { success: true, path: file.path, created, granularity };
	} catch (error) {
		return { 
			success: false, 
			error: `Failed to open ${granularity} note: ${error}`,
			granularity 
		};
	}
}

/**
 * Get default config for a granularity (used when settings not provided)
 */
function getDefaultPeriodicConfig(granularity: PeriodicNoteGranularity): PeriodicNoteConfig {
	switch (granularity) {
		case 'daily':
			return { enabled: true, format: 'YYYY-MM-DD', folder: 'Daily Notes' };
		case 'weekly':
			return { enabled: true, format: 'gggg-[W]ww', folder: 'Weekly Notes' };
		case 'monthly':
			return { enabled: true, format: 'YYYY-MM', folder: 'Monthly Notes' };
		case 'quarterly':
			return { enabled: true, format: 'YYYY-[Q]Q', folder: 'Quarterly Notes' };
		case 'yearly':
			return { enabled: true, format: 'YYYY', folder: 'Yearly Notes' };
	}
}

export interface ListNotesResult {
	success: boolean;
	items: Array<{ path: string; name: string; type: 'file' | 'folder' }>;
}

export interface ListNotesRecursivelyResult {
	success: boolean;
	notes: Array<{ path: string; title: string }>;
	total: number;
	truncated: boolean;
}

export async function listNotes(
	app: App,
	folder?: string,
	_limit = 100  // Kept for backward compatibility but not used (returns immediate children only)
): Promise<ListNotesResult> {
	const { TFolder, TFile } = await import('obsidian');
	const normalizedFolder = folder
		? folder.replace(/\\/g, "/").replace(/\/+$/, "")
		: '';

	// Get the target folder (or root)
	let targetFolder;
	if (normalizedFolder === '' || normalizedFolder === '/') {
		targetFolder = app.vault.getRoot();
	} else {
		const abstractFile = app.vault.getAbstractFileByPath(normalizedFolder);
		if (!abstractFile || !(abstractFile instanceof TFolder)) {
			return { success: true, items: [] };
		}
		targetFolder = abstractFile;
	}

	// List immediate children only (non-recursive)
	const items: Array<{ path: string; name: string; type: 'file' | 'folder' }> = [];
	
	for (const child of targetFolder.children) {
		if (child instanceof TFolder) {
			items.push({
				path: child.path,
				name: child.name,
				type: 'folder'
			});
		} else if (child instanceof TFile && child.extension === 'md') {
			items.push({
				path: child.path,
				name: child.basename,
				type: 'file'
			});
		}
	}

	// Sort: folders first, then files, alphabetically
	items.sort((a, b) => {
		if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
		return a.name.localeCompare(b.name);
	});

	return { success: true, items: items.slice(0, 100) };
}

export async function listNotesRecursively(
	app: App,
	folder?: string,
	limit = 200
): Promise<ListNotesRecursivelyResult> {
	const files = app.vault.getMarkdownFiles();
	const normalizedFolder = folder
		? folder.replace(/\\/g, "/").replace(/\/+$/, "")
		: '';

	// Filter to folder (or all if no folder specified)
	const filtered = normalizedFolder === '' || normalizedFolder === '/'
		? files
		: files.filter(file => file.path.startsWith(normalizedFolder + '/') || file.path === normalizedFolder);

	// Sort alphabetically by path
	filtered.sort((a, b) => a.path.localeCompare(b.path));

	const total = filtered.length;
	const truncated = total > limit;

	const notes = filtered
		.slice(0, limit)
		.map(file => ({
			path: file.path,
			title: file.basename,
		}));

	return { success: true, notes, total, truncated };
}

// ============================================================================
// Vault Write Operations
// ============================================================================

export interface WriteResult {
	success: boolean;
	path?: string;
	error?: string;
}

export async function createNote(
	app: App,
	path: string,
	content: string
): Promise<WriteResult> {
	try {
		const normalizedPath = ensureMarkdownExtension(path);

		const existing = app.vault.getAbstractFileByPath(normalizedPath);
		if (existing) {
			return { success: false, error: `Note already exists: ${normalizedPath}` };
		}

		// Create parent folders if needed
		const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf("/"));
		if (folderPath) {
			const folder = app.vault.getAbstractFileByPath(folderPath);
			if (!folder) {
				await app.vault.createFolder(folderPath);
			}
		}

		await app.vault.create(normalizedPath, content);
		return { success: true, path: normalizedPath };
	} catch (error) {
		return { success: false, error: `Failed to create note: ${error}` };
	}
}

export async function appendToNote(
	app: App,
	path: string,
	content: string
): Promise<WriteResult> {
	try {
		const normalizedPath = normalizeVaultPath(path);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${path}` };
		}
		await app.vault.append(file, "\n" + content);
		return { success: true, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to append to note: ${error}` };
	}
}

export async function updateNote(
	app: App,
	path: string,
	content: string
): Promise<WriteResult> {
	try {
		const normalizedPath = normalizeVaultPath(path);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${path}` };
		}
		await app.vault.modify(file, content);
		return { success: true, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to update note: ${error}` };
	}
}

export async function deleteNote(
	app: App,
	path: string
): Promise<WriteResult> {
	try {
		const normalizedPath = normalizeVaultPath(path);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${path}` };
		}
		await app.vault.trash(file, true); // Move to system trash for safety
		return { success: true, path: normalizedPath };
	} catch (error) {
		return { success: false, error: `Failed to delete note: ${error}` };
	}
}

export async function renameNote(
	app: App,
	oldPath: string,
	newPath: string
): Promise<{ success: boolean; newPath?: string; error?: string }> {
	try {
		const normalizedOldPath = normalizeVaultPath(oldPath);
		const file = app.vault.getAbstractFileByPath(normalizedOldPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${oldPath}` };
		}

		// Normalize new path and ensure .md extension
		const normalizedNewPath = ensureMarkdownExtension(newPath);

		// Check if target already exists
		const existing = app.vault.getAbstractFileByPath(normalizedNewPath);
		if (existing) {
			return { success: false, error: `A note already exists at: ${normalizedNewPath}` };
		}

		await app.fileManager.renameFile(file, normalizedNewPath);
		return { success: true, newPath: normalizedNewPath };
	} catch (error) {
		return { success: false, error: `Failed to rename note: ${error}` };
	}
}

export interface RecentChangesResult {
	files: Array<{ path: string; title: string; mtime: number; mtimeFormatted: string }>;
}

export async function getRecentChanges(
	app: App,
	limit = 10
): Promise<RecentChangesResult> {
	const files = app.vault.getMarkdownFiles()
		.sort((a, b) => b.stat.mtime - a.stat.mtime)
		.slice(0, limit)
		.map(file => ({
			path: file.path,
			title: file.basename,
			mtime: file.stat.mtime,
			mtimeFormatted: new Date(file.stat.mtime).toISOString(),
		}));
	return { files };
}

// Re-export PatchOperation and PatchTargetType from ToolDefinitions for backward compatibility
export type { PatchOperation, PatchTargetType } from "./ToolDefinitions";

export interface PatchNoteResult {
	success: boolean;
	error?: string;
}

export async function patchNote(
	app: App,
	path: string,
	operation: PatchOperation,
	targetType: PatchTargetType,
	target: string | undefined,
	content: string
): Promise<PatchNoteResult> {
	try {
		const normalizedPath = normalizeVaultPath(path);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${path}` };
		}

		const fileContent = await app.vault.read(file);
		let newContent: string;

		if (targetType === "end") {
			// Simply append to end
			newContent = fileContent + "\n" + content;
		} else if (targetType === "frontmatter") {
			// Handle frontmatter
			const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
			if (frontmatterMatch) {
				const frontmatterEnd = frontmatterMatch[0].length;
				if (operation === "append") {
					newContent = fileContent.slice(0, frontmatterEnd) + "\n" + content + fileContent.slice(frontmatterEnd);
				} else if (operation === "prepend") {
					newContent = content + "\n" + fileContent;
				} else {
					// replace frontmatter
					newContent = content + fileContent.slice(frontmatterEnd);
				}
			} else {
				// No frontmatter exists
				if (operation === "prepend" || operation === "append") {
					newContent = content + "\n" + fileContent;
				} else {
					newContent = content + "\n" + fileContent;
				}
			}
		} else if (targetType === "heading") {
			// Find heading
			const headingRegex = new RegExp(`^(#{1,6})\\s+${escapeRegex(target || "")}\\s*$`, "m");
			const match = fileContent.match(headingRegex);
			if (!match || match.index === undefined || !match[1]) {
				return { success: false, error: `Heading not found: ${target}` };
			}

			const headingLevel = match[1].length;
			const headingEnd = (match.index as number) + match[0].length;

			// Find the end of this section (next heading of same or higher level, or EOF)
			const restContent = fileContent.slice(headingEnd);
			const nextHeadingRegex = new RegExp(`^#{1,${headingLevel}}\\s+`, "m");
			const nextMatch = restContent.match(nextHeadingRegex);
			const sectionEnd = nextMatch && nextMatch.index !== undefined 
				? headingEnd + nextMatch.index 
				: fileContent.length;

			if (operation === "prepend") {
				// Insert right after the heading line
				newContent = fileContent.slice(0, headingEnd) + "\n" + content + fileContent.slice(headingEnd);
			} else if (operation === "append") {
				// Insert at the end of the section
				newContent = fileContent.slice(0, sectionEnd) + "\n" + content + fileContent.slice(sectionEnd);
			} else {
				// Replace the entire section content (keep heading)
				newContent = fileContent.slice(0, headingEnd) + "\n" + content + "\n" + fileContent.slice(sectionEnd);
			}
		} else if (targetType === "block") {
			// Find block reference ^blockid
			const blockRegex = new RegExp(`\\^${escapeRegex(target || "")}\\s*$`, "m");
			const match = fileContent.match(blockRegex);
			if (!match || match.index === undefined) {
				return { success: false, error: `Block reference not found: ^${target}` };
			}

			// Find the start of the line containing the block reference
			const beforeMatch = fileContent.slice(0, match.index);
			const lineStart = beforeMatch.lastIndexOf("\n") + 1;
			const lineEnd = match.index + match[0].length;

			if (operation === "prepend") {
				newContent = fileContent.slice(0, lineStart) + content + "\n" + fileContent.slice(lineStart);
			} else if (operation === "append") {
				newContent = fileContent.slice(0, lineEnd) + "\n" + content + fileContent.slice(lineEnd);
			} else {
				// Replace the entire block line
				newContent = fileContent.slice(0, lineStart) + content + " ^" + target + fileContent.slice(lineEnd);
			}
		} else {
			return { success: false, error: `Unknown target type: ${targetType}` };
		}

		await app.vault.modify(file, newContent);
		return { success: true };
	} catch (error) {
		return { success: false, error: `Failed to patch note: ${error}` };
	}
}

export interface GetDailyNoteResult {
	success: boolean;
	path?: string;
	content?: string;
	exists: boolean;
	error?: string;
}

/**
 * Get a daily note for a specific date (read-only, doesn't open/create)
 */
export async function getDailyNote(
	app: App,
	date?: string
): Promise<GetDailyNoteResult> {
	try {
		// Determine the date
		const targetDate = date ? new Date(date) : new Date();
		const dateStr = targetDate.toISOString().split("T")[0]; // YYYY-MM-DD format

		// Common daily note folder patterns
		const possiblePaths = [
			`Daily Notes/${dateStr}.md`,
			`daily/${dateStr}.md`,
			`Daily/${dateStr}.md`,
			`journal/${dateStr}.md`,
			`Journal/${dateStr}.md`,
			`${dateStr}.md`,
		];

		// Try to find existing daily note
		for (const path of possiblePaths) {
			const file = app.vault.getAbstractFileByPath(path);
			if (file && file instanceof TFile) {
				const content = await app.vault.read(file);
				return { success: true, path: file.path, content, exists: true };
			}
		}

		// Also search for files matching the date in their name
		const files = app.vault.getMarkdownFiles();
		for (const file of files) {
			if (dateStr && (file.basename === dateStr || file.basename.includes(dateStr))) {
				const content = await app.vault.read(file);
				return { success: true, path: file.path, content, exists: true };
			}
		}

		return { success: true, exists: false, error: `No daily note found for ${dateStr}. Common paths checked: ${possiblePaths.join(", ")}` };
	} catch (error) {
		return { success: false, exists: false, error: `Failed to get daily note: ${error}` };
	}
}

export interface FindReplaceResult {
	success: boolean;
	path?: string;
	error?: string;
}

export async function findAndReplaceInNote(
	app: App,
	path: string,
	find: string,
	replace: string
): Promise<FindReplaceResult> {
	try {
		const normalizedPath = normalizeVaultPath(path);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${path}` };
		}

		const content = await app.vault.read(file);

		if (!content.includes(find)) {
			return {
				success: false,
				error: `Text not found in note: "${find.substring(0, 50)}${find.length > 50 ? "..." : ""}"`,
			};
		}

		const updatedContent = content.replace(find, replace);
		await app.vault.modify(file, updatedContent);
		return { success: true, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to update note: ${error}` };
	}
}

export interface MarkTasksResult {
	success: boolean;
	path?: string;
	tasksMarked?: number;
	error?: string;
}

export async function markTasksComplete(
	app: App,
	taskList: string[],
	exceptions: string[] = [],
	notePath?: string
): Promise<MarkTasksResult> {
	try {
		let file: TFile | null = null;
		
		if (notePath) {
			const normalizedPath = normalizeVaultPath(notePath);
			const abstractFile = app.vault.getAbstractFileByPath(normalizedPath);
			if (abstractFile instanceof TFile) {
				file = abstractFile;
			}
		} else {
			file = app.workspace.getActiveFile();
		}

		if (!file) {
			return { success: false, error: "No note specified or active" };
		}

		let content = await app.vault.read(file);
		let modified = false;
		let tasksMarked = 0;

		for (const task of taskList) {
			if (exceptions.includes(task)) continue;

			const escapedTask = escapeRegex(task);
			const taskRegex = new RegExp(`- \\[ \\] ${escapedTask}`, "g");
			const newContent = content.replace(taskRegex, `- [x] ${task}`);

			if (newContent !== content) {
				content = newContent;
				modified = true;
				tasksMarked++;
			}
		}

		if (modified) {
			await app.vault.modify(file, content);
			return { success: true, path: file.path, tasksMarked };
		} else {
			return { success: false, error: "No matching unchecked tasks found" };
		}
	} catch (error) {
		return { success: false, error: `Failed to mark tasks: ${error}` };
	}
}

// ============================================================================
// Web Operations
// ============================================================================

export interface FetchWebPageResult {
	success: boolean;
	url?: string;
	title?: string;
	content?: string;
	error?: string;
}

export async function fetchWebPage(url: string): Promise<FetchWebPageResult> {
	try {
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(url);
			if (!["http:", "https:"].includes(parsedUrl.protocol)) {
				return {
					success: false,
					error: "Invalid URL protocol. Only http and https are supported.",
				};
			}
		} catch {
			return { success: false, error: `Invalid URL: ${url}` };
		}

		const response = await fetch(url, {
			method: "GET",
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; ObsidianVaultCopilot/1.0)",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
		});

		if (!response.ok) {
			return {
				success: false,
				error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
			};
		}

		const html = await response.text();

		const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
		const title =
			titleMatch && titleMatch[1] ? titleMatch[1].trim() : parsedUrl.hostname;

		let textContent = html
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim();

		const maxLength = 8000;
		if (textContent.length > maxLength) {
			textContent = textContent.substring(0, maxLength) + "...";
		}

		return { success: true, url, title, content: textContent };
	} catch (error) {
		return { success: false, error: `Failed to fetch web page: ${error}` };
	}
}

export interface WebSearchResult {
	success: boolean;
	query?: string;
	results: Array<{ title: string; url: string; snippet: string }>;
	error?: string;
}

export async function webSearch(
	query: string,
	limit = 5
): Promise<WebSearchResult> {
	try {
		const encodedQuery = encodeURIComponent(query);
		const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

		const response = await fetch(searchUrl, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			},
		});

		if (!response.ok) {
			return {
				success: false,
				results: [],
				error: `Search request failed: ${response.status}`,
			};
		}

		const html = await response.text();
		const results: Array<{ title: string; url: string; snippet: string }> = [];

		const resultRegex =
			/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)/gi;
		let match;

		while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
			const url = match[1] || "";
			const title = (match[2] || "").trim();
			const snippet = (match[3] || "").trim();

			if (title && url) {
				const actualUrl = url.includes("uddg=")
					? decodeURIComponent(url.split("uddg=")[1]?.split("&")[0] || url)
					: url;

				results.push({ title, url: actualUrl, snippet });
			}
		}

		// Fallback: try simpler regex if no results found
		if (results.length === 0) {
			const simpleRegex =
				/<a[^>]*class="result__url"[^>]*href="([^"]*)"[^>]*>[\s\S]*?<a[^>]*class="result__a"[^>]*>([^<]*)<\/a>/gi;
			while ((match = simpleRegex.exec(html)) !== null && results.length < limit) {
				const url = match[1] || "";
				const title = (match[2] || "").trim();
				if (title && url) {
					results.push({ title, url, snippet: "" });
				}
			}
		}

		return { success: true, query, results };
	} catch (error) {
		return { success: false, results: [], error: `Search failed: ${error}` };
	}
}

// ============================================================================
// Task Operations
// ============================================================================

/** Options for creating a task through VaultOperations */
export interface CreateTaskVaultOptions extends Omit<CreateTaskOptions, "status"> {
	/** Path to the note where the task should be added */
	path: string;
}

/** Options for listing tasks */
export interface ListTasksOptions extends TaskFilter {
	/** Path to a specific note. If not provided, searches the active note */
	path?: string;
}

/**
 * Get all tasks from a note with full Obsidian Tasks metadata
 */
export async function getTasksFromNote(
	app: App,
	notePath?: string
): Promise<TaskOperationResult> {
	try {
		let file: TFile | null = null;

		if (notePath) {
			const normalizedPath = normalizeVaultPath(notePath);
			const abstractFile = app.vault.getAbstractFileByPath(normalizedPath);
			if (abstractFile instanceof TFile) {
				file = abstractFile;
			}
		} else {
			file = app.workspace.getActiveFile();
		}

		if (!file) {
			return {
				success: false,
				error: notePath ? `Note not found: ${notePath}` : "No active note",
			};
		}

		const content = await app.vault.read(file);
		const tasks = parseTasksFromContent(content, file.path);

		return { success: true, tasks, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to get tasks: ${error}` };
	}
}

/**
 * Create a new task with Obsidian Tasks syntax
 */
export async function createTask(
	app: App,
	options: CreateTaskVaultOptions
): Promise<WriteResult> {
	try {
		const normalizedPath = normalizeVaultPath(options.path);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (!file || !(file instanceof TFile)) {
			return { success: false, error: `Note not found: ${options.path}` };
		}

		const taskLine = buildTaskLine({
			description: options.description,
			priority: options.priority,
			dueDate: options.dueDate,
			scheduledDate: options.scheduledDate,
			startDate: options.startDate,
			recurrence: options.recurrence,
			tags: options.tags,
		});

		await app.vault.append(file, "\n" + taskLine);
		return { success: true, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to create task: ${error}` };
	}
}

/**
 * Update task status (complete/incomplete) with bidirectional support
 * 
 * @param app - Obsidian App instance
 * @param tasks - Array of task description texts to modify
 * @param complete - true to mark complete ([x]), false to mark incomplete ([ ])
 * @param exceptions - Task texts to exclude from the operation
 * @param notePath - Optional note path, defaults to active note
 */
export async function updateTaskStatus(
	app: App,
	tasks: string[],
	complete: boolean,
	exceptions: string[] = [],
	notePath?: string
): Promise<MarkTasksResult> {
	try {
		let file: TFile | null = null;

		if (notePath) {
			const normalizedPath = normalizeVaultPath(notePath);
			const abstractFile = app.vault.getAbstractFileByPath(normalizedPath);
			if (abstractFile instanceof TFile) {
				file = abstractFile;
			}
		} else {
			file = app.workspace.getActiveFile();
		}

		if (!file) {
			return { success: false, error: "No note specified or active" };
		}

		let content = await app.vault.read(file);
		let modified = false;
		let tasksMarked = 0;

		// Determine the source and target status patterns
		const sourcePattern = complete ? "- [ ]" : "- [x]";
		const targetPattern = complete ? "- [x]" : "- [ ]";
		const sourcePatternAlt = complete ? "- [ ]" : "- [X]"; // Handle uppercase X

		for (const task of tasks) {
			if (exceptions.includes(task)) continue;

			const escapedTask = escapeRegex(task);
			
			// Match both lowercase and uppercase status
			const taskRegex = new RegExp(
				`- \\[${complete ? " " : "[xX]"}\\]\\s*${escapedTask}`,
				"g"
			);
			
			const newContent = content.replace(taskRegex, (match) => {
				// Replace just the checkbox part while preserving the rest
				if (match.startsWith(sourcePattern) || match.startsWith(sourcePatternAlt)) {
					return targetPattern + match.slice(5);
				}
				return targetPattern + " " + task;
			});

			if (newContent !== content) {
				content = newContent;
				modified = true;
				tasksMarked++;
			}
		}

		if (modified) {
			await app.vault.modify(file, content);
			return { success: true, path: file.path, tasksMarked };
		} else {
			const status = complete ? "unchecked" : "checked";
			return { success: false, error: `No matching ${status} tasks found` };
		}
	} catch (error) {
		return { success: false, error: `Failed to update tasks: ${error}` };
	}
}

/**
 * List tasks with filtering options
 */
export async function listTasks(
	app: App,
	options: ListTasksOptions
): Promise<TaskOperationResult> {
	try {
		let file: TFile | null = null;

		if (options.path) {
			const normalizedPath = normalizeVaultPath(options.path);
			const abstractFile = app.vault.getAbstractFileByPath(normalizedPath);
			if (abstractFile instanceof TFile) {
				file = abstractFile;
			}
		} else {
			file = app.workspace.getActiveFile();
		}

		if (!file) {
			return {
				success: false,
				error: options.path ? `Note not found: ${options.path}` : "No active note",
			};
		}

		const content = await app.vault.read(file);
		const allTasks = parseTasksFromContent(content, file.path);

		// Apply filters
		const filteredTasks = filterTasks(allTasks, {
			completed: options.completed,
			priority: options.priority,
			dueBefore: options.dueBefore,
			dueAfter: options.dueAfter,
			dueOn: options.dueOn,
			tags: options.tags,
			query: options.query,
			limit: options.limit,
		});

		return { success: true, tasks: filteredTasks, path: file.path };
	} catch (error) {
		return { success: false, error: `Failed to list tasks: ${error}` };
	}
}
