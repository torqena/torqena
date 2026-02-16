// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module CopilotChatView
 * @description Main chat view component for Vault Copilot.
 *
 * This is the primary user interface for AI-powered chat, displayed as an
 * Obsidian ItemView in the right sidebar. It integrates all chat functionality
 * including message rendering, voice input, session management, and tool execution.
 *
 * ## Features
 *
 * - **Chat Interface**: Message input, streaming responses, markdown rendering
 * - **Session Management**: Save, restore, and archive chat sessions
 * - **Voice Input**: Whisper-based voice transcription
 * - **Realtime Agent**: Live voice conversation with tool execution
 * - **Context Awareness**: Attach notes for context, inline @-mentions
 * - **Tool Execution**: Visual feedback for AI tool calls
 * - **Prompt Library**: Quick access to saved prompts
 *
 * ## Architecture
 *
 * ```
 * CopilotChatView (ItemView)
 *   ├── SessionPanel (sidebar)
 *   ├── ToolbarManager (agent/model/tool selectors)
 *   ├── PromptPicker (toolbar)
 *   ├── ContextPicker (toolbar)
 *   ├── MessagesContainer (main area)
 *   │    └── MessageRenderer
 *   ├── InputArea (bottom)
 *   │    ├── VoiceManager
 *   │    ├── RealtimeAgentManager
 *   │    └── SendButton
 *   └── PromptExecutor
 * ```
 *
 * @see {@link SessionManager} for session state management
 * @see {@link MessageRenderer} for message display
 * @see {@link VoiceManager} for voice input
 * @see {@link RealtimeAgentManager} for realtime voice agent
 * @see {@link ToolbarManager} for toolbar controls
 * @see {@link PromptExecutor} for prompt execution
 * @since 0.0.1
 */

import { ItemView, WorkspaceLeaf, Menu } from "obsidian";
import { setIcon } from "../platform/utils/icons";
import { GitHubCopilotCliService, ChatMessage } from "../ai/providers/GitHubCopilotCliService";
import CopilotPlugin from "../main";
import { CopilotSession, getVoiceServiceConfigFromProfile, getProfileById, OpenAIProviderProfile, AzureOpenAIProviderProfile, getOpenAIProfileApiKey, getAzureProfileApiKey, getLegacyOpenAIKey } from "../ui/settings";
import { SessionPanel } from "./components/SessionPanel";
import { CachedPromptInfo } from "../ai/customization/PromptCache";
import { ToolCatalog } from "../ai/tools/ToolCatalog";
import { 
	McpAppContainer,
	UIResourceContent,
	ToolCallResult
} from "../ui/mcp-apps";
import { SLASH_COMMANDS } from "./processing/SlashCommands";
import { InlineQuestionRenderer } from "./renderers/InlineQuestionRenderer";
import { renderWelcomeMessage, WelcomeMessageHandle } from "./renderers/WelcomeMessage";
import { PromptPicker } from "./pickers/PromptPicker";
import { ContextPicker } from "./pickers/ContextPicker";
import { PromptProcessor } from "./processing/PromptProcessor";
import { ContextAugmentation } from "./processing/ContextAugmentation";
import { MessageRenderer, UsedReference } from "./renderers/MessageRenderer";
import { SessionManager } from "./managers/SessionManager";
import { ToolExecutionRenderer } from "./renderers/ToolExecutionRenderer";
import { VoiceChatService } from "../ai/voice-chat";
import type { QuestionRequest, QuestionResponse } from "../types/questions";
import { AIProvider } from "../ai/providers/AIProvider";
import { getSecretValue } from "../utils/secrets";
import { checkAnyProviderAvailable } from "../utils/providerAvailability";
import { EditorSelectionManager } from "./components/EditorSelectionManager";
import { VoiceConversationStore } from "./components/VoiceConversationStore";
import { MessageContextBuilder } from "./processing/MessageContextBuilder";
import { InputAreaManager } from "./managers/InputAreaManager";
import { VoiceManager } from "./managers/VoiceManager";
import { RealtimeAgentManager } from "./managers/RealtimeAgentManager";
import { ToolbarManager } from "./managers/ToolbarManager";
import { PromptExecutor } from "./managers/PromptExecutor";

export const COPILOT_VIEW_TYPE = "copilot-chat-view";

export class CopilotChatView extends ItemView {
	public plugin: CopilotPlugin;
	private githubCopilotCliService: GitHubCopilotCliService;
	private messagesContainer!: HTMLElement;
	private inputArea: HTMLElement | null = null;
	private inputEl!: HTMLDivElement;  // contenteditable div for inline chips
	private sendButton!: HTMLButtonElement;
	private isProcessing = false;
	private currentStreamingMessageEl: HTMLElement | null = null;
	private inputAreaManager!: InputAreaManager;
	private attachmentsContainer: HTMLElement | null = null;
	private sessionPanel: SessionPanel | null = null;
	private sessionPanelEl: HTMLElement | null = null;
	private mainViewEl: HTMLElement | null = null;
	private sessionPanelVisible = false;
	private resizerEl: HTMLElement | null = null;
	private sessionToggleBtnEl: HTMLElement | null = null;
	private isExpanded = false;
	private expandBtnEl: HTMLElement | null = null;
	private originalRightSplitSize: number | null = null;
	private isResizing = false;
	private promptPickerEl: HTMLElement | null = null;
	private promptCacheUnsubscribe: (() => void) | null = null;
	private promptPicker: PromptPicker | null = null;
	private contextPickerEl: HTMLElement | null = null;
	private contextPicker: ContextPicker | null = null;
	private toolCatalog: ToolCatalog | null = null;
	private promptProcessor: PromptProcessor;
	private contextAugmentation: ContextAugmentation;
	private messageRenderer: MessageRenderer;
	private sessionManager: SessionManager;
	private toolExecutionRenderer: ToolExecutionRenderer;
	private messageContextBuilder: MessageContextBuilder;
	
	// Voice & realtime agent
	private voiceChatService: VoiceChatService | null = null;
	private voiceManager: VoiceManager | null = null;
	private realtimeAgentManager: RealtimeAgentManager | null = null;
	private voiceConversationStore: VoiceConversationStore;
	private toolbarRightEl: HTMLDivElement | null = null;
	
