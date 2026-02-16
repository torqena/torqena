/**
 * BasesMutator - Batch frontmatter mutation operations with dry-run support
 * 
 * Provides safe bulk update operations on vault notes matching Base filters.
 * All mutation operations support dry-run preview before applying changes.
 */

import type { App, TFile } from "obsidian";
import type { BaseSchema, QueryResult } from "./types";
import { queryBase } from "./BasesQueryEngine";

/**
 * Preview of a mutation operation
 */
export interface MutationPreview {
	affectedNotes: Array<{
		path: string;
		basename: string;
		currentProperties: Record<string, any>;
		proposedChanges: Record<string, any>;
	}>;
	totalAffected: number;
	summary: string;
}

/**
 * Result of applying a mutation
 */
export interface MutationResult {
	successCount: number;
	errorCount: number;
	successful: string[];
	errors: Array<{ path: string; error: string }>;
	summary: string;
}

/**
 * Preview what would change if property updates are applied
 * 
 * @param app - Obsidian App instance
 * @param schema - Base schema with filters
 * @param propertyUpdates - Object mapping property names to new values
 * @returns Preview of changes
 */
export async function previewPropertyUpdates(
	app: App,
	schema: BaseSchema,
	propertyUpdates: Record<string, any>
): Promise<MutationPreview> {
	// Query matching notes
	const matchingNotes = await queryBase(app, schema, 1000);

	const affectedNotes = matchingNotes.map((note) => ({
		path: note.path,
		basename: note.basename,
		currentProperties: { ...note.properties },
		proposedChanges: { ...propertyUpdates },
	}));

	const changesSummary: string[] = [];
	for (const [key, value] of Object.entries(propertyUpdates)) {
		changesSummary.push(`  - ${key}: ${value}`);
	}

	const summary = `Will update ${affectedNotes.length} note(s) with:\n${changesSummary.join("\n")}`;

	return {
		affectedNotes,
		totalAffected: affectedNotes.length,
		summary,
	};
}

/**
 * Apply property updates to notes matching a Base's filters
 * 
 * @param app - Obsidian App instance
 * @param schema - Base schema with filters
 * @param propertyUpdates - Object mapping property names to new values
 * @returns Result of the mutation operation
 */
export async function applyPropertyUpdates(
	app: App,
	schema: BaseSchema,
	propertyUpdates: Record<string, any>
): Promise<MutationResult> {
	const matchingNotes = await queryBase(app, schema, 1000);

	const successful: string[] = [];
	const errors: Array<{ path: string; error: string }> = [];

	for (const note of matchingNotes) {
		try {
			const file = app.vault.getAbstractFileByPath(note.path);
			if (!file || !("stat" in file)) {
				errors.push({ path: note.path, error: "File not found" });
				continue;
			}

			const content = await app.vault.read(file as TFile);

			// Parse frontmatter
			const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
			if (!frontmatterMatch) {
				errors.push({ path: note.path, error: "No frontmatter found" });
				continue;
			}

			const frontmatterContent = frontmatterMatch[1] ?? "";
			const restOfContent = content.substring(frontmatterMatch[0].length);

			// Parse existing frontmatter into object
			const frontmatterLines = frontmatterContent.split("\n");
			const existingProps: Record<string, any> = {};
			
			for (const line of frontmatterLines) {
				const trimmed = line.trim();
				if (trimmed && trimmed.includes(":")) {
					const colonIndex = trimmed.indexOf(":");
					const key = trimmed.substring(0, colonIndex).trim();
					const value = trimmed.substring(colonIndex + 1).trim();
					existingProps[key] = value;
				}
			}

			// Apply updates
			const updatedProps = { ...existingProps, ...propertyUpdates };

			// Build new frontmatter
			const newFrontmatterLines = ["---"];
			for (const [key, value] of Object.entries(updatedProps)) {
				if (typeof value === "string") {
					newFrontmatterLines.push(`${key}: ${value}`);
				} else if (typeof value === "number" || typeof value === "boolean") {
					newFrontmatterLines.push(`${key}: ${value}`);
				} else if (value === null) {
					newFrontmatterLines.push(`${key}: null`);
				} else if (Array.isArray(value)) {
					newFrontmatterLines.push(`${key}:`);
					for (const item of value) {
						newFrontmatterLines.push(`  - ${item}`);
					}
				} else {
					newFrontmatterLines.push(`${key}: ${JSON.stringify(value)}`);
				}
			}
			newFrontmatterLines.push("---");

			const newContent = newFrontmatterLines.join("\n") + restOfContent;

			// Write back
			await app.vault.modify(file as TFile, newContent);
			successful.push(note.path);
		} catch (error) {
			errors.push({
				path: note.path,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const summary = `Updated ${successful.length} note(s) successfully${errors.length > 0 ? `. ${errors.length} error(s)` : ""}.`;

	return {
		successCount: successful.length,
		errorCount: errors.length,
		successful,
		errors,
		summary,
	};
}

/**
 * Format a mutation preview for display
 */
export function formatMutationPreview(preview: MutationPreview): string {
	const lines: string[] = [];

	lines.push(`**Preview: ${preview.totalAffected} note(s) will be affected**\n`);

	if (preview.affectedNotes.length > 0) {
		const firstNote = preview.affectedNotes[0];
		if (firstNote) {
			lines.push("**Changes:**");
			for (const [key, value] of Object.entries(firstNote.proposedChanges)) {
				lines.push(`  - ${key} → ${value}`);
			}
			lines.push("");
		}

		lines.push("**Affected notes:**");
		const displayLimit = Math.min(10, preview.affectedNotes.length);
		for (let i = 0; i < displayLimit; i++) {
			const note = preview.affectedNotes[i];
			if (!note) continue;
			lines.push(`  - ${note.basename}`);
		}
		if (preview.affectedNotes.length > displayLimit) {
			lines.push(`  ... and ${preview.affectedNotes.length - displayLimit} more`);
		}
	}

	return lines.join("\n");
}

/**
 * Format a mutation result for display
 */
export function formatMutationResult(result: MutationResult): string {
	const lines: string[] = [];

	lines.push(result.summary);
	lines.push("");

	if (result.successful.length > 0) {
		lines.push(`**Successfully updated (${result.successful.length}):**`);
		const displayLimit = Math.min(10, result.successful.length);
		for (let i = 0; i < displayLimit; i++) {
			lines.push(`  ✓ ${result.successful[i]}`);
		}
		if (result.successful.length > displayLimit) {
			lines.push(`  ... and ${result.successful.length - displayLimit} more`);
		}
		lines.push("");
	}

	if (result.errors.length > 0) {
		lines.push(`**Errors (${result.errors.length}):**`);
		for (const error of result.errors) {
			lines.push(`  ✗ ${error.path}: ${error.error}`);
		}
	}

	return lines.join("\n");
}
