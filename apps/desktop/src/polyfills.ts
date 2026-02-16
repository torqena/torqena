/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Polyfills
 * @description Global polyfills that must run before any other module evaluates.
 *
 * This module is loaded as a separate `<script type="module">` in index.html
 * BEFORE the main entry point. ES module scripts execute in document order,
 * so these shims are guaranteed to be available when dependency code
 * (e.g., vscode-jsonrpc's ril.js) references Node.js globals at the top level.
 *
 * Provides:
 * - `Buffer` — required by vscode-jsonrpc's node ril.js
 * - `process` — required by @github/copilot-sdk and other Node-oriented libs
 * - `setImmediate` — required by vscode-jsonrpc
 *
 * @since 0.0.28
 */

import { Buffer } from "buffer";

// ---- Buffer ----
if (typeof globalThis.Buffer === "undefined") {
	(globalThis as any).Buffer = Buffer;
}

// ---- process ----
if (typeof (globalThis as any).process === "undefined") {
	const isWindows = typeof navigator !== "undefined" &&
		navigator.platform.toLowerCase().includes("win");

	(globalThis as any).process = {
		env: {},
		platform: isWindows ? "win32" : "linux",
		arch: "x64",
		versions: {},
		cwd: () => "/",
		nextTick: (fn: (...args: any[]) => void, ...args: any[]) =>
			queueMicrotask(() => fn(...args)),
		stderr: { write: () => true },
		stdout: { write: () => true },
	};
}

// ---- setImmediate ----
if (typeof (globalThis as any).setImmediate === "undefined") {
	(globalThis as any).setImmediate = (
		fn: (...args: any[]) => void,
		...args: any[]
	) => setTimeout(fn, 0, ...args);
}