	// Toolbar
	private toolbarManager: ToolbarManager;
	
	// Prompt execution
	private promptExecutor: PromptExecutor;
	
	// Thinking indicator
	private thinkingIndicatorEl: HTMLElement | null = null;
	
	// Welcome message handle for provider warning
	private welcomeMessageHandle: WelcomeMessageHandle | null = null;
	private settingsChangeUnsubscribe: (() => void) | null = null;

	// Editor selection preservation
	private editorSelectionManager: EditorSelectionManager;

	constructor(leaf: WorkspaceLeaf, plugin: CopilotPlugin, githubCopilotCliService: GitHubCopilotCliService | null) {
		super(leaf);
		this.plugin = plugin;
		this.githubCopilotCliService = githubCopilotCliService as GitHubCopilotCliService;
		this.toolCatalog = new ToolCatalog(plugin.skillRegistry, plugin.mcpManager, plugin.skillCache);
		this.promptProcessor = new PromptProcessor(plugin.app);
		this.contextAugmentation = new ContextAugmentation(plugin.app);
		this.messageRenderer = new MessageRenderer(plugin.app, this);
		this.editorSelectionManager = new EditorSelectionManager(plugin.app);
		this.voiceConversationStore = new VoiceConversationStore(plugin.settings, () => plugin.saveSettings());
		
		const activeService = this.getActiveAIService();
		if (activeService) {
			this.wireQuestionCallback(activeService);
		}

		this.sessionManager = new SessionManager(
			plugin.settings,
			(activeService ?? null) as GitHubCopilotCliService,
			() => plugin.saveSettings(),
			{
				onSessionCreated: () => {
					if (this.inputAreaManager) {
						this.inputAreaManager.clearInput();
						this.inputAreaManager.clearAttachments();
						this.inputAreaManager.resetHistory();
					}
				},
				onSessionLoaded: () => {
					if (this.inputAreaManager) {
						this.inputAreaManager.resetHistory();
					}
				},
				onHeaderUpdate: () => this.updateHeaderTitle(),
				onSessionPanelHide: () => {
					if (this.sessionPanelVisible) this.toggleSessionPanel();
				},
				onAgentReset: async () => {
					await this.plugin.agentCache.refreshCache();
					this.toolbarManager.resetSelectedAgent();
				},
				onClearUI: () => this.messagesContainer.empty(),
				onLoadMessages: () => this.loadMessages(),
				onShowWelcome: () => this.addWelcomeMessage(),
			}
		);
		
		this.toolExecutionRenderer = new ToolExecutionRenderer(
			this,
			(toolName, args) => this.executeTool(toolName, args)
		);

		this.messageContextBuilder = new MessageContextBuilder(
			plugin.app,
			plugin,
			this.promptProcessor,
			this.contextAugmentation,
			(activeService ?? null) as GitHubCopilotCliService
		);

		// Initialize ToolbarManager
		this.toolbarManager = new ToolbarManager(
			plugin,
			this.githubCopilotCliService,
			this.toolCatalog,
			{
				getCurrentSession: () => this.sessionManager.getCurrentSession(),
				saveSettings: () => plugin.saveSettings(),
				openExtensionBrowser: () => this.plugin.activateExtensionBrowser(),
				openPluginSettings: () => {
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				},
				openToolPicker: () => this.toolbarManager.openToolPicker(),
				openVoiceHistory: () => this.voiceConversationStore.openHistory(this.app),
			}
		);

		// Initialize PromptExecutor
		this.promptExecutor = new PromptExecutor(
			plugin.app,
			plugin,
			this.githubCopilotCliService,
			this.promptProcessor,
			{
				ensureSessionExists: () => this.sessionManager.ensureSessionExists(),
				renderMessage: (msg) => this.messageRenderer.renderMessage(this.messagesContainer, msg),
				createMessageElement: (role, content) => this.messageRenderer.createMessageElement(this.messagesContainer, role, content),
				renderMarkdownContent: (el, content) => this.messageRenderer.renderMarkdownContent(el, content),
				addCopyButton: (el) => this.messageRenderer.addCopyButton(el),
				renderUsedReferences: (refs) => this.messageRenderer.renderUsedReferences(this.messagesContainer, refs),
				addErrorMessage: (err) => this.addErrorMessage(err),
				setProcessing: (val) => { this.isProcessing = val; },
				showThinkingIndicator: () => this.showThinkingIndicator(),
				hideThinkingIndicator: () => this.hideThinkingIndicator(),
				updateUIState: () => this.updateUIState(),
				scrollToBottom: () => this.scrollToBottom(),
				scrollMessageToTop: (el) => this.scrollMessageToTop(el),
				getPreservedSelectionText: () => this.editorSelectionManager.getPreservedSelectionText(),
				logToolContext: (tools) => this.toolbarManager.logToolContext(tools),
				clearInput: () => { if (this.inputEl) this.inputEl.innerHTML = ""; },
				autoResizeInput: () => this.inputAreaManager?.autoResizeInput(),
				getMessagesContainer: () => this.messagesContainer,
			}
		);
		
		// Initialize VoiceChatService
		const voiceSettings = this.plugin.settings.voice || {
			backend: 'openai-whisper',
			whisperServerUrl: 'http://127.0.0.1:8080',
			language: 'en-US',
			audioDeviceId: undefined,
		};
		
		const voiceProfileId = this.plugin.settings.voiceInputProfileId;
		const voiceProfile = getProfileById(this.plugin.settings, voiceProfileId);
		const profileConfig = getVoiceServiceConfigFromProfile(this.plugin.settings, voiceProfileId);

		const openaiSettings = this.plugin.settings.openai;
		let profileOpenAiKey: string | undefined;
		if (voiceProfile?.type === 'openai') {
			profileOpenAiKey = getOpenAIProfileApiKey(this.app, voiceProfile as OpenAIProviderProfile);
		} else if (profileConfig?.openaiApiKeySecretId) {
			profileOpenAiKey = getSecretValue(this.app, profileConfig.openaiApiKeySecretId);
		}
		const legacyOpenAiKey = getLegacyOpenAIKey(this.app, this.plugin.settings);
		const resolvedOpenAiKey = profileOpenAiKey || legacyOpenAiKey;

		let resolvedAzureKey: string | undefined;
		if (voiceProfile?.type === 'azure-openai') {
			resolvedAzureKey = getAzureProfileApiKey(this.app, voiceProfile as AzureOpenAIProviderProfile);
		} else if (profileConfig?.azureApiKeySecretId) {
			resolvedAzureKey = getSecretValue(this.app, profileConfig.azureApiKeySecretId);
		}
		if (!resolvedAzureKey && typeof process !== "undefined" && process.env) {
			resolvedAzureKey = process.env.AZURE_OPENAI_KEY || process.env.AZURE_OPENAI_API_KEY;
		}

		this.voiceChatService = new VoiceChatService({
			backend: profileConfig?.backend || voiceSettings.backend,
			whisperServerUrl: profileConfig?.whisperServerUrl || voiceSettings.whisperServerUrl,
			language: voiceSettings.language,
			openaiApiKey: resolvedOpenAiKey,
			openaiBaseUrl: profileConfig?.openaiBaseUrl || openaiSettings?.baseURL || undefined,
			azureApiKey: resolvedAzureKey,
			azureEndpoint: profileConfig?.azureEndpoint || voiceSettings.azure?.endpoint || undefined,
			azureDeploymentName: profileConfig?.azureDeploymentName || voiceSettings.azure?.deploymentName || undefined,
			azureApiVersion: profileConfig?.azureApiVersion || voiceSettings.azure?.apiVersion || undefined,
			audioDeviceId: voiceSettings.audioDeviceId,
		});

		// Create VoiceManager
		this.voiceManager = new VoiceManager(this.voiceChatService, {
			onTranscription: (text) => this.insertTextAtCursor(text),
		});
	}

