// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module VoiceConversationStore
 * @description CRUD operations for voice conversations stored in plugin settings.
 *
 * Manages the lifecycle of voice conversations created during realtime agent sessions.
 * Conversations are persisted in plugin settings and can be viewed in the conversation
 * history modal.
 *
 * Also provides static utility methods for parsing realtime agent history items,
 * including detection of system context messages and tool call parsing.
 *
 * @see {@link RealtimeAgentManager} for the agent that creates conversations
 * @see {@link ConversationHistoryModal} for the history viewer
 * @since 0.0.15
 */

import { App } from "obsidian";
import { CopilotPluginSettings, VoiceConversation, VoiceMessage } from "../../ui/settings";
import { RealtimeHistoryItem } from "../../ai/voice-chat";
import { openVoiceHistoryPopout } from "../modals/ConversationHistoryModal";

/**
 * Manages voice conversation persistence and provides parsing utilities
 */
export class VoiceConversationStore {
	private settings: CopilotPluginSettings;
	private saveSettings: () => Promise<void>;
	private currentVoiceConversationId: string | null = null;

	constructor(
		settings: CopilotPluginSettings,
		saveSettings: () => Promise<void>
	) {
		this.settings = settings;
		this.saveSettings = saveSettings;
	}

	/**
	 * Get the current conversation ID (null if none active)
	 */
	getCurrentConversationId(): string | null {
		return this.currentVoiceConversationId;
	}

	/**
	 * Start a new voice conversation and return its ID
	 */
	startNewConversation(): string {
		const id = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const now = Date.now();

		// Create the conversation in settings
		if (!this.settings.voice) {
			this.settings.voice = {
				backend: 'openai-whisper',
				whisperServerUrl: 'http://127.0.0.1:8080',
				language: 'auto',
				conversations: []
			};
		}
		if (!this.settings.voice.conversations) {
			this.settings.voice.conversations = [];
		}

		const conversation: VoiceConversation = {
			id,
			name: `Voice Chat ${new Date(now).toLocaleString()}`,
			createdAt: now,
			messages: []
		};

		this.settings.voice.conversations.push(conversation);
		this.currentVoiceConversationId = id;
		this.saveSettings();

		console.log(`[VoiceHistory] Started new conversation: ${id}`);
		return id;
	}

	/**
	 * Update current voice conversation with history from realtime agent
	 */
	updateConversation(history: RealtimeHistoryItem[]): void {
		if (!this.currentVoiceConversationId) return;

		const conversations = this.settings.voice?.conversations;
		if (!conversations) return;

		const convIndex = conversations.findIndex(c => c.id === this.currentVoiceConversationId);
		if (convIndex === -1) return;

		const conv = conversations[convIndex];
		if (!conv) return;

		// Debug: Log all history items we receive
		console.log('[VoiceHistory] Received history items:', history.length);
		for (const item of history) {
			console.log('[VoiceHistory] Item:', item.type, item.role,
				item.content?.substring(0, 50) || item.transcript?.substring(0, 50) || '(no content)');
		}

		// Convert history items to voice messages
		const messages: VoiceMessage[] = [];
		const baseTimestamp = conv.createdAt;

		for (let i = 0; i < history.length; i++) {
			const item = history[i];
			if (!item) continue;

			const text = item.content || item.transcript || '';

			// Skip system context messages (injected context)
			if (VoiceConversationStore.isSystemContextMessage(text)) {
				continue;
			}

			// Determine the message type
			const messageType = item.type || 'message';

			// For function calls, create a tool message
			if (messageType === 'function_call') {
				if (item.name) {
					messages.push({
						role: 'assistant',
						content: '',
						timestamp: baseTimestamp + (i * 1000),
						type: 'function_call',
						toolName: item.name,
						toolArgs: item.arguments || ''
					});
				}
				continue;
			}

			// For function call outputs
			if (messageType === 'function_call_output') {
				if (item.output) {
					messages.push({
						role: 'system',
						content: '',
						timestamp: baseTimestamp + (i * 1000),
						type: 'function_call_output',
						toolOutput: item.output
					});
				}
				continue;
			}

			// Regular message - determine role from item
			const role = item.role || 'assistant';
			const content = item.content || item.transcript || '';

			// Skip empty messages
			if (!content.trim()) {
				continue;
			}

			// Log user messages specifically for debugging
			if (role === 'user') {
				console.log('[VoiceHistory] Captured user message:', content.substring(0, 100));
			}

			// Check if assistant message looks like a tool call (JSON or function syntax)
			if (role === 'assistant' && VoiceConversationStore.looksLikeToolCall(content)) {
				// Parse to extract tool name and args
				const parsed = VoiceConversationStore.parseToolCall(content);
				if (parsed) {
					messages.push({
						role: 'tool',  // Use 'tool' role to distinguish in history
						content: '',
						timestamp: baseTimestamp + (i * 1000),
						type: 'function_call',
						toolName: parsed.toolName,
						toolArgs: parsed.args
					});
					continue;
				}
			}

			messages.push({
				role: role,
				content: content,
				timestamp: baseTimestamp + (i * 1000),
				type: 'message'
			});
		}

		console.log('[VoiceHistory] Converted to', messages.length, 'messages');

		// Update the conversation
		conv.messages = messages;
		this.saveSettings();
	}

