import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["tests/**/*.test.ts"],
		setupFiles: ["./tests/setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/realtime-agent/**/*.ts"],
			exclude: ["tests/**/*.ts", "src/realtime-agent/index.ts"],
		},
	},
	resolve: {
		alias: {
			obsidian: "./src/__mocks__/platform.ts",
		},
	},
});
