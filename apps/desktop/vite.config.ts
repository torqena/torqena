import { defineConfig } from "vitest/config";
import type { Plugin as EsbuildPlugin } from "esbuild";
import path from "path";

// Stubs are in src/stubs
const stub = (name: string) => path.resolve(__dirname, `src/stubs/${name}.ts`);

/** Map Node built-in specifiers to our IPC-backed stubs during esbuild prebundling. */
const nodeBuiltinAliases: Record<string, string> = {
	"node:child_process": stub("child_process"),
	child_process: stub("child_process"),
	"node:fs/promises": stub("fs_promises"),
	"fs/promises": stub("fs_promises"),
	"node:fs": stub("fs"),
	fs: stub("fs"),
	"node:path": stub("path"),
	path: stub("path"),
	"node:os": stub("os"),
	os: stub("os"),
	"node:util": stub("util"),
	util: stub("util"),
	"node:http": stub("http"),
	http: stub("http"),
	"node:https": stub("https"),
	https: stub("https"),
	"node:net": stub("net"),
	net: stub("net"),
	"node:crypto": stub("crypto"),
	crypto: stub("crypto"),
	"node:url": stub("url"),
	url: stub("url"),
};

const nodeBuiltinFilter = /^(node:)?(child_process|fs\/promises|fs|path|os|util|http|https|net|crypto|url)$/;

/**
 * Resolve path to the real Node entry of vscode-jsonrpc, bypassing the
 * package's "browser" field that redirects lib/node/main → lib/browser/main.
 * The SDK needs StreamMessageReader/StreamMessageWriter which only exist in
 * the Node entry.
 */
const jsonrpcNodeMain = path.resolve(
	__dirname, "../../node_modules/vscode-jsonrpc/lib/node/main.js",
);

const esbuildNodeStubPlugin: EsbuildPlugin = {
	name: "node-builtin-stubs",
	setup(build) {
		// Redirect Node built-in imports to our IPC-backed stubs
		build.onResolve({ filter: nodeBuiltinFilter }, (args) => {
			const resolved = nodeBuiltinAliases[args.path];
			if (resolved) return { path: resolved };
			return null;
		});

		// Force vscode-jsonrpc to use the Node entry (not browser)
		build.onResolve({ filter: /vscode-jsonrpc[\/\\]node/ }, () => {
			return { path: jsonrpcNodeMain };
		});
		// Internal ./ril require inside lib/node/main.js must also stay on node path
		build.onResolve({ filter: /^\.\/ril$/ }, (args) => {
			if (args.resolveDir.replace(/\\/g, "/").includes("vscode-jsonrpc/lib/node")) {
				return { path: path.resolve(args.resolveDir, "ril.js") };
			}
			return null;
		});
	},
};

const isTest = !!process.env.VITEST;

export default defineConfig({
	root: "src",
	base: "./", // Relative paths for Electron file:// protocol
	optimizeDeps: {
		esbuildOptions: {
			plugins: [esbuildNodeStubPlugin],
		},
	},
	server: {
		fs: {
			allow: [__dirname],
		},
	},
	resolve: {
		alias: {
			// In test mode, use the mock; at runtime, use the platform shim
			obsidian: isTest
				? path.resolve(__dirname, "src/__mocks__/platform.ts")
				: path.resolve(__dirname, "src/platform/index.ts"),
			// Force vscode-jsonrpc to use the Node entry (has StreamMessageReader)
			"vscode-jsonrpc/node.js": jsonrpcNodeMain,
			"vscode-jsonrpc/node": jsonrpcNodeMain,
			// Lucide ESM entry for proper bundling
			"lucide": path.resolve(__dirname, "../../node_modules/lucide/dist/esm/lucide/src/lucide.js"),
			// Node.js built-in stubs for browser (only in non-test mode)
			...(isTest ? {} : nodeBuiltinAliases),
		},
	},
	build: {
		outDir: path.resolve(__dirname, "dist"),
		sourcemap: true,
	},
	test: {
		globals: true,
		environment: "node",
		include: ["tests/**/*.test.ts"],
		setupFiles: ["./tests/setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["realtime-agent/**/*.ts"],
			exclude: ["tests/**/*.ts", "realtime-agent/index.ts"],
		},
	},
});
