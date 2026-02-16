/**
 * @module settings/profiles
 * @description AI Provider profile management utilities.
 *
 * This module contains helper functions for managing AI provider profiles,
 * including creation, retrieval, validation, and configuration mapping.
 *
 * @see {@link AIProviderProfile} for profile type definitions
 * @since 0.0.1
 */

import { App } from "obsidian";
import { getOpenAIApiKey } from "../../ai/providers/AIProvider";
import { getSecretValue } from "../../utils/secrets";
import type {
	CopilotPluginSettings,
	AIProviderProfile,
	AIProviderProfileType,
	CopilotProviderProfile,
	OpenAIProviderProfile,
	AzureOpenAIProviderProfile,
	LocalProviderProfile,
	VoiceServiceConfigFromProfile,
} from "./types";

// ============================================================================
// Profile ID Generation
// ============================================================================

/** Generate a unique profile ID */
export function generateProfileId(): string {
	return `profile-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// Built-in Profile Management
// ============================================================================

/** Get the built-in GitHub Copilot CLI profile */
export function getBuiltInCopilotProfile(): CopilotProviderProfile {
	return {
		id: 'builtin-copilot',
		name: 'GitHub Copilot CLI',
		type: 'copilot',
		readonly: true,
	};
}

/** Ensure the built-in GitHub Copilot CLI profile exists in settings */
export function ensureBuiltInProfiles(settings: CopilotPluginSettings): void {
	if (!settings.aiProviderProfiles) {
		settings.aiProviderProfiles = [];
	}
	
	// Check if built-in Copilot profile exists
	const hasCopilotProfile = settings.aiProviderProfiles.some(p => p.id === 'builtin-copilot');
	if (!hasCopilotProfile) {
		settings.aiProviderProfiles.unshift(getBuiltInCopilotProfile());
	}
}

// ============================================================================
// Profile Retrieval
// ============================================================================

/** Get a profile by ID from the settings */
export function getProfileById(settings: CopilotPluginSettings, id: string | null | undefined): AIProviderProfile | undefined {
	if (!id || !settings.aiProviderProfiles) return undefined;
	return settings.aiProviderProfiles.find(p => p.id === id);
}

/** Get all profiles of a specific type */
export function getProfilesByType(settings: CopilotPluginSettings, type: AIProviderProfileType): AIProviderProfile[] {
	if (!settings.aiProviderProfiles) return [];
	return settings.aiProviderProfiles.filter(p => p.type === type);
}

/** Get OpenAI profiles only (for Realtime Agent which only supports OpenAI) */
export function getOpenAIProfiles(settings: CopilotPluginSettings): OpenAIProviderProfile[] {
	return getProfilesByType(settings, 'openai') as OpenAIProviderProfile[];
}

// ============================================================================
// Profile Display Helpers
// ============================================================================

/** Get display name for profile type */
export function getProfileTypeDisplayName(type: AIProviderProfileType): string {
	switch (type) {
		case 'copilot': return 'GitHub Copilot CLI';
		case 'openai': return 'OpenAI';
		case 'azure-openai': return 'Azure OpenAI';
		case 'local': return 'Local Whisper';
		default: return type;
	}
}

/** Map profile type to voice backend type */
export function profileTypeToBackend(type: AIProviderProfileType): 'openai-whisper' | 'azure-whisper' | 'local-whisper' {
	switch (type) {
		case 'openai': return 'openai-whisper';
		case 'azure-openai': return 'azure-whisper';
		case 'local': return 'local-whisper';
		default: return 'openai-whisper';
	}
}

// ============================================================================
// Voice Service Configuration
// ============================================================================

/**
 * Get VoiceChatService configuration from a profile
 * Returns null if no profile is found
 */
export function getVoiceServiceConfigFromProfile(
	settings: CopilotPluginSettings,
	profileId: string | null | undefined
): VoiceServiceConfigFromProfile | null {
	const profile = getProfileById(settings, profileId);
	if (!profile) return null;

	const config: VoiceServiceConfigFromProfile = {
		backend: profileTypeToBackend(profile.type),
	};

	if (profile.type === 'openai') {
		const openai = profile as OpenAIProviderProfile;
		config.openaiApiKeySecretId = openai.apiKeySecretId || undefined;
		config.openaiBaseUrl = openai.baseURL || undefined;
	} else if (profile.type === 'azure-openai') {
		const azure = profile as AzureOpenAIProviderProfile;
		config.azureApiKeySecretId = azure.apiKeySecretId || undefined;
		config.azureEndpoint = azure.endpoint;
		config.azureDeploymentName = azure.deploymentName;
		config.azureApiVersion = azure.apiVersion;
	} else if (profile.type === 'local') {
		const local = profile as LocalProviderProfile;
		config.whisperServerUrl = local.serverUrl;
	}

	return config;
}

// ============================================================================
// API Key Resolution
// ============================================================================

/** Resolve the OpenAI API key for a provider profile (secret + env fallback). */
export function getOpenAIProfileApiKey(app: App, profile?: OpenAIProviderProfile | null): string | undefined {
	return getSecretValue(app, profile?.apiKeySecretId) || getOpenAIApiKey();
}

/** Resolve the Azure OpenAI API key for a provider profile (secret + env fallback). */
export function getAzureProfileApiKey(app: App, profile?: AzureOpenAIProviderProfile | null): string | undefined {
	const secret = getSecretValue(app, profile?.apiKeySecretId);
	if (secret) {
		return secret;
	}
	if (typeof process !== 'undefined' && process.env) {
		return process.env.AZURE_OPENAI_KEY || process.env.AZURE_OPENAI_API_KEY;
	}
	return undefined;
}

/** Resolve the legacy OpenAI API key stored under plugin settings + env fallback. */
export function getLegacyOpenAIKey(app: App, settings: CopilotPluginSettings): string | undefined {
	return getSecretValue(app, settings.openai?.apiKeySecretId) || getOpenAIApiKey();
}
