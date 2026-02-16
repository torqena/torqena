/**
 * normalizePath — path normalization replicating Obsidian's normalizePath.
 *
 * Converts backslashes to forward slashes, collapses duplicate slashes,
 * and strips leading slashes.
 */

export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\//, "")
		.replace(/\/$/, "");
}
