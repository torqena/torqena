/**
 * @module Secrets
 * @description Utility helpers for interacting with Obsidian SecretStorage.
 * 
 * This module provides safe wrappers for reading secrets from Obsidian's
 * SecretStorage API, which securely stores sensitive data like API keys
 * in the operating system's keychain.
 * 
 * ## Key Features
 * 
 * - **Safe Access**: Graceful fallback when SecretStorage is unavailable
 * - **Cross-Platform**: Works on desktop and mobile (where supported)
 * - **Error Handling**: Catches and logs errors without throwing
 * 
 * ## Usage Pattern
 * 
 * Store secrets using Obsidian's SecretStorage directly, then retrieve
 * them using this module's helpers:
 * 
 * @example
 * ```typescript
 * // Storing a secret (done in settings UI)
 * app.secretStorage.setSecret("openai-api-key", "sk-...");
 * 
 * // Retrieving a secret safely
 * import { getSecretValue } from "./utils/secrets";
 * const apiKey = getSecretValue(app, "openai-api-key");
 * if (apiKey) {
 *   // Use the API key
 * }
 * ```
 * 
 * @see {@link AIProviderProfile} for profile-based secret management
 * @since 0.0.14
 */
import type { App } from 'obsidian';

/**
 * Safely read a secret value from Obsidian's SecretStorage.
 * 
 * This function gracefully handles cases where:
 * - The app instance is null/undefined
 * - The secretId is null/undefined
 * - SecretStorage is not available (older Obsidian versions)
 * - The secret doesn't exist
 * - An error occurs during retrieval
 * 
 * @param app - The Obsidian App instance (can be null/undefined)
 * @param secretId - The secret identifier to retrieve (can be null/undefined)
 * @returns The secret value if found, `undefined` otherwise
 * 
 * @example
 * ```typescript
 * // Safe retrieval with fallback
 * const apiKey = getSecretValue(app, profile?.apiKeySecretId) 
 *   || process.env.OPENAI_API_KEY;
 * 
 * // Check before use
 * const secret = getSecretValue(app, "my-secret");
 * if (!secret) {
 *   console.warn("Secret not configured");
 * }
 * ```
 */
export function getSecretValue(app: App | null | undefined, secretId?: string | null): string | undefined {
	if (!app || !secretId) {
		return undefined;
	}

	try {
		return app.secretStorage?.getSecret(secretId) ?? undefined;
	} catch (error) {
		console.error(`[SecretStorage] Failed to read secret "${secretId}":`, error);
		return undefined;
	}
}
