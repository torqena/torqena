/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module PromptExecutor
 * @description Executes custom prompts (from the prompt library / slash commands), handling
 * variable replacement, input collection modals, file/URL reference expansion, and streaming.
 *
 * @see {@link CopilotChatView} for integration
 * @see {@link PromptProcessor} for variable processing
 * @since 0.0.20
 */

import { App } from "obsidian";
import CopilotPlugin from "../../main";
import { GitHubCopilotCliService, ChatMessage } from "../../ai/providers/GitHubCopilotCliService";
import { CachedPromptInfo } from "../../ai/customization/PromptCache";
import { PromptInputModal, parseInputVariables } from "../modals/PromptInputModal";
import { PromptProcessor } from "../processing/PromptProcessor";
import { MessageRenderer, UsedReference } from "../renderers/MessageRenderer";
import { MessageContextBuilder } from "../processing/MessageContextBuilder";

/**
 * Callbacks that the PromptExecutor needs from the parent view
 */
export interface PromptExecutorCallbacks {
	/** Ensure a session exists before sending messages */
	ensureSessionExists: () => Promise<void>;
	/** Render a full chat message and return the element */
	renderMessage: (message: ChatMessage) => Promise<HTMLElement>;
	/** Create a streaming message element */
	createMessageElement: (role: "user" | "assistant", content: string) => HTMLElement;
	/** Render markdown into a message element */
	renderMarkdownContent: (messageEl: HTMLElement, content: string) => Promise<void>;
	/** Add a copy button to a message element */
	addCopyButton: (messageEl: HTMLElement) => void;
	/** Render used references after a message */
	renderUsedReferences: (references: UsedReference[]) => void;
	/** Show an error message */
	addErrorMessage: (error: string) => void;
	/** Set processing state */
	setProcessing: (isProcessing: boolean) => void;
	/** Show the thinking indicator */
	showThinkingIndicator: () => void;
	/** Hide the thinking indicator */
	hideThinkingIndicator: () => void;
	/** Update the UI send/cancel button state */
	updateUIState: () => void;
	/** Scroll messages to bottom */
	scrollToBottom: () => void;
	/** Scroll so a message is at the top of the visible area */
	scrollMessageToTop: (messageEl: HTMLElement) => void;
	/** Get preserved editor selection text */
	getPreservedSelectionText: () => string | null;
	/** Log tool context for debugging */
	logToolContext: (promptTools?: string[]) => void;
	/** Clear the input area */
	clearInput: () => void;
	/** Auto-resize the input */
	autoResizeInput: () => void;
	/** Get the messages container element */
	getMessagesContainer: () => HTMLElement;
}

/**
 * Executes custom prompts with variable processing, input modals, and streaming
 */
export class PromptExecutor {
	private app: App;
	private plugin: CopilotPlugin;
	private service: GitHubCopilotCliService;
	private promptProcessor: PromptProcessor;
	private callbacks: PromptExecutorCallbacks;

	private currentStreamingMessageEl: HTMLElement | null = null;

	constructor(
		app: App,
		plugin: CopilotPlugin,
		service: GitHubCopilotCliService,
		promptProcessor: PromptProcessor,
		callbacks: PromptExecutorCallbacks
	) {
		this.app = app;
		this.plugin = plugin;
		this.service = service;
		this.promptProcessor = promptProcessor;
		this.callbacks = callbacks;
	}

	/**
	 * Normalize an agent reference from frontmatter.
	 * Strips wikilink syntax (`[[...]]`) and `.agent` suffix.
	 * e.g., `"[[daily-journal.agent]]"` → `"daily-journal"`
	 *
	 * @param agentRef - Raw agent value from frontmatter
	 * @returns Normalized agent name
	 * @internal
	 */
	private normalizeAgentRef(agentRef: string): string {
		let name = agentRef.trim();
		// Strip wikilink brackets
		if (name.startsWith('[[') && name.endsWith(']]')) {
			name = name.slice(2, -2);
		}
		// Strip path prefix (e.g., "../Agents/Tutor.agent" → "Tutor.agent")
		const lastSlash = name.lastIndexOf('/');
		if (lastSlash !== -1) {
			name = name.slice(lastSlash + 1);
		}
		// Strip .agent suffix
		if (name.endsWith('.agent')) {
			name = name.slice(0, -6);
		}
		return name;
	}

