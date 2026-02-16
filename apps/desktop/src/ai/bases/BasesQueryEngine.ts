/**
 * BasesQueryEngine - Query vault notes matching Base filters
 * 
 * This module scans vault notes and evaluates their frontmatter properties
 * against a Base's filter definitions. Since .base files contain no data,
 * this engine finds the actual "records" (vault notes) that would appear
 * in the rendered Base view.
 */

import type { App, TFile } from "obsidian";
import type { BaseFilterGroup, BaseSchema, ParsedFilterCondition, ParsedFilterFunction, QueryResult } from "./types";

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content: string): Record<string, any> | null {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!match) return null;

	try {
		// Simple YAML parser for frontmatter
		const yaml = match[1];
		if (!yaml) return null;
		const lines = yaml.split("\n");
		const result: Record<string, any> = {};
		let currentKey = "";

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;

			if (trimmed.includes(":")) {
				const parts = trimmed.split(":");
				const key = parts[0]?.trim() ?? "";
				const value = parts.slice(1).join(":").trim();
				currentKey = key;

				if (value) {
					result[key] = parseValue(value);
				}
			}
		}

		return result;
	} catch (error) {
		console.error("Error parsing frontmatter:", error);
		return null;
	}
}

function parseValue(value: string): any {
	if (!value) return null;

	const trimmed = value.trim();

	// Boolean
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;

	// Null
	if (trimmed === "null" || trimmed === "~") return null;

	// Number
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
		return Number(trimmed);
	}

	// String (remove quotes if present)
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

/**
 * Parse a filter expression string into a structured condition or function call.
 * 
 * Supports:
 *   'status != "archived"'  →  comparison
 *   file.inFolder("Projects")  →  function call
 *   file.hasTag("book")  →  function call
 */
function parseFilterExpression(expr: string): ParsedFilterCondition | ParsedFilterFunction | null {
	const trimmed = expr.trim();

	// Check for function-style: file.inFolder("X"), file.hasTag("X"), etc.
	const fnMatch = trimmed.match(/^file\.(\w+)\(\s*"([^"]*)"\s*\)$/);
	if (fnMatch && fnMatch[1] && fnMatch[2] !== undefined) {
		return { fn: fnMatch[1], args: [fnMatch[2]] };
	}

	// Check for comparison: property op value
	// Operators: ==, !=, >=, <=, >, <
	const compMatch = trimmed.match(/^(.+?)\s*(!=|==|>=|<=|>|<)\s*(.+)$/);
	if (compMatch && compMatch[1] && compMatch[2] && compMatch[3]) {
		const property = compMatch[1].trim();
		const operator = compMatch[2] as ParsedFilterCondition["operator"];
		let rawValue = compMatch[3].trim();

		// Parse the value
		let value: string | number | boolean;
		if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
			(rawValue.startsWith("'") && rawValue.endsWith("'"))) {
			value = rawValue.slice(1, -1);
		} else if (rawValue === "true") {
			value = true;
		} else if (rawValue === "false") {
			value = false;
		} else if (rawValue === "null") {
			value = "";
		} else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
			value = Number(rawValue);
		} else {
			value = rawValue;
		}

		return { property, operator, value };
	}

	console.warn(`BasesQueryEngine: Could not parse filter expression: ${expr}`);
	return null;
}

/**
 * Evaluate a parsed filter condition against a note's properties
 */
function evaluateCondition(condition: ParsedFilterCondition, properties: Record<string, any>): boolean {
	const value = properties[condition.property];

	switch (condition.operator) {
		case "==":
			return value === condition.value;
		case "!=":
			return value !== condition.value;
		case ">":
			return typeof value === "number" && value > Number(condition.value);
		case "<":
			return typeof value === "number" && value < Number(condition.value);
		case ">=":
			return typeof value === "number" && value >= Number(condition.value);
		case "<=":
			return typeof value === "number" && value <= Number(condition.value);
		default:
			return true;
	}
}

/**
 * Evaluate a parsed function filter against a note's properties and path
 */
function evaluateFunction(fn: ParsedFilterFunction, filePath: string, properties: Record<string, any>): boolean {
	switch (fn.fn) {
		case "inFolder": {
			const noteFolder = filePath.substring(0, filePath.lastIndexOf("/"));
			const target = fn.args[0] ?? "";
			return noteFolder === target || noteFolder.startsWith(target + "/");
		}
		case "hasTag": {
			const tags = properties["tags"];
			const target = fn.args[0] ?? "";
			if (Array.isArray(tags)) {
				return tags.includes(target) || tags.includes("#" + target);
			}
			if (typeof tags === "string") {
				return tags === target || tags === "#" + target;
			}
			return false;
		}
		case "hasLink": {
			// For POC, check if content contains a link to the target
			return false;
		}
		default:
			console.warn(`BasesQueryEngine: Unknown function: file.${fn.fn}`);
			return true;
	}
}

