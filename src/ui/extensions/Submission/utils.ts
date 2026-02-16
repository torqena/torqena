/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/utils
 * @description Shared utility functions for extension submission
 */

import { App, TFile, ButtonComponent } from "obsidian";
import type { ExtensionManifest, ExtensionType } from "./types";
import type { AIServiceManager as VaultCopilotPlugin } from "../../../app/AIServiceManager";
import { normalizeVaultPath, toVaultRelativePath } from "../../../utils/pathUtils";

/**
 * Loads author information from GitHub CLI or git config
 * 
 * Tries GitHub CLI first (gh api user) to get authenticated user info,
 * falls back to git config if gh is not available or not authenticated.
 * 
 * Note: Uses require() for Node.js modules (child_process, util) as they are only available
 * in desktop environments and need to be loaded dynamically to avoid build errors.
 */
export async function loadAuthorInfo(): Promise<{ authorName?: string; authorUrl?: string; githubUsername?: string }> {
	try {
		const { exec } = await import("child_process");
		const execAsync = (command: string): Promise<{ stdout: string; stderr: string }> => {
			return new Promise((resolve, reject) => {
				exec(command, (error, stdout, stderr) => {
					if (error) {
						reject(error);
						return;
					}
					resolve({
						stdout: typeof stdout === "string" ? stdout : String(stdout ?? ""),
						stderr: typeof stderr === "string" ? stderr : String(stderr ?? ""),
					});
				});
			});
		};
		
		const result: { authorName?: string; authorUrl?: string; githubUsername?: string } = {};
		
		// Try GitHub CLI first for most reliable info
		try {
			const { stdout: ghUser } = await execAsync('gh api user');
			if (ghUser && ghUser.trim()) {
				const user = JSON.parse(ghUser.trim());
				if (user.login) {
					result.githubUsername = user.login;
					result.authorUrl = user.html_url || `https://github.com/${user.login}`;
				}
				if (user.name) {
					result.authorName = user.name;
				}
				console.log('Loaded author info from GitHub CLI:', result);
				return result;
			}
		} catch (e) {
			// gh not available or not authenticated, fall back to git config
			console.log('GitHub CLI not available, falling back to git config');
		}
		
		// Fallback: use git config
		try {
			const { stdout: name } = await execAsync('git config user.name');
			if (name && name.trim()) {
				result.authorName = name.trim();
			}
		} catch (e) {
			// Ignore error, just won't pre-populate
		}
		
		try {
			const { stdout: email } = await execAsync('git config user.email');
			if (email && email.trim()) {
				const emailStr = email.trim();
				let username: string | undefined;
				
				if (emailStr.includes('@users.noreply.github.com')) {
					const beforeAt = emailStr.split('@')[0] ?? '';
					username = beforeAt.includes('+') ? (beforeAt.split('+')[1] ?? beforeAt) : beforeAt;
					result.githubUsername = username;
				} else if (emailStr.includes('@')) {
					username = emailStr.split('@')[0] ?? undefined;
					result.githubUsername = username;
				}
				
				if (username) {
					result.authorUrl = `https://github.com/${username}`;
					console.log(`Auto-populated author URL from git config: https://github.com/${username}`);
				}
			}
		} catch (e) {
			// Ignore error
		}
		
		return result;
	} catch (error) {
		console.log('Could not load author info:', error);
		return {};
	}
}

/**
 * Shows an inline message in the specified container
 */
export function showInlineMessage(container: HTMLElement, message: string, type: 'error' | 'warning' | 'success' | 'info'): void {
	const existingMessages = container.querySelectorAll('.inline-message');
	existingMessages.forEach(msg => msg.remove());
	
	const messageEl = container.createDiv({ cls: `inline-message inline-message-${type}` });
	
	const icons = {
		error: '❌',
		warning: '⚠️',
		success: '✅',
		info: 'ℹ️'
	};
	
	messageEl.createSpan({ cls: 'inline-message-icon', text: icons[type] });
	messageEl.createSpan({ cls: 'inline-message-text', text: message });
	
	const closeBtn = messageEl.createEl('button', { cls: 'inline-message-close', text: '×' });
	closeBtn.addEventListener('click', () => messageEl.remove());
}

/**
 * Adds a summary item to the preview
 */
export function addSummaryItem(container: HTMLElement, label: string, value: string): void {
	const item = container.createDiv({ cls: "summary-item" });
	item.createEl("span", { cls: "summary-label", text: `${label}:` });
	item.createEl("span", { cls: "summary-value", text: value });
}

/**
 * Opens a native file/folder picker and returns a vault-relative path.
 *
 * The picker is only available on desktop vaults with a local filesystem.
 * If the user selects a path outside of the vault, this returns an error
 * message so the caller can show feedback in the UI.
 *
 * @param app - The Obsidian app instance
 * @param extensionType - The extension type (used for dialog title context)
 * @returns Selected vault-relative path and optional error message
 *
 * @example
 * ```typescript
 * const result = await openExtensionPathDialog(app, "agent");
 * if (result.path) {
 *   console.log("Selected:", result.path);
 * }
 * ```
 *
 * @since 0.1.0
 */
