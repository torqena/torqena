/**
 * BasesToolHandlers - Implementation of Bases AI tool handlers
 * 
 * Provides the handler functions for Bases tools that are registered
 * with AI providers. Handlers receive parsed arguments and delegate
 * to the appropriate Bases service modules.
 */

import type { App, TFile } from "obsidian";
import { parseBaseFile } from "./BasesParser";
import { queryBase, formatQueryResults } from "./BasesQueryEngine";
import { generateBaseYaml, validateBaseSpec, createDefaultBaseSpec } from "./BasesYamlGenerator";
import { listBases, findBaseByName, formatBasesList } from "./BasesDiscovery";
import {
	previewPropertyUpdates,
	applyPropertyUpdates,
	formatMutationPreview,
	formatMutationResult,
} from "./BasesMutator";
import type {
	CreateBaseParams,
	ReadBaseParams,
	QueryBaseParams,
	AddBaseRecordsParams,
	UpdateBaseRecordsParams,
	EvolveBaseSchemaParams,
} from "./BasesToolDefinitions";
import type { BaseFilterGroup } from "./types";
import { getFilterExpressions } from "./types";
import type { QuestionHandler } from "../../types/questions";

/**
 * Map of common natural-language operator names to valid Bases expression operators.
 */
const OPERATOR_ALIASES: Record<string, string> = {
	"equals": "==",
	"equal": "==",
	"eq": "==",
	"is": "==",
	"not_equals": "!=",
	"not_equal": "!=",
	"ne": "!=",
	"neq": "!=",
	"isnt": "!=",
	"is_not": "!=",
	"greater_than": ">",
	"gt": ">",
	"less_than": "<",
	"lt": "<",
	"greater_than_or_equal": ">=",
	"gte": ">=",
	"ge": ">=",
	"less_than_or_equal": "<=",
	"lte": "<=",
	"le": "<=",
};

/**
 * Normalize a filter operator to valid Obsidian Bases syntax.
 * Accepts both standard operators (==, !=) and natural-language aliases (equals, is).
 * 
 * @param op - The operator string from the AI
 * @returns A valid Bases expression operator
 * @internal
 */
function normalizeFilterOperator(op: string): string {
	const trimmed = op.trim().toLowerCase();
	return OPERATOR_ALIASES[trimmed] ?? op.trim();
}

/**
 * Convert a structured filter parameter to a Bases expression string.
 * Handles both property comparisons and function-style filters (file.inFolder, file.hasTag).
 * 
 * @param filter - The filter param from the AI tool call
 * @returns A valid Bases filter expression string
 * @internal
 */
function convertFilterParamToExpression(filter: { property: string; operator?: string; value?: string }): string {
	const prop = filter.property.trim();

	// Handle function-style filters
	if (prop === "file.inFolder" || prop.toLowerCase() === "file.infolder") {
		return `file.inFolder("${filter.value ?? ""}")`;
	}
	if (prop === "file.hasTag" || prop.toLowerCase() === "file.hastag") {
		return `file.hasTag("${filter.value ?? ""}")`;
	}

	// Standard property comparison
	const op = normalizeFilterOperator(filter.operator ?? "==");
	if (filter.value !== undefined) {
		return `${prop} ${op} "${filter.value}"`;
	}
	return `${prop} ${op} ""`;
}

/**
 * Recursively search a filter group for a file.inFolder() expression and extract the folder path
 */
function findFolderFromFilters(group: BaseFilterGroup): string | undefined {
	const items = group.and || group.or;
	if (items) {
		for (const item of items) {
			if (typeof item === "string") {
				const match = item.match(/file\.inFolder\(\s*"([^"]*)"\s*\)/);
				if (match && match[1] !== undefined) return match[1];
			} else {
				const found = findFolderFromFilters(item);
				if (found) return found;
			}
		}
	}
	if (group.not) {
		if (typeof group.not === "string") {
			const match = group.not.match(/file\.inFolder\(\s*"([^"]*)"\s*\)/);
			if (match && match[1] !== undefined) return match[1];
		} else {
			return findFolderFromFilters(group.not);
		}
	}
	return undefined;
}

/**
 * Normalize a Base file path (similar to normalizeVaultPath but for .base files)
 */
