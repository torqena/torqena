/**
 * Type definitions for Obsidian Bases
 * 
 * Bases are markdown files (.base) that define views over vault notes.
 * They contain view definitions (filters, properties, formulas, summaries, views)
 * but do NOT contain data. The actual data comes from vault notes with frontmatter.
 */

/**
 * Filter operator types supported in Bases expressions
 */
export type FilterOperator =
	| "=="
	| "!="
	| ">"
	| "<"
	| ">="
	| "<=";

/**
 * A single filter condition in a Base, parsed from an expression string.
 * Used internally by the query engine after parsing expressions like:
 *   'status != "archived"'  →  { property: "status", operator: "!=", value: "archived" }
 *   file.inFolder("Projects")  →  { fn: "inFolder", args: ["Projects"] }
 */
export interface ParsedFilterCondition {
	property: string;
	operator: FilterOperator;
	value: string | number | boolean;
}

/**
 * A parsed function-style filter like file.inFolder("X") or file.hasTag("Y")
 */
export interface ParsedFilterFunction {
	fn: string;
	args: string[];
}

/**
 * Boolean filter group used by Obsidian Bases.
 * Filters must be wrapped in an "and", "or", or "not" key.
 * Items are expression strings or nested filter groups.
 */
export interface BaseFilterGroup {
	and?: (string | BaseFilterGroup)[];
	or?: (string | BaseFilterGroup)[];
	not?: string | BaseFilterGroup;
}

/**
 * Property column configuration in a Base
 */
export interface BaseProperty {
	width?: number;
	position?: number;
	type?: "text" | "number" | "date" | "checkbox" | "list" | "tags";
}

/**
 * Formula definition for computed columns
 */
export interface BaseFormula {
	[formulaName: string]: string;
}

/**
 * Summary/aggregation configuration
 */
export interface BaseSummary {
	type: "count" | "sum" | "average" | "min" | "max";
	property?: string;
}

/**
 * Sort configuration for views
 */
export interface BaseSort {
	property: string;
	order: "asc" | "desc";
}

/**
 * View configuration (table, card, list, etc.)
 */
export interface BaseView {
	name: string;
	type: "table" | "card" | "list" | "map";
	order?: string[];
	sort?: BaseSort[];
	filters?: BaseFilterGroup;
}

/**
 * Complete Base schema parsed from a .base file
 */
export interface BaseSchema {
	filters?: BaseFilterGroup;
	properties?: Record<string, BaseProperty>;
	formulas?: BaseFormula;
	summaries?: Record<string, BaseSummary[]>;
	views?: BaseView[];
}

/**
 * Specification for creating a new Base
 */
export interface BaseSpec {
	name: string;
	description?: string;
	properties: Array<{
		name: string;
		type: "text" | "number" | "date" | "checkbox" | "list" | "tags";
		width?: number;
	}>;
	filters?: BaseFilterGroup;
	views?: BaseView[];
}

/**
 * Result of querying a Base - represents a note that matches the Base's filters
 */
export interface QueryResult {
	path: string;
	basename: string;
	properties: Record<string, any>;
}

/**
 * Information about a Base file in the vault
 */
export interface BaseInfo {
	name: string;
	path: string;
	schema?: BaseSchema;
}

/**
 * Extract all filter expression strings from a BaseFilterGroup recursively.
 * @param group - The filter group to extract from
 * @returns Flat array of expression strings
 */
export function getFilterExpressions(group: BaseFilterGroup): string[] {
	const expressions: string[] = [];
	if (group.and) {
		for (const item of group.and) {
			if (typeof item === "string") expressions.push(item);
			else expressions.push(...getFilterExpressions(item));
		}
	}
	if (group.or) {
		for (const item of group.or) {
			if (typeof item === "string") expressions.push(item);
			else expressions.push(...getFilterExpressions(item));
		}
	}
	if (group.not) {
		if (typeof group.not === "string") expressions.push(group.not);
		else expressions.push(...getFilterExpressions(group.not));
	}
	return expressions;
}
