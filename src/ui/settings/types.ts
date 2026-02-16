/**
 * @module settings/types
 * @description Type definitions and interfaces for Vault Copilot settings.
 *
 * This module contains all TypeScript interfaces and types for plugin configuration,
 * including session data, voice settings, AI provider profiles, and periodic notes.
 *
 * @see {@link CopilotPluginSettings} for the main settings interface
 * @see {@link AIProviderProfile} for provider configuration
 * @since 0.0.1
 */

import type { ChatMessage } from "../../ai/providers/GitHubCopilotCliService";
import type { AIProviderType } from "../../ai/providers/AIProvider";
import type { RealtimeToolConfig } from "../../ai/voice-chat";
import type { CliStatus } from "../../ai/providers/GitHubCopilotCliManager";

// ============================================================================
// Session Types
// ============================================================================

/**
 * Represents a saved chat session with conversation history.
 *
 * Sessions are persisted to plugin settings and can be archived,
 * restored, and managed through the session panel UI.
 *
 * @example
 * ```typescript
 * const session: CopilotSession = {
 *   id: 'session-123',
 *   name: 'Project Planning',
 *   createdAt: Date.now(),
 *   lastUsedAt: Date.now(),
 *   archived: false,
 *   messages: [],
 * };
 * ```
 *
 * @see {@link SessionManager} for session lifecycle management
 * @since 0.0.1
 */
export interface CopilotSession {
	/** Unique identifier for the session */
	id: string;
	/** Display name for the session */
	name: string;
	/** Timestamp when the session was created */
	createdAt: number;
	/** Timestamp when the session was last used */
	lastUsedAt: number;
	/** Timestamp when the session was completed (if applicable) */
	completedAt?: number;
	/** Duration of the session in milliseconds */
	durationMs?: number;
	/** Whether the session is archived */
	archived: boolean;
	/** Chat message history for the session */
	messages: ChatMessage[];
	/** Per-session tool overrides (enabled tools list, or undefined for defaults) */
	toolOverrides?: {
		/** If set, only these tools are enabled for this session */
		enabled?: string[];
		/** If set, these tools are disabled for this session */
		disabled?: string[];
	};
}

// ============================================================================
// Voice Types
// ============================================================================

/** Voice conversation for realtime agent history */
export interface VoiceConversation {
	id: string;
	name: string;
	createdAt: number;
	messages: VoiceMessage[];
}

/** Message in a voice conversation */
export interface VoiceMessage {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	timestamp: number;
	type?: 'message' | 'function_call' | 'function_call_output';
	toolName?: string;
	toolArgs?: string;
	toolOutput?: string;
}

// ============================================================================
// OpenAI Settings
// ============================================================================

export interface OpenAISettings {
	/** Whether OpenAI is enabled */
	enabled: boolean;
	/** Secret ID referencing the OpenAI API key stored in SecretStorage */
	apiKeySecretId?: string | null;
	/** OpenAI model to use */
	model: string;
	/** Base URL for OpenAI API (optional, for Azure or custom endpoints) */
	baseURL: string;
	/** Organization ID (optional) */
	organization: string;
	/** Max tokens for completion */
	maxTokens: number;
	/** Temperature (0-2) */
	temperature: number;
}

// ============================================================================
// AI Provider Profile Types
// ============================================================================

/** AI Provider Profile Types */
export type AIProviderProfileType = 'copilot' | 'openai' | 'azure-openai' | 'local';

/** Base interface for all AI Provider profiles */
export interface AIProviderProfileBase {
	/** Unique identifier for the profile */
	id: string;
	/** Display name for the profile */
	name: string;
	/** Provider type */
	type: AIProviderProfileType;
	/** Whether this profile is built-in and cannot be edited or removed */
	readonly?: boolean;
}

/** GitHub Copilot CLI provider profile */
export interface CopilotProviderProfile extends AIProviderProfileBase {
	type: 'copilot';
	/** This is the built-in GitHub Copilot CLI profile */
	readonly: true;
}

/** OpenAI provider profile configuration */
export interface OpenAIProviderProfile extends AIProviderProfileBase {
	type: 'openai';
	/** Secret ID referencing an OpenAI API key */
	apiKeySecretId?: string | null;
	/** Custom base URL (optional, for compatible APIs) */
	baseURL?: string;
	/** Selected model for this profile */
	model?: string;
}