export async function openExtensionPathDialog(
	app: App,
	extensionType: ExtensionType | undefined
): Promise<{ path: string | null; error?: string }> {
	const adapter = (app.vault as any).adapter as {
		getBasePath?: () => string;
		basePath?: string;
	};
	const vaultBasePath =
		typeof adapter?.getBasePath === "function"
			? adapter.getBasePath()
			: typeof adapter?.basePath === "string"
				? adapter.basePath
				: undefined;

	if (!vaultBasePath) {
		return {
			path: null,
			error: "File browsing is only available for local desktop vaults."
		};
	}

	const electron = (window as any)?.require ? (window as any).require("electron") : null;
	const dialog = electron?.remote?.dialog || electron?.dialog;
	if (!dialog || typeof dialog.showOpenDialog !== "function") {
		return {
			path: null,
			error: "Native file picker is not available in this environment."
		};
	}

	const typeLabel = extensionType ? extensionType.replace(/-/g, " ") : "extension";
	const result = await dialog.showOpenDialog({
		title: `Select ${typeLabel} file or folder`,
		defaultPath: vaultBasePath,
		properties: ["openFile", "openDirectory"]
	});

	if (result?.canceled || !result?.filePaths?.length) {
		return { path: null };
	}

	const pickedPath = result.filePaths[0];
	const normalizedPicked = normalizeVaultPath(pickedPath);
	const normalizedBase = normalizeVaultPath(vaultBasePath);

	if (!normalizedPicked.toLowerCase().startsWith(normalizedBase.toLowerCase())) {
		return {
			path: null,
			error: "Please choose a file or folder inside the current vault."
		};
	}

	const vaultRelative = toVaultRelativePath(normalizedPicked, vaultBasePath);
	return { path: vaultRelative || "" };
}

/**
 * Parses or derives extension info from path
 */
export async function parseOrDeriveExtensionInfo(
	app: App,
	extensionPath: string,
	extensionType: ExtensionType | undefined
): Promise<ExtensionManifest | null> {
	try {
		const abstractFile = app.vault.getAbstractFileByPath(extensionPath);
		if (!abstractFile) {
			console.error(`Could not find file or folder at path: ${extensionPath}`);
			return null;
		}
		
		if (abstractFile instanceof TFile) {
			// Scenario 1: User provided a file path
			console.log(`Input is a file: ${abstractFile.name}, deriving extension info...`);
			
			const extensions: Record<string, string> = {
				"agent": ".agent.md",
				"voice-agent": ".voice-agent.md",
				"prompt": ".prompt.md",
				"skill": ".skill.md",
				"mcp-server": ".mcp-server.md"
			};
			
			const targetExtension = (extensionType ? extensions[extensionType] : undefined) || ".agent.md";
			const id = abstractFile.name.replace(targetExtension, "");
			const name = id
				.split("-")
				.map(word => word.charAt(0).toUpperCase() + word.slice(1))
				.join(" ");
			
			console.log(`Derived from file: id=${id}, name=${name}`);
			
			return {
				id: id,
				name: name,
				version: "1.0.0",
				description: "",
				author: { name: "", url: "" },
				type: (extensionType as any) || "agent",
				minVaultCopilotVersion: "0.0.1",
				categories: [],
				tags: [],
				files: []
			};
		} else {
			// It's a folder - check for manifest.json
			console.log(`Input is a folder, checking for manifest.json...`);
			
			const manifestPath = `${extensionPath}/manifest.json`;
			const manifestFile = app.vault.getAbstractFileByPath(manifestPath);
			
			if (manifestFile && manifestFile instanceof TFile) {
				// Scenario 2: Folder with manifest.json
				console.log(`Found manifest.json, parsing...`);
				
				try {
					const manifestContent = await app.vault.read(manifestFile);
					const manifest = JSON.parse(manifestContent) as ExtensionManifest;
					
					console.log(`Parsed manifest: id=${manifest.id}, name=${manifest.name}, version=${manifest.version}`);
					
					return manifest;
				} catch (error) {
					console.error("Failed to parse manifest.json, will derive from markdown file:", error);
				}
			}
			
			// Scenario 3: Folder without manifest - derive from markdown file
			console.log(`No valid manifest.json, deriving from markdown file...`);
			
			const extensions: Record<string, string> = {
				"agent": ".agent.md",
				"voice-agent": ".voice-agent.md",
				"prompt": ".prompt.md",
				"skill": ".skill.md",
				"mcp-server": ".mcp-server.md"
			};
			
			const targetExtension = (extensionType ? extensions[extensionType] : undefined) || ".agent.md";
			
			if (!('children' in abstractFile) || !Array.isArray((abstractFile as any).children)) {
				console.error("Folder does not contain files");
				return null;
			}
			
			const files = (abstractFile as any).children as TFile[];
			const mainFile = files.find((f: TFile) => f.name.endsWith(targetExtension));
			
			if (!mainFile) {
				console.error(`Could not find ${targetExtension} file in the folder`);
				return null;
			}
			
			const id = mainFile.name.replace(targetExtension, "");
			const name = id
				.split("-")
				.map(word => word.charAt(0).toUpperCase() + word.slice(1))
				.join(" ");
			
			console.log(`Derived from markdown file: id=${id}, name=${name}`);
			
			return {
				id: id,
				name: name,
				version: "1.0.0",
				description: "",
				author: { name: "", url: "" },
				type: (extensionType as any) || "agent",
				minVaultCopilotVersion: "0.0.1",
				categories: [],
				tags: [],
				files: []
			};
		}
	} catch (error) {
		console.error("Failed to parse or derive extension info:", error);
		return null;
	}
}