	/**
	 * Resolve agent from prompt frontmatter and load its instructions.
	 * Returns the agent instructions to prepend, or empty string if no agent.
	 *
	 * @param agentRef - Raw agent value from frontmatter
	 * @returns Agent instructions prefix and used reference, if found
	 * @internal
	 */
	private async resolveAgentInstructions(agentRef?: string): Promise<{ prefix: string; reference?: { name: string; path: string } }> {
		if (!agentRef) return { prefix: '' };

		const agentName = this.normalizeAgentRef(agentRef);
		const agent = this.plugin.agentCache.getAgentByName(agentName);

		if (!agent) {
			console.warn(`[VC] Agent "${agentRef}" (normalized: "${agentName}") specified in prompt not found`);
			return { prefix: '' };
		}

		console.log(`[VC] Prompt specifies agent: ${agent.name}`);

		// Load full agent instructions
		const fullAgent = await this.plugin.agentCache.getFullAgent(agent.name);
		if (fullAgent?.instructions) {
			const prefix = `[Agent: ${agent.name}]\n${fullAgent.instructions}\n\n---\n\n`;
			return { prefix, reference: { name: agent.name, path: agent.path } };
		}

		return { prefix: '', reference: { name: agent.name, path: agent.path } };
	}

	/**
	 * Execute a custom prompt with additional user arguments.
	 * Called when user types /prompt-name additional text here.
	 *
	 * @param promptInfo - The cached prompt metadata
	 * @param userArgs - Additional text after the slash command
	 */
	async executePromptWithArgs(promptInfo: CachedPromptInfo, userArgs: string): Promise<void> {
		const fullPrompt = await this.plugin.promptCache.getFullPrompt(promptInfo.name);
		if (!fullPrompt) {
			console.error(`Could not load prompt: ${promptInfo.name}`);
			return;
		}

		const inputVariables = parseInputVariables(fullPrompt.content);

		if (inputVariables.length > 0) {
			const modal = new PromptInputModal(this.app, inputVariables, (values) => {
				this.executePromptWithInputValues(promptInfo, fullPrompt, userArgs, values);
			});
			modal.open();
			return;
		}

		await this.executePromptWithInputValues(promptInfo, fullPrompt, userArgs, new Map());
	}

	/**
	 * Execute a custom prompt (VS Code compatible) — no user args.
	 * Called when user selects a prompt from the picker dropdown.
	 *
	 * @param promptInfo - The cached prompt metadata
	 */
	async executePrompt(promptInfo: CachedPromptInfo): Promise<void> {
		this.callbacks.clearInput();
		this.callbacks.autoResizeInput();

		const fullPrompt = await this.plugin.promptCache.getFullPrompt(promptInfo.name);
		if (!fullPrompt) {
			console.error(`Could not load prompt: ${promptInfo.name}`);
			return;
		}

		await this.callbacks.ensureSessionExists();

		// Clear welcome message if present
		const messagesContainer = this.callbacks.getMessagesContainer();
		const welcomeEl = messagesContainer.querySelector(".vc-welcome");
		if (welcomeEl) welcomeEl.remove();

		const userMessage = `Run prompt: **${promptInfo.name}**\n\n> ${promptInfo.description}`;
		await this.callbacks.renderMessage({ role: "user", content: userMessage, timestamp: new Date() });

		const promptUserMsgEl = messagesContainer.lastElementChild as HTMLElement;
		if (promptUserMsgEl) {
			this.callbacks.scrollMessageToTop(promptUserMsgEl);
		}

		this.callbacks.setProcessing(true);
		this.callbacks.updateUIState();
		this.callbacks.showThinkingIndicator();

		try {
			this.currentStreamingMessageEl = this.callbacks.createMessageElement("assistant", "");
			this.callbacks.scrollToBottom();

			let content = await this.promptProcessor.processVariables(
				fullPrompt.content, fullPrompt.path, this.callbacks.getPreservedSelectionText() ?? undefined
			);
			content = await this.promptProcessor.resolveMarkdownFileLinks(content, fullPrompt.path);
			content = this.promptProcessor.processToolReferences(content, fullPrompt.tools);

			// Prepend agent instructions if specified
			if (fullPrompt.agent) {
				const { prefix: agentPrefix } = await this.resolveAgentInstructions(fullPrompt.agent);
				if (agentPrefix) {
					content = agentPrefix + content;
				}
			}

			const originalModel = this.plugin.settings.model;
			if (fullPrompt.model) {
				this.service.updateConfig({ model: fullPrompt.model });
				console.log(`[VC] Prompt using model: ${fullPrompt.model}`);
			}

			this.callbacks.logToolContext(fullPrompt.tools);

			await this.sendContent(content);

			if (fullPrompt.model) {
				this.service.updateConfig({ model: originalModel });
			}
		} catch (error) {
			console.error(`Prompt execution error: ${error}`);
			if (this.currentStreamingMessageEl) {
				this.currentStreamingMessageEl.remove();
				this.currentStreamingMessageEl = null;
			}
			this.callbacks.addErrorMessage(String(error));
		} finally {
			this.callbacks.hideThinkingIndicator();
			this.callbacks.setProcessing(false);
			this.callbacks.updateUIState();
			this.callbacks.scrollToBottom();
		}
	}

