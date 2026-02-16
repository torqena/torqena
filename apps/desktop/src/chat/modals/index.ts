/**
 * @module modals
 * @description Modal dialogs for the ChatView.
 * 
 * - **ConversationHistoryModal** - Voice conversation history viewer
 * - **NoteSuggestModal** - Note file picker
 * - **PromptInputModal** - Prompt variable input dialog
 * - **ToolPickerModal** - Tool selection dialog
 * - **TracingModal** - SDK diagnostics/tracing viewer
 * 
 * @since 0.0.14
 */

export { TracingModal, TracingView, TRACING_VIEW_TYPE, openTracingPopout } from "./TracingModal";
export { ConversationHistoryModal, ConversationHistoryView, VOICE_HISTORY_VIEW_TYPE, openVoiceHistoryPopout } from "./ConversationHistoryModal";
export { ToolPickerModal } from "./ToolPickerModal";
export type { ToolPickerModalOptions } from "./ToolPickerModal";
export { NoteSuggestModal } from "./NoteSuggestModal";
export { PromptInputModal, parseInputVariables } from "./PromptInputModal";
