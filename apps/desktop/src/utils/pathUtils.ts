/**
 * @module PathUtils
 * @description Cross-platform path utilities for Obsidian vault paths.
 * 
 * Obsidian uses forward slashes internally regardless of the host platform.
 * These utilities ensure consistent path handling across Windows, Mac, and Linux.
 * 
 * ## Why This Module
 * 
 * Different platforms have different path conventions:
 * - **Windows**: Uses backslashes (`\`) and is case-insensitive
 * - **Mac**: Uses forward slashes (`/`) and is case-insensitive by default
 * - **Linux**: Uses forward slashes (`/`) and is case-sensitive
 * 
 * Obsidian's vault API always expects forward slashes, so these utilities
 * normalize paths for consistent behavior.
 * 
 * ## Home Directory Expansion
 * 
 * The `expandHomePath()` function expands `~/` prefixes to the user's home
 * directory, enabling cross-platform path specifications in settings and configs.
 * This works on Windows (`C:\Users\<user>`), macOS (`/Users/<user>`), and
 * Linux (`/home/<user>`).
 * 
 * @example
 * ```typescript
 * import { normalizeVaultPath, ensureMarkdownExtension, pathsEqual, expandHomePath } from "./utils/pathUtils";
 * 
 * // Windows path converted to vault format
 * const path = normalizeVaultPath("Notes\\Projects\\README");
 * // Result: "Notes/Projects/README"
 * 
 * // Ensure .md extension
 * const mdPath = ensureMarkdownExtension("my-note");
 * // Result: "my-note.md"
 * 
 * // Compare paths
 * pathsEqual("Notes/Daily", "notes/daily"); // true (case-insensitive)
 * 
 * // Expand home directory
 * expandHomePath("~/.copilot/skills"); // "C:/Users/me/.copilot/skills" (Windows)
 * expandHomePath("~/Documents/notes"); // "/Users/me/Documents/notes" (macOS)
 * ```
 * 
 * @see {@link VaultOperations} for vault file operations
 * @since 0.0.14
 */

import { isDesktop } from "./platform";

/**
 * Normalize a path for use with Obsidian's vault API.
 * 
 * Performs the following transformations:
 * - Converts backslashes to forward slashes (Windows compatibility)
 * - Removes trailing slashes
 * - Collapses multiple consecutive slashes
 * - Removes leading slashes (vault paths are relative)
 * - Trims whitespace
 * 
 * @param path - The path to normalize
 * @returns Normalized vault-relative path
 * 
 * @example
 * ```typescript
 * normalizeVaultPath("\\Notes\\Daily\\");  // "Notes/Daily"
 * normalizeVaultPath("/root/path");         // "root/path"
 * normalizeVaultPath("  spaced/path  ");    // "spaced/path"
 * ```
 */
export function normalizeVaultPath(path: string): string {
	let normalized = path.trim();
	
	// Convert backslashes to forward slashes (Windows)
	normalized = normalized.replace(/\\/g, '/');
	
	// Remove trailing slashes
	normalized = normalized.replace(/\/+$/, '');
	
	// Collapse multiple consecutive slashes
	normalized = normalized.replace(/\/+/g, '/');
	
	// Remove leading slashes (vault paths are relative)
	normalized = normalized.replace(/^\/+/, '');
	
	return normalized;
}

/**
 * Ensure a path ends with .md extension.
 * 
 * Useful when accepting user input that may or may not include the extension.
 * 
 * @param path - The path to check
 * @returns Path with .md extension guaranteed
 * 
 * @example
 * ```typescript
 * ensureMarkdownExtension("my-note");      // "my-note.md"
 * ensureMarkdownExtension("my-note.md");   // "my-note.md"
 * ensureMarkdownExtension("folder/note");  // "folder/note.md"
 * ```
 */
export function ensureMarkdownExtension(path: string): string {
	const normalized = normalizeVaultPath(path);
	return normalized.endsWith('.md') ? normalized : `${normalized}.md`;
}

/**
 * Compare two vault paths for equality.
 * 
 * Uses case-insensitive comparison for broader compatibility across platforms.
 * Both Windows and Mac are case-insensitive by default, while Linux is case-sensitive.
 * For vault operations, case-insensitive comparison provides safer behavior.
 * 
 * @param path1 - First path to compare
 * @param path2 - Second path to compare
 * @returns `true` if paths are equivalent, `false` otherwise
 * 
 * @example
 * ```typescript
 * pathsEqual("Notes/Daily", "notes/daily");  // true
 * pathsEqual("Notes/A.md", "Notes/A.md");    // true
 * pathsEqual("foo/bar", "foo/baz");          // false
 * ```
 */