	/**
	 * Get the active AI service (Copilot, OpenAI, or Azure)
	 */
	private getActiveAIService(): GitHubCopilotCliService | AIProvider | null {
		const activeService = this.plugin.getActiveService();
		if (activeService) return activeService as GitHubCopilotCliService;
		if (this.githubCopilotCliService) return this.githubCopilotCliService;
		return null;
	}

	getViewType(): string {
		return COPILOT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Vault Copilot";
	}

	getIcon(): string {
		return "message-square";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		container.empty();
		container.addClass("vc-chat-container");

		const layoutWrapper = container.createDiv({ cls: "vc-layout-wrapper" });

		this.mainViewEl = layoutWrapper.createDiv({ cls: "vc-main-view" });

		this.resizerEl = layoutWrapper.createDiv({ cls: "vc-resizer" });
		this.resizerEl.style.display = "none";
		this.setupResizer();

		this.sessionPanelEl = layoutWrapper.createDiv({ cls: "vc-session-panel-wrapper" });
		this.sessionPanelEl.style.display = "none";
		this.sessionPanel = new SessionPanel(this.plugin, this.sessionPanelEl, {
			onSessionSelect: (session) => this.loadSession(session),
			onNewSession: () => this.createNewSession(),
			onClose: () => this.toggleSessionPanel(),
		});

		// Header toolbar
		const header = this.mainViewEl.createDiv({ cls: "vc-chat-header" });
		const sessionTitle = header.createDiv({ cls: "vc-header-title" });
		sessionTitle.setText(this.getCurrentSessionName());
		
		const headerActions = header.createDiv({ cls: "vc-header-actions" });
		
		const newSessionBtn = headerActions.createEl("button", {
			cls: "vc-header-btn",
			attr: { "aria-label": "New session" }
		});
		setIcon(newSessionBtn, "plus");
		newSessionBtn.addEventListener("click", () => this.createNewSession());

		const settingsMenuBtn = headerActions.createEl("button", {
			cls: "vc-header-btn",
			attr: { "aria-label": "Settings menu" }
		});
		setIcon(settingsMenuBtn, "settings");
		settingsMenuBtn.addEventListener("click", (e) => this.toolbarManager.showSettingsMenu(e));
		
		this.sessionToggleBtnEl = headerActions.createEl("button", {
			cls: "vc-header-btn vc-session-toggle-btn",
			attr: { "aria-label": "Toggle sessions" }
		});
		setIcon(this.sessionToggleBtnEl, "panel-right");
		this.sessionToggleBtnEl.addEventListener("click", () => this.toggleSessionPanel());

		// Divider before expand/close buttons
		headerActions.createSpan({ cls: "vc-header-divider" });

		// Expand/shrink button
		this.expandBtnEl = headerActions.createEl("button", {
			cls: "vc-header-btn",
			attr: { "aria-label": "Expand chat" }
		});
		setIcon(this.expandBtnEl, "maximize");
		this.expandBtnEl.addEventListener("click", () => this.toggleExpandChat());

		// Close chat pane button
		const closePaneBtn = headerActions.createEl("button", {
			cls: "vc-header-btn",
			attr: { "aria-label": "Close chat" }
		});
		setIcon(closePaneBtn, "x");
		closePaneBtn.addEventListener("click", () => this.closeChatPane());

		// Messages container
		this.messagesContainer = this.mainViewEl.createDiv({ cls: "vc-messages" });

		// Input area
		this.inputArea = this.mainViewEl.createDiv({ cls: "vc-input-area" });
		const inputArea = this.inputArea;

		const inputWrapper = inputArea.createDiv({ cls: "vc-input-wrapper" });
		
		// Context row
		const contextRow = inputWrapper.createDiv({ cls: "vc-context-row" });
		
		const addContextBtn = contextRow.createEl("button", { 
			cls: "vc-add-context",
			attr: { "aria-label": "Add context from notes" }
		});
		addContextBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg><span>Add Context...</span>`;
		addContextBtn.addEventListener("click", () => this.inputAreaManager.openNotePicker());
		
		this.attachmentsContainer = contextRow.createDiv({ cls: "vc-attachments" });
		
		this.inputEl = inputWrapper.createDiv({
			cls: "vc-input",
			attr: { 
				contenteditable: "true",
				"data-placeholder": "Ask Vault Copilot anything or type / for prompts"
			}
		}) as HTMLDivElement;
		
		this.contextPickerEl = inputWrapper.createDiv({ cls: "vc-context-picker" });
		this.contextPickerEl.style.display = "none";

		this.inputAreaManager = new InputAreaManager(this.plugin, this.inputEl, this.attachmentsContainer);
		
		this.promptPickerEl = inputWrapper.createDiv({ cls: "vc-prompt-picker" });
		this.promptPickerEl.style.display = "none";
		
		this.promptCacheUnsubscribe = this.plugin.promptCache.onCacheChange(() => {
			if (this.promptPicker?.isVisible()) {
				this.promptPicker.update(this.inputEl.innerText || "");
			}
		});

		// Bottom toolbar
		const inputToolbar = inputWrapper.createDiv({ cls: "vc-input-toolbar" });
		const toolbarLeft = inputToolbar.createDiv({ cls: "vc-toolbar-left" });
		this.toolbarRightEl = inputToolbar.createDiv({ cls: "vc-toolbar-right" });

		// Create toolbar selectors (agent, model, tool)
		this.toolbarManager.createToolbarLeft(toolbarLeft);

		// Initialize RealtimeAgentManager
		if (this.plugin.settings.voice?.realtimeAgentEnabled) {
			this.realtimeAgentManager = new RealtimeAgentManager(
				this.app,
				this.plugin,
				this.messagesContainer,
				this.voiceConversationStore,
				{
					showThinkingIndicator: () => this.showThinkingIndicator(),
					hideThinkingIndicator: () => this.hideThinkingIndicator(),
					renderMessage: (msg) => this.messageRenderer.renderMessage(this.messagesContainer, msg),
					handleQuestionRequest: (q) => this.handleQuestionRequest(q),
					scrollToBottom: () => this.scrollToBottom(),
				}
			);
		}

		// Wire voice managers into toolbar and create voice/agent buttons
		this.toolbarManager.setVoiceManagers(this.voiceManager, this.realtimeAgentManager);

		// Send button
		this.sendButton = this.toolbarRightEl.createEl("button", { 
			cls: "vc-send-btn",
			attr: { "aria-label": "Send message (Enter or Ctrl-Alt-Enter)" }
		});
		this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>`;

		// Create voice/agent toolbar buttons + send button positioning
		this.toolbarManager.createToolbarRight(this.toolbarRightEl, this.sendButton);

		// Event listeners
		this.editorSelectionManager.setupSelectionChangeListener();
		this.editorSelectionManager.setupInputFocusListener(this.inputEl);
		
		this.inputEl.addEventListener("keydown", (e) => {
			if (this.contextPicker?.handleKeyDown(e)) return;
			if (this.promptPicker?.handleKeyDown(e)) return;
			
			if (e.key === "ArrowUp" || e.key === "ArrowDown") {
				const currentText = this.inputEl.textContent || '';
				const isEmpty = currentText.trim() === '';

				if (isEmpty || e.key === "ArrowUp" || e.key === "ArrowDown") {
					const handled = this.inputAreaManager !== undefined;
					if (handled) {
						e.preventDefault();
						this.inputAreaManager.navigateHistory(e.key === "ArrowUp" ? 'up' : 'down');
						return;
					}
				}
			}

			if (e.key === "Enter" && (!e.shiftKey || (e.ctrlKey && e.altKey))) {
				if (this.promptPicker?.checkAndClearJustSelected()) return;
				e.preventDefault();
				this.sendMessage();
			}
		});

		this.inputEl.addEventListener("input", () => {
			this.inputAreaManager.autoResizeInput();
			this.promptPicker?.handleInput();
			this.contextPicker?.handleInput();
		});

		if (this.promptPickerEl) {
			this.promptPicker = new PromptPicker({
				containerEl: this.promptPickerEl,
				inputEl: this.inputEl,
				getPrompts: () => this.plugin.promptCache.getPrompts(),
				getSkills: () => this.plugin.skillCache.getSkills(),
				onSelect: (prompt) => this.promptExecutor.executePrompt(prompt),
			});
		}

		if (this.contextPickerEl) {
			this.contextPicker = new ContextPicker({
				containerEl: this.contextPickerEl,
				inputEl: this.inputEl,
				getFiles: () => this.app.vault.getMarkdownFiles(),
				onSelect: (file) => this.inputAreaManager.insertInlineChip(file),
			});
		}

		this.sendButton.addEventListener("click", () => this.handleSendOrCancel());

		await this.loadMessages();

		if (!this.githubCopilotCliService || this.githubCopilotCliService.getMessageHistory().length === 0) {
			this.addWelcomeMessage();
		}

		this.startService();
		this.registerKeyboardShortcuts();
		await this.updateProviderAvailabilityUI();
		
		this.settingsChangeUnsubscribe = this.plugin.onSettingsChange(() => {
			this.updateProviderAvailabilityUI();
		});
	}

