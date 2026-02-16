/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module RealtimeAgentManager
 * @description Manages the realtime voice agent (MainVaultAssistant) lifecycle,
 * event subscriptions, button states, tool approval, and transcript handling.
 *
 * @see {@link CopilotChatView} for integration
 * @see {@link MainVaultAssistant} for the underlying voice agent service
 * @since 0.0.20
 */

import { App } from "obsidian";
import CopilotPlugin from "../../main";
import { MainVaultAssistant, RealtimeAgentState, RealtimeHistoryItem, ToolApprovalRequest } from "../../ai/voice-chat";
import { ChatMessage } from "../../ai/providers/GitHubCopilotCliService";
import { getProfileById, OpenAIProviderProfile, getOpenAIProfileApiKey, getLegacyOpenAIKey } from "../../ui/settings";
import { getSecretValue } from "../../utils/secrets";
import type { QuestionRequest, QuestionResponse } from "../../types/questions";
import { VoiceConversationStore } from "../components/VoiceConversationStore";

/**
 * Callbacks for realtime agent events that the parent view must handle
 */
export interface RealtimeAgentCallbacks {
	/** Show the thinking indicator */
	showThinkingIndicator: () => void;
	/** Hide the thinking indicator */
	hideThinkingIndicator: () => void;
	/** Render a full chat message */
	renderMessage: (message: ChatMessage) => Promise<HTMLElement>;
	/** Handle a question request from the agent */
	handleQuestionRequest: (question: QuestionRequest) => Promise<QuestionResponse | null>;
	/** Scroll the messages container to the bottom */
	scrollToBottom: () => void;
}

/**
 * Manages the realtime voice agent lifecycle and UI
 */
export class RealtimeAgentManager {
	private app: App;
	private plugin: CopilotPlugin;
	private callbacks: RealtimeAgentCallbacks;
	private messagesContainer: HTMLElement;
	private voiceConversationStore: VoiceConversationStore;

	private realtimeAgentService: MainVaultAssistant | null = null;
	private agentBtn: HTMLButtonElement | null = null;
	private agentMuteBtn: HTMLButtonElement | null = null;
	private realtimeAgentUnsubscribes: (() => void)[] = [];
	private pendingToolApproval: ToolApprovalRequest | null = null;
	private toolApprovalEl: HTMLElement | null = null;

	constructor(
		app: App,
		plugin: CopilotPlugin,
		messagesContainer: HTMLElement,
		voiceConversationStore: VoiceConversationStore,
		callbacks: RealtimeAgentCallbacks
	) {
		this.app = app;
		this.plugin = plugin;
		this.messagesContainer = messagesContainer;
		this.voiceConversationStore = voiceConversationStore;
		this.callbacks = callbacks;
	}

	/**
	 * Whether the realtime agent is currently connected
	 */
	isConnected(): boolean {
		return this.realtimeAgentService?.isConnected() ?? false;
	}

	/**
	 * Send a text message to the connected realtime agent
	 */
	sendMessage(message: string): void {
		this.realtimeAgentService?.sendMessage(message);
	}

	/**
	 * Create agent toolbar buttons in the given container
	 * @param toolbarRightEl - The toolbar container to append buttons to
	 */
	createButtons(toolbarRightEl: HTMLDivElement): void {
		this.agentBtn = toolbarRightEl.createEl("button", {
			cls: "vc-toolbar-btn vc-agent-btn",
			attr: { "aria-label": "Start voice agent" }
		});
		this.updateAgentButtonState('idle');
		this.agentBtn.addEventListener("click", () => this.handleAgentToggle());

		this.agentMuteBtn = toolbarRightEl.createEl("button", {
			cls: "vc-toolbar-btn vc-agent-mute-btn",
			attr: { "aria-label": "Mute microphone" }
		});
		this.agentMuteBtn.style.display = "none";
		this.updateAgentMuteButtonState(false);
		this.agentMuteBtn.addEventListener("click", () => this.handleAgentMuteToggle());

		// Initialize realtime agent service
		if (!this.realtimeAgentService) {
			this.initService();
		}

		// Sync button state with current service state
		if (this.realtimeAgentService) {
			this.updateAgentButtonState(this.realtimeAgentService.getState());
		}
	}

