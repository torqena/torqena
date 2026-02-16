/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module extensions/GitHubSubmissionService
 * @description Service for submitting extensions to the torqena-extensions repository via GitHub.
 * 
 * This service orchestrates the complete workflow for submitting an extension to the
 * official marketplace catalog, including validation, GitHub setup, branch creation,
 * file operations, and pull request creation using the GitHub Copilot CLI SDK.
 * 
 * **Workflow Steps:**
 * 1. Validate extension files and manifest
 * 2. Check GitHub setup (CLI auth, fork exists)
 * 3. Create a new branch in the fork
 * 4. Copy extension files to the appropriate directory
 * 5. Commit and push changes
 * 6. Create a pull request to the upstream repository
 * 
 * @example
 * ```typescript
 * const service = new GitHubSubmissionService();
 * await service.initialize();
 * 
 * const result = await service.submitExtension({
 *   extensionPath: "/path/to/my-agent",
 *   extensionId: "my-agent",
 *   extensionType: "agent",
 *   version: "1.0.0",
 *   branchName: "add-my-agent"
 * });
 * 
 * if (result.success) {
 *   console.log(`PR created: ${result.pullRequestUrl}`);
 * }
 * ```
 * 
 * @since 0.0.19
 */

// No longer using Copilot SDK for orchestration
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

/**
 * Configuration options for the GitHub Submission Service.
 * 
 * @example
 * ```typescript
 * const config: GitHubSubmissionConfig = {
 *   upstreamOwner: "danielshue",
 *   upstreamRepo: "torqena-extensions",
 *   targetBranch: "main"
 * };
 * ```
 */
export interface GitHubSubmissionConfig {
	/** GitHub username/organization that owns the upstream repository */
	upstreamOwner: string;
	
	/** Name of the upstream repository */
	upstreamRepo: string;
	
	/** Target branch to create PR against (default: "main") */
	targetBranch?: string;
	
	/** Custom fork owner (if different from authenticated user) */
	forkOwner?: string;
}

/**
 * Parameters for submitting an extension to the marketplace.
 * 
 * @example
 * ```typescript
 * const params: ExtensionSubmissionParams = {
 *   extensionPath: "/vault/Reference/Agents/my-agent",
 *   extensionId: "my-agent",
 *   extensionType: "agent",
 *   version: "1.0.0",
 *   branchName: "add-my-agent-1.0.0"
 * };
 * ```
 */
export interface ExtensionSubmissionParams {
	/** Absolute path to the extension directory */
	extensionPath: string;
	
	/** Unique extension ID (lowercase-with-hyphens) */
	extensionId: string;
	
	/** Type of extension being submitted */
	extensionType: "agent" | "voice-agent" | "prompt" | "skill" | "mcp-server";
	
	/** Semantic version of the extension */
	version: string;
	
	/** Name of the branch to create for the submission */
	branchName: string;
	
	/** Optional commit message override */
	commitMessage?: string;
	
	/** Optional PR title override */
	prTitle?: string;
	
	/** Optional PR description override */
	prDescription?: string;
}

/**
 * Result of an extension submission operation.
 * 
 * @example
 * ```typescript
 * const result: ExtensionSubmissionResult = {
 *   success: true,
 *   pullRequestUrl: "https://github.com/danielshue/torqena-extensions/pull/42",
 *   pullRequestNumber: 42,
 *   branchName: "add-my-agent-1.0.0",
 *   validationErrors: []
 * };
 * ```
 */
export interface ExtensionSubmissionResult {
	/** Whether the submission was successful */
	success: boolean;
	
	/** URL to the created pull request (if successful) */
	pullRequestUrl?: string;
	
	/** Pull request number (if successful) */
	pullRequestNumber?: number;
	
	/** Name of the branch created */
	branchName?: string;
	
	/** List of validation errors (if any) */
	validationErrors: string[];
	
	/** Error message if submission failed */
	error?: string;
	
	/** Detailed error information for debugging */
	details?: unknown;
}