/** Azure OpenAI provider profile configuration */
export interface AzureOpenAIProviderProfile extends AIProviderProfileBase {
	type: 'azure-openai';
	/** Secret ID referencing an Azure OpenAI API key */
	apiKeySecretId?: string | null;
	/** Azure OpenAI endpoint (e.g., https://your-resource.openai.azure.com) */
	endpoint: string;
	/** Deployment name for the model */
	deploymentName: string;
	/** API version (optional, defaults to 2024-06-01) */
	apiVersion?: string;
	/** Selected model for this profile */
	model?: string;
}

/** Local Whisper server profile configuration */
export interface LocalProviderProfile extends AIProviderProfileBase {
	type: 'local';
	/** Local server URL */
	serverUrl: string;
}

/** Union type for all AI Provider profiles */
export type AIProviderProfile = CopilotProviderProfile | OpenAIProviderProfile | AzureOpenAIProviderProfile | LocalProviderProfile;

/** Configuration for VoiceChatService derived from a profile */
export interface VoiceServiceConfigFromProfile {
	backend: 'openai-whisper' | 'azure-whisper' | 'local-whisper';
	openaiApiKeySecretId?: string;
	openaiBaseUrl?: string;
	azureApiKeySecretId?: string;
	azureEndpoint?: string;
	azureDeploymentName?: string;
	azureApiVersion?: string;
	whisperServerUrl?: string;
}

// ============================================================================
// Periodic Notes Types
// ============================================================================

/** Periodic note granularity */
export type PeriodicNoteGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/** Configuration for a single periodic note type */
export interface PeriodicNoteConfig {
	/** Whether this periodic note type is enabled */
	enabled: boolean;
	/** Date format for the filename (moment.js format) */
	format: string;
	/** Folder where notes are stored */
	folder: string;
	/** Path to the template file (optional) */
	templatePath?: string;
}

/** Periodic notes settings - compatible with obsidian-periodic-notes plugin */
export interface PeriodicNotesSettings {
	/** Daily notes configuration */
	daily: PeriodicNoteConfig;
	/** Weekly notes configuration */
	weekly: PeriodicNoteConfig;
	/** Monthly notes configuration */
	monthly: PeriodicNoteConfig;
	/** Quarterly notes configuration */
	quarterly: PeriodicNoteConfig;
	/** Yearly notes configuration */
	yearly: PeriodicNoteConfig;
}

// ============================================================================
// Main Settings Interface
// ============================================================================

/** Supported timezone identifiers (IANA Time Zone Database) */
export type TimezoneId = string; // e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'UTC'

/**
 * Day of the week for week start configuration.
 * Used for periodic notes and calendar calculations.
 */
export type WeekStartDay = 'sunday' | 'monday' | 'saturday';

/**
 * Main plugin settings interface containing all configuration options.
 *
 * This interface defines all user-configurable settings for the Vault Copilot plugin,
 * including AI provider selection, voice settings, periodic notes, and session management.
 *
 * Settings are persisted using Obsidian's `loadData`/`saveData` methods.
 *
 * @example
 * ```typescript
 * // Load settings with defaults
 * const settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
 *
 * // Access provider profile
 * const profile = getProfileById(settings, settings.chatProviderProfileId);
 * ```
 *
 * @see {@link DEFAULT_SETTINGS} for default values
 * @see {@link CopilotSettingsTab} for the settings UI
 * @since 0.0.1
 */
