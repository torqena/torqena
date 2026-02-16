/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module url
 * @description Minimal stub for Node.js url module used by SDK imports in the renderer.
 *
 * Provides `fileURLToPath` and `pathToFileURL` which are used by `@github/copilot-sdk`
 * to resolve `__dirname` equivalents in ESM. In the Electron renderer these paths
 * are not meaningful, so the stub performs a best-effort conversion.
 *
 * @internal
 * @since 0.1.0
 */

/**
 * Convert a file:// URL to a filesystem path string.
 *
 * @param url - A file:// URL string or URL object
 * @returns The decoded filesystem path
 *
 * @example
 * ```typescript
 * fileURLToPath('file:///C:/Users/test/app.js'); // 'C:/Users/test/app.js'
 * ```
 */
export function fileURLToPath(url: string | URL): string {
	const str = typeof url === "string" ? url : url.href;
	if (str.startsWith("file:///")) {
		// Remove file:/// prefix and decode URI components
		const decoded = decodeURIComponent(str.slice(8));
		// On Windows, paths look like file:///C:/... → C:/...
		// On Unix, file:///home/... → /home/...
		return decoded.match(/^[a-zA-Z]:/) ? decoded : "/" + decoded;
	}
	return str;
}

/**
 * Convert a filesystem path to a file:// URL.
 *
 * @param path - The filesystem path
 * @returns A URL object with the file:// scheme
 *
 * @example
 * ```typescript
 * pathToFileURL('/home/user/app.js').href; // 'file:///home/user/app.js'
 * ```
 */
export function pathToFileURL(path: string): URL {
	const encoded = encodeURIComponent(path).replace(/%2F/g, "/").replace(/%3A/g, ":");
	return new URL(`file:///${encoded}`);
}

/**
 * Parse a URL string into its components.
 *
 * @param urlString - The URL to parse
 * @returns A URL object
 */
export function parse(urlString: string): URL {
	return new URL(urlString);
}

/**
 * Format a URL object into a string.
 *
 * @param url - The URL object or options to format
 * @returns The formatted URL string
 */
export function format(url: URL | { href: string }): string {
	return url.href ?? String(url);
}

export default {
	fileURLToPath,
	pathToFileURL,
	parse,
	format,
};
