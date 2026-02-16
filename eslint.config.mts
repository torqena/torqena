import { tseslint, recommendedConfigs, sharedRules } from './packages/config/eslint.config.mts';
import type { ConfigArray } from 'typescript-eslint';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default tseslint.config(
	{
		ignores: [
			"node_modules/**",
			"**/node_modules/**",
			"**/dist/**",
			"coverage/**",
			"**/*.mjs",
			"**/*.cjs",
			"**/*.js",
			"test-vault/**",
			"examples/**",
			"scripts/**",
			"apps/desktop/vite.config.ts",
			"apps/desktop/src/tests/**",
			"apps/desktop/src/__mocks__/**",
			"_site/**",
			"apps/api/**",
		],
	},
	...recommendedConfigs,
	sharedRules,
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: __dirname,
			},
		},
	}
) satisfies ConfigArray;
