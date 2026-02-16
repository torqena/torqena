/**
 * @module renderers
 * @description Rendering utilities for the ChatView.
 * 
 * - **MessageRenderer** - Chat message rendering
 * - **ToolExecutionRenderer** - Tool call output rendering
 * - **WelcomeMessage** - Welcome screen content
 * 
 * @since 0.0.14
 */

export { MessageRenderer } from "./MessageRenderer";
export type { UsedReference } from "./MessageRenderer";
export { ToolExecutionRenderer } from "./ToolExecutionRenderer";
export type { ToolExecutionCallback } from "./ToolExecutionRenderer";
export { 
	renderWelcomeMessage, 
	WELCOME_CAPABILITIES, 
	WELCOME_EXAMPLES 
} from "./WelcomeMessage";
export type { WelcomeExample } from "./WelcomeMessage";