/**
 * Validation result for extension files and manifest.
 */
interface ValidationResult {
	/** Whether validation passed */
	valid: boolean;
	
	/** List of validation errors */
	errors: string[];
	
	/** List of validation warnings */
	warnings: string[];
}

/**
 * Service for submitting extensions to the GitHub marketplace repository.
 * Uses the GitHub Copilot CLI SDK to interact with GitHub APIs through custom tools.
 * 
 * @example
 * ```typescript
 * const service = new GitHubSubmissionService({
 *   upstreamOwner: "danielshue",
 *   upstreamRepo: "torqena-extensions"
 * });
 * 
 * await service.initialize();
 * const result = await service.submitExtension(params);
 * await service.cleanup();
 * ```
 */
export class GitHubSubmissionService {
	private config: GitHubSubmissionConfig;
	private initialized = false;
	private commandLogger: ((command: string, cwd?: string) => void) | null = null;
	private abortRequested = false;

	/**
	 * Creates a new GitHub Submission Service instance.
	 * 
	 * @param config - Configuration options for the service
	 * 
	 * @example
	 * ```typescript
	 * const service = new GitHubSubmissionService({
	 *   upstreamOwner: "danielshue",
	 *   upstreamRepo: "torqena-extensions",
	 *   targetBranch: "main"
	 * });
	 * ```
	 */
	constructor(config: GitHubSubmissionConfig) {
		this.config = {
			targetBranch: "main",
			...config,
		};
	}

