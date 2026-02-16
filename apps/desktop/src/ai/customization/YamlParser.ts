/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module YamlParser
 * @description Lightweight YAML parser for frontmatter in customization files.
 * Supports key-value pairs, inline JSON arrays, YAML block lists, quoted strings,
 * booleans, and numeric values.
 *
 * This module is the single source of truth for YAML parsing across all customization
 * caches (AgentCache, PromptCache, SkillCache) and the CustomizationLoader.
 *
 * @example
 * ```typescript
 * import { parseYamlKeyValues, parseFrontmatter } from "./YamlParser";
 *
 * const fm = parseYamlKeyValues("name: My Prompt\ntimeout: 300\ntools:\n  - read_note\n  - create_note");
 * // { name: "My Prompt", timeout: 300, tools: ["read_note", "create_note"] }
 *
 * const { frontmatter, body } = parseFrontmatter("---\nname: Test\n---\nBody content");
 * // frontmatter: { name: "Test" }, body: "Body content"
 * ```
 *
 * @since 0.0.36
 */

/**
 * Parse simple YAML key-value pairs from a YAML string.
 *
 * Handles:
 * - Simple key: value pairs
 * - Inline JSON arrays: `tools: ["a", "b"]`
 * - YAML block lists: `tools:\n  - a\n  - b`
 * - Quoted strings (single and double)
 * - Bare numbers parsed as `number` type
 * - Boolean values (`true`/`false`) parsed as `boolean` type
 *
 * @param yamlStr - Raw YAML string (without `---` delimiters)
 * @returns Parsed key-value record
 *
 * @example
 * ```typescript
 * const result = parseYamlKeyValues("timeout: 300\nname: My Tool");
 * // result.timeout === 300 (number, not string)
 * // result.name === "My Tool" (string)
 * ```
 */
export function parseYamlKeyValues(yamlStr: string): Record<string, unknown> {
	const frontmatter: Record<string, unknown> = {};
	const lines = yamlStr.split(/\r?\n/);

	let currentKey: string | null = null;
	let currentList: string[] | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';

		// Check for YAML block list continuation: lines starting with "  - " or "\t- "
		const listItemMatch = line.match(/^[\s\t]+- (.+)$/);
		if (listItemMatch && currentKey !== null && currentList !== null) {
			currentList.push(listItemMatch[1]?.trim() ?? '');
			continue;
		}

		// If we were accumulating a block list and this line is not a list item, flush it
		if (currentKey !== null && currentList !== null) {
			frontmatter[currentKey] = currentList;
			currentKey = null;
			currentList = null;
		}

		const colonIndex = line.indexOf(':');
		if (colonIndex === -1) continue;

		const key = line.slice(0, colonIndex).trim();
		if (!key) continue;

		const rawValue = line.slice(colonIndex + 1).trim();

		// Empty value after colon — might be the start of a YAML block list
		if (rawValue === '') {
			currentKey = key;
			currentList = [];
			continue;
		}

		let value: unknown = rawValue;

		// Handle inline JSON arrays like ["read", "search", "edit"]
		if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
			try {
				value = JSON.parse(rawValue.replace(/'/g, '"'));
			} catch {
				// Keep as string if parsing fails
			}
		}
		// Handle quoted strings
		else if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
			value = rawValue.slice(1, -1);
		}
		// Handle booleans
		else if (rawValue === 'true') {
			value = true;
		}
		else if (rawValue === 'false') {
			value = false;
		}
		// Handle bare numbers (integer and float)
		else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
			value = Number(rawValue);
		}

		frontmatter[key] = value;
	}

	// Flush any trailing block list
	if (currentKey !== null && currentList !== null) {
		frontmatter[currentKey] = currentList;
	}

	return frontmatter;
}

/**
 * Parse YAML frontmatter from markdown content.
 *
 * Splits content at `---` delimiters and parses the YAML section.
 * Returns the parsed frontmatter and the remaining body text.
 *
 * @param content - Full markdown content with optional `---` frontmatter
 * @returns Parsed frontmatter record and body text
 *
 * @example
 * ```typescript
 * const { frontmatter, body } = parseFrontmatter("---\nname: Test\n---\nBody here");
 * // frontmatter: { name: "Test" }, body: "Body here"
 * ```
 */
export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) {
		return { frontmatter: {}, body: content };
	}

	const yamlStr = match[1] || '';
	const body = match[2] || '';

	return { frontmatter: parseYamlKeyValues(yamlStr), body: body.trim() };
}