	/**
	 * Check provider availability and toggle between input area and placeholder
	 */
	private async updateProviderAvailabilityUI(): Promise<void> {
		const cliManager = this.plugin.getCliManager?.();
		const status = await checkAnyProviderAvailable(
			this.app,
			this.plugin.settings,
			cliManager
		);

		if (status.available) {
			if (this.inputArea) this.inputArea.style.display = "";
			if (this.welcomeMessageHandle) this.welcomeMessageHandle.setProviderWarningVisible(false);
		} else {
			if (this.inputArea) this.inputArea.style.display = "none";
			if (this.welcomeMessageHandle) this.welcomeMessageHandle.setProviderWarningVisible(true);
		}
	}

	/**
	 * Insert text at the current cursor position in the input
	 */
	private insertTextAtCursor(text: string): void {
		console.log('insertTextAtCursor: Inserting text:', text);
		
		const existingText = this.inputEl.textContent || '';
		const newText = existingText ? existingText + ' ' + text : text;
		this.inputEl.textContent = newText;
		
		const range = document.createRange();
		const selection = window.getSelection();
		range.selectNodeContents(this.inputEl);
		range.collapse(false);
		if (selection) {
			selection.removeAllRanges();
			selection.addRange(range);
		}
		
		this.inputAreaManager.autoResizeInput();
		this.inputEl.focus();
		console.log('insertTextAtCursor: Done, input now contains:', this.inputEl.textContent);
	}

