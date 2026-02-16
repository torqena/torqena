/**
 * @module settings/utils
 * @description Utility functions for settings and model management.
 *
 * This module contains helper functions for model display names,
 * available models resolution, and other settings-related utilities.
 *
 * @since 0.0.1
 */

import type { CopilotPluginSettings } from "./types";
import { FALLBACK_MODELS } from "./defaults";

// ============================================================================
// Model Display Helpers
// ============================================================================

/**
 * Get display name for a model ID
 * Converts model IDs like "gpt-5.1-codex" to "GPT-5.1-Codex"
 */
export function getModelDisplayName(modelId: string): string {
	if (!modelId) return "Unknown";
	
	// Handle special cases
	if (modelId === "auto") return "Auto";
	
	// Capitalize and format
	return modelId
		.split('-')
		.map(part => {
			// Preserve version numbers like "4.5", "5.1"
			if (/^\d/.test(part)) return part;
			// Capitalize first letter, keep rest lowercase except known acronyms
			if (part.toLowerCase() === 'gpt') return 'GPT';
			if (part.toLowerCase() === 'mini') return 'Mini';
			if (part.toLowerCase() === 'max') return 'Max';
			if (part.toLowerCase() === 'preview') return '(Preview)';
			if (part.toLowerCase() === 'codex') return 'Codex';
			if (part.toLowerCase() === 'pro') return 'Pro';
			if (part.toLowerCase() === 'flash') return 'Flash';
			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join(' ')
		.replace(' (Preview)', ' (Preview)');
}

/**
 * Get available models from settings or fallback
 */
export function getAvailableModels(settings: CopilotPluginSettings): string[] {
	if (settings.availableModels && settings.availableModels.length > 0) {
		return settings.availableModels;
	}
	return FALLBACK_MODELS;
}
