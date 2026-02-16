/**
 * Minimal stub for Node.js crypto module used by vscode-jsonrpc in web-shell.
 *
 * Only implements `randomBytes()` which is used for generating unique IDs.
 * Delegates to the Web Crypto API (`crypto.getRandomValues()`).
 */

export function randomBytes(size: number): { toString(encoding: string): string } {
	const buf = new Uint8Array(size);
	globalThis.crypto.getRandomValues(buf);
	return {
		toString(encoding: string): string {
			if (encoding === "hex") {
				return Array.from(buf)
					.map((b) => b.toString(16).padStart(2, "0"))
					.join("");
			}
			if (encoding === "base64") {
				return btoa(String.fromCharCode(...buf));
			}
			return Array.from(buf)
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
		},
	};
}

export default { randomBytes };