	/**
	 * Refresh toolbar after settings change
	 */
	refreshFromSettings(): void {
		this.toolbarManager.refreshFromSettings();
	}

	/**
	 * Handle question request from agent (renders inline in chat)
	 */
	private async handleQuestionRequest(question: QuestionRequest): Promise<QuestionResponse | null> {
		this.hideThinkingIndicator();
		const renderer = new InlineQuestionRenderer(this.messagesContainer);
		const response = await renderer.render(question);
		this.showThinkingIndicator();
		return response;
	}

	/**
	 * Wire the question callback on a text chat service
	 */
	private wireQuestionCallback(service: GitHubCopilotCliService | AIProvider): void {
		const questionHandler = async (question: QuestionRequest): Promise<QuestionResponse | null> => {
			return await this.handleQuestionRequest(question);
		};

		if (service instanceof AIProvider) {
			service.setQuestionCallback(questionHandler);
		} else if (service && typeof (service as any).setQuestionCallback === 'function') {
			(service as GitHubCopilotCliService).setQuestionCallback(questionHandler);
		}
	}

	/**
	 * Show "Thinking..." indicator
	 */
	private showThinkingIndicator(): void {
		console.log('[UI] showThinkingIndicator called, existing:', !!this.thinkingIndicatorEl);
		if (this.thinkingIndicatorEl || !this.inputArea) return;
		
		this.thinkingIndicatorEl = this.inputArea.createDiv({ cls: "vc-thinking" });
		
		const textEl = this.thinkingIndicatorEl.createDiv({ cls: "vc-thinking-text" });
		textEl.setText("Thinking...");
		
		const progressEl = this.thinkingIndicatorEl.createDiv({ cls: "vc-thinking-progress" });
		progressEl.createDiv({ cls: "vc-thinking-progress-bar" });
		
		if (this.inputArea.firstChild) {
			this.inputArea.insertBefore(this.thinkingIndicatorEl, this.inputArea.firstChild);
		}
		console.log('[UI] Thinking indicator CREATED');
	}

	/**
	 * Hide "Thinking..." indicator
	 */
	private hideThinkingIndicator(): void {
		console.log('[UI] hideThinkingIndicator called, existing:', !!this.thinkingIndicatorEl);
		if (this.thinkingIndicatorEl) {
			this.thinkingIndicatorEl.remove();
			this.thinkingIndicatorEl = null;
			console.log('[UI] Thinking indicator REMOVED');
		}
	}

	private async startService(): Promise<void> {
		try {
			if (!this.githubCopilotCliService) return;
			if (!this.githubCopilotCliService.isConnected()) {
				await this.githubCopilotCliService.start();
				
				const activeSessionId = this.plugin.settings.activeSessionId;
				if (activeSessionId) {
					await this.githubCopilotCliService.loadSession(activeSessionId);
					console.log('[Vault Copilot] Resumed session:', activeSessionId);
				} else {
					await this.githubCopilotCliService.createSession();
				}
				
				this.plugin.updateStatusBar();
			}
		} catch (error) {
			console.error("Failed to start Copilot service:", error);
		}
	}

	/**
	 * Toggle the session panel visibility
	 */
	private toggleSessionPanel(): void {
		this.sessionPanelVisible = !this.sessionPanelVisible;
		
		if (this.sessionPanelEl) {
			this.sessionPanelEl.style.display = this.sessionPanelVisible ? "flex" : "none";
			if (this.sessionPanelVisible && this.sessionPanel) {
				this.sessionPanel.render();
			}
		}
		
		if (this.resizerEl) {
			this.resizerEl.style.display = this.sessionPanelVisible ? "block" : "none";
		}
		
		if (this.sessionToggleBtnEl) {
			this.sessionToggleBtnEl.style.display = this.sessionPanelVisible ? "none" : "flex";
		}
	}

	/**
	 * Toggle expanded mode — collapse the left sidebar and resize chat to fill.
	 * Pressing again restores the original layout.
	 */
	private toggleExpandChat(): void {
		const { workspace } = this.app;
		const rightSplit = (workspace as any).rightSplit;
		this.isExpanded = !this.isExpanded;

		if (this.isExpanded) {
			// Save original size before expanding
			this.originalRightSplitSize = rightSplit?.containerEl?.offsetWidth ?? null;
			(workspace as any).leftSplit?.collapse();
			rightSplit?.setSize?.(window.innerWidth * 0.85);
		} else {
			(workspace as any).leftSplit?.expand();
			if (this.originalRightSplitSize != null) {
				rightSplit?.setSize?.(this.originalRightSplitSize);
				this.originalRightSplitSize = null;
			}
		}

		if (this.expandBtnEl) {
			setIcon(this.expandBtnEl, this.isExpanded ? "minimize" : "maximize");
			this.expandBtnEl.setAttribute("aria-label", this.isExpanded ? "Shrink chat" : "Expand chat");
		}
	}

	/**
	 * Close the chat pane (detach the leaf).
	 */
	private closeChatPane(): void {
		// Restore layout if expanded
		if (this.isExpanded) {
			const { workspace } = this.app;
			(workspace as any).leftSplit?.expand();
			if (this.originalRightSplitSize != null) {
				(workspace as any).rightSplit?.setSize?.(this.originalRightSplitSize);
				this.originalRightSplitSize = null;
			}
			this.isExpanded = false;
		}
		this.leaf.detach();
	}

