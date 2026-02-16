/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module sections
 * @description Barrel export for all settings tab sections.
 *
 * @since 0.0.15
 */

export { type SettingSectionContext, createCollapsibleSection, renderDirectoryList } from "./SectionHelpers";
export { renderCliStatusSection, type CliStatusState } from "./CliStatusSection";
export { renderChatPreferencesSection, type ChatPreferencesState } from "./ChatPreferencesSection";
export { renderAIProviderProfilesSection } from "./AIProviderProfilesSection";
export { renderDateTimeSection } from "./DateTimeSection";
export { renderPeriodicNotesSection } from "./PeriodicNotesSection";
export { renderWhisperCppSection, type WhisperCppState } from "./WhisperCppSection";
export { renderVoiceInputSection } from "./VoiceInputSection";
export { renderRealtimeAgentSection } from "./RealtimeAgentSection";
export { renderToolSelectionSection } from "./ToolSelectionSection";
export { renderSkillsMcpSection, type SkillsMcpState } from "./SkillsMcpSection";
export { renderAutomationsSection } from "./AutomationsSection";
export { renderAdvancedSettings, renderVaultSetupSection, renderHelpSection } from "./AdvancedSettingsSection";
