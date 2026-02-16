/**
 * @module Modals
 * @description Settings modals for Torqena configuration.
 *
 * This module exports modals used in the settings interface for:
 * - Creating and managing secrets (API keys)
 * - Configuring AI Provider profiles
 * - Adding HTTP MCP servers
 *
 * @example
 * ```typescript
 * import { AIProviderProfileModal, AddHttpMcpServerModal } from './modals';
 *
 * // Create a new AI provider profile
 * const modal = new AIProviderProfileModal(app, null, (profile) => {
 *   settings.aiProviderProfiles.push(profile);
 * });
 * modal.open();
 * ```
 *
 * @see {@link CopilotSettingTab} for the main settings interface
 * @since 0.0.1
 */

export { SecretCreationModal, type SecretCreationOptions } from "./SecretCreationModal";
export { AIProviderProfileModal } from "./AIProviderProfileModal";
export { AddHttpMcpServerModal } from "./AddHttpMcpServerModal";
export { AutomationScheduleModal } from "./AutomationScheduleModal";
export { AutomationHistoryModal } from "./AutomationHistoryModal";
