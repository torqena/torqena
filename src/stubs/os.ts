/**
 * Stub for Node.js os module.
 * Provides minimal implementations for browser use.
 */

export function homedir(): string {
	return "/home/user";
}

export function tmpdir(): string {
	return "/tmp";
}

export function platform(): string {
	return "browser";
}

export function arch(): string {
	return "wasm";
}

export function hostname(): string {
	return "localhost";
}

export function type(): string {
	return "Browser";
}

export function release(): string {
	return "0.0.0";
}

export const EOL = "\n";

export default { homedir, tmpdir, platform, arch, hostname, type, release, EOL };