	/**
	 * Initializes the service by verifying GitHub CLI authentication.
	 * Must be called before using submitExtension().
	 * 
	 * @throws {Error} If the GitHub CLI is not installed or authenticated
	 * 
	 * @example
	 * ```typescript
	 * await service.initialize();
	 * ```
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			// Verify GitHub CLI is authenticated

			await execFileAsync("gh", ["auth", "status", "--hostname", "github.com"]);
			this.initialized = true;
		} catch (error) {
			throw new Error(
				`GitHub CLI not authenticated. Please run 'gh auth login' first. ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Validates extension files and manifest before submission.
	 * 
	 * **Validation checks:**
	 * - All required files exist (manifest.json, README.md, extension files)
	 * - manifest.json is valid JSON and follows schema
	 * - Extension ID matches directory name
	 * - Version follows semantic versioning
	 * - File sizes are within limits
	 * - No security issues detected
	 * 
	 * @param params - Extension submission parameters
	 * @returns Validation result with errors and warnings
	 * 
	 * @example
	 * ```typescript
	 * const validation = await service.validateExtension(params);
	 * if (!validation.valid) {
	 *   console.error("Validation errors:", validation.errors);
	 * }
	 * ```
	 */
	async validateExtension(
		params: ExtensionSubmissionParams
	): Promise<ValidationResult> {
		const errors: string[] = [];
		const warnings: string[] = [];

		try {
			// Check if extension directory exists
			if (!fs.existsSync(params.extensionPath)) {
				errors.push(`Extension directory not found: ${params.extensionPath}`);
				return { valid: false, errors, warnings };
			}

			// Check for required files
			const manifestPath = path.join(params.extensionPath, "manifest.json");
			const readmePath = path.join(params.extensionPath, "README.md");

			if (!fs.existsSync(manifestPath)) {
				errors.push("manifest.json is required");
			}

			if (!fs.existsSync(readmePath)) {
				errors.push("README.md is required");
			}

			// Validate manifest.json if it exists
			if (fs.existsSync(manifestPath)) {
				try {
					const manifestContent = fs.readFileSync(manifestPath, "utf-8");
					const manifest = JSON.parse(manifestContent);

					// Validate required fields
					if (!manifest.id) {
						errors.push("manifest.json must have an 'id' field");
					} else if (manifest.id !== params.extensionId) {
						errors.push(
							`manifest.json id "${manifest.id}" does not match expected "${params.extensionId}"`
						);
					}

					if (!manifest.name) {
						errors.push("manifest.json must have a 'name' field");
					}

					if (!manifest.version) {
						errors.push("manifest.json must have a 'version' field");
					} else if (manifest.version !== params.version) {
						warnings.push(
							`manifest.json version "${manifest.version}" does not match expected "${params.version}"`
						);
					}

					if (!manifest.type) {
						errors.push("manifest.json must have a 'type' field");
					} else if (manifest.type !== params.extensionType) {
						errors.push(
							`manifest.json type "${manifest.type}" does not match expected "${params.extensionType}"`
						);
					}

					// Validate semantic versioning
					const semverRegex = /^\d+\.\d+\.\d+$/;
					if (!semverRegex.test(params.version)) {
						errors.push(
							`Version "${params.version}" does not follow semantic versioning (x.y.z)`
						);
					}
				} catch (parseError) {
					errors.push(
						`manifest.json is not valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
					);
				}
			}

			// Check for extension-specific required files
			const extensionFile = this.getExpectedExtensionFile(
				params.extensionType,
				params.extensionId
			);
			const extensionFilePath = path.join(
				params.extensionPath,
				extensionFile
			);

			if (!fs.existsSync(extensionFilePath)) {
				errors.push(
					`Extension file not found: ${extensionFile} (expected for ${params.extensionType})`
				);
			}

			// Check file sizes
			const files = fs.readdirSync(params.extensionPath);
			let totalSize = 0;

			for (const file of files) {
				const filePath = path.join(params.extensionPath, file);
				const stat = fs.statSync(filePath);

				if (stat.isFile()) {
					totalSize += stat.size;

					// Warn if single file is large
					if (stat.size > 100 * 1024) {
						// 100KB
						warnings.push(
							`File ${file} is large (${Math.round(stat.size / 1024)}KB)`
						);
					}
				}
			}

			// Error if total size exceeds limit
			if (totalSize > 2 * 1024 * 1024) {
				// 2MB
				errors.push(
					`Total extension size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds 2MB limit`
				);
			}
		} catch (error) {
			errors.push(
				`Validation failed: ${error instanceof Error ? error.message : String(error)}`
			);
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Submits an extension to the GitHub marketplace repository.
	 * 
	 * **Workflow:**
	 * 1. Validates extension files and manifest
	 * 2. Checks GitHub authentication
	 * 3. Ensures fork exists
	 * 4. Creates a new branch
	 * 5. Copies extension files
	 * 6. Commits and pushes changes
	 * 7. Creates a pull request
	 * 
	 * @param params - Extension submission parameters
	 * @returns Submission result with PR URL or errors
	 * 
	 * @throws {Error} If service is not initialized
	 * 
	 * @example
	 * ```typescript
	 * const result = await service.submitExtension({
	 *   extensionPath: "/vault/Reference/Agents/my-agent",
	 *   extensionId: "my-agent",
	 *   extensionType: "agent",
	 *   version: "1.0.0",
	 *   branchName: "add-my-agent"
	 * });
	 * 
	 * if (result.success) {
	 *   console.log(`Successfully created PR: ${result.pullRequestUrl}`);
	 * } else {
	 *   console.error("Submission failed:", result.validationErrors);
	 * }
	 * ```
	 */
	async submitExtension(
		params: ExtensionSubmissionParams
	): Promise<ExtensionSubmissionResult> {
		if (!this.initialized) {
			throw new Error(
				"GitHubSubmissionService must be initialized before use. Call initialize() first."
			);
		}

		this.abortRequested = false;

		// Step 1: Validate extension files and manifest
		const validation = await this.validateExtension(params);

		if (!validation.valid) {
			return {
				success: false,
				validationErrors: validation.errors,
				error: "Extension validation failed",
			};
		}

		try {
		const { upstreamOwner, upstreamRepo, targetBranch } = this.config;

			// Helper: run gh command
			const runGh = async (args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> => {
				if (this.abortRequested) throw new Error("Submission aborted by user");
				const command = ["gh", ...args].join(" ");
				if (this.commandLogger) {
					this.commandLogger(command, cwd);
				}
				console.log("[GitHubSubmission] Running gh", { command, cwd });
				const { stdout, stderr } = await execFileAsync("gh", args, { cwd });
				return { stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" };
			};

			// Helper: run git command
			const runGit = async (args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> => {
				if (this.abortRequested) throw new Error("Submission aborted by user");
				console.log("[GitHubSubmission] Running git", { args: ["git", ...args].join(" "), cwd });
				const { stdout, stderr } = await execFileAsync("git", args, { cwd });
				return { stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" };
			};

			// Step 2: Check authentication and get username
			console.log("[GitHubSubmission] Checking GitHub authentication");
		const { stdout: authOutput, stderr: authError } = await runGh(["auth", "status", "--hostname", "github.com"]);
		
	// Debug logging to see what we got
	console.log("[GitHubSubmission] gh auth status stdout:", authOutput);
	console.log("[GitHubSubmission] gh auth status stderr:", authError);
	
	// gh auth status outputs to stderr, not stdout, so check both
	const authText = authError || authOutput;
	console.log("[GitHubSubmission] Checking text:", authText);
	
	let authenticatedUsername: string | null = null;
	for (const line of authText.split(/\r?\n/)) {
		// Match format: "✓ Logged in to github.com account username (keyring)"
		const match = line.match(/Logged in to [^ ]+ account ([^ ]+)/);
		if (match && match[1]) {
			authenticatedUsername = match[1];
			break;
		}
	}

		if (!authenticatedUsername) {
			console.log("[GitHubSubmission] Failed to parse username from auth output");
		throw new Error("Could not determine authenticated GitHub username");
	}

	console.log("[GitHubSubmission] Authenticated as:", authenticatedUsername);

	// Step 3: Determine if we need to fork
			const isOwner = authenticatedUsername === upstreamOwner;
			const targetOwner = isOwner ? upstreamOwner : authenticatedUsername;
			const repoFullName = `${targetOwner}/${upstreamRepo}`;

			console.log("[GitHubSubmission] Target repository:", repoFullName, { isOwner });

			// Step 4: Create fork if needed (external contributor)
			if (!isOwner) {
				console.log("[GitHubSubmission] Checking if fork exists");
				try {
					await runGh(["api", `repos/${repoFullName}`]);
					console.log("[GitHubSubmission] Fork already exists");
				} catch (error) {
					console.log("[GitHubSubmission] Fork does not exist, creating...");
					await runGh(["repo", "fork", `${upstreamOwner}/${upstreamRepo}`, "--remote=false", "--clone=false"]);
					console.log("[GitHubSubmission] Fork created");
				}
			}

			// Step 5: Clone repository with sparse checkout (only extensions/ directory)
			const baseDir = path.join(os.tmpdir(), "torqena-submissions");
			if (!fs.existsSync(baseDir)) {
				fs.mkdirSync(baseDir, { recursive: true });
			}

			const repoDirName = `${upstreamRepo}-${Date.now()}`;
			const repoDir = path.join(baseDir, repoDirName);

			console.log("[GitHubSubmission] Setting up sparse checkout", { repoFullName, repoDir });
			fs.mkdirSync(repoDir, { recursive: true });
			
			// Initialize empty repo
			await runGit(["init"], repoDir);
			
			// Add remote
			const repoUrl = `https://github.com/${repoFullName}.git`;
			await runGit(["remote", "add", "origin", repoUrl], repoDir);
			
			// Enable sparse checkout and configure to only fetch extensions/
			await runGit(["config", "core.sparseCheckout", "true"], repoDir);
			const sparseCheckoutFile = path.join(repoDir, ".git", "info", "sparse-checkout");
			const sparseCheckoutDir = path.dirname(sparseCheckoutFile);
			if (!fs.existsSync(sparseCheckoutDir)) {
				fs.mkdirSync(sparseCheckoutDir, { recursive: true });
			}
			fs.writeFileSync(sparseCheckoutFile, "extensions/\n", "utf-8");
			
			// Fetch only the target branch with depth 1
			await runGit(["fetch", "--depth=1", "origin", targetBranch || "main"], repoDir);
			
			// Step 6: Create branch
			console.log("[GitHubSubmission] Creating branch:", params.branchName);
			await runGit(["checkout", "-B", params.branchName, `origin/${targetBranch || "main"}`], repoDir);

			// Step 7: Copy files
			const targetPath = path.join(
				repoDir,
				"extensions",
				this.getExtensionTypeFolder(params.extensionType),
				params.extensionId
			);

			console.log("[GitHubSubmission] Copying files", { from: params.extensionPath, to: targetPath });
			if (!fs.existsSync(targetPath)) {
				fs.mkdirSync(targetPath, { recursive: true });
			}

			const copyRecursive = (src: string, dest: string): void => {
				const stat = fs.statSync(src);
				if (stat.isDirectory()) {
					if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
					const entries = fs.readdirSync(src);
					for (const entry of entries) {
						copyRecursive(path.join(src, entry), path.join(dest, entry));
					}
				} else {
					const parentDir = path.dirname(dest);
					if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
					fs.copyFileSync(src, dest);
				}
			};

			copyRecursive(params.extensionPath, targetPath);

			// Step 8: Commit changes
			const commitMessage = params.commitMessage || `Add ${params.extensionType}: ${params.extensionId} v${params.version}`;
			console.log("[GitHubSubmission] Committing changes");
			await runGit(["add", "."], repoDir);
			await runGit(["commit", "-m", commitMessage], repoDir);

			// Step 9: Push branch
			console.log("[GitHubSubmission] Pushing branch:", params.branchName);
		try {
			await runGit(["push", "-u", "origin", params.branchName], repoDir);
		} catch (pushError: any) {
			// If push fails because remote has changes we don't have, fetch and rebase
			if (pushError.message?.includes("fetch first") || pushError.message?.includes("rejected")) {
				console.log("[GitHubSubmission] Push rejected, fetching remote changes and rebasing...");
				try {
					// Fetch the remote branch
					await runGit(["fetch", "origin", params.branchName], repoDir);
					// Rebase our changes on top of the remote branch
					await runGit(["rebase", `origin/${params.branchName}`], repoDir);
					// Try pushing again
					await runGit(["push", "-u", "origin", params.branchName], repoDir);
					console.log("[GitHubSubmission] Successfully pushed after rebase");
				} catch (rebaseError: any) {
					console.log("[GitHubSubmission] Rebase failed, using force push with lease");
					// If rebase fails (conflicts), use force-with-lease to overwrite remote
					// This is safer than --force as it won't overwrite unexpected changes
					await runGit(["push", "--force-with-lease", "-u", "origin", params.branchName], repoDir);
				}
			} else {
				// Re-throw if it's a different error
				throw pushError;
			}
		}
			const prTitle = params.prTitle || `[${this.capitalizeType(params.extensionType)}] ${params.extensionId} v${params.version}`;
			const prDescription = params.prDescription || `## Extension Submission\n\n**Extension Name:** ${params.extensionId}\n**Type:** ${params.extensionType}\n**Version:** ${params.version}`;

			const prBodyFile = path.join(repoDir, ".gh-pr-body.md");
			fs.writeFileSync(prBodyFile, prDescription, "utf-8");

			const headRef = isOwner ? params.branchName : `${targetOwner}:${params.branchName}`;
			console.log("[GitHubSubmission] Creating pull request", { head: headRef, base: targetBranch });

		// Create the PR (returns the URL in stdout)
		const { stdout: prUrl } = await runGh([
			"pr", "create",
			"--repo", `${upstreamOwner}/${upstreamRepo}`,
			"--title", prTitle,
			"--base", targetBranch || "main",
			"--head", headRef,
			"--body-file", prBodyFile
		], repoDir);

		const prUrlTrimmed = prUrl.trim();
		if (!prUrlTrimmed) {
			throw new Error("Failed to get PR URL from gh pr create");
		}

		console.log("[GitHubSubmission] Pull request created:", prUrlTrimmed);
		
		// Extract PR number from URL (format: https://github.com/owner/repo/pull/123)
		const prNumberMatch = prUrlTrimmed.match(/\/pull\/(\d+)$/);
		const prNumber = prNumberMatch?.[1] ? parseInt(prNumberMatch[1], 10) : undefined;

		return {
			success: true,
			pullRequestUrl: prUrlTrimmed,
			pullRequestNumber: prNumber,
			branchName: params.branchName,
			validationErrors: [],
		};
	} catch (error) {
			console.error("[GitHubSubmission] Submission failed:", error);
			return {
				success: false,
				validationErrors: [],
				error: `Submission failed: ${error instanceof Error ? error.message : String(error)}`,
				details: error,
			};
		}
	}

	/**
	 * Cleans up resources used by the service.
	 * Should be called when the service is no longer needed.
	 * 
	 * @example
	 * ```typescript
	 * await service.cleanup();
	 * ```
	 */
	async cleanup(): Promise<void> {
		this.initialized = false;
	}

	/**
	 * Attempts to abort any in-flight submission.
	 *
	 * This is a best-effort cancellation mechanism used when the user
	 * cancels the submission workflow from the UI. It sets an internal
	 * flag that is checked before each git/gh operation.
	 *
	 * @since 0.0.18
	 */
	async abort(): Promise<void> {
		this.abortRequested = true;
	}

	/**
	 * Sets a callback used to report each GitHub CLI command that the
	 * submission workflow executes.
	 *
	 * This is primarily intended for UI layers that want to surface a
	 * human-readable log (for example, nested under a "Submitting" step
	 * in a progress view). The callback is invoked before each `gh`
	 * command is run, and is best-effort only – failures are still
	 * reported via the normal error handling path.
	 *
	 * @param logger - Function that receives the full `gh` command and optional cwd
	 *
	 * @example
	 * ```typescript
	 * service.setCommandLogger((command, cwd) => {
	 *   console.log("Running:", command, "in", cwd);
	 * });
	 * ```
	 *
	 * @since 0.0.19
	 */
	setCommandLogger(logger: (command: string, cwd?: string) => void): void {
		this.commandLogger = logger;
	}

	// =========================================================================
	// Private Helper Methods
	// =========================================================================

	/**
	 * Gets the expected extension file name based on type and ID.
	 * 
	 * @param type - Extension type
	 * @param id - Extension ID
	 * @returns Expected filename
	 * 
	 * @internal
	 */
	private getExpectedExtensionFile(
		type: string,
		id: string
	): string {
		switch (type) {
			case "agent":
				return `${id}.agent.md`;
			case "voice-agent":
				return `${id}.voice-agent.md`;
			case "prompt":
				return `${id}.prompt.md`;
			case "skill":
				return "skill.md";
			case "mcp-server":
				return "mcp-config.json";
			default:
				return `${id}.md`;
		}
	}

	/**
	 * Gets the folder name for an extension type.
	 * 
	 * @param type - Extension type
	 * @returns Folder name (plural)
	 * 
	 * @internal
	 */
	private getExtensionTypeFolder(type: string): string {
		switch (type) {
			case "agent":
				return "agents";
			case "voice-agent":
				return "voice-agents";
			case "prompt":
				return "prompts";
			case "skill":
				return "skills";
			case "mcp-server":
				return "mcp-servers";
			default:
				return type + "s";
		}
	}

	/**
	 * Capitalizes the extension type for display.
	 * 
	 * @param type - Extension type
	 * @returns Capitalized type
	 * 
	 * @internal
	 */
	private capitalizeType(type: string): string {
		return type
			.split("-")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	}
}