/**
 * Cleans up markdown code blocks from AI-generated content
 */
export function cleanMarkdownCodeBlocks(content: string): string {
	let cleaned = content.trim();
	if (cleaned.startsWith('```markdown')) {
		cleaned = cleaned.replace(/^```markdown\n/, '').replace(/\n```$/, '');
	} else if (cleaned.startsWith('```')) {
		cleaned = cleaned.replace(/^```\n/, '').replace(/\n```$/, '');
	}
	return cleaned.trim();
}

/**
 * Metadata carried over from an existing catalog entry during updates.
 * Used to preserve categories, tags, and other fields the user shouldn't need to re-enter.
 */
export interface CatalogEntryMetadata {
	/** Extension display name as published in the catalog */
	name: string;
	/** Published categories */
	categories: string[];
	/** Published tags */
	tags: string[];
	/** Tools declared by the extension */
	tools: string[];
	/** Repository URL */
	repository: string | null;
	/** Whether the extension is featured */
	featured: boolean;
	/** Preview image URL from the catalog (raw GitHub URL) */
	previewUrl: string | null;
	/** Icon URL from the catalog (raw GitHub URL) */
	iconUrl: string | null;
}

/**
 * Result of validating an extension ID against the catalog
 */
export interface ExtensionIdValidationResult {
	/** Whether the extension ID already exists in the catalog */
	exists: boolean;
	/** The version currently published in the catalog (if it exists) */
	catalogVersion: string | null;
	/** The actual extension ID as it appears in the catalog (may differ from derived ID) */
	catalogExtensionId: string | null;
	/** Metadata from the existing catalog entry (only when exists is true) */
	catalogMetadata: CatalogEntryMetadata | null;
}

/**
 * Validates an extension ID against the catalog, returning status info
 * 
 * Instead of throwing when an ID exists, this returns structured info
 * so the caller can determine whether this is a new submission or an update.
 * 
 * @param extensionId - The extension ID to check
 * @returns Validation result with existence status and catalog version
 * @throws {Error} If the catalog cannot be fetched (network error)
 * 
 * @example
 * ```typescript
 * const result = await validateExtensionId("my-agent");
 * if (result.exists) {
 *   console.log(`Update: current catalog version is ${result.catalogVersion}`);
 * }
 * ```
 */
export async function validateExtensionId(extensionId: string): Promise<ExtensionIdValidationResult> {
	const defaultResult: ExtensionIdValidationResult = { exists: false, catalogVersion: null, catalogExtensionId: null, catalogMetadata: null };
	if (!extensionId) {
		return defaultResult;
	}
	
	try {
		const catalogUrl = "https://raw.githubusercontent.com/danielshue/vault-copilot-extensions/main/catalog/catalog.json";
		
		const response = await fetch(catalogUrl);
		if (!response.ok) {
			throw new Error(
				`Could not fetch extension catalog from GitHub (HTTP ${response.status}). ID uniqueness could not be validated, but you may still continue.`
			);
		}
		
		const catalog = await response.json();
		
		// The catalog uses a flat "extensions" array, not per-type arrays
		const allExtensions: any[] = catalog.extensions || [];
		
		// Exact match first
		let existingExtension = allExtensions.find((ext: any) => ext.id === extensionId);
		
		// Fallback: the derived ID from a file like "daily-journal.agent.md" yields
		// "daily-journal", but the catalog entry may be "daily-journal-agent".
		// Try matching by prefix (derivedId matches the start of a catalog ID).
		if (!existingExtension) {
			existingExtension = allExtensions.find(
				(ext: any) => ext.id && ext.id.startsWith(extensionId + "-")
			);
		}
		
		if (existingExtension) {
			return {
				exists: true,
				catalogVersion: existingExtension.version || null,
				catalogExtensionId: existingExtension.id || null,
				catalogMetadata: {
					name: existingExtension.name || "",
					categories: existingExtension.categories || [],
					tags: existingExtension.tags || [],
					tools: existingExtension.tools || [],
					repository: existingExtension.repository || null,
					featured: existingExtension.featured || false,
					previewUrl: existingExtension.preview || null,
					iconUrl: existingExtension.icon || null,
				}
			};
		}
		
		return defaultResult;
	} catch (error) {
		if (error instanceof Error) {
			if (error.message.includes("Could not fetch extension catalog")) {
				throw error;
			}
		}
		console.warn("Catalog validation failed:", error);
		return defaultResult;
	}
}

/**
 * Validates that a version string is valid semantic versioning (MAJOR.MINOR.PATCH)
 * 
 * @param version - The version string to validate
 * @returns Whether the version is valid semver
 * 
 * @example
 * ```typescript
 * validateSemver("1.0.0"); // true
 * validateSemver("2.1.3"); // true
 * validateSemver("v1.0");  // false
 * ```
 */
export function validateSemver(version: string): boolean {
	return /^\d+\.\d+\.\d+$/.test(version);
}

/**
 * Compares two semantic version strings
 * 
 * @param a - First version string
 * @param b - Second version string
 * @returns Negative if a < b, 0 if equal, positive if a > b
 * 
 * @example
 * ```typescript
 * compareSemver("1.0.0", "2.0.0"); // -1 (a < b)
 * compareSemver("1.1.0", "1.0.0"); // 1 (a > b)
 * ```
 */