export interface CopilotPluginSettings {
	/** AI provider to use: 'copilot' or 'openai' */
	aiProvider: AIProviderType;
	model: string;
	cliPath: string;
	cliUrl: string;
	streaming: boolean;
	/** Request timeout in milliseconds (default: 120000 = 2 minutes) */
	requestTimeout: number;
	/** Preferred timezone (IANA identifier, e.g., 'America/New_York'). If empty, uses system default. */
	timezone: TimezoneId;
	/** First day of the week for calendar calculations */
	weekStartDay: WeekStartDay;
	/** Enable tracing to capture agent execution details */
	tracingEnabled: boolean;
	/** Log level for SDK logging when tracing is enabled */
	logLevel: 'debug' | 'info' | 'warn' | 'error';
	showInStatusBar: boolean;
	sessions: CopilotSession[];
	activeSessionId: string | null;
	/** Directories containing skill definition files */
	skillDirectories: string[];
	/** Directories containing custom agent definition files */
	agentDirectories: string[];
	/** Directories containing instruction files */
	instructionDirectories: string[];
	/** Directories containing prompt files */
	promptDirectories: string[];
	/** Default enabled tools (builtin tools enabled by default, MCP disabled by default) */
	defaultEnabledTools?: string[];
	/** Default disabled tools */
	defaultDisabledTools?: string[];
	/** AI Provider profiles for voice and chat services */
	aiProviderProfiles?: AIProviderProfile[];
	/** Selected profile ID for Chat (OpenAI/Azure OpenAI) */
	chatProviderProfileId?: string | null;
	/** Selected profile ID for Voice Input */
	voiceInputProfileId?: string | null;
	/** Selected profile ID for Realtime Voice Agent */
	realtimeAgentProfileId?: string | null;
	/** Selected model for Realtime Agent */
	realtimeAgentModel?: string;
	/** Voice chat settings */
	voice?: {
		/** Enable voice input (show mic button in chat) */
		voiceInputEnabled?: boolean;
		/** Voice backend: 'openai-whisper', 'azure-whisper', or 'local-whisper' */
		backend: 'openai-whisper' | 'azure-whisper' | 'local-whisper';
		/** URL of the local whisper.cpp server */
		whisperServerUrl: string;
		/** Language for voice recognition */
		language: string;
		/** Selected audio input device ID */
		audioDeviceId?: string;
		/** Selected audio model for voice input */
		audioModel?: string;
		/** Auto synthesize: read responses aloud when voice was used as input */
		autoSynthesize?: 'off' | 'on';
		/** Speech timeout in milliseconds (0 to disable) */
		speechTimeout?: number;
		/** Enable realtime voice agent */
		realtimeAgentEnabled?: boolean;
		/** Voice for realtime agent responses */
		realtimeVoice?: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer' | 'verse';
		/** Turn detection mode for realtime agent */
		realtimeTurnDetection?: 'semantic_vad' | 'server_vad';
		/** Language for speech recognition (ISO 639-1 code like 'en', 'es', 'fr') */
		realtimeLanguage?: string;
		/** Tool configuration for realtime agent */
		realtimeToolConfig?: RealtimeToolConfig;
		/** Directories to search for voice agent definition files (*.voice-agent.md) */
		voiceAgentDirectories?: string[];
		/** Per-agent definition file paths (takes precedence over directory scanning) */
		voiceAgentFiles?: {
			/** Main Vault Assistant definition file */
			mainAssistant?: string;
			/** Note Manager definition file */
			noteManager?: string;
			/** Task Manager definition file */
			taskManager?: string;
			/** WorkIQ agent definition file */
			workiq?: string;
		};
		/** Voice conversation history */
		conversations?: VoiceConversation[];
		/** Azure OpenAI settings for whisper */
		azure?: {
			/** Azure OpenAI endpoint (e.g., https://your-resource.openai.azure.com) */
			endpoint: string;
			/** Azure OpenAI deployment name for Whisper model */
			deploymentName: string;
			/** API version (default: 2024-06-01) */
			apiVersion?: string;
		};
	};
	/** OpenAI settings */
	openai: OpenAISettings;
	/** Periodic notes settings (daily, weekly, monthly, quarterly, yearly) */
	periodicNotes: PeriodicNotesSettings;
	/** Dynamically discovered available models from CLI */
	availableModels?: string[];
	/** Whether the CLI status check has run at least once */
	cliStatusChecked?: boolean;
	/** Last known CLI status from a successful check */
	cliLastKnownStatus?: CliStatus | null;
	/** Extension marketplace catalog URL */
	extensionCatalogUrl?: string;
	/** Enable anonymous extension analytics (install tracking, ratings) */
	enableAnalytics?: boolean;
	/** Custom analytics API endpoint URL */
	analyticsEndpoint?: string;
	/** GitHub username for rating attribution (hashed for privacy) */
	githubUsername?: string;
	/** Generated anonymous ID for users without GitHub username */
	anonymousId?: string;
}