/**
 * Evaluate a single filter expression string
 */
function evaluateExpression(expr: string, properties: Record<string, any>, filePath: string): boolean {
	const parsed = parseFilterExpression(expr);
	if (!parsed) return true; // Unknown expressions pass through

	if ("fn" in parsed) {
		return evaluateFunction(parsed, filePath, properties);
	}
	return evaluateCondition(parsed, properties);
}

/**
 * Evaluate a filter group (and/or/not) against a note's properties
 */
function evaluateFilterGroup(
	group: BaseFilterGroup,
	properties: Record<string, any>,
	filePath: string
): boolean {
	if (group.and) {
		return group.and.every((item) =>
			typeof item === "string"
				? evaluateExpression(item, properties, filePath)
				: evaluateFilterGroup(item, properties, filePath)
		);
	}
	if (group.or) {
		return group.or.some((item) =>
			typeof item === "string"
				? evaluateExpression(item, properties, filePath)
				: evaluateFilterGroup(item, properties, filePath)
		);
	}
	if (group.not) {
		const inner = group.not;
		return typeof inner === "string"
			? !evaluateExpression(inner, properties, filePath)
			: !evaluateFilterGroup(inner, properties, filePath);
	}
	// No filter keys — everything matches
	return true;
}

/**
 * Query vault notes matching a Base's filters
 * 
 * @param app - Obsidian App instance
 * @param schema - Parsed Base schema with filters
 * @param limit - Maximum number of results to return (default: 50)
 * @returns Array of matching notes with their properties
 */
export async function queryBase(
	app: App,
	schema: BaseSchema,
	limit: number = 50
): Promise<QueryResult[]> {
	const results: QueryResult[] = [];
	const files = app.vault.getFiles();

	for (const file of files) {
		// Check if we've hit the limit
		if (results.length >= limit) {
			break;
		}

		// Only parse frontmatter for markdown files; skip binary/non-md content
		let frontmatter: Record<string, any> = {};
		if (file.extension === "md") {
			const content = await app.vault.read(file);
			frontmatter = parseFrontmatter(content) || {};
		}

		// Add file.folder as a special property
		const properties: Record<string, any> = {
			...frontmatter,
			"file.folder": file.parent?.path || "",
			"file.name": file.basename,
			"file.path": file.path,
		};

		// Evaluate filter group
		let matches = true;
		if (schema.filters) {
			matches = evaluateFilterGroup(schema.filters, properties, file.path);
		}

		if (matches) {
			// Extract only the properties defined in the Base schema
			const resultProperties: Record<string, any> = {};

			if (schema.properties) {
				for (const propName of Object.keys(schema.properties)) {
					resultProperties[propName] = properties[propName];
				}
			} else {
				// If no properties defined, return all frontmatter
				Object.assign(resultProperties, frontmatter);
			}

			results.push({
				path: file.path,
				basename: file.basename,
				properties: resultProperties,
			});
		}
	}

	return results;
}

/**
 * Format query results as a markdown table
 */
export function formatQueryResults(results: QueryResult[], schema: BaseSchema): string {
	if (results.length === 0) {
		return "No matching records found.";
	}

	// Get column names from schema properties or from first result
	const columns: string[] = [];
	if (schema.properties) {
		// Sort by position if available
		const sortedProps = Object.entries(schema.properties)
			.sort(([, a], [, b]) => (a.position || 0) - (b.position || 0));
		columns.push(...sortedProps.map(([name]) => name));
	} else if (results.length > 0 && results[0]) {
		columns.push(...Object.keys(results[0].properties));
	}

	// Add "Note" column for the file name
	const allColumns = ["Note", ...columns];

	// Build markdown table
	const lines: string[] = [];

	// Header row
	lines.push("| " + allColumns.join(" | ") + " |");

	// Separator row
	lines.push("| " + allColumns.map(() => "---").join(" | ") + " |");

	// Data rows
	for (const result of results) {
		const cells = [result.basename];

		for (const col of columns) {
			const value = result.properties[col];
			cells.push(value !== undefined && value !== null ? String(value) : "");
		}

		lines.push("| " + cells.join(" | ") + " |");
	}

	return lines.join("\n");
}
