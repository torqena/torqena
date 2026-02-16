/**
 * Minimal path module for browser use.
 * Provides basic path manipulation (forward-slash only, no Windows semantics).
 */

export const sep = "/";
export const delimiter = ":";

export function join(...parts: string[]): string {
	return normalize(parts.filter(Boolean).join("/"));
}

export function resolve(...parts: string[]): string {
	let resolved = "";
	for (let i = parts.length - 1; i >= 0; i--) {
		const part = parts[i];
		if (!part) continue;
		resolved = resolved ? part + "/" + resolved : part;
		if (part.startsWith("/")) break;
	}
	return normalize(resolved);
}

export function normalize(p: string): string {
	if (!p) return ".";
	const isAbsolute = p.startsWith("/");
	const segments = p.split(/[/\\]+/).filter(Boolean);
	const result: string[] = [];
	for (const seg of segments) {
		if (seg === ".") continue;
		if (seg === "..") {
			if (result.length > 0 && result[result.length - 1] !== "..") {
				result.pop();
			} else if (!isAbsolute) {
				result.push("..");
			}
		} else {
			result.push(seg);
		}
	}
	let out = result.join("/");
	if (isAbsolute) out = "/" + out;
	return out || (isAbsolute ? "/" : ".");
}

export function basename(p: string, ext?: string): string {
	const base = p.split(/[/\\]/).filter(Boolean).pop() || "";
	if (ext && base.endsWith(ext)) {
		return base.slice(0, -ext.length);
	}
	return base;
}

export function dirname(p: string): string {
	const parts = p.split(/[/\\]/).filter(Boolean);
	parts.pop();
	if (p.startsWith("/")) return "/" + parts.join("/");
	return parts.join("/") || ".";
}

export function extname(p: string): string {
	const base = basename(p);
	const idx = base.lastIndexOf(".");
	if (idx <= 0) return "";
	return base.slice(idx);
}

export function isAbsolute(p: string): boolean {
	return p.startsWith("/");
}

export function relative(from: string, to: string): string {
	const fromParts = normalize(from).split("/").filter(Boolean);
	const toParts = normalize(to).split("/").filter(Boolean);
	let common = 0;
	while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
		common++;
	}
	const ups = fromParts.length - common;
	const rest = toParts.slice(common);
	return [...Array(ups).fill(".."), ...rest].join("/") || ".";
}

export const posix = { sep, delimiter, join, resolve, normalize, basename, dirname, extname, isAbsolute, relative };

export default { sep, delimiter, join, resolve, normalize, basename, dirname, extname, isAbsolute, relative, posix };