	/**
	 * Setup the resizer drag functionality
	 */
	private setupResizer(): void {
		if (!this.resizerEl) return;

		const resizer = this.resizerEl;
		
		const onMouseDown = (e: MouseEvent) => {
			e.preventDefault();
			this.isResizing = true;
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		};

		const onMouseMove = (e: MouseEvent) => {
			if (!this.isResizing || !this.sessionPanelEl) return;
			const container = this.containerEl.children[1] as HTMLElement;
			if (!container) return;
			const containerRect = container.getBoundingClientRect();
			const newPanelWidth = containerRect.right - e.clientX;
			const minWidth = 200;
			const maxWidth = containerRect.width * 0.5;
			const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newPanelWidth));
			this.sessionPanelEl.style.width = `${constrainedWidth}px`;
			this.sessionPanelEl.style.flex = "none";
		};

		const onMouseUp = () => {
			this.isResizing = false;
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};

		resizer.addEventListener("mousedown", onMouseDown);
	}

	private getCurrentSessionName(): string {
		const activeSessionId = this.plugin.settings.activeSessionId;
		if (activeSessionId) {
			const session = this.plugin.settings.sessions.find(s => s.id === activeSessionId);
			if (session) return session.name;
		}
		return "New Chat";
	}

	private updateHeaderTitle(): void {
		const titleEl = this.containerEl.querySelector(".vc-header-title");
		if (titleEl) titleEl.setText(this.getCurrentSessionName());
	}

	/**
	 * Get the currently selected agent (delegates to ToolbarManager)
	 */
	getSelectedAgent() {
		return this.toolbarManager.getSelectedAgent();
	}

	private getCurrentSession(): CopilotSession | undefined {
		return this.sessionManager.getCurrentSession();
	}

	async createNewSession(name?: string): Promise<void> {
		await this.sessionManager.createNewSession(name);
		this.inputAreaManager.renderAttachments();
	}

	async loadSession(session: CopilotSession): Promise<void> {
		await this.sessionManager.loadSession(session);
	}

	async saveCurrentSession(): Promise<void> {
		await this.sessionManager.saveCurrentSession();
	}

	private async ensureSessionExists(): Promise<void> {
		await this.sessionManager.ensureSessionExists();
	}

	registerKeyboardShortcuts(): void {
		this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
			if (e.ctrlKey && e.key === "n" && this.containerEl.contains(document.activeElement)) {
				e.preventDefault();
				this.createNewSession();
			}
		});
	}

	async onClose(): Promise<void> {
		// Restore layout if expanded
		if (this.isExpanded) {
			const { workspace } = this.app;
			(workspace as any).leftSplit?.expand();
			if (this.originalRightSplitSize != null) {
				(workspace as any).rightSplit?.setSize?.(this.originalRightSplitSize);
				this.originalRightSplitSize = null;
			}
			this.isExpanded = false;
		}
		// Cleanup toolbar
		this.toolbarManager.destroy();
		// Cleanup prompt cache subscription
		if (this.promptCacheUnsubscribe) {
			this.promptCacheUnsubscribe();
			this.promptCacheUnsubscribe = null;
		}
		// Cleanup voice manager
		if (this.voiceManager) {
			this.voiceManager.destroy();
			this.voiceManager = null;
		}
		// Cleanup realtime agent manager
		if (this.realtimeAgentManager) {
			this.realtimeAgentManager.destroy();
			this.realtimeAgentManager = null;
		}
		// Cleanup settings subscription
		if (this.settingsChangeUnsubscribe) {
			this.settingsChangeUnsubscribe();
			this.settingsChangeUnsubscribe = null;
		}
		// Reset welcome message handle
		this.welcomeMessageHandle = null;
		// Cleanup editor selection
		this.editorSelectionManager.destroy();
	}

	private async loadMessages(): Promise<void> {
		if (!this.githubCopilotCliService) return;
		const history = this.githubCopilotCliService.getMessageHistory();
		for (const message of history) {
			await this.messageRenderer.renderMessage(this.messagesContainer, message);
		}
		this.scrollToBottom();
	}

	private addWelcomeMessage(): void {
		this.welcomeMessageHandle = renderWelcomeMessage(
			this.messagesContainer,
			(text) => {
				this.inputEl.innerText = text;
				this.sendMessage();
			},
			{
				onOpenSettings: () => {
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-vault-copilot");
				},
			}
		);
	}

	/**
	 * Execute a tool directly (used by slash commands)
	 */
	async executeTool(toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
		const service = this.githubCopilotCliService as unknown as {
			readNote: (path: string) => Promise<Record<string, unknown>>;
			searchNotes: (query: string, limit: number) => Promise<Record<string, unknown>>;
			createNote: (path: string, content: string) => Promise<Record<string, unknown>>;
			getActiveNote: () => Promise<Record<string, unknown>>;
			listNotes: (folder?: string) => Promise<Record<string, unknown>>;
			listNotesRecursively: (folder?: string, limit?: number) => Promise<Record<string, unknown>>;
			appendToNote: (path: string, content: string) => Promise<Record<string, unknown>>;
			batchReadNotes: (paths: string[], aiSummarize?: boolean, summaryPrompt?: string) => Promise<Record<string, unknown>>;
			updateNote: (path: string, content: string) => Promise<Record<string, unknown>>;
			deleteNote: (path: string) => Promise<Record<string, unknown>>;
			getRecentChanges: (limit: number) => Promise<Record<string, unknown>>;
			getDailyNote: (date?: string) => Promise<Record<string, unknown>>;
			renameNote: (oldPath: string, newPath: string) => Promise<Record<string, unknown>>;
		};

		switch (toolName) {
			case "read_note":
				return await service.readNote(args.path as string);
			case "search_notes":
				return await service.searchNotes(args.query as string, (args.limit as number) || 10);
			case "create_note":
				return await service.createNote(args.path as string, args.content as string);
			case "get_active_note":
				return await service.getActiveNote();
			case "list_notes":
				return await service.listNotes(args.folder as string | undefined);
			case "list_notes_recursively":
				return await service.listNotesRecursively(args.folder as string | undefined, args.limit as number | undefined);
			case "append_to_note":
				return await service.appendToNote(args.path as string, args.content as string);
			case "batch_read_notes":
				return await service.batchReadNotes(
					args.paths as string[], 
					args.aiSummarize as boolean | undefined,
					args.summaryPrompt as string | undefined
				);
			case "update_note":
				return await service.updateNote(args.path as string, args.content as string);
			case "delete_note":
				return await service.deleteNote(args.path as string);
			case "get_recent_changes":
				return await service.getRecentChanges((args.limit as number) || 10);
			case "get_daily_note":
				return await service.getDailyNote(args.date as string | undefined);
			case "rename_note":
				return await service.renameNote(args.oldPath as string, args.newPath as string);
			default:
				return { success: false, error: `Unknown tool: ${toolName}` };
		}
	}

	async clearChat(): Promise<void> {
		await this.githubCopilotCliService.clearHistory();
		this.messagesContainer.empty();
		this.addWelcomeMessage();
	}

	/**
	 * Handle slash command
	 */
	private async handleSlashCommand(message: string): Promise<boolean> {
		if (!message.startsWith("/")) return false;

		const match = message.match(/^\/([\w-]+)(?:\s+([\s\S]*))?$/);
		if (!match) return false;

		const [, commandName, args] = match;
		if (!commandName) return false;
		
		const normalizedCommand = commandName.toLowerCase();
		
		// Check custom prompts first
		const promptInfo = this.plugin.promptCache.getPrompts().find(
			p => p.name.toLowerCase().replace(/\s+/g, '-') === normalizedCommand ||
			     p.name.toLowerCase() === normalizedCommand
		);
		
		if (promptInfo) {
			await this.promptExecutor.executePromptWithArgs(promptInfo, args?.trim() || "");
			return true;
		}
		
		const command = SLASH_COMMANDS.find(c => c.name === normalizedCommand);
		
		if (!command) {
			// Check skills before showing "unknown command"
			const skillInfo = this.plugin.skillCache.getSkills().find(
				s => s.name.toLowerCase().replace(/\s+/g, '-') === normalizedCommand ||
				     s.name.toLowerCase() === normalizedCommand
			);
			if (skillInfo) {
				return await this.executeSkillSlashCommand(skillInfo, args?.trim() || "", message);
			}

			await this.messageRenderer.renderMessage(this.messagesContainer, { role: "user", content: message, timestamp: new Date() });
			const helpMsg = `Unknown command: /${commandName}\n\nType **/help** to see available commands.`;
			await this.messageRenderer.renderMessage(this.messagesContainer, { role: "assistant", content: helpMsg, timestamp: new Date() });
			return true;
		}

		await this.messageRenderer.renderMessage(this.messagesContainer, { role: "user", content: message, timestamp: new Date() });
		
		const userMsgEl = this.messagesContainer.lastElementChild as HTMLElement;
		if (userMsgEl) this.scrollMessageToTop(userMsgEl);

		try {
			const result = await command.handler(this, args?.trim() || "");
			if (result) {
				const msgEl = this.messageRenderer.createMessageElement(this.messagesContainer, "assistant", "");
				await this.messageRenderer.renderMarkdownContent(msgEl, result);
				this.messageRenderer.addCopyButton(msgEl);
			}
		} catch (error) {
			this.addErrorMessage(`Command failed: ${error}`);
		}

		return true;
	}

	/**
	 * Execute a skill as a slash command by prepending skill instructions to the user message
	 */
	private async executeSkillSlashCommand(skillInfo: { name: string; path: string }, userArgs: string, originalMessage: string): Promise<boolean> {
		const fullSkill = await this.plugin.skillCache.getFullSkill(skillInfo.name);
		if (!fullSkill) {
			this.addErrorMessage(`Could not load skill: ${skillInfo.name}`);
			return true;
		}

		// Prepend skill instructions as context prefix
		const skillPrefix = `[Skill: ${fullSkill.name}]\n${fullSkill.instructions}\n\n---\n\n`;
		const enhancedMessage = skillPrefix + (userArgs || `Use the ${fullSkill.name} skill.`);

		await this.messageRenderer.renderMessage(this.messagesContainer, { role: "user", content: originalMessage, timestamp: new Date() });
		const userMsgEl = this.messagesContainer.lastElementChild as HTMLElement;
		if (userMsgEl) this.scrollMessageToTop(userMsgEl);

		this.isProcessing = true;
		this.updateUIState();
		this.showThinkingIndicator();

		try {
			const msgEl = this.messageRenderer.createMessageElement(this.messagesContainer, "assistant", "");

			if (this.plugin.settings.streaming) {
				let isFirstDelta = true;
				await this.githubCopilotCliService.sendMessageStreaming(
					enhancedMessage,
					(delta: string) => {
						if (isFirstDelta) {
							this.hideThinkingIndicator();
							isFirstDelta = false;
						}
						const contentEl = msgEl.querySelector(".vc-message-content");
						if (contentEl) contentEl.textContent += delta;
					},
					async (fullContent: string) => {
						await this.messageRenderer.renderMarkdownContent(msgEl, fullContent);
						this.messageRenderer.addCopyButton(msgEl);
					}
				);
			} else {
				this.hideThinkingIndicator();
				const response = await this.githubCopilotCliService.sendMessage(enhancedMessage);
				await this.messageRenderer.renderMarkdownContent(msgEl, response);
				this.messageRenderer.addCopyButton(msgEl);
			}
		} catch (error) {
			this.addErrorMessage(`Skill execution failed: ${error}`);
		} finally {
			this.isProcessing = false;
			this.updateUIState();
			this.hideThinkingIndicator();
		}

		return true;
	}

	private async sendMessage(): Promise<void> {
		const { text: message, chipFilePaths } = this.inputAreaManager.extractInputContent();
		if (!message || this.isProcessing) return;

		this.editorSelectionManager.clearHighlight();
		this.inputAreaManager.addToHistory(message);

		this.isProcessing = true;
		this.updateUIState();
		this.showThinkingIndicator();

		this.inputEl.innerHTML = "";
		this.inputAreaManager.autoResizeInput();

		await this.ensureSessionExists();

		const welcomeEl = this.messagesContainer.querySelector(".vc-welcome");
		if (welcomeEl) welcomeEl.remove();

		// Slash commands
		if (message.startsWith("/")) {
			try {
				const handled = await this.handleSlashCommand(message);
				if (handled) {
					this.isProcessing = false;
					this.updateUIState();
					this.hideThinkingIndicator();
					this.scrollToBottom();
					return;
				}
			} catch (error) {
				this.addErrorMessage(`Command error: ${error}`);
				this.isProcessing = false;
				this.updateUIState();
				this.hideThinkingIndicator();
				return;
			}
		}

		// Check if voice agent is active
		if (this.realtimeAgentManager?.isConnected()) {
			await this.messageRenderer.renderMessage(this.messagesContainer, { role: "user", content: message, timestamp: new Date() });
			this.realtimeAgentManager.sendMessage(message);
			this.isProcessing = false;
			this.updateUIState();
			this.hideThinkingIndicator();
			this.scrollToBottom();
			return;
		}

		// Process #fetch URL references
		const { processedMessage, fetchedUrls, fetchedContext } = await this.promptProcessor.processFetchReferences(message);

		// Build context
		const { fullMessage, usedReferences } = await this.messageContextBuilder.buildContext({
			processedMessage,
			fetchedUrls,
			fetchedContext,
			chipFilePaths,
			attachedNotes: this.inputAreaManager.getAttachedNotes(),
			preservedSelectionText: this.editorSelectionManager.getPreservedSelectionText(),
			selectedAgent: this.toolbarManager.getSelectedAgent(),
		});

		const userMessageEl = await this.messageRenderer.renderMessage(this.messagesContainer, { role: "user", content: processedMessage, timestamp: new Date() });
		
		if (usedReferences.length > 0) {
			this.messageRenderer.renderUsedReferences(this.messagesContainer, usedReferences);
		}

		this.inputAreaManager.clearAttachments();

		try {
			this.currentStreamingMessageEl = this.messageRenderer.createMessageElement(this.messagesContainer, "assistant", "");
			
			if (userMessageEl) {
				requestAnimationFrame(() => {
					this.scrollMessageToTop(userMessageEl);
				});
			}

			this.toolbarManager.logToolContext();

			let isFirstDelta = true;
			if (this.plugin.settings.streaming) {
				await this.githubCopilotCliService.sendMessageStreaming(
					fullMessage,
					(delta) => {
						if (isFirstDelta) {
							this.hideThinkingIndicator();
							isFirstDelta = false;
						}
						if (this.currentStreamingMessageEl) {
							const contentEl = this.currentStreamingMessageEl.querySelector(".vc-message-content");
							if (contentEl) contentEl.textContent += delta;
						}
					},
					async (fullContent) => {
						if (this.currentStreamingMessageEl) {
							await this.messageRenderer.renderMarkdownContent(this.currentStreamingMessageEl, fullContent);
							this.messageRenderer.addCopyButton(this.currentStreamingMessageEl);
						}
						this.currentStreamingMessageEl = null;
					}
				);
			} else {
				this.hideThinkingIndicator();
				const response = await this.githubCopilotCliService.sendMessage(fullMessage);
				if (this.currentStreamingMessageEl) {
					await this.messageRenderer.renderMarkdownContent(this.currentStreamingMessageEl, response);
					this.messageRenderer.addCopyButton(this.currentStreamingMessageEl);
				}
				this.currentStreamingMessageEl = null;
			}
		} catch (error) {
			console.error(`Vault Copilot error: ${error}`);
			if (this.currentStreamingMessageEl) {
				this.currentStreamingMessageEl.remove();
				this.currentStreamingMessageEl = null;
			}
			this.addErrorMessage(String(error));
		} finally {
			this.hideThinkingIndicator();
			
			await this.sessionManager.autoRenameSessionFromFirstMessage(
				message,
				this.sessionPanel ? () => this.sessionPanel!.render() : undefined
			);
			
			this.isProcessing = false;
			this.updateUIState();
		}
	}

	/**
	 * Render an MCP App inline in the chat (delegates to ToolExecutionRenderer)
	 */
	renderMcpApp(
		containerEl: HTMLElement,
		resource: UIResourceContent,
		toolInfo?: { id?: string | number; tool: { name: string; description: string } }
	): McpAppContainer {
		return this.toolExecutionRenderer.renderMcpApp(containerEl, resource, toolInfo);
	}

	renderToolExecution(
		toolName: string,
		toolArgs: Record<string, unknown>,
		uiResourceUri?: string
	): HTMLElement {
		const el = this.toolExecutionRenderer.renderToolExecution(
			this.messagesContainer,
			toolName,
			toolArgs,
			uiResourceUri
		);
		this.scrollToBottom();
		return el;
	}

	async updateToolExecutionComplete(
		containerEl: HTMLElement,
		result: ToolCallResult,
		uiResource?: UIResourceContent
	): Promise<void> {
		await this.toolExecutionRenderer.updateToolExecutionComplete(
			this.messagesContainer,
			containerEl,
			result,
			uiResource
		);
		this.scrollToBottom();
	}

	renderSampleMcpApp(): void {
		this.toolExecutionRenderer.renderSampleMcpApp(this.messagesContainer);
		this.scrollToBottom();
	}

	private addErrorMessage(error: string): void {
		const errorEl = this.messagesContainer.createDiv({ cls: "vc-error" });
		errorEl.createEl("span", { text: `Error: ${error}` });
	}

	private handleSendOrCancel(): void {
		if (this.isProcessing) {
			this.cancelRequest();
		} else {
			this.sendMessage();
		}
	}

	private async cancelRequest(): Promise<void> {
		try {
			await this.githubCopilotCliService.abort();
			if (this.currentStreamingMessageEl) {
				const contentEl = this.currentStreamingMessageEl.querySelector(".vc-message-content");
				if (contentEl && contentEl.textContent) {
					contentEl.textContent += "\n\n*[Generation cancelled]*";
				} else {
					this.currentStreamingMessageEl.remove();
				}
				this.currentStreamingMessageEl = null;
			}
			this.isProcessing = false;
			this.updateUIState();
		} catch (error) {
			console.error("Failed to cancel:", error);
		}
	}

	private updateUIState(): void {
		this.inputEl.contentEditable = this.isProcessing ? "false" : "true";
		
		if (this.isProcessing) {
			this.sendButton.addClass("vc-loading");
			this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><rect x="9" y="9" width="6" height="6"></rect></svg>`;
			this.sendButton.setAttribute("aria-label", "Stop generation");
		} else {
			this.sendButton.removeClass("vc-loading");
			this.sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>`;
			this.sendButton.setAttribute("aria-label", "Send message");
		}
	}

	private scrollToBottom(): void {
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private scrollMessageToTop(messageEl: HTMLElement): void {
		const containerRect = this.messagesContainer.getBoundingClientRect();
		const messageRect = messageEl.getBoundingClientRect();
		const scrollAmount = this.messagesContainer.scrollTop + (messageRect.top - containerRect.top);
		this.messagesContainer.scrollTop = scrollAmount;
	}
}