	/**
	 * Remove agent buttons from the DOM
	 */
	removeButtons(): void {
		if (this.agentBtn) {
			this.agentBtn.remove();
			this.agentBtn = null;
		}
		if (this.agentMuteBtn) {
			this.agentMuteBtn.remove();
			this.agentMuteBtn = null;
		}
	}

	/**
	 * Set the visibility of a paired voice button based on agent state
	 * @param setVoiceVisible - callback to show/hide the voice button
	 */
	private notifyVoiceVisibility(agentActive: boolean, setVoiceVisible?: (visible: boolean) => void): void {
		setVoiceVisible?.(!agentActive);
	}

	/** Externally provided callback for hiding voice button when agent is active */
	private _setVoiceVisible: ((visible: boolean) => void) | null = null;

	/**
	 * Set the voice visibility callback (for hiding voice button when agent is active)
	 */
	setVoiceVisibilityCallback(cb: (visible: boolean) => void): void {
		this._setVoiceVisible = cb;
	}

	/**
	 * Initialize the realtime agent service with event handlers
	 */
	private initService(): void {
		if (this.realtimeAgentService) return;

		const selectedProfileId = this.plugin.settings.realtimeAgentProfileId;
		const selectedProfile = getProfileById(this.plugin.settings, selectedProfileId);

		let apiKey: string | undefined;
		if (selectedProfile && selectedProfile.type === 'openai') {
			apiKey = getOpenAIProfileApiKey(this.app, selectedProfile as OpenAIProviderProfile);
		} else {
			apiKey = getLegacyOpenAIKey(this.app, this.plugin.settings);
		}

		if (!apiKey) {
			console.warn('OpenAI API key not configured for realtime agent. Select an OpenAI profile in settings.');
			return;
		}

		// Build supplemental instructions
		let supplementalInstructions = '';

		if (this.plugin.mcpManager?.hasConnectedServers()) {
			const mcpTools = this.plugin.mcpManager.getAllTools();
			if (mcpTools.length > 0) {
				supplementalInstructions += `\n\nYou also have access to ${mcpTools.length} MCP tools from connected servers:`;
				const byServer = new Map<string, string[]>();
				for (const t of mcpTools) {
					if (!byServer.has(t.serverName)) byServer.set(t.serverName, []);
					byServer.get(t.serverName)!.push(t.tool.name);
				}
				for (const [serverName, toolNames] of byServer) {
					supplementalInstructions += `\n- ${serverName}: ${toolNames.join(', ')}`;
				}
				supplementalInstructions += `\nUse these MCP tools when relevant to the user's questions.`;
			}
		}

		const configuredLanguage = this.plugin.settings.voice?.realtimeLanguage || 'en';
		const languageName = this.getLanguageName(configuredLanguage);

		if (configuredLanguage && configuredLanguage !== 'en') {
			supplementalInstructions += `\n\nIMPORTANT: Always respond in ${languageName}. The user prefers to communicate in ${languageName}.`;
		}

		this.realtimeAgentService = new MainVaultAssistant(this.app, {
			apiKey,
			voice: this.plugin.settings.voice?.realtimeVoice || 'alloy',
			turnDetection: this.plugin.settings.voice?.realtimeTurnDetection || 'server_vad',
			language: configuredLanguage,
			instructions: supplementalInstructions || undefined,
			mcpManager: this.plugin.mcpManager,
			toolConfig: this.plugin.settings.voice?.realtimeToolConfig,
			voiceAgentDirectories: this.plugin.settings.voice?.voiceAgentDirectories,
			voiceAgentFiles: this.plugin.settings.voice?.voiceAgentFiles,
			periodicNotesSettings: this.plugin.settings.periodicNotes,
			timezone: this.plugin.settings.timezone,
			weekStartDay: this.plugin.settings.weekStartDay,
		});

		// Subscribe to state changes
		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('stateChange', (state) => {
				console.log(`[UI] stateChange received: ${state}`);
				this.updateAgentButtonState(state);
			})
		);

		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('transcript', (item) => {
				this.handleRealtimeTranscript(item);
			})
		);

		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('toolExecution', (toolName, args, result, agentName) => {
				console.log(`[${agentName}] Tool executed: ${toolName}`, args, result);
			})
		);

		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('error', (error) => {
				const errorMessage = error instanceof Error
					? error.message
					: (typeof error === 'string' ? error : JSON.stringify(error));
				console.error(`Voice agent error: ${errorMessage}`);
				console.error('[VoiceAgent] Error:', error);
			})
		);

		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('toolApprovalRequested', (request) => {
				this.showToolApprovalPrompt(request);
			})
		);

		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('historyUpdated', (history) => {
				this.voiceConversationStore.updateConversation(history);
			})
		);

		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('user_transcription', (item) => {
				console.log('[VoiceHistory] User transcription received:', item);
				this.voiceConversationStore.addUserTranscription(item);
			})
		);

		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('chatOutput', (content, sourceAgent) => {
				console.log(`[VoiceAgent] Chat output from ${sourceAgent}:`, content?.substring(0, 100));
				this.handleChatOutput(content, sourceAgent);
			})
		);

		this.realtimeAgentService.setQuestionCallback(async (question) => {
			return await this.callbacks.handleQuestionRequest(question);
		});

		this.realtimeAgentUnsubscribes.push(
			this.realtimeAgentService.on('muteChange', (isMuted) => {
				console.log(`[VoiceAgent] Mute state changed: ${isMuted}`);
				this.updateAgentMuteButtonState(isMuted);
			})
		);
	}

	/**
	 * Handle toggle of the realtime agent button
	 */
	private async handleAgentToggle(): Promise<void> {
		if (!this.realtimeAgentService) {
			this.initService();
		}
		if (!this.realtimeAgentService) {
			console.error('Failed to initialize voice agent. Check your OpenAI API key.');
			return;
		}

		const state = this.realtimeAgentService.getState();

		if (state === 'idle' || state === 'error') {
			this.voiceConversationStore.startNewConversation();

			try {
				await this.realtimeAgentService.connect();

				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					try {
						const content = await this.app.vault.read(activeFile);
						const truncatedContent = content.length > 6000
							? content.substring(0, 6000) + '\n\n[Content truncated...]'
							: content;
						this.realtimeAgentService.sendContext(
							`The user is currently looking at a note called "${activeFile.basename}" (path: ${activeFile.path}). Here is its content:\n\n${truncatedContent}`
						);
					} catch {
						this.realtimeAgentService.sendContext(
							`The user is currently looking at a note called "${activeFile.basename}" (path: ${activeFile.path}).`
						);
					}
				}

				const fileOpenRef = this.app.workspace.on('file-open', async (file) => {
					if (file && this.realtimeAgentService?.isConnected()) {
						try {
							const content = await this.app.vault.read(file);
							const truncatedContent = content.length > 6000
								? content.substring(0, 6000) + '\n\n[Content truncated...]'
								: content;
							this.realtimeAgentService!.sendContext(
								`The user switched to a different note called "${file.basename}" (path: ${file.path}). Here is its content:\n\n${truncatedContent}`
							);
							console.log(`[RealtimeAgent] Shared note context: ${file.basename}`);
						} catch (e) {
							console.warn('[RealtimeAgent] Failed to read opened file:', e);
						}
					}
				});

				this.realtimeAgentUnsubscribes.push(() => {
					this.app.workspace.offref(fileOpenRef);
				});
			} catch (error) {
				console.error(`Failed to connect voice agent: ${error instanceof Error ? error.message : String(error)}`);
			}
		} else {
			this.voiceConversationStore.saveCurrentConversation();
			this.realtimeAgentService.disconnect();
		}
	}

	/**
	 * Convert a language code to a human-readable name
	 * @internal
	 */
	private getLanguageName(code: string): string {
		const languageNames: Record<string, string> = {
			'': 'auto-detected',
			'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
			'it': 'Italian', 'pt': 'Portuguese', 'nl': 'Dutch', 'ja': 'Japanese',
			'ko': 'Korean', 'zh': 'Chinese', 'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi',
		};
		return languageNames[code] || code;
	}

	/**
	 * Show tool approval prompt in the messages area
	 */
	private showToolApprovalPrompt(request: ToolApprovalRequest): void {
		this.pendingToolApproval = request;

		if (this.toolApprovalEl) {
			this.toolApprovalEl.remove();
			this.toolApprovalEl = null;
		}

		this.toolApprovalEl = this.messagesContainer.createDiv({ cls: 'vc-tool-approval-prompt' });

		const headerEl = this.toolApprovalEl.createDiv({ cls: 'vc-tool-approval-header' });
		headerEl.createSpan({ text: '🔧 Tool Approval Required', cls: 'vc-tool-approval-title' });

		const infoEl = this.toolApprovalEl.createDiv({ cls: 'vc-tool-approval-info' });
		infoEl.createEl('strong', { text: request.toolName });

		const argsObj = request.args as Record<string, unknown> | undefined;
		if (argsObj && Object.keys(argsObj).length > 0) {
			const argsEl = infoEl.createDiv({ cls: 'vc-tool-approval-args' });
			const argsText = JSON.stringify(argsObj, null, 2);
			const truncatedArgs = argsText.length > 200 ? argsText.substring(0, 200) + '...' : argsText;
			argsEl.createEl('pre', { text: truncatedArgs });
		}

		const buttonsEl = this.toolApprovalEl.createDiv({ cls: 'vc-tool-approval-buttons' });

		const allowOnceBtn = buttonsEl.createEl('button', {
			text: 'Allow Once',
			cls: 'vc-tool-approval-btn vc-tool-approval-allow'
		});
		allowOnceBtn.addEventListener('click', () => this.handleToolApproval('once'));

		const alwaysAllowBtn = buttonsEl.createEl('button', {
			text: 'Always Allow',
			cls: 'vc-tool-approval-btn vc-tool-approval-always'
		});
		alwaysAllowBtn.addEventListener('click', () => this.handleToolApproval('always'));

		const denyBtn = buttonsEl.createEl('button', {
			text: 'Deny',
			cls: 'vc-tool-approval-btn vc-tool-approval-deny'
		});
		denyBtn.addEventListener('click', () => this.handleToolApproval('deny'));

		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	/**
	 * Handle tool approval decision
	 */
	private handleToolApproval(decision: 'once' | 'always' | 'deny'): void {
		if (!this.pendingToolApproval || !this.realtimeAgentService) return;

		const request = this.pendingToolApproval;

		if (decision === 'deny') {
			this.realtimeAgentService.rejectTool(request);
			console.log(`Denied tool: ${request.toolName}`);
		} else {
			if (decision === 'always') {
				this.realtimeAgentService.approveToolForSession(request);
			} else {
				this.realtimeAgentService.approveTool(request);
			}
			console.log(`Allowed tool: ${request.toolName}${decision === 'always' ? ' (for session)' : ''}`);
		}

		this.pendingToolApproval = null;
		if (this.toolApprovalEl) {
			this.toolApprovalEl.remove();
			this.toolApprovalEl = null;
		}
	}

	/**
	 * Handle transcript updates from the realtime agent.
	 * Transcripts are NOT displayed in the main chat view — voice agent speaks directly.
	 */
	private handleRealtimeTranscript(item: RealtimeHistoryItem): void {
		const text = item.content || item.transcript || '';
		const role = item.role || 'assistant';

		if (text.includes('[SYSTEM CONTEXT') || text.includes('DO NOT RESPOND TO THIS')) return;

		console.log(`[RealtimeAgent] ${role}: ${text}`);
	}

	/**
	 * Handle chat output from the realtime agent.
	 * Displays formatted content in the chat view.
	 */
	private async handleChatOutput(content: string, sourceAgent: string): Promise<void> {
		if (!content || !content.trim()) return;

		await this.callbacks.renderMessage({
			role: 'assistant',
			content: content,
			timestamp: new Date(),
		});

		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
		console.log(`[VoiceAgent] Displayed chat output from ${sourceAgent}: ${content.substring(0, 100)}...`);
	}

	/**
	 * Update the agent button visual state
	 */
	private updateAgentButtonState(state: RealtimeAgentState): void {
		if (!this.agentBtn) return;

		this.agentBtn.removeClass('vc-agent-connecting', 'vc-agent-connected', 'vc-agent-speaking', 'vc-agent-listening', 'vc-agent-error');

		const agentIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="10" x="3" y="11" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" x2="8" y1="16" y2="16"></line><line x1="16" x2="16" y1="16" y2="16"></line></svg>`;
		const activeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="10" x="3" y="11" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" x2="8" y1="16" y2="16"></line><line x1="16" x2="16" y1="16" y2="16"></line></svg>`;

		switch (state) {
			case 'connecting':
				this.agentBtn.addClass('vc-agent-connecting');
				this.agentBtn.innerHTML = agentIcon;
				this.agentBtn.setAttribute('aria-label', 'Connecting...');
				this.callbacks.showThinkingIndicator();
				break;
			case 'connected':
				this.agentBtn.addClass('vc-agent-connected');
				this.agentBtn.innerHTML = activeIcon;
				this.agentBtn.setAttribute('aria-label', 'Voice agent active - click to stop');
				this.callbacks.hideThinkingIndicator();
				break;
			case 'listening':
				this.agentBtn.addClass('vc-agent-listening');
				this.agentBtn.innerHTML = activeIcon;
				this.agentBtn.setAttribute('aria-label', 'Agent listening...');
				this.callbacks.hideThinkingIndicator();
				break;
			case 'processing':
				this.agentBtn.addClass('vc-agent-listening');
				this.agentBtn.innerHTML = activeIcon;
				this.agentBtn.setAttribute('aria-label', 'Processing...');
				this.callbacks.showThinkingIndicator();
				break;
			case 'speaking':
				this.agentBtn.addClass('vc-agent-speaking');
				this.agentBtn.innerHTML = activeIcon;
				this.agentBtn.setAttribute('aria-label', 'Agent speaking - click to interrupt');
				this.callbacks.hideThinkingIndicator();
				break;
			case 'error':
				this.agentBtn.addClass('vc-agent-error');
				this.agentBtn.innerHTML = agentIcon;
				this.agentBtn.setAttribute('aria-label', 'Voice agent error - click to retry');
				this.callbacks.hideThinkingIndicator();
				break;
			case 'idle':
			default:
				this.agentBtn.innerHTML = agentIcon;
				this.agentBtn.setAttribute('aria-label', 'Start voice agent');
				this.callbacks.hideThinkingIndicator();
				break;
		}

		const agentActive = state === 'connected' || state === 'listening' || state === 'processing' || state === 'speaking';

		if (this.agentMuteBtn) {
			this.agentMuteBtn.style.display = agentActive ? 'inline-flex' : 'none';
		}

		// Notify parent to show/hide voice button
		this._setVoiceVisible?.(!agentActive);
	}

	/**
	 * Update the mute button visual state
	 */
	private updateAgentMuteButtonState(isMuted: boolean): void {
		if (!this.agentMuteBtn) return;

		const micIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;
		const micMutedIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"></path><path d="M5 10v2a7 7 0 0 0 12 5"></path><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"></path><path d="M9 9v3a3 3 0 0 0 5.12 2.12"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;

		if (isMuted) {
			this.agentMuteBtn.addClass('vc-agent-muted');
			this.agentMuteBtn.innerHTML = micMutedIcon;
			this.agentMuteBtn.setAttribute('aria-label', 'Unmute microphone');
		} else {
			this.agentMuteBtn.removeClass('vc-agent-muted');
			this.agentMuteBtn.innerHTML = micIcon;
			this.agentMuteBtn.setAttribute('aria-label', 'Mute microphone');
		}
	}

	/**
	 * Handle mute button toggle
	 */
	private handleAgentMuteToggle(): void {
		this.realtimeAgentService?.toggleMute();
	}

	/**
	 * Clean up all resources
	 */
	destroy(): void {
		for (const unsubscribe of this.realtimeAgentUnsubscribes) {
			unsubscribe();
		}
		this.realtimeAgentUnsubscribes = [];
		if (this.realtimeAgentService) {
			this.realtimeAgentService.destroy();
			this.realtimeAgentService = null;
		}
		this.removeButtons();
	}
}
