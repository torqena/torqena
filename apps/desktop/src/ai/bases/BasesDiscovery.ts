/**
 * BasesDiscovery - Find and catalog .base files in the vault
 * 
 * Scans the vault for .base files and provides Base metadata for
 * discovery, listing, and reference by other tools.
 */

import type { App } from "obsidian";
import type { BaseInfo, BaseSchema } from "./types";
import { getFilterExpressions } from "./types";
import { parseBaseFile } from "./BasesParser";

/**
 * Find all .base files in the vault
 * 
 * @param app - Obsidian App instance
 * @param includeSchema - Whether to parse and include schema for each Base (default: false)
 * @returns Array of BaseInfo objects
 */
export async function listBases(app: App, includeSchema: boolean = false): Promise<BaseInfo[]> {
	const bases: BaseInfo[] = [];
	const files = app.vault.getAllLoadedFiles();

	for (const file of files) {
		if ("extension" in file && file.path.endsWith(".base")) {
			const baseInfo: BaseInfo = {
				name: file.name.replace(".base", ""),
				path: file.path,
			};

			if (includeSchema) {
				try {
					const content = await app.vault.read(file as any);
					const schema = parseBaseFile(content);
					if (schema) {
						baseInfo.schema = schema;
					}
				} catch (error) {
					console.error(`Error parsing Base schema for ${file.path}:`, error);
				}
			}

			bases.push(baseInfo);
		}
	}

	return bases;
}

/**
 * Find a Base by name (case-insensitive, fuzzy matching)
 * 
 * @param app - Obsidian App instance
 * @param name - Base name to search for
 * @returns BaseInfo if found, null otherwise
 */
export async function findBaseByName(app: App, name: string): Promise<BaseInfo | null> {
	const allBases = await listBases(app, false);
	const lowerName = name.toLowerCase();

	// Exact match first
	for (const base of allBases) {
		if (base.name.toLowerCase() === lowerName) {
			return base;
		}
	}

	// Contains match
	for (const base of allBases) {
		if (base.name.toLowerCase().includes(lowerName)) {
			return base;
		}
	}

	// Fuzzy match - remove spaces and special chars
	const fuzzyName = lowerName.replace(/[^a-z0-9]/g, "");
	for (const base of allBases) {
		const fuzzyBaseName = base.name.toLowerCase().replace(/[^a-z0-9]/g, "");
		if (fuzzyBaseName === fuzzyName) {
			return base;
		}
	}

	return null;
}

/**
 * Format a list of Bases for display in chat
 * 
 * @param bases - Array of BaseInfo objects
 * @param includeDetails - Whether to include schema details (default: false)
 * @returns Formatted string for chat output
 */
export function formatBasesList(bases: BaseInfo[], includeDetails: boolean = false): string {
	if (bases.length === 0) {
		return "No Bases found in the vault.";
	}

	const lines: string[] = [`Found ${bases.length} Base(s) in the vault:\n`];

	for (const base of bases) {
		lines.push(`📊 **${base.name}**`);
		lines.push(`   Path: ${base.path}`);

		if (includeDetails && base.schema) {
			const schema = base.schema;
			const parts: string[] = [];

			if (schema.filters) {
				const filterExprs = getFilterExpressions(schema.filters);
				if (filterExprs.length > 0) {
					parts.push(`${filterExprs.length} filter(s)`);
				}
			}
			if (schema.properties) {
				parts.push(`${Object.keys(schema.properties).length} property(s)`);
			}
			if (schema.views && schema.views.length > 0) {
				parts.push(`${schema.views.length} view(s)`);
			}

			if (parts.length > 0) {
				lines.push(`   Structure: ${parts.join(", ")}`);
			}
		}

		lines.push("");
	}

	return lines.join("\n");
}