	/**
	 * Execute a prompt after input variables have been collected
	 */
	private async executePromptWithInputValues(
		promptInfo: CachedPromptInfo,
		fullPrompt: { content: string; path: string; agent?: string; model?: string; tools?: string[]; timeout?: number },
		userArgs: string,
		inputValues: Map<string, string>
	): Promise<void> {
		await this.callbacks.ensureSessionExists();

		const messagesContainer = this.callbacks.getMessagesContainer();
		const welcomeEl = messagesContainer.querySelector(".vc-welcome");
		if (welcomeEl) welcomeEl.remove();

		// Build display message
		let userMessage = `Run prompt: **${promptInfo.name}**\n\n> ${promptInfo.description}`;
		if (userArgs) userMessage += `\n\n**Input:** ${userArgs}`;
		if (inputValues.size > 0) {
			for (const [name, value] of inputValues) {
				userMessage += `\n\n**${name}:** ${value}`;
			}
		}
		await this.callbacks.renderMessage({ role: "user", content: userMessage, timestamp: new Date() });

		const usedReferences: UsedReference[] = [];

		if (fullPrompt.agent) {
			const { reference: agentRef } = await this.resolveAgentInstructions(fullPrompt.agent);
			if (agentRef) {
				usedReferences.push({ type: "agent", name: agentRef.name, path: agentRef.path });
			}
		}

		this.callbacks.setProcessing(true);
		this.callbacks.updateUIState();
		this.callbacks.showThinkingIndicator();

		try {
			let content = await this.promptProcessor.processVariables(
				fullPrompt.content, fullPrompt.path, this.callbacks.getPreservedSelectionText() ?? undefined
			);

			content = content.replace(/\$\{userInput\}/g, userArgs || '[No input provided]');

			// Expand folder paths to file references
			if (userArgs) {
				const normalizedPath = userArgs.replace(/^\/+|\/+$/g, '');
				const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

				if (folder && 'children' in folder) {
					const files = this.app.vault.getMarkdownFiles().filter(f =>
						f.path === normalizedPath || f.path.startsWith(normalizedPath + '/')
					);
					for (const file of files) {
						usedReferences.push({ type: "context", name: file.basename, path: file.path });
					}
					console.log(`[VC] Expanded folder "${normalizedPath}" to ${files.length} file references`);
				}
			}

			content = this.processInputVariablesWithValues(content, inputValues);

			const { content: contentWithLinks, resolvedFiles } = await this.promptProcessor.resolveMarkdownFileLinksWithTracking(content, fullPrompt.path);
			content = contentWithLinks;

			for (const file of resolvedFiles) {
				usedReferences.push({ type: "context", name: file.name, path: file.path });
			}

			content = this.promptProcessor.processToolReferences(content, fullPrompt.tools);

			// Prepend agent instructions if specified
			if (fullPrompt.agent) {
				const { prefix: agentPrefix } = await this.resolveAgentInstructions(fullPrompt.agent);
				if (agentPrefix) {
					content = agentPrefix + content;
				}
			}

			// Process user arguments (fetch URLs, inline note refs)
			if (userArgs) {
				const additionalContent = await this.processUserArgsContent(userArgs, usedReferences);
				if (additionalContent) content += additionalContent;
			}

			if (usedReferences.length > 0) {
				this.callbacks.renderUsedReferences(usedReferences);
			}

			this.currentStreamingMessageEl = this.callbacks.createMessageElement("assistant", "");
			this.callbacks.scrollToBottom();

			const originalModel = this.plugin.settings.model;
			if (fullPrompt.model) {
				this.service.updateConfig({ model: fullPrompt.model });
				console.log(`[VC] Prompt using model: ${fullPrompt.model}`);
			}

			const timeoutMs = fullPrompt.timeout ? fullPrompt.timeout * 1000 : undefined;
			this.callbacks.logToolContext(fullPrompt.tools);

			await this.sendContent(content, timeoutMs);

			if (fullPrompt.model) {
				this.service.updateConfig({ model: originalModel });
			}
		} catch (error) {
			console.error(`Prompt execution error: ${error}`);
			if (this.currentStreamingMessageEl) {
				this.currentStreamingMessageEl.remove();
				this.currentStreamingMessageEl = null;
			}
			this.callbacks.addErrorMessage(String(error));
		} finally {
			this.callbacks.hideThinkingIndicator();
			this.callbacks.setProcessing(false);
			this.callbacks.updateUIState();
			this.callbacks.scrollToBottom();
		}
	}