function normalizeBasePath(path: string): string {
	// Replace backslashes with forward slashes
	let normalized = path.replace(/\\/g, "/");
	// Remove leading slashes
	normalized = normalized.replace(/^\/+/, "");
	// Ensure .base extension if not present
	if (!normalized.endsWith(".base")) {
		normalized += ".base";
	}
	return normalized;
}

/**
 * Derive a .base filename from name or description when no explicit path is provided.
 * Converts to kebab-case and strips unsafe characters.
 *
 * @param name - Optional display name
 * @param description - Optional description (fallback)
 * @returns A reasonable filename (without .base extension)
 * @internal
 */
function deriveBaseFilename(name?: string, description?: string): string {
	const source = (name || description || "").trim();
	if (!source) {
		return `base-${Date.now()}`;
	}
	// Lowercase, replace spaces/underscores with hyphens, strip non-alphanumeric except hyphens and slashes
	const slug = source
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9\-\/]/g, "")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || `base-${Date.now()}`;
}

/**
 * Handler for query_base tool
 * 
 * Queries vault notes matching a Base's filters and returns formatted results
 */
export async function handleQueryBase(
	app: App,
	params: QueryBaseParams
): Promise<string> {
	try {
		// Normalize and validate base path
		const basePath = normalizeBasePath(params.base_path);
		if (!basePath.endsWith(".base")) {
			return `Error: Invalid Base file path. Must end with .base (got: ${params.base_path})`;
		}

		// Read the Base file
		const baseFile = app.vault.getAbstractFileByPath(basePath);
		if (!baseFile || !("stat" in baseFile)) {
			return `Error: Base file not found: ${basePath}`;
		}

		const content = await app.vault.read(baseFile as TFile);
		const schema = parseBaseFile(content);

		if (!schema) {
			return `Error: Failed to parse Base file: ${basePath}`;
		}

		// Query matching notes
		const limit = params.limit || 50;
		const results = await queryBase(app, schema, limit);

		// Format results
		if (results.length === 0) {
			return `No records found matching the filters in ${basePath}.\n\nThe Base filters are:\n${JSON.stringify(
				schema.filters,
				null,
				2
			)}`;
		}

		const table = formatQueryResults(results, schema);
		const summary = `Found ${results.length} record(s) in ${basePath}:\n\n${table}`;

		if (results.length >= limit) {
			return `${summary}\n\n(Showing first ${limit} results. Use limit parameter to see more.)`;
		}

		return summary;
	} catch (error) {
		console.error("Error in handleQueryBase:", error);
		return `Error querying Base: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Handler for add_base_records tool
 * 
 * Creates new vault notes with frontmatter matching a Base's schema
 */
export async function handleAddBaseRecords(
	app: App,
	params: AddBaseRecordsParams
): Promise<string> {
	try {
		// Normalize and validate base path
		const basePath = normalizeBasePath(params.base_path);
		if (!basePath.endsWith(".base")) {
			return `Error: Invalid Base file path. Must end with .base (got: ${params.base_path})`;
		}

		// Read the Base file to get schema
		const baseFile = app.vault.getAbstractFileByPath(basePath);
		if (!baseFile || !("stat" in baseFile)) {
			return `Error: Base file not found: ${basePath}`;
		}

		const content = await app.vault.read(baseFile as TFile);
		const schema = parseBaseFile(content);

		if (!schema) {
			return `Error: Failed to parse Base file: ${basePath}`;
		}

		// Determine folder for new notes
		let targetFolder = params.folder;
		if (!targetFolder && schema.filters) {
			// Try to infer folder from file.inFolder() expression in the filter group
			targetFolder = findFolderFromFilters(schema.filters);
		}
		if (!targetFolder) {
			targetFolder = "";
		}

		// Create notes
		const createdNotes: string[] = [];
		const errors: string[] = [];

		for (const record of params.records) {
			try {
				// Build note path
				const noteName = record.title.endsWith(".md") ? record.title : `${record.title}.md`;
				const notePath = targetFolder ? `${targetFolder}/${noteName}` : noteName;

				// Build frontmatter YAML
				const frontmatterLines = ["---"];
				for (const [key, value] of Object.entries(record.properties)) {
					if (typeof value === "string") {
						frontmatterLines.push(`${key}: ${value}`);
					} else if (typeof value === "number" || typeof value === "boolean") {
						frontmatterLines.push(`${key}: ${value}`);
					} else if (value === null) {
						frontmatterLines.push(`${key}: null`);
					} else if (Array.isArray(value)) {
						frontmatterLines.push(`${key}:`);
						for (const item of value) {
							frontmatterLines.push(`  - ${item}`);
						}
					} else {
						frontmatterLines.push(`${key}: ${JSON.stringify(value)}`);
					}
				}
				frontmatterLines.push("---");
				frontmatterLines.push("");

				// Build full content
				const fullContent = frontmatterLines.join("\n") + (record.content || "");

				// Ensure parent folder exists
				if (targetFolder) {
					const folderPath = targetFolder.split("/")[0] ?? targetFolder;
					const folder = app.vault.getAbstractFileByPath(folderPath);
					if (!folder) {
						await app.vault.createFolder(targetFolder);
					}
				}

				// Create the note
				await app.vault.create(notePath, fullContent);
				createdNotes.push(notePath);
			} catch (error) {
				errors.push(
					`Failed to create "${record.title}": ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		// Build response
		const parts: string[] = [];
		if (createdNotes.length > 0) {
			parts.push(`Successfully created ${createdNotes.length} record(s):`);
			for (const path of createdNotes) {
				parts.push(`- ${path}`);
			}
		}
		if (errors.length > 0) {
			parts.push(`\nErrors (${errors.length}):`);
			for (const error of errors) {
				parts.push(`- ${error}`);
			}
		}

		return parts.join("\n");
	} catch (error) {
		console.error("Error in handleAddBaseRecords:", error);
		return `Error adding records to Base: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Handler for create_base tool
 * 
 * Creates a new .base file from a specification.
 * When a questionCallback is provided and confirmed is not set, the handler
 * will scan vault notes, present discovered properties to the user via
 * inline question UI, and proceed to create the base with the user's choices.
 * 
 * @param app - Obsidian App instance
 * @param params - The create base parameters from the AI tool call
 * @param questionCallback - Optional callback to show inline questions to the user
 */
export async function handleCreateBase(
	app: App,
	params: CreateBaseParams,
	questionCallback?: QuestionHandler | null
): Promise<string> {
	try {
		// Derive path from name/description if not explicitly provided
		const rawPath = params.path || deriveBaseFilename(params.name, params.description);
		const basePath = normalizeBasePath(rawPath);

		// Check if file already exists
		const existing = app.vault.getAbstractFileByPath(basePath);
		if (existing) {
			return `Error: Base file already exists at ${basePath}. Use a different path or evolve_base_schema to modify it.`;
		}

		// ── Discovery phase: scan vault and ask user via inline questions ──
		// Always run interactive discovery when a question callback is available,
		// unless the AI already provided explicit properties from the user.
		const hasExplicitProperties = params.properties && params.properties.length > 0;
		if (questionCallback && !hasExplicitProperties) {
			const discoveryResult = await discoverAndAskProperties(app, basePath, params, questionCallback);
			if (discoveryResult.cancelled) {
				return discoveryResult.message;
			}
			// Use the user's selections to proceed
			params = { ...params, ...discoveryResult.resolvedParams, confirmed: true };
		}

		// ── Fallback discovery (no question callback and no properties): return text summary ──
		if (!params.confirmed && !questionCallback && !hasExplicitProperties) {
			return await discoverPropertiesForBase(app, basePath, params);
		}

		// ── Confirmed phase: actually create the Base ──
		if (!params.properties || params.properties.length === 0) {
			return "Error: No properties provided. Please specify which properties to include as columns.";
		}

		// Create BaseSpec
		const spec = createDefaultBaseSpec(
			params.name || basePath.replace(".base", "").split("/").pop() || "Untitled",
			params.properties,
			params.description
		);

		// Add filters if provided - convert from param format to BaseFilterGroup
		if (params.filters && params.filters.length > 0) {
			spec.filters = {
				and: params.filters.map(f => convertFilterParamToExpression(f)),
			};
		}

		// Validate spec
		const validationError = validateBaseSpec(spec);
		if (validationError) {
			return `Error: Invalid Base specification - ${validationError}`;
		}

		// Generate YAML
		const yamlContent = generateBaseYaml(spec);

		// Ensure parent folder exists
		const folderPath = basePath.substring(0, basePath.lastIndexOf("/"));
		if (folderPath) {
			const folder = app.vault.getAbstractFileByPath(folderPath);
			if (!folder) {
				await app.vault.createFolder(folderPath);
			}
		}

		// Create the Base file
		await app.vault.create(basePath, yamlContent);

		let response = `Successfully created Base: ${basePath}\n\n`;
		response += `Properties: ${params.properties.map((p) => p.name).join(", ")}`;

		return response;
	} catch (error) {
		console.error("Error in handleCreateBase:", error);
		return `Error creating Base: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Result from the interactive discovery flow
 * @internal
 */
interface DiscoveryResult {
	cancelled: boolean;
	message: string;
	resolvedParams: Partial<CreateBaseParams>;
}

/**
 * Scan vault notes near the target path, discover frontmatter properties,
 * then ask the user via inline question UI to select columns and view type.
 * Returns the resolved parameters to use for base creation.
 * 
 * @param app - Obsidian App instance
 * @param basePath - The intended .base file path
 * @param params - The original create params
 * @param questionCallback - Callback to render inline questions
 * @returns DiscoveryResult with user's selections or cancellation
 * @internal
 */
async function discoverAndAskProperties(
	app: App,
	basePath: string,
	params: CreateBaseParams,
	questionCallback: QuestionHandler
): Promise<DiscoveryResult> {
	// Determine the folder to scan
	const folderPath = basePath.includes("/")
		? basePath.substring(0, basePath.lastIndexOf("/"))
		: "";

	// Gather markdown files in the target folder
	const allFiles = app.vault.getFiles();
	const mdFiles = allFiles.filter(f => {
		if (!f.path.endsWith(".md")) return false;
		if (folderPath) return f.path.startsWith(folderPath + "/");
		return !f.path.includes("/");
	});

	// Broaden search if nothing found in the exact folder
	let scannedFiles = mdFiles;
	if (mdFiles.length === 0 && folderPath) {
		const parentFolder = folderPath.includes("/")
			? folderPath.substring(0, folderPath.lastIndexOf("/"))
			: "";
		scannedFiles = allFiles.filter(f => {
			if (!f.path.endsWith(".md")) return false;
			if (parentFolder) return f.path.startsWith(parentFolder + "/");
			return true;
		});
	}

	// No notes found — ask if user wants to proceed anyway
	if (scannedFiles.length === 0) {
		const response = await questionCallback({
			id: `base_empty_${Date.now()}`,
			type: "radio",
			question: `No notes found near "${basePath}". Create the Base anyway with custom properties?`,
			context: "There are no .md files in or near this folder to discover properties from.",
			options: ["Yes, I'll specify properties manually", "No, cancel"],
			required: true,
		});

		if (!response || response.type !== "radio" || response.selected[0]?.startsWith("No")) {
			return { cancelled: true, message: "Base creation cancelled — no notes found to discover properties from.", resolvedParams: {} };
		}

		// Let the AI proceed with whatever properties were passed
		return { cancelled: false, message: "", resolvedParams: { confirmed: true } };
	}

	// Read up to 5 sample files to discover frontmatter properties
	const sampleCount = Math.min(5, scannedFiles.length);
	const sampleFiles = scannedFiles.slice(0, sampleCount);

	const propertyMap = new Map<string, { values: Set<string>; count: number; type: string }>();

	for (const file of sampleFiles) {
		try {
			const content = await app.vault.read(file);
			const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
			if (!fmMatch || !fmMatch[1]) continue;

			const fmLines = fmMatch[1].split("\n");
			for (const line of fmLines) {
				const trimmed = line.trim();
				if (!trimmed || !trimmed.includes(":")) continue;

				const colonIdx = trimmed.indexOf(":");
				const key = trimmed.substring(0, colonIdx).trim();
				const rawValue = trimmed.substring(colonIdx + 1).trim();

				if (!key || key.startsWith("#")) continue;

				const entry = propertyMap.get(key) || { values: new Set<string>(), count: 0, type: "text" };
				entry.count++;
				if (rawValue && rawValue !== "''") {
					entry.values.add(rawValue.replace(/^['"]|['"]$/g, ""));
				}

				// Detect type heuristics
				if (/^\d{4}-\d{2}-\d{2}/.test(rawValue)) {
					entry.type = "date";
				} else if (rawValue === "true" || rawValue === "false") {
					entry.type = "checkbox";
				} else if (/^\d+(\.\d+)?$/.test(rawValue) && rawValue !== "") {
					entry.type = "number";
				} else if (rawValue.startsWith("[") || rawValue.startsWith("-")) {
					entry.type = "list";
				}

				propertyMap.set(key, entry);
			}
		} catch {
			// Skip files that can't be read
		}
	}

	// No frontmatter found — let AI proceed with whatever it has
	if (propertyMap.size === 0) {
		return { cancelled: false, message: "", resolvedParams: { confirmed: true } };
	}

	// Sort by frequency (most common first) and build option labels
	const sortedProps = [...propertyMap.entries()].sort((a, b) => b[1].count - a[1].count);
	const options: string[] = [];

	for (const [key, info] of sortedProps) {
		const sampleValues = [...info.values].slice(0, 2).map(v =>
			v.length > 25 ? v.substring(0, 25) + "…" : v
		);
		const sampleStr = sampleValues.length > 0 ? ` — e.g. "${sampleValues.join('", "')}"` : "";
		const label = `${key} (${info.type})${sampleStr}`;
		options.push(label);
	}

	// ── Ask the user which properties to include ──
	// Pre-check all discovered properties; user deselects ones they don't want
	const propResponse = await questionCallback({
		id: `base_props_${Date.now()}`,
		type: "multipleChoice",
		question: `Found ${propertyMap.size} properties in ${sampleCount} notes near "${basePath}". Which ones should be columns?`,
		context: `${scannedFiles.length} total note(s) in folder. All properties are selected — deselect any you don't need.`,
		options,
		allowMultiple: true,
		defaultSelected: options,
		required: true,
	});

	if (!propResponse || propResponse.type !== "multipleChoice" || propResponse.selected.length === 0) {
		return { cancelled: true, message: "Base creation cancelled — no properties selected.", resolvedParams: {} };
	}

	// Parse selected property names from the labels
	const selectedProperties: CreateBaseParams["properties"] = propResponse.selected.map(label => {
		const name = label.split(" (")[0] ?? label;
		const propInfo = propertyMap.get(name);
		return {
			name,
			type: (propInfo?.type || "text") as "text" | "number" | "date" | "checkbox" | "list" | "tags",
		};
	});

	// ── Ask for view type ──
	const viewResponse = await questionCallback({
		id: `base_view_${Date.now()}`,
		type: "radio",
		question: "What view type should the Base use?",
		options: ["Table", "Card", "List"],
		defaultSelected: "Table",
		required: false,
	});

	// Default to table if skipped
	// (view type is used for display but the current generator always uses table — 
	//  this captures intent for future use)

	// Auto-add a file.inFolder filter if no filters were provided and we know the folder
	const resolvedFilters = params.filters && params.filters.length > 0
		? params.filters
		: folderPath
			? [{ property: "file.inFolder", value: folderPath }]
			: undefined;

	return {
		cancelled: false,
		message: "",
		resolvedParams: {
			properties: selectedProperties,
			filters: resolvedFilters,
			confirmed: true,
		},
	};
}

/**
 * Discover frontmatter properties from vault notes near the target Base path.
 * Returns a formatted message for the AI to present to the user for confirmation.
 * 
 * @param app - Obsidian App instance
 * @param basePath - The intended .base file path
 * @param params - The original create params (may have partial info)
 * @returns A discovery summary message
 * @internal
 */
async function discoverPropertiesForBase(app: App, basePath: string, params: CreateBaseParams): Promise<string> {
	// Determine the folder to scan — use the base file's parent folder, or vault root
	const folderPath = basePath.includes("/")
		? basePath.substring(0, basePath.lastIndexOf("/"))
		: "";

	// Gather markdown files in the target folder (non-recursive first level)
	const allFiles = app.vault.getFiles();
	const mdFiles = allFiles.filter(f => {
		if (!f.path.endsWith(".md")) return false;
		if (folderPath) {
			return f.path.startsWith(folderPath + "/");
		}
		// Vault root: only top-level .md files
		return !f.path.includes("/");
	});

	// If no files in exact folder, try a broader search
	let searchFolder = folderPath;
	let scannedFiles = mdFiles;
	if (mdFiles.length === 0 && folderPath) {
		// Search recursively under parent
		const parentFolder = folderPath.includes("/")
			? folderPath.substring(0, folderPath.lastIndexOf("/"))
			: "";
		scannedFiles = allFiles.filter(f => {
			if (!f.path.endsWith(".md")) return false;
			if (parentFolder) return f.path.startsWith(parentFolder + "/");
			return true;
		});
		searchFolder = parentFolder || "(vault root)";
	}

	if (scannedFiles.length === 0) {
		return `**No notes found** near \`${basePath}\`.\n\n` +
			`There are no .md files in or near the folder \`${folderPath || "(vault root)"}\`.\n\n` +
			`Would you like me to create the Base anyway and add some sample notes to populate it? ` +
			`If so, tell me what kind of data this Base should track and I'll create both the Base and sample notes.\n\n` +
			`_To proceed, call create_base again with confirmed=true and the desired properties._`;
	}

	// Read up to 5 sample files to discover frontmatter properties
	const sampleCount = Math.min(5, scannedFiles.length);
	const sampleFiles = scannedFiles.slice(0, sampleCount);

	// Collect all frontmatter properties across sample files
	const propertyMap = new Map<string, { values: Set<string>; count: number; type: string }>();

	for (const file of sampleFiles) {
		try {
			const content = await app.vault.read(file);
			const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
			if (!fmMatch || !fmMatch[1]) continue;

			const fmLines = fmMatch[1].split("\n");
			for (const line of fmLines) {
				const trimmed = line.trim();
				if (!trimmed || !trimmed.includes(":")) continue;

				const colonIdx = trimmed.indexOf(":");
				const key = trimmed.substring(0, colonIdx).trim();
				const rawValue = trimmed.substring(colonIdx + 1).trim();

				if (!key || key.startsWith("#")) continue;

				const entry = propertyMap.get(key) || { values: new Set<string>(), count: 0, type: "text" };
				entry.count++;
				if (rawValue && rawValue !== "''") {
					entry.values.add(rawValue.replace(/^['"]|['"]$/g, ""));
				}

				// Detect type heuristics
				if (/^\d{4}-\d{2}-\d{2}/.test(rawValue)) {
					entry.type = "date";
				} else if (rawValue === "true" || rawValue === "false") {
					entry.type = "checkbox";
				} else if (/^\d+(\.\d+)?$/.test(rawValue) && rawValue !== "") {
					entry.type = "number";
				} else if (rawValue.startsWith("[") || rawValue.startsWith("-")) {
					entry.type = "list";
				}

				propertyMap.set(key, entry);
			}
		} catch {
			// Skip files that can't be read
		}
	}

	if (propertyMap.size === 0) {
		return `**Found ${scannedFiles.length} notes** in \`${searchFolder || "(vault root)"}\`, but none have frontmatter properties.\n\n` +
			`Would you like me to create the Base with custom properties? Tell me what columns you'd like.\n\n` +
			`_To proceed, call create_base again with confirmed=true and the desired properties._`;
	}

	// Build the discovery message
	const lines: string[] = [];
	lines.push(`**Discovered ${propertyMap.size} frontmatter properties** from ${sampleCount} sample notes in \`${searchFolder || "(vault root)"}\`:\n`);

	// Sort by frequency (most common first)
	const sortedProps = [...propertyMap.entries()].sort((a, b) => b[1].count - a[1].count);

	let idx = 1;
	for (const [key, info] of sortedProps) {
		const sampleValues = [...info.values].slice(0, 2).map(v =>
			v.length > 30 ? v.substring(0, 30) + "…" : v
		);
		const sampleStr = sampleValues.length > 0 ? ` — e.g. "${sampleValues.join('", "')}"` : "";
		// Recommend properties that appear in most sample files
		const recommended = info.count >= Math.ceil(sampleCount / 2);
		const icon = recommended ? "✅" : "⬜";
		lines.push(`${idx}. ${icon} **${key}** (${info.type})${sampleStr}`);
		idx++;
	}

	lines.push("");
	lines.push(`Total notes in folder: ${scannedFiles.length}`);
	lines.push("");
	lines.push("**Please ask the user which properties they want as columns in the Base.**");
	lines.push("Also suggest appropriate filters (e.g., folder scoping, property-based filtering) and a view type (table, card, list).");
	lines.push("");
	lines.push("_After the user confirms, call create_base again with `confirmed: true` and the chosen properties and filters._");

	return lines.join("\n");
}

/**
 * Handler for read_base tool
 * 
 * Reads a Base's schema or lists all Bases in the vault
 */
export async function handleReadBase(app: App, params: ReadBaseParams): Promise<string> {
	try {
		// List mode - no base_path provided
		if (!params.base_path) {
			const bases = await listBases(app, params.include_schema_details || false);
			return formatBasesList(bases, params.include_schema_details || false);
		}

		// Read specific Base
		const basePath = normalizeBasePath(params.base_path);
		const baseFile = app.vault.getAbstractFileByPath(basePath);
		
		if (!baseFile || !("stat" in baseFile)) {
			return `Error: Base file not found: ${basePath}`;
		}

		const content = await app.vault.read(baseFile as TFile);
		const schema = parseBaseFile(content);

		if (!schema) {
			return `Error: Failed to parse Base file: ${basePath}`;
		}

		// Format schema for display
		const lines: string[] = [];
		lines.push(`**Base: ${basePath}**\n`);

		if (schema.filters) {
			const filterExprs = getFilterExpressions(schema.filters);
			if (filterExprs.length > 0) {
				lines.push(`**Filters (${filterExprs.length}):**`);
				for (const expr of filterExprs) {
					lines.push(`  - ${expr}`);
				}
			}
			lines.push("");
		}

		if (schema.properties) {
			const propCount = Object.keys(schema.properties).length;
			lines.push(`**Properties (${propCount}):**`);
			const sortedProps = Object.entries(schema.properties).sort(
				([, a], [, b]) => (a.position || 0) - (b.position || 0)
			);
			for (const [name, config] of sortedProps) {
				const parts = [name];
				if (config.type) parts.push(`type: ${config.type}`);
				if (config.width) parts.push(`width: ${config.width}`);
				lines.push(`  - ${parts.join(", ")}`);
			}
			lines.push("");
		}

		if (schema.formulas) {
			const formulaCount = Object.keys(schema.formulas).length;
			lines.push(`**Formulas (${formulaCount}):**`);
			for (const [name, formula] of Object.entries(schema.formulas)) {
				lines.push(`  - ${name}: ${formula.substring(0, 50)}...`);
			}
			lines.push("");
		}

		if (schema.views && schema.views.length > 0) {
			lines.push(`**Views (${schema.views.length}):**`);
			for (const view of schema.views) {
				lines.push(`  - ${view.name} (${view.type})`);
			}
			lines.push("");
		}

		lines.push("*Note: This shows the view definition only. Use query_base to see actual data.*");

		return lines.join("\n");
	} catch (error) {
		console.error("Error in handleReadBase:", error);
		return `Error reading Base: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Handler for update_base_records tool
 * 
 * Updates frontmatter properties on notes matching a Base's filters
 */
export async function handleUpdateBaseRecords(
	app: App,
	params: UpdateBaseRecordsParams
): Promise<string> {
	try {
		const basePath = normalizeBasePath(params.base_path);
		const baseFile = app.vault.getAbstractFileByPath(basePath);

		if (!baseFile || !("stat" in baseFile)) {
			return `Error: Base file not found: ${basePath}`;
		}

		const content = await app.vault.read(baseFile as TFile);
		const schema = parseBaseFile(content);

		if (!schema) {
			return `Error: Failed to parse Base file: ${basePath}`;
		}

		// Preview mode (default: true for safety)
		if (params.preview_only !== false) {
			const preview = await previewPropertyUpdates(app, schema, params.property_updates);
			const formatted = formatMutationPreview(preview);
			return `${formatted}\n\n*To apply these changes, call update_base_records again with preview_only: false*`;
		}

		// Apply mode
		const result = await applyPropertyUpdates(app, schema, params.property_updates);
		return formatMutationResult(result);
	} catch (error) {
		console.error("Error in handleUpdateBaseRecords:", error);
		return `Error updating records: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Handler for evolve_base_schema tool
 * 
 * Modifies a Base's schema and optionally backfills values
 */
export async function handleEvolveBaseSchema(
	app: App,
	params: EvolveBaseSchemaParams
): Promise<string> {
	try {
		const basePath = normalizeBasePath(params.base_path);
		const baseFile = app.vault.getAbstractFileByPath(basePath);

		if (!baseFile || !("stat" in baseFile)) {
			return `Error: Base file not found: ${basePath}`;
		}

		const content = await app.vault.read(baseFile as TFile);
		const schema = parseBaseFile(content);

		if (!schema) {
			return `Error: Failed to parse Base file: ${basePath}`;
		}

		// Preview mode (default: true)
		if (params.preview_only !== false) {
			let previewMsg = `**Preview: Schema evolution for ${basePath}**\n\n`;
			previewMsg += `Operation: ${params.operation}\n`;
			previewMsg += `Property: ${params.property_name}\n`;

			if (params.operation === "add_property") {
				previewMsg += `Type: ${params.property_type || "text"}\n`;
				if (params.backfill_value) {
					previewMsg += `Backfill value: ${params.backfill_value}\n`;
					const matchingNotes = await queryBase(app, schema, 1000);
					previewMsg += `\nWill backfill ${matchingNotes.length} note(s)\n`;
				}
			} else if (params.operation === "rename_property") {
				previewMsg += `New name: ${params.new_property_name}\n`;
				if (params.backfill_value) {
					const matchingNotes = await queryBase(app, schema, 1000);
					previewMsg += `Will update ${matchingNotes.length} note(s)\n`;
				}
			} else if (params.operation === "remove_property") {
				previewMsg += `\nProperty will be removed from Base schema (notes will not be modified)\n`;
			}

			previewMsg += `\n*To apply, call evolve_base_schema again with preview_only: false*`;
			return previewMsg;
		}

		// Apply mode - modify Base schema
		const modifiedSchema = { ...schema };

		if (!modifiedSchema.properties) {
			modifiedSchema.properties = {};
		}

		if (params.operation === "add_property") {
			const position = Object.keys(modifiedSchema.properties).length;
			modifiedSchema.properties[params.property_name] = {
				position,
				type: params.property_type as any,
				width: 150,
			};
		} else if (params.operation === "remove_property") {
			delete modifiedSchema.properties[params.property_name];
		} else if (params.operation === "rename_property" && params.new_property_name) {
			const oldConfig = modifiedSchema.properties[params.property_name];
			if (oldConfig) {
				modifiedSchema.properties[params.new_property_name] = oldConfig;
				delete modifiedSchema.properties[params.property_name];
			}
		}

		// Generate new YAML - convert modifiedSchema to BaseSpec
		const spec = {
			name: basePath.replace(".base", "").split("/").pop() || "Base",
			properties: Object.entries(modifiedSchema.properties).map(([name, config]) => ({
				name,
				type: config.type || "text",
				width: config.width,
			})),
			filters: modifiedSchema.filters as any,
			views: modifiedSchema.views,
		};

		const newYaml = generateBaseYaml(spec);

		// Update Base file
		await app.vault.modify(baseFile as TFile, newYaml);

		let response = `Successfully updated Base schema: ${basePath}\n\n`;
		response += `Operation: ${params.operation}\n`;
		response += `Property: ${params.property_name}\n`;

		// Backfill if requested
		if (params.backfill_value && (params.operation === "add_property" || params.operation === "rename_property")) {
			const propertyName = params.operation === "rename_property" && params.new_property_name
				? params.new_property_name
				: params.property_name;

			const backfillResult = await applyPropertyUpdates(app, modifiedSchema, {
				[propertyName]: params.backfill_value,
			});

			response += `\n${formatMutationResult(backfillResult)}`;
		}

		return response;
	} catch (error) {
		console.error("Error in handleEvolveBaseSchema:", error);
		return `Error evolving Base schema: ${error instanceof Error ? error.message : String(error)}`;
	}
}

