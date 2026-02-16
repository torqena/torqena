// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module SessionManager
 * @description Manages chat session lifecycle for Torqena chat view.
 *
 * Handles creation, loading, persistence, and auto-naming of chat sessions while
 * coordinating with the GitHub Copilot CLI service for message history.
 *
 * @since 0.0.14
 */

import { CopilotSession, CopilotPluginSettings } from "../../ui/settings";
import { GitHubCopilotCliService, ChatMessage } from "../../ai/providers/GitHubCopilotCliService";

/**
 * Callback interface for SessionManager to notify the view of changes
 */
export interface SessionManagerCallbacks {
	onSessionCreated: () => void;
	onSessionLoaded: () => void;
	onHeaderUpdate: () => void;
	onSessionPanelHide: () => void;
	onAgentReset: () => void;
	onClearUI: () => void;
	onLoadMessages: () => Promise<void>;
	onShowWelcome: () => void;
}

/**
 * Manages chat session lifecycle - creation, loading, saving, and naming
 */
export class SessionManager {
	private settings: CopilotPluginSettings;
	private githubCopilotCliService: GitHubCopilotCliService;
	private saveSettings: () => Promise<void>;
	private callbacks: SessionManagerCallbacks;

	constructor(
		settings: CopilotPluginSettings,
		githubCopilotCliService: GitHubCopilotCliService,
		saveSettings: () => Promise<void>,
		callbacks: SessionManagerCallbacks
	) {
		this.settings = settings;
		this.githubCopilotCliService = githubCopilotCliService;
		this.saveSettings = saveSettings;
		this.callbacks = callbacks;
	}

	/**
	 * Get the current session object
	 */
	getCurrentSession(): CopilotSession | undefined {
		const activeSessionId = this.settings.activeSessionId;
		if (activeSessionId) {
			return this.settings.sessions.find((s: CopilotSession) => s.id === activeSessionId);
		}
		return undefined;
	}

	/**
	 * Get the current session name for display
	 */
	getCurrentSessionName(): string {
		const session = this.getCurrentSession();
		if (session) {
			return session.name;
		}
		return "New Chat";
	}

	/**
	 * Create a new chat session
	 */
	async createNewSession(name?: string): Promise<void> {
		// Save current session before creating new one
		await this.saveCurrentSession();

		// Reset agent through callback
		this.callbacks.onAgentReset();

		// Create new session
		const now = Date.now();
		const defaultName = `Chat ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		const sessionId = `session-${now}`;
		
		// Create the SDK session with the ID for persistence
		const actualSessionId = await this.githubCopilotCliService.createSession(sessionId);
		
		// Use the actual session ID from the SDK (it may differ)
		const newSession: CopilotSession = {
			id: actualSessionId || sessionId,
			name: name || defaultName,
			createdAt: now,
			lastUsedAt: now,
			archived: false,
			messages: [],
		};

		this.settings.sessions.push(newSession);
		this.settings.activeSessionId = newSession.id;
		await this.saveSettings();
		
		// Notify view to update UI
		this.callbacks.onClearUI();
		this.callbacks.onShowWelcome();
		this.callbacks.onHeaderUpdate();
		this.callbacks.onSessionCreated();
		this.callbacks.onSessionPanelHide();
	}

	/**
	 * Load a session by its data
	 */
	async loadSession(session: CopilotSession): Promise<void> {
		// Save current session first
		await this.saveCurrentSession();

		// Update active session
		this.settings.activeSessionId = session.id;
		session.lastUsedAt = Date.now();
		await this.saveSettings();

		// Load the session into the service
		await this.githubCopilotCliService.loadSession(session.id, session.messages || []);

		// Notify view to update UI
		this.callbacks.onClearUI();
		await this.callbacks.onLoadMessages();

		if (this.githubCopilotCliService.getMessageHistory().length === 0) {
			this.callbacks.onShowWelcome();
		}

		this.callbacks.onHeaderUpdate();
		this.callbacks.onSessionPanelHide();
		this.callbacks.onSessionLoaded();
	}

	/**
	 * Save the current session's messages
	 */
	async saveCurrentSession(): Promise<void> {
		const activeSessionId = this.settings.activeSessionId;
		if (activeSessionId) {
			const session = this.settings.sessions.find((s: CopilotSession) => s.id === activeSessionId);
			if (session) {
				session.messages = this.githubCopilotCliService.getMessageHistory();
				session.lastUsedAt = Date.now();
				await this.saveSettings();
			}
		}
	}

	/**
	 * Ensure a session exists in our tracking system before sending messages
	 */
	async ensureSessionExists(): Promise<void> {
		// If there's already an active session, we're good
		if (this.settings.activeSessionId) {
			const existingSession = this.settings.sessions.find(
				s => s.id === this.settings.activeSessionId
			);
			if (existingSession) {
				return;
			}
		}

		// Create a new session with SDK persistence
		const now = Date.now();
		const defaultName = `Chat ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		const sessionId = `session-${now}`;
		
		// Get the actual session ID from GitHubCopilotCliService (creates session if needed)
		const actualSessionId = this.githubCopilotCliService.getSessionId() || sessionId;
		
		const newSession: CopilotSession = {
			id: actualSessionId,
			name: defaultName,
			createdAt: now,
			lastUsedAt: now,
			archived: false,
			messages: [],
		};

		this.settings.sessions.push(newSession);
		this.settings.activeSessionId = newSession.id;
		await this.saveSettings();
		
		this.callbacks.onHeaderUpdate();
		console.log("[VC] Created new session:", newSession.name, "with SDK ID:", actualSessionId);
	}

	/**
	 * Auto-rename session based on first user message
	 */
	async autoRenameSessionFromFirstMessage(firstMessage: string, sessionPanelRender?: () => void): Promise<void> {
		const currentSession = this.settings.sessions.find(
			(s: CopilotSession) => s.id === this.settings.activeSessionId
		);
		
		if (!currentSession) {
			console.log("[VC] No current session found for auto-rename");
			return;
		}
		
		// Only rename if this appears to be the default auto-generated name
		// (starts with "Chat " followed by a time)
		if (!currentSession.name.startsWith("Chat ")) {
			console.log("[VC] Session already has custom name:", currentSession.name);
			return;
		}
		
		// Check if this is the first user message by counting user messages
		const messageHistory = this.githubCopilotCliService.getMessageHistory();
		const userMessageCount = messageHistory.filter((m: ChatMessage) => m.role === "user").length;
		console.log("[VC] User message count:", userMessageCount, "Total messages:", messageHistory.length);
		
		if (userMessageCount !== 1) {
			console.log("[VC] Not first user message, skipping rename");
			return;
		}
		
		// Generate a concise title from the first message
		const title = this.generateSessionTitle(firstMessage);
		console.log("[VC] Renaming session to:", title);
		
		// Update session name
		currentSession.name = title;
		await this.saveSettings();
		
		// Update UI
		this.callbacks.onHeaderUpdate();
		if (sessionPanelRender) {
			sessionPanelRender();
		}
	}
	
	/**
	 * Generate a concise session title from a message (max ~50 chars)
	 */
	generateSessionTitle(message: string): string {
		// Remove slash commands prefix if any
		let cleaned = message.replace(/^\/\w+\s*/, "").trim();
		
		// Remove common prefixes
		cleaned = cleaned.replace(/^(can you|could you|please|would you|help me|i want to|i need to)\s+/i, "");
		
		// Capitalize first letter
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
		
		// Truncate if too long (keep first ~47 chars + "...")
		if (cleaned.length > 50) {
			cleaned = cleaned.substring(0, 47).trim() + "...";
		}
		
		return cleaned;
	}
}