	/**
	 * Process user arguments to find fetch URLs and inline note references.
	 * Returns additional content to append, or null if none.
	 */
	private async processUserArgsContent(userArgs: string, usedReferences: UsedReference[]): Promise<string | null> {
		const { processedMessage: processedUserArgs, fetchedUrls, fetchedContext } = await this.promptProcessor.processFetchReferences(userArgs);

		const inlineNoteRefs = MessageContextBuilder.extractInlineNoteReferences(processedUserArgs);
		const inlineNoteContext: string[] = [];
		for (const noteName of inlineNoteRefs) {
			const file = this.app.metadataCache.getFirstLinkpathDest(noteName, "");
			if (file) {
				try {
					const noteContent = await this.app.vault.cachedRead(file);
					inlineNoteContext.push(`--- Content of "${file.path}" ---\n${noteContent}\n--- End of "${file.path}" ---`);
					usedReferences.push({ type: "context", name: file.basename, path: file.path });
				} catch (e) {
					console.error(`Failed to read inline note reference: ${noteName}`, e);
				}
			}
		}

		for (const url of fetchedUrls) {
			try {
				usedReferences.push({ type: "url", name: new URL(url).hostname, path: url });
			} catch {
				usedReferences.push({ type: "url", name: url, path: url });
			}
		}

		if (fetchedContext.length > 0 || inlineNoteContext.length > 0) {
			let section = `\n\n---\n**Referenced content:**\n`;
			if (fetchedContext.length > 0) section += `\n${fetchedContext.join("\n\n")}\n`;
			if (inlineNoteContext.length > 0) section += `\n${inlineNoteContext.join("\n\n")}\n`;
			return section;
		}

		return null;
	}

	/**
	 * Process ${input:name:...} variables with pre-collected values
	 */
	private processInputVariablesWithValues(content: string, values: Map<string, string>): string {
		const inputRegex = /\$\{input:([^:}]+):([^}]+)\}/g;

		return content.replace(inputRegex, (_match, varName, descAndOptions) => {
			if (values.has(varName)) return values.get(varName) || '';

			const parts = descAndOptions.split('|');
			const options = parts.slice(1).map((opt: string) => opt.trim()).filter((opt: string) => opt);
			if (options.length > 0) return options[0];

			const description = parts[0]?.trim() || varName;
			return `[${description}]`;
		});
	}

	/**
	 * Send content to the AI service (handles streaming vs non-streaming)
	 */
	private async sendContent(content: string, timeoutMs?: number): Promise<void> {
		if (this.plugin.settings.streaming) {
			await this.service.sendMessageStreaming(
				content,
				(delta) => {
					if (this.currentStreamingMessageEl) {
						const contentEl = this.currentStreamingMessageEl.querySelector(".vc-message-content");
						if (contentEl) contentEl.textContent += delta;
					}
					this.callbacks.scrollToBottom();
				},
				async (fullContent) => {
					if (this.currentStreamingMessageEl) {
						await this.callbacks.renderMarkdownContent(this.currentStreamingMessageEl, fullContent);
						this.callbacks.addCopyButton(this.currentStreamingMessageEl);
					}
					this.currentStreamingMessageEl = null;
				},
				timeoutMs
			);
		} else {
			const response = await this.service.sendMessage(content, timeoutMs);
			if (this.currentStreamingMessageEl) {
				await this.callbacks.renderMarkdownContent(this.currentStreamingMessageEl, response);
				this.callbacks.addCopyButton(this.currentStreamingMessageEl);
			}
			this.currentStreamingMessageEl = null;
		}
	}
}