export function pathsEqual(path1: string, path2: string): boolean {
	const normalized1 = normalizeVaultPath(path1);
	const normalized2 = normalizeVaultPath(path2);
	
	// Use case-insensitive comparison for broader compatibility
	// (Windows and Mac are case-insensitive, Linux is case-sensitive)
	return normalized1.toLowerCase() === normalized2.toLowerCase();
}

/**
 * Convert an absolute system path to a vault-relative path.
 * 
 * Strips the vault base path prefix from an absolute path to produce
 * a path suitable for use with Obsidian's vault API.
 * 
 * @param absolutePath - The absolute system path
 * @param vaultBasePath - The vault's base path (e.g., from `app.vault.adapter.basePath`)
 * @returns Vault-relative path, or the original normalized path if not within vault
 * 
 * @example
 * ```typescript
 * const vaultBase = "C:/Users/me/Documents/MyVault";
 * toVaultRelativePath("C:/Users/me/Documents/MyVault/Notes/daily.md", vaultBase);
 * // Result: "Notes/daily.md"
 * 
 * toVaultRelativePath("/other/path/file.md", vaultBase);
 * // Result: "other/path/file.md" (not in vault, returns normalized)
 * ```
 */
export function toVaultRelativePath(absolutePath: string, vaultBasePath: string): string {
	let normalized = normalizeVaultPath(absolutePath);
	const normalizedBase = normalizeVaultPath(vaultBasePath);
	
	// Case-insensitive comparison for Windows/Mac compatibility
	if (normalized.toLowerCase().startsWith(normalizedBase.toLowerCase())) {
		normalized = normalized.slice(normalizedBase.length);
		// Remove leading slash after stripping base
		normalized = normalized.replace(/^\/+/, '');
	}
	
	return normalized;
}

/**
 * Check if a path represents the vault root.
 * 
 * Useful for determining if a path refers to the top-level vault folder.
 * 
 * @param path - The path to check
 * @returns `true` if this represents the vault root, `false` otherwise
 * 
 * @example
 * ```typescript
 * isVaultRoot("");    // true
 * isVaultRoot("/");   // true
 * isVaultRoot(".");   // true
 * isVaultRoot("Notes"); // false
 * ```
 */
export function isVaultRoot(path: string): boolean {
	const normalized = normalizeVaultPath(path);
	return normalized === '' || normalized === '.' || normalized === '/';
}

/**
 * Expand a leading `~/` or `~\` in a path to the user's home directory.
 * 
 * This enables cross-platform path specifications in settings and configs.
 * On desktop, uses `os.homedir()` for expansion. On mobile (where Node.js
 * `os` module is unavailable), returns the path unchanged.
 * 
 * Only expands the `~` when it appears as the first character followed by
 * a path separator (or is the entire string). Does **not** expand `~user/`
 * syntax.
 * 
 * @param inputPath - The path that may start with `~/`
 * @returns The path with `~/` expanded to the home directory, or unchanged
 * 
 * @example
 * ```typescript
 * // On Windows (home = C:\Users\me)
 * expandHomePath("~/.copilot/skills"); // "C:\\Users\\me/.copilot/skills"
 * expandHomePath("~/Documents");       // "C:\\Users\\me/Documents"
 * expandHomePath("~");                 // "C:\\Users\\me"
 * 
 * // Non-tilde paths pass through unchanged
 * expandHomePath("/absolute/path");    // "/absolute/path"
 * expandHomePath("relative/path");     // "relative/path"
 * ```
 * 
 * @see {@link normalizeVaultPath} for vault-relative path normalization
 * @since 0.0.27
 */
export function expandHomePath(inputPath: string): string {
	if (!inputPath) return inputPath;

	const trimmed = inputPath.trim();

	// Only expand ~/... or ~\... or bare ~
	if (trimmed === "~" || trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
		if (!isDesktop) {
			// os.homedir() is not available on mobile
			return inputPath;
		}
		try {
			// Dynamic require to avoid issues on mobile where os module doesn't exist
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const os = require("os") as typeof import("os");
			const home = os.homedir();
			if (trimmed === "~") {
				return home;
			}
			// Replace leading ~ with home dir, keeping the rest of the path
			return home + trimmed.slice(1);
		} catch {
			// If os module unavailable, return unchanged
			return inputPath;
		}
	}

	return inputPath;
}
