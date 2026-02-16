/**
 * @module ChatView
 * @description Main chat view module for Vault Copilot.
 * 
 * This module contains all components related to the main chat view:
 * 
 * ## Submodules
 * - **modals/** - Modal dialogs (TracingModal, ToolPickerModal, etc.)
 * - **pickers/** - Dropdown pickers (ContextPicker, PromptPicker)
 * - **renderers/** - Rendering utilities (MessageRenderer, WelcomeMessage)
 * 
 * ## Main Components
 * - **CopilotChatView** - The main chat view component
 * - **SessionPanel** - Session management panel
 * - **SessionManager** - Session state management
 * 
 * @since 0.0.14
 */

// Main view component
export { CopilotChatView, COPILOT_VIEW_TYPE } from "./CopilotChatView";

// Components
export { SessionPanel } from "./components/SessionPanel";
export type { SessionPanelCallbacks } from "./components/SessionPanel";
export { NoProviderPlaceholder } from "./components/NoProviderPlaceholder";
export type { NoProviderPlaceholderCallbacks } from "./components/NoProviderPlaceholder";
export * from "./components/iconSvgs";

// Managers
export { SessionManager } from "./managers/SessionManager";
export type { SessionManagerCallbacks } from "./managers/SessionManager";
export { VoiceManager } from "./managers/VoiceManager";
export type { VoiceManagerCallbacks } from "./managers/VoiceManager";
export { RealtimeAgentManager } from "./managers/RealtimeAgentManager";
export type { RealtimeAgentCallbacks } from "./managers/RealtimeAgentManager";
export { ToolbarManager } from "./managers/ToolbarManager";
export type { ToolbarCallbacks } from "./managers/ToolbarManager";
export { PromptExecutor } from "./managers/PromptExecutor";
export type { PromptExecutorCallbacks } from "./managers/PromptExecutor";
export { InputAreaManager } from "./managers/InputAreaManager";

// Processing
export { PromptProcessor } from "./processing/PromptProcessor";
export { SLASH_COMMANDS } from "./processing/SlashCommands";
export type { SlashCommand } from "./processing/SlashCommands";

// Modals
export * from "./modals";

// Pickers
export * from "./pickers";

// Renderers
export * from "./renderers";
