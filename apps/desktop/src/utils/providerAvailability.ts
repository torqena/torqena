/**
 * @module ProviderAvailability
 * @description Utilities for checking if any AI provider is properly configured.
 * 
 * This module provides functions to determine whether the user has at least one
 * working AI provider configured, which is required for the chat functionality.
 * 
 * ## Provider Requirements
 * 
 * | Provider | Desktop | Mobile | Requirements |
 * |----------|---------|--------|--------------|
 * | GitHub Copilot CLI | ✅ | ❌ | CLI installed |
 * | OpenAI | ✅ | ✅ | API key configured |
 * | Azure OpenAI | ✅ | ✅ | API key + endpoint configured |
 * 
 * @example
 * ```typescript
 * import { checkAnyProviderAvailable } from "./utils/providerAvailability";
 * 
 * const status = await checkAnyProviderAvailable(app, plugin.settings, cliManager);
 * if (!status.available) {
 *   // Show "No Provider" placeholder
 * }
 * ```
 * 
 * @see {@link GitHubCopilotCliManager} for CLI status checking
 * @see {@link AIProviderProfile} for profile configuration
 * @since 0.1.0
 */

import type { App } from "obsidian";
import type { CopilotPluginSettings, OpenAIProviderProfile, AzureOpenAIProviderProfile } from "../ui/settings/types";
import type { GitHubCopilotCliManager } from "../ai/providers/GitHubCopilotCliManager";
import { isDesktop } from "./platform";
import { getSecretValue } from "./secrets";
import { getOpenAIApiKey } from "../ai/providers/AIProvider";

/**
 * Result of provider availability check.
 */
export interface ProviderAvailabilityStatus {
	/** Whether at least one provider is available and configured */
	available: boolean;
	
	/** Details about each provider type */
	providers: {
		/** GitHub Copilot CLI status (desktop only) */
		copilot: {
			available: boolean;
			installed: boolean;
			platformSupported: boolean;
		};
		/** OpenAI status */
		openai: {
			available: boolean;
			hasApiKey: boolean;
			profileCount: number;
		};
		/** Azure OpenAI status */
		azureOpenai: {
			available: boolean;
			hasApiKey: boolean;
			profileCount: number;
		};
	};
}

/**
 * Check if any AI provider is properly configured and available.
 * 
 * This function checks:
 * - **Desktop**: GitHub Copilot CLI installed, OR OpenAI/Azure with API keys
 * - **Mobile**: OpenAI/Azure with API keys (Copilot CLI not available)
 * 
 * @param app - Obsidian App instance for secret storage access
 * @param settings - Plugin settings containing provider profiles
 * @param cliManager - CLI manager for checking Copilot CLI status (optional on mobile)
 * @returns Promise resolving to availability status
 * 
 * @example
 * ```typescript
 * const status = await checkAnyProviderAvailable(app, settings, cliManager);
 * if (status.available) {
 *   renderInputArea();
 * } else {
 *   renderNoProviderPlaceholder();
 * }
 * ```
 */
export async function checkAnyProviderAvailable(
	app: App,
	settings: CopilotPluginSettings,
	cliManager?: GitHubCopilotCliManager | null
): Promise<ProviderAvailabilityStatus> {
	const profiles = settings.aiProviderProfiles || [];
	
	// Check OpenAI profiles
	const openaiProfiles = profiles.filter(p => p.type === 'openai') as OpenAIProviderProfile[];
	const openaiHasKey = openaiProfiles.some(p => {
		const secretKey = getSecretValue(app, p.apiKeySecretId);
		const envKey = getOpenAIApiKey();
		return !!(secretKey || envKey);
	});
	
	// Check Azure OpenAI profiles
	const azureProfiles = profiles.filter(p => p.type === 'azure-openai') as AzureOpenAIProviderProfile[];
	const azureHasKey = azureProfiles.some(p => {
		const secretKey = getSecretValue(app, p.apiKeySecretId);
		// Check environment variable fallback
		let envKey: string | undefined;
		if (typeof process !== 'undefined' && process.env) {
			envKey = process.env.AZURE_OPENAI_KEY || process.env.AZURE_OPENAI_API_KEY;
		}
		return !!(secretKey || envKey);
	});
	
	// Check Copilot CLI (desktop only)
	let copilotInstalled = false;
	if (isDesktop && cliManager) {
		try {
			const status = await cliManager.getStatus();
			copilotInstalled = status.installed;
		} catch {
			copilotInstalled = false;
		}
	}
	
	const status: ProviderAvailabilityStatus = {
		available: false,
		providers: {
			copilot: {
				available: isDesktop && copilotInstalled,
				installed: copilotInstalled,
				platformSupported: isDesktop,
			},
			openai: {
				available: openaiHasKey,
				hasApiKey: openaiHasKey,
				profileCount: openaiProfiles.length,
			},
			azureOpenai: {
				available: azureHasKey,
				hasApiKey: azureHasKey,
				profileCount: azureProfiles.length,
			},
		},
	};
	
	// Available if ANY provider is ready
	status.available = 
		status.providers.copilot.available ||
		status.providers.openai.available ||
		status.providers.azureOpenai.available;
	
	return status;
}

/**
 * Synchronous check for provider availability (without CLI check).
 * 
 * Use this for quick checks when you don't need CLI status or when
 * the async version would cause issues. This only checks OpenAI/Azure profiles.
 * 
 * @param app - Obsidian App instance
 * @param settings - Plugin settings
 * @returns `true` if OpenAI or Azure has API keys configured
 */
export function hasAnyApiKeyConfigured(
	app: App,
	settings: CopilotPluginSettings
): boolean {
	const profiles = settings.aiProviderProfiles || [];
	
	// Check OpenAI
	const openaiProfiles = profiles.filter(p => p.type === 'openai') as OpenAIProviderProfile[];
	const openaiHasKey = openaiProfiles.some(p => {
		return !!(getSecretValue(app, p.apiKeySecretId) || getOpenAIApiKey());
	});
	if (openaiHasKey) return true;
	
	// Check Azure
	const azureProfiles = profiles.filter(p => p.type === 'azure-openai') as AzureOpenAIProviderProfile[];
	const azureHasKey = azureProfiles.some(p => {
		const secretKey = getSecretValue(app, p.apiKeySecretId);
		let envKey: string | undefined;
		if (typeof process !== 'undefined' && process.env) {
			envKey = process.env.AZURE_OPENAI_KEY || process.env.AZURE_OPENAI_API_KEY;
		}
		return !!(secretKey || envKey);
	});
	
	return azureHasKey;
}