	/**
	 * Add a user transcription to the current voice conversation.
	 * Called separately from historyUpdated since user transcriptions
	 * come through a different event in the Realtime API.
	 */
	addUserTranscription(item: RealtimeHistoryItem): void {
		if (!this.currentVoiceConversationId) return;

		const conversations = this.settings.voice?.conversations;
		if (!conversations) return;

		const convIndex = conversations.findIndex(c => c.id === this.currentVoiceConversationId);
		if (convIndex === -1) return;

		const conv = conversations[convIndex];
		if (!conv) return;

		const content = item.content || item.transcript || '';
		if (!content.trim() || VoiceConversationStore.isSystemContextMessage(content)) {
			return;
		}

		console.log('[VoiceHistory] Adding user transcription:', content.substring(0, 100));

		// Add to messages array
		conv.messages.push({
			role: 'user',
			content: content,
			timestamp: Date.now(),
			type: 'message'
		});

		this.saveSettings();
	}

	/**
	 * Save and close the current conversation.
	 * Removes empty conversations automatically.
	 */
	saveCurrentConversation(): void {
		if (!this.currentVoiceConversationId) return;

		const conversations = this.settings.voice?.conversations;
		if (!conversations) return;

		const conv = conversations.find(c => c.id === this.currentVoiceConversationId);
		if (conv && conv.messages.length === 0) {
			// Remove empty conversations
			const idx = conversations.indexOf(conv);
			if (idx > -1) {
				conversations.splice(idx, 1);
			}
		}

		this.saveSettings();
		this.currentVoiceConversationId = null;
		console.log(`[VoiceHistory] Saved conversation`);
	}

	/**
	 * Open the voice history popout modal
	 */
	openHistory(app: App): void {
		const conversations = this.settings.voice?.conversations || [];

		openVoiceHistoryPopout(
			app,
			conversations,
			(id: string) => this.deleteConversation(id),
			() => this.deleteAll()
		);
	}

	/**
	 * Delete a single conversation by ID
	 */
	deleteConversation(id: string): void {
		if (!this.settings.voice?.conversations) return;

		const idx = this.settings.voice.conversations.findIndex(c => c.id === id);
		if (idx > -1) {
			this.settings.voice.conversations.splice(idx, 1);
			this.saveSettings();
		}
	}

	/**
	 * Delete all conversations
	 */
	deleteAll(): void {
		if (this.settings.voice) {
			this.settings.voice.conversations = [];
			this.saveSettings();
		}
	}

	/**
	 * Check if a message is system context that should be hidden
	 */
	static isSystemContextMessage(text: string): boolean {
		if (!text) return false;

		// Common patterns for system context messages
		const systemPatterns = [
			'[SYSTEM CONTEXT',
			'DO NOT RESPOND TO THIS',
			'[Context Update]',
			'The user is currently looking at a note',
			'The user switched to a different note',
			'Here is its content:',
			'[Content truncated...]'
		];

		for (const pattern of systemPatterns) {
			if (text.includes(pattern)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if content looks like a JSON tool call response or function-call syntax
	 */
	static looksLikeToolCall(content: string): boolean {
		if (!content) return false;
		const trimmed = content.trim();

		// Check for function-call syntax (e.g., "update_checklist_item(...)")
		if (trimmed.match(/^\w+\s*\(/)) {
			return true;
		}

		// Check for JSON object or array start
		if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
			try {
				JSON.parse(trimmed);
				return true;
			} catch {
				// Not valid JSON, but might still be partial JSON
				return trimmed.startsWith('{') && trimmed.includes('"');
			}
		}

		return false;
	}

	/**
	 * Parse a tool call to extract tool name and arguments.
	 * Handles both JSON format and function-call syntax.
	 */
	static parseToolCall(content: string): { toolName: string; args: string } | null {
		const trimmed = content.trim();

		// Check for function-call syntax first (e.g., "update_checklist_item(...)")
		const funcMatch = trimmed.match(/^(\w+)\s*\(([\s\S]*)\)$/);
		if (funcMatch) {
			const toolName = funcMatch[1] || 'unknown_tool';
			const argsContent = funcMatch[2] || '';

			// Try to parse the args into a more readable format
			// Format: note_path="...", item_text="...", checked=True
			const args: Record<string, string> = {};
			const argMatches = argsContent.matchAll(/(\w+)\s*=\s*["']?([^"',\n]+)["']?/g);
			for (const match of argMatches) {
				if (match[1] && match[2]) {
					args[match[1]] = match[2].trim();
				}
			}

			return {
				toolName,
				args: Object.keys(args).length > 0 ? JSON.stringify(args, null, 2) : argsContent
			};
		}

		// Try JSON parsing
		try {
			const parsed = JSON.parse(trimmed);

			// Try common JSON tool call formats
			// Format 1: { "tool": "name", "args": {...} }
			if (parsed.tool && typeof parsed.tool === 'string') {
				return {
					toolName: parsed.tool,
					args: JSON.stringify(parsed.args || parsed.arguments || parsed, null, 2)
				};
			}

			// Format 2: { "name": "tool_name", "arguments": {...} }
			if (parsed.name && typeof parsed.name === 'string') {
				return {
					toolName: parsed.name,
					args: JSON.stringify(parsed.arguments || parsed.args || parsed, null, 2)
				};
			}

			// Format 3: { "action": "tool_name", ... }
			if (parsed.action && typeof parsed.action === 'string') {
				return {
					toolName: parsed.action,
					args: JSON.stringify(parsed, null, 2)
				};
			}

			// Format 4: Just a JSON object that looks like a response
			const keys = Object.keys(parsed);
			if (keys.length > 0) {
				if (parsed.result || parsed.output || parsed.data || parsed.response) {
					return {
						toolName: 'json_response',
						args: JSON.stringify(parsed, null, 2)
					};
				}
			}

			// Default: treat any JSON as a tool response
			return {
				toolName: 'structured_output',
				args: JSON.stringify(parsed, null, 2)
			};
		} catch {
			return null;
		}
	}
}
