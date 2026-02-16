// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module Settings
 * @description Plugin settings, configuration interfaces, and settings UI for Vault Copilot.
 *
 * This module provides the settings infrastructure for Vault Copilot, including:
 * - Type definitions for all configuration options
 * - AI Provider profile types and management utilities
 * - Periodic notes configuration
 * - Voice/realtime agent settings
 * - Settings tab UI implementation
 * - Modals for profile creation and MCP server management
 *
 * ## Module Structure
 *
 * The settings module is organized into several sub-modules:
 * - `types.ts` - All TypeScript interfaces and type definitions
 * - `defaults.ts` - Default values and constants
 * - `profiles.ts` - AI Provider profile management utilities
 * - `utils.ts` - Model display and utility functions
 * - `modals/` - Modal dialogs for settings UI
 *
 * ## Usage
 *
 * ```typescript
 * import {
 *   CopilotPluginSettings,
 *   DEFAULT_SETTINGS,
 *   AIProviderProfile,
 *   getProfileById,
 *   getModelDisplayName,
 * } from './ui/settings';
 * ```
 *
 * @see {@link CopilotPlugin} for the main plugin implementation
 * @since 0.0.1
 */

// Re-export types
export type {
	CopilotSession,
	VoiceConversation,
	VoiceMessage,
	OpenAISettings,
	AIProviderProfileType,
	AIProviderProfileBase,
	CopilotProviderProfile,
	OpenAIProviderProfile,
	AzureOpenAIProviderProfile,
	LocalProviderProfile,
	AIProviderProfile,
	VoiceServiceConfigFromProfile,
	PeriodicNoteGranularity,
	PeriodicNoteConfig,
	PeriodicNotesSettings,
	TimezoneId,
	WeekStartDay,
	CopilotPluginSettings,
} from "./types";

// Re-export defaults
export {
	DEFAULT_PERIODIC_NOTES,
	DEFAULT_SETTINGS,
	FALLBACK_MODELS,
	COPILOT_LOGO_DATA_URL,
} from "./defaults";

// Re-export profile utilities
export {
	generateProfileId,
	getBuiltInCopilotProfile,
	ensureBuiltInProfiles,
	getProfileById,
	getProfilesByType,
	getOpenAIProfiles,
	getProfileTypeDisplayName,
	profileTypeToBackend,
	getVoiceServiceConfigFromProfile,
	getOpenAIProfileApiKey,
	getAzureProfileApiKey,
	getLegacyOpenAIKey,
} from "./profiles";

// Re-export utility functions
export {
	getModelDisplayName,
	getAvailableModels,
} from "./utils";

// Re-export modals
export {
	SecretCreationModal,
	type SecretCreationOptions,
	AIProviderProfileModal,
	AddHttpMcpServerModal,
} from "./modals";
export {
	CopilotSettingTab,
	COPILOT_SETTINGS_TABS,
	type CopilotSettingsSection,
	type CopilotSettingsTabDescriptor,
} from "./CopilotSettingTab";
