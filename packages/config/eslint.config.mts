import tseslint from 'typescript-eslint';
import type { ConfigArray } from 'typescript-eslint';
import globals from "globals";

/**
 * @module eslint-config
 * @description Shared ESLint configuration for the Torqena monorepo.
 *
 * Exports a reusable TSESLint flat config array. Workspace-specific
 * ignores and tsconfigRootDir should be set in the consuming config.
 *
 * @example
 * ```ts
 * // In root eslint.config.mts
 * import { sharedRules, recommendedConfigs } from '@torqena/config/eslint.config.mts';
 * ```
 *
 * @since 0.1.0
 */

/** Recommended base configs from typescript-eslint. */
export const recommendedConfigs = tseslint.configs.recommended;

/** Shared TypeScript rules for all workspaces. */
export const sharedRules: ConfigArray[number] = {
	files: ["**/*.ts", "**/*.tsx"],
	languageOptions: {
		globals: {
			...globals.browser,
			...globals.node,
		},
	},
	rules: {
		// TypeScript rules - Configure for gradual cleanup
		"@typescript-eslint/no-unused-vars": ["warn", { 
			argsIgnorePattern: "^_",
			varsIgnorePattern: "^_" 
		}],
		"@typescript-eslint/no-explicit-any": "warn",
		"@typescript-eslint/explicit-module-boundary-types": "off",
		"@typescript-eslint/no-non-null-assertion": "warn",
		"@typescript-eslint/no-empty-object-type": "off",
		"@typescript-eslint/no-unused-expressions": "off",
		"@typescript-eslint/no-this-alias": "warn",
		"prefer-const": "warn",
	},
};

export { tseslint, globals };