export function compareSemver(a: string, b: string): number {
	const partsA = a.split(".").map(Number);
	const partsB = b.split(".").map(Number);
	
	for (let i = 0; i < 3; i++) {
		const diff = (partsA[i] || 0) - (partsB[i] || 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

/**
 * Result type for fetching previous extension data from the catalog repository.
 *
 * @internal
 */
interface PreviousExtensionData {
	/** Previous README content, or empty string if not found */
	readme: string;
	/** Previous manifest data, or null if not found */
	manifest: ExtensionManifest | null;
}

/**
 * Fetches the previous README and manifest for an existing catalog extension from GitHub.
 *
 * Used during update submissions to generate a changelog by comparing the previous
 * and new versions of the extension's README.
 *
 * @param extensionId - The unique extension identifier
 * @param extensionType - The type of extension (agent, prompt, etc.)
 * @returns Previous README content and manifest from the catalog repository
 *
 * @example
 * ```typescript
 * const prev = await fetchPreviousExtensionData("my-agent", "agent");
 * console.log(prev.readme); // previous README content
 * console.log(prev.manifest?.version); // e.g. "1.0.0"
 * ```
 *
 * @since 0.1.0
 */
export async function fetchPreviousExtensionData(
	extensionId: string,
	extensionType: ExtensionType
): Promise<PreviousExtensionData> {
	const baseUrl = "https://raw.githubusercontent.com/danielshue/vault-copilot-extensions/main/extensions";
	const typeFolder = `${extensionType}s`;

	const readmeUrl = `${baseUrl}/${typeFolder}/${extensionId}/README.md`;
	const manifestUrl = `${baseUrl}/${typeFolder}/${extensionId}/manifest.json`;

	let readme = "";
	let manifest: ExtensionManifest | null = null;

	try {
		const readmeResp = await fetch(readmeUrl);
		if (readmeResp.ok) {
			readme = await readmeResp.text();
		}
	} catch (err) {
		console.warn("Failed to fetch previous README:", err);
	}

	try {
		const manifestResp = await fetch(manifestUrl);
		if (manifestResp.ok) {
			manifest = (await manifestResp.json()) as ExtensionManifest;
		}
	} catch (err) {
		console.warn("Failed to fetch previous manifest:", err);
	}

	return { readme, manifest };
}

/**
 * Generates a structured changelog by comparing the previous and new README using AI.
 *
 * The function sends both versions of the README to the active AI provider and asks it
 * to produce a concise changelog summarizing what changed between versions. The result
 * is a human-readable Markdown string suitable for inclusion in CHANGELOG.md and the
 * manifest's `versions` array.
 *
 * @param plugin - The Vault Copilot plugin instance (provides access to the AI service)
 * @param extensionName - Human-readable name of the extension
 * @param extensionId - Unique extension identifier
 * @param previousReadme - The README content from the currently published version
 * @param currentReadme - The README content for the new version being submitted
 * @param previousVersion - The version string of the current catalog entry
 * @param newVersion - The version string being submitted
 * @param messageContainer - Optional element for displaying status messages
 * @param showMessage - Optional callback for rendering inline messages
 * @returns Generated changelog as Markdown text
 *
 * @example
 * ```typescript
 * const changelog = await generateChangelogWithAI(
 *   plugin, "My Agent", "my-agent",
 *   "# My Agent\n\nDoes thing A.",
 *   "# My Agent\n\nDoes thing A and B.",
 *   "1.0.0", "1.1.0"
 * );
 * console.log(changelog); // "## 1.1.0\n\n- Added support for thing B"
 * ```
 *
 * @since 0.1.0
 */
export async function generateChangelogWithAI(
	plugin: VaultCopilotPlugin | undefined,
	extensionName: string,
	extensionId: string,
	previousReadme: string,
	currentReadme: string,
	previousVersion: string,
	newVersion: string,
	messageContainer?: HTMLElement | null,
	showMessage?: (container: HTMLElement, message: string, type: "error" | "warning" | "success" | "info") => void
): Promise<string> {
	if (!plugin) {
		const fallback = `## ${newVersion}\n\n- Updated from ${previousVersion}`;
		return fallback;
	}

	try {
		const service = plugin.getActiveService?.();
		if (!service) {
			throw new Error("No active AI service available");
		}

		const prompt = `You are an expert technical writer generating a detailed changelog entry for an Obsidian Vault Copilot extension update.

Extension: "${extensionName}" (ID: ${extensionId})
Previous version: ${previousVersion}
New version: ${newVersion}

Below are the PREVIOUS and CURRENT README files in their entirety. Perform a thorough, line-by-line comparison and document every meaningful difference.

=== PREVIOUS README (v${previousVersion}) ===
${previousReadme || "(no previous README available)"}

=== CURRENT README (v${newVersion}) ===
${currentReadme || "(no current README available)"}

Instructions:
1. Compare both READMEs carefully. Identify ALL differences: added sections, removed sections, changed wording, new features, removed features, updated examples, modified instructions, etc.
2. Output ONLY the changelog entry as Markdown. Do NOT say "see README" or "refer to README" — the changelog must be self-contained.
3. Start with: ## ${newVersion}
4. Group changes under these headings where applicable:
   ### Added
   ### Changed
   ### Fixed
   ### Removed
5. Use bullet points for each individual change.
6. Be specific and descriptive. Instead of "Updated documentation", write "Added new Configuration section with API key setup instructions".
7. If a section was rewritten, describe what changed in its content.
8. If both READMEs are identical, output: "## ${newVersion}\n\n- No content changes detected"
9. Do NOT include any commentary, preamble, or explanation outside the changelog entry itself.`;

		// If AI service requires session creation, initialize it first
		// createSession() returns a session ID string and sets up the internal session
		if ('createSession' in service && typeof (service as any).createSession === 'function') {
			await (service as any).createSession();
		}

		let response: string;
		if (typeof service.sendMessage === "function") {
			const result = await service.sendMessage(prompt);
			response = typeof result === "string" ? result : (result as { text?: string }).text || String(result);
		} else {
			throw new Error("AI service does not support sendMessage");
		}

		const changelog = cleanMarkdownCodeBlocks(response.trim());

		if (messageContainer && showMessage) {
			showMessage(messageContainer, "Changelog generated successfully!", "success");
		}

		return changelog;
	} catch (error) {
		console.error("AI changelog generation error:", error);

		const fallback = `## ${newVersion}\n\n- Updated from ${previousVersion}\n- See README for details`;

		if (messageContainer && showMessage) {
			showMessage(messageContainer, "Changelog generation failed. Using fallback content.", "warning");
		}

		return fallback;
	}
}

/**
 * Reads the primary content for an extension based on the user-attached path.
 *
 * Supports both file and folder inputs:
 * - If the path points to a file, that file is read directly.
 * - If the path points to a folder, common extension files are probed using the
 *   derived extension ID (agent/prompt/voice-agent) and finally README.md.
 */
async function readExtensionContent(
	app: App,
	extensionPath: string,
	extensionId: string | undefined
): Promise<string> {
	if (!extensionPath) {
		return "";
	}

	try {
		const abstractFile = app.vault.getAbstractFileByPath(extensionPath);
		if (!abstractFile) {
			console.warn(`Could not resolve extension path for content: ${extensionPath}`);
			return "";
		}

		// If the user attached a specific file, read it directly
		if (abstractFile instanceof TFile) {
			console.log("Reading extension content from attached file:", abstractFile.path);
			return await app.vault.read(abstractFile);
		}

		// Otherwise treat the path as a folder and probe common files
		const adapter = app.vault.adapter;
		const basePath = extensionPath;
		const possibleFiles: string[] = [];
		if (extensionId) {
			possibleFiles.push(
				`${basePath}/${extensionId}.agent.md`,
				`${basePath}/${extensionId}.prompt.md`,
				`${basePath}/${extensionId}.voice-agent.md`
			);
		}
		possibleFiles.push(`${basePath}/README.md`);

		for (const filePath of possibleFiles) {
			try {
				if (await adapter.exists(filePath)) {
					console.log("Read extension content from:", filePath);
					return await adapter.read(filePath);
				}
			} catch (e) {
				// Continue to next file
			}
		}
	} catch (error) {
		console.error("Error reading extension content:", error);
	}

	return "";
}

/**
 * Generates extension content (description and README) using AI
 */
export async function generateExtensionContent(
	app: App,
	plugin: VaultCopilotPlugin | undefined,
	extensionPath: string,
	extensionId: string | undefined,
	extensionName: string | undefined
): Promise<{ description: string; readme: string }> {
	if (!plugin || !extensionPath) {
		console.log("No plugin or extension path, skipping content generation");
		return {
			description: `${extensionName || "Extension"} - A helpful extension for Obsidian Vault Copilot.`,
			readme: `# ${extensionName || "Extension"}\n\n## Overview\n\nThis extension enhances your Obsidian experience.\n\n## Usage\n\nUse the command palette to access extension features.`
		};
	}
	
	try {
		const aiService = plugin.getActiveService?.();
		
		if (!aiService) {
			console.log("AI service not available, using fallback content");
			return {
				description: `${extensionName || "Extension"} - A helpful extension for Obsidian Vault Copilot.`,
				readme: `# ${extensionName || "Extension"}\n\n## Overview\n\nThis extension enhances your Obsidian experience.\n\n## Usage\n\nUse the command palette to access extension features.`
			};
		}
		
		console.log("AI service available, generating content...");
		
		// Read extension files (supports both file and folder paths)
		const extensionContent = await readExtensionContent(app, extensionPath, extensionId);
		
		// Check if AI service requires session creation
		let aiSession = null;
		if ('createSession' in aiService && typeof (aiService as any).createSession === 'function') {
			console.log("AI service requires session creation");
			aiSession = await (aiService as any).createSession();
		}
		
		// Generate description
		console.log("Starting AI description generation...");
		const descriptionPrompt = `Based on this extension content, write a brief 1-2 sentence description suitable for a catalog listing:

${extensionContent || `Extension Name: ${extensionName}\nExtension ID: ${extensionId}`}

Description:`;
		
		console.log("Sending prompt to AI service for description...");
		let descriptionResponse;
		if (aiSession && typeof aiSession.sendMessage === 'function') {
			descriptionResponse = await aiSession.sendMessage(descriptionPrompt);
		} else if (typeof aiService.sendMessage === 'function') {
			descriptionResponse = await aiService.sendMessage(descriptionPrompt);
		} else {
			throw new Error("AI service does not support sendMessage");
		}
		
		const description = descriptionResponse.trim();
		console.log("AI description generated successfully");
		
		// Generate README
		console.log("Starting AI README generation...");
		const readmePrompt = `Based on this extension content, write a comprehensive README.md file with the following sections:
- Brief overview
- Features
- Usage instructions
- Examples (if applicable)

IMPORTANT:
- Do NOT wrap the output in markdown code blocks (no \`\`\`markdown)
- If the extension file has frontmatter (--- at the top), preserve it exactly
- Return the README content directly without any wrapper

${extensionContent || `Extension Name: ${extensionName}\nExtension ID: ${extensionId}`}

README.md content:`;
		
		console.log("Sending prompt to AI service for README...");
		let readmeResponse;
		if (aiSession && typeof aiSession.sendMessage === 'function') {
			readmeResponse = await aiSession.sendMessage(readmePrompt);
		} else if (typeof aiService.sendMessage === 'function') {
			readmeResponse = await aiService.sendMessage(readmePrompt);
		} else {
			throw new Error("AI service does not support sendMessage");
		}
		
		const readme = cleanMarkdownCodeBlocks(readmeResponse);
		console.log("AI README generated successfully");
		console.log("Generated description:", description);
		console.log("Generated README length:", readme.length);
		
		return { description, readme };
		
	} catch (error) {
		console.error("AI content generation error:", error);
		return {
			description: `${extensionName} - A helpful extension for Obsidian Vault Copilot.`,
			readme: `# ${extensionName}\n\n## Overview\n\nThis extension enhances your Obsidian experience.\n\n## Usage\n\nUse the command palette to access extension features.`
		};
	}
}

/**
 * Generates a preview image for the extension automatically.
 *
 * This helper is intentionally file-system based (no direct external image API).
 * It will:
 * - Resolve the target folder for the extension (file → parent folder, folder → itself)
 * - Re-use an existing preview asset if one already exists (preview.svg / preview.png)
 * - Otherwise, ask the active AI provider to generate an SVG image based on the README
 *   (or fall back to a static banner if AI is unavailable)
 *
 * The returned string is the vault-relative path to the generated or existing asset,
 * which is then surfaced in the wizard as the AI-generated image placeholder.
 *
 * @param app - The Obsidian app instance used for vault access
 * @param plugin - The Vault Copilot plugin instance (used to access the active AI service)
 * @param extensionPath - The path provided by the user for the extension (file or folder)
 * @param extensionId - The derived extension ID (used for logging only)
 * @param extensionName - Human-friendly extension name used in the SVG banner
 * @param readmeContent - README content used as the basis for the generated image
 * @returns The vault-relative image path, or null if generation fails
 */
export async function generateExtensionImageAuto(
	app: App,
	plugin: VaultCopilotPlugin | undefined,
	extensionPath: string,
	extensionId: string | undefined,
	extensionName: string | undefined,
	readmeContent?: string
): Promise<string | null> {
	try {
		if (!extensionPath) {
			console.warn("No extension path provided, skipping auto image generation");
			return null;
		}
		
		// Resolve the target folder for assets based on the provided path
		const abstractFile = app.vault.getAbstractFileByPath(extensionPath);
		let folderPath: string | null = null;
		
		if (abstractFile instanceof TFile) {
			// Use parent folder for files
			folderPath = abstractFile.parent ? abstractFile.parent.path : null;
		} else {
			// Path already points to a folder
			folderPath = extensionPath;
		}
		
		if (!folderPath) {
			console.warn("Could not resolve folder for auto image generation", { extensionPath });
			return null;
		}
		
		const adapter = app.vault.adapter;
		const svgPath = `${folderPath}/preview.svg`;
		const pngPath = `${folderPath}/preview.png`;
		
		// If a preview already exists on disk (user-provided asset), just reuse it
		if (await adapter.exists(svgPath)) {
			console.log("Reusing existing preview.svg for auto image generation:", svgPath);
			return svgPath;
		}
		if (await adapter.exists(pngPath)) {
			console.log("Reusing existing preview.png for auto image generation:", pngPath);
			return pngPath;
		}
		
		// Build a safe display name used in prompts and fallbacks
		const safeName = (extensionName || extensionId || "Vault Copilot Extension").trim();
		const titleText = safeName.length > 40 ? `${safeName.slice(0, 37)}...` : safeName;
		
		// Helper: static SVG banner used as a fallback when AI is unavailable or returns invalid output
		const buildFallbackSvg = (): string => {
		return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="fallbackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea"/>
      <stop offset="100%" style="stop-color:#764ba2"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="64" fill="url(#fallbackGrad)"/>
  <g transform="translate(256, 256)">
    <circle r="80" fill="white" opacity="0.2"/>
    <path d="M 0,-50 L 35,25 L -35,25 Z" fill="white" transform="rotate(0)"/>
  </g>
</svg>`;
	};
		// Helper: wrap SVG markup in a data URL so the image can be rendered
		// in the UI without writing files into the vault or repo.
		const toDataUrl = (svgContent: string): string => {
			return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
		};
		
		// If no plugin or AI service is available, fall back to a static SVG
		// returned as a data URL. This avoids creating on-disk assets inside the
		// plugin repo or test vault.
		if (!plugin) {
			const svgContent = buildFallbackSvg();
			const dataUrl = toDataUrl(svgContent);
			console.log("Auto-generated static preview image (no plugin available)", { extensionId });
			return dataUrl;
		}
		
		const aiService = plugin.getActiveService?.();
		if (!aiService) {
			const svgContent = buildFallbackSvg();
			const dataUrl = toDataUrl(svgContent);
			console.log("Auto-generated static preview image (no AI service available)", { extensionId });
			return dataUrl;
		}
		
		// Prefer README content passed from the caller; fall back to README.md in the folder
		let effectiveReadme = (readmeContent || "").trim();
		if (!effectiveReadme) {
			try {
				const readmePath = `${folderPath}/README.md`;
				if (await adapter.exists(readmePath)) {
					effectiveReadme = await adapter.read(readmePath);
					console.log("Loaded README.md for image generation:", readmePath);
				}
			} catch (readError) {
				console.warn("Failed to read README.md for image generation", readError);
			}
		}
		
		// Ask the AI provider to generate standalone SVG markup for the preview image
		let svgResponse: string;
		try {
			const prompt = `You are a UI designer generating SVG preview icons for the Obsidian Vault Copilot extensions catalog. Based on the following README content, generate a vibrant, modern icon that matches the catalog's visual style.

Style Requirements (CRITICAL - match examples exactly):
- Output a single, valid standalone SVG element
- Size must be 512x512 (square format)
- Use a vibrant gradient background (choose from: purple, blue, orange/yellow, teal/green gradients)
- Add rounded corners (border-radius equivalent via SVG)
- Center a simple, flat/minimalist icon that represents the extension's purpose
- Icon should be clean and professional (single-concept, flat design)
- Use white or light colors for the icon against the gradient background
- Modern, catalog-quality appearance

Examples of the target style:
- Daily Journal: Purple gradient background, white document icon centered
- Meeting Notes: Blue gradient background, white meeting/people icon centered
- Task Management: Orange gradient background, white checklist icon centered
- Weather: Blue gradient background, white weather icon centered
- Weekly Review: Teal gradient background, white checkmark icon centered

Extension context (use this to choose the icon concept):
Name: "${titleText}"
${effectiveReadme ? `README excerpt:\n${effectiveReadme.slice(0, 300)}` : "(Design a generic but professional icon)"}

IMPORTANT:
- Do NOT wrap the SVG in Markdown or code fences
- Do NOT include any explanations, comments, or backticks
- Return ONLY the <svg>...</svg> markup
- Make it visually stunning and catalog-ready`;
			
			let aiSession: any = null;
			if ("createSession" in aiService && typeof (aiService as any).createSession === "function") {
				console.log("AI service requires session creation for image generation");
				aiSession = await (aiService as any).createSession();
			}
			
			if (aiSession && typeof aiSession.sendMessage === "function") {
				svgResponse = await aiSession.sendMessage(prompt);
			} else if (typeof (aiService as any).sendMessage === "function") {
				svgResponse = await (aiService as any).sendMessage(prompt);
			} else {
				throw new Error("AI service does not support sendMessage for image generation");
			}
		} catch (aiError) {
			console.error("AI image generation failed, falling back to static SVG:", aiError);
			const svgContent = buildFallbackSvg();
			return toDataUrl(svgContent);
		}
		
		// Clean up any accidental code fences and extract the SVG element if needed
		let cleanedSvg = cleanMarkdownCodeBlocks(svgResponse || "");
		const startIdx = cleanedSvg.indexOf("<svg");
		const endIdx = cleanedSvg.lastIndexOf("</svg>");
		if (startIdx !== -1 && endIdx !== -1) {
			cleanedSvg = cleanedSvg.slice(startIdx, endIdx + "</svg>".length);
		}
		cleanedSvg = cleanedSvg.trim();
		
		if (!cleanedSvg.toLowerCase().includes("<svg")) {
			console.warn("AI did not return valid SVG, using static fallback preview");
			const svgContent = buildFallbackSvg();
			return toDataUrl(svgContent);
		}
		
		const dataUrl = toDataUrl(cleanedSvg);
		console.log("AI-generated preview image for extension (data URL)", { extensionId });
		
		return dataUrl;
	} catch (error) {
		console.error("Auto image generation failed:", error);
		return null;
	}
}

/**
 * Generates extension image (with button interaction)
 */
export async function generateExtensionImage(
	plugin: VaultCopilotPlugin | undefined,
	extensionId: string | undefined,
	button: ButtonComponent,
	messageContainer: HTMLElement | null,
	showMessage: (container: HTMLElement, message: string, type: 'error' | 'warning' | 'success' | 'info') => void
): Promise<{ imagePath: string | null; isGenerating: boolean }> {
	if (!plugin) {
		return { imagePath: null, isGenerating: false };
	}
	
	button.setButtonText("Generating...");
	button.setDisabled(true);
	
	try {
		// TODO: Implement actual AI image generation
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		const imagePath = `generated-${extensionId}-icon.png`;
		
		if (messageContainer) {
			showMessage(messageContainer, "Image generated successfully! Same image will be used for both icon and preview.", 'success');
		}
		
		return { imagePath, isGenerating: false };
		
	} catch (error) {
		console.error("Image generation failed:", error);
		
		if (messageContainer) {
			showMessage(messageContainer, "Image generation failed. Please upload an image manually.", 'error');
		}
		
		return { imagePath: null, isGenerating: false };
	} finally {
		button.setButtonText("Generate with AI");
		button.setDisabled(false);
	}
}

/**
 * Generates description with AI (manual trigger)
 */
export async function generateDescriptionWithAI(
	app: App,
	plugin: VaultCopilotPlugin | undefined,
	extensionPath: string,
	extensionId: string | undefined,
	extensionName: string | undefined,
	descriptionInput: HTMLTextAreaElement | null,
	messageContainer: HTMLElement | null,
	showMessage: (container: HTMLElement, message: string, type: 'error' | 'warning' | 'success' | 'info') => void
): Promise<string> {
	if (!plugin) {
		return "";
	}
	
	try {
		const aiService = plugin.getActiveService?.();
		
		if (!aiService) {
			throw new Error("AI service not available");
		}
		
		console.log("Starting AI description generation...");
		
		// Read extension files (supports both file and folder paths)
		const extensionContent = await readExtensionContent(app, extensionPath, extensionId);
		
		const descPrompt = `You are helping generate a short catalog listing for an Obsidian Vault Copilot extension.

Write a single, concise description of this extension that is at most 200 characters long (including spaces).
- Focus on what it does and why it's useful.
- Do not include quotes or markdown formatting.
- Answer with the description text only.

Extension context:
${extensionContent || `Extension Name: ${extensionName}\nExtension ID: ${extensionId}`}\n\nDescription (<= 200 characters):`;
		
		console.log("Sending prompt to AI service for description...");
		
		let descResponse;
		if ('createSession' in aiService && typeof (aiService as any).createSession === 'function') {
			console.log("AI service requires session creation");
			const aiSession = await (aiService as any).createSession();
			descResponse = await aiSession.sendMessage(descPrompt);
		} else if (typeof aiService.sendMessage === 'function') {
			descResponse = await aiService.sendMessage(descPrompt);
		} else {
			throw new Error("AI service does not support sendMessage");
		}
		
		console.log("AI description generated successfully");
		let description = descResponse.trim();
		if (description.length > 200) {
			description = `${description.slice(0, 197)}...`;
		}
		
		if (descriptionInput) {
			descriptionInput.value = description;
		}
		
		if (messageContainer) {
			showMessage(messageContainer, "Description generated successfully!", 'success');
		}
		
		return description;
		
	} catch (error) {
		console.error("AI description generation error:", error);
		const fallback = `${extensionName} - A helpful extension for Obsidian Vault Copilot.`;
		
		if (descriptionInput) {
			descriptionInput.value = fallback;
		}
		
		if (messageContainer) {
			showMessage(messageContainer, "Description generation failed. Using fallback content.", 'warning');
		}
		
		return fallback;
	}
}

/**
 * Generates README with AI (manual trigger)
 */
export async function generateReadmeWithAI(
	app: App,
	plugin: VaultCopilotPlugin | undefined,
	extensionPath: string,
	extensionId: string | undefined,
	extensionName: string | undefined,
	readmeInput: HTMLTextAreaElement | null,
	messageContainer: HTMLElement | null,
	showMessage: (container: HTMLElement, message: string, type: 'error' | 'warning' | 'success' | 'info') => void
): Promise<string> {
	if (!plugin) {
		return "";
	}
	
	try {
		const aiService = plugin.getActiveService?.();
		
		if (!aiService) {
			throw new Error("AI service not available");
		}
		
		console.log("Starting AI README generation...");
		
		// Read extension files (supports both file and folder paths)
		const extensionContent = await readExtensionContent(app, extensionPath, extensionId);
		
		const readmePrompt = `Based on this extension content, write a comprehensive README.md with:
- Brief overview
- Features
- Usage instructions
- Examples (if applicable)

IMPORTANT:
- Do NOT wrap the output in markdown code blocks (no \`\`\`markdown)
- If the extension file has frontmatter (--- at the top), preserve it exactly
- Return the README content directly without any wrapper

${extensionContent || `Extension Name: ${extensionName}\nExtension ID: ${extensionId}`}

README.md content:`;
		
		console.log("Sending prompt to AI service for README...");
		
		let readmeResponse;
		if ('createSession' in aiService && typeof (aiService as any).createSession === 'function') {
			console.log("AI service requires session creation");
			const aiSession = await (aiService as any).createSession();
			readmeResponse = await aiSession.sendMessage(readmePrompt);
		} else if (typeof aiService.sendMessage === 'function') {
			readmeResponse = await aiService.sendMessage(readmePrompt);
		} else {
			throw new Error("AI service does not support sendMessage");
		}
		
		console.log("AI README generated successfully");
		const readme = cleanMarkdownCodeBlocks(readmeResponse);
		
		if (readmeInput) {
			readmeInput.value = readme;
		}
		
		if (messageContainer) {
			showMessage(messageContainer, "README generated successfully!", 'success');
		}
		
		return readme;
		
	} catch (error) {
		console.error("AI README generation error:", error);
		const fallback = `# ${extensionName}\n\n## Overview\n\nThis extension enhances your Obsidian experience.\n\n## Usage\n\nUse the command palette to access extension features.`;
		
		if (readmeInput) {
			readmeInput.value = fallback;
		}
		
		if (messageContainer) {
			showMessage(messageContainer, "README generation failed. Using fallback content.", 'warning');
		}
		
		return fallback;
	}
}
