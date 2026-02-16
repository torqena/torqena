// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module MessageContextBuilder
 * @description Builds the full context-augmented message for AI service calls.
 *
 * Assembles context from multiple sources (editor selection, agent instructions,
 * fetched URLs, inline note references, chip file references, attached notes,
 * and implicit context) into a single message. Also collects used references
 * for display in the chat UI.
 *
 * @see {@link CopilotChatView} for the orchestrator that calls this builder
 * @see {@link ContextAugmentation} for implicit context gathering
 * @see {@link PromptProcessor} for fetch reference processing
 * @since 0.0.15
 */

import { App, TFile } from "obsidian";
import { PromptProcessor } from "./PromptProcessor";
import { ContextAugmentation } from "./ContextAugmentation";
import { UsedReference } from "../renderers/MessageRenderer";
import { CachedAgentInfo } from "../../ai/customization/AgentCache";
import { GitHubCopilotCliService } from "../../ai/providers/GitHubCopilotCliService";
import type CopilotPlugin from "../../main";

/**
 * Parameters for building message context
 */
export interface MessageContextParams {
	/** The user's processed message (after fetch references) */
	processedMessage: string;
	/** Fetched URLs from #fetch processing */
	fetchedUrls: string[];
	/** Fetched content from #fetch processing */
	fetchedContext: string[];
	/** File paths from inline # chips */
	chipFilePaths: string[];
	/** Files attached via the "Add Context" button */
	attachedNotes: TFile[];
	/** Preserved editor selection text */
	preservedSelectionText: string;
	/** Currently selected agent (if any) */
	selectedAgent: CachedAgentInfo | null;
}

/**
 * Result of building message context
 */
export interface MessageContextResult {
	/** The fully augmented message ready for the AI service */
	fullMessage: string;
	/** References used in building context, for UI display */
	usedReferences: UsedReference[];
}

/**
 * Builds context-augmented messages and collects used references
 */
export class MessageContextBuilder {
	private app: App;
	private plugin: CopilotPlugin;
	private promptProcessor: PromptProcessor;
	private contextAugmentation: ContextAugmentation;
	private service: GitHubCopilotCliService;

	constructor(
		app: App,
		plugin: CopilotPlugin,
		promptProcessor: PromptProcessor,
		contextAugmentation: ContextAugmentation,
		service: GitHubCopilotCliService
	) {
		this.app = app;
		this.plugin = plugin;
		this.promptProcessor = promptProcessor;
		this.contextAugmentation = contextAugmentation;
		this.service = service;
	}

	/**
	 * Update the service reference (needed when active service changes)
	 */
	updateService(service: GitHubCopilotCliService): void {
		this.service = service;
	}

	/**
	 * Build the full message with all context sources and collect references
	 */
	async buildContext(params: MessageContextParams): Promise<MessageContextResult> {
		const {
			processedMessage,
			fetchedUrls,
			fetchedContext,
			chipFilePaths,
			attachedNotes,
			preservedSelectionText,
			selectedAgent,
		} = params;

		// Extract and process [[filename]] inline references
		const inlineNoteRefs = MessageContextBuilder.extractInlineNoteReferences(processedMessage);
		const inlineNoteContext: string[] = [];
		const loadedInlineNotes: string[] = [];
		for (const noteName of inlineNoteRefs) {
			const file = this.app.metadataCache.getFirstLinkpathDest(noteName, "");
			if (file) {
				try {
					const content = await this.app.vault.cachedRead(file);
					inlineNoteContext.push(`--- Content of "${file.path}" ---\n${content}\n--- End of "${file.path}" ---`);
					loadedInlineNotes.push(file.basename);
				} catch (e) {
					console.error(`Failed to read inline note reference: ${noteName}`, e);
				}
			}
		}

		// Build message with all context sources
		let fullMessage = processedMessage;

		// Add preserved editor selection as implicit workspace context
		if (preservedSelectionText) {
			const selectionContext = [
				'[Selected text from editor]',
				preservedSelectionText,
				'[End selected text]',
				'',
				'User message:',
				fullMessage
			].join('\n');
			fullMessage = selectionContext;
		}

		// Add selected agent instructions as context
		if (selectedAgent) {
			const fullAgent = await this.plugin.agentCache.getFullAgent(selectedAgent.name);
			if (fullAgent?.instructions) {
				fullMessage = `[Agent Instructions for "${fullAgent.name}"]\n${fullAgent.instructions}\n[End Agent Instructions]\n\nUser message:\n${fullMessage}`;
			}
		}

		// Add fetched web page content as context
		if (fetchedContext.length > 0) {
			fullMessage = `${fetchedContext.join("\n\n")}\n\n${fullMessage}`;
		}

		// Add inline [[note]] reference content as context
		if (inlineNoteContext.length > 0) {
			fullMessage = `${inlineNoteContext.join("\n\n")}\n\n${fullMessage}`;
		}

		// Add inline chip note refs (from # picker) as context
		const chipFileNames: string[] = [];
		if (chipFilePaths.length > 0) {
			const inlineRefContext: string[] = [];
			for (const filePath of chipFilePaths) {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					try {
						const content = await this.app.vault.cachedRead(file);
						inlineRefContext.push(`--- Content of "${file.path}" ---\n${content}\n--- End of "${file.path}" ---`);
						chipFileNames.push(file.basename);
					} catch (e) {
						console.error(`Failed to read inline note ref: ${file.path}`, e);
					}
				}
			}
			if (inlineRefContext.length > 0) {
				fullMessage = `${inlineRefContext.join("\n\n")}\n\n${fullMessage}`;
			}
		}

		// Add attached notes context
		if (attachedNotes.length > 0) {
			const attachmentContext: string[] = [];
			for (const file of attachedNotes) {
				try {
					const content = await this.app.vault.cachedRead(file);
					attachmentContext.push(`--- Content of "${file.path}" ---\n${content}\n--- End of "${file.path}" ---`);
				} catch (e) {
					console.error(`Failed to read attached note: ${file.path}`, e);
				}
			}
			if (attachmentContext.length > 0) {
				fullMessage = `${attachmentContext.join("\n\n")}\n\nUser question about the above note(s):\n${processedMessage}`;
			}
		}

		// Gather and add implicit context (selected text, active file, open tabs)
		const implicitContext = await this.contextAugmentation.gatherImplicitContext();

		const hasImplicitContext =
			implicitContext.selectedText !== null ||
			implicitContext.activeFile !== null ||
			implicitContext.openTabs.length > 0;

		if (hasImplicitContext) {
			const implicitContextFormatted = this.contextAugmentation.formatImplicitContext(implicitContext);

			if (implicitContextFormatted.trim().length > 0) {
				fullMessage = `${implicitContextFormatted}\n\nUser message:\n${fullMessage}`;
			}
		}

		// Collect all used references for display
		const usedReferences: UsedReference[] = [];

		// Add preserved editor selection as a reference
		if (preservedSelectionText) {
			const SELECTION_PREVIEW_MAX = 100;
			const preview = preservedSelectionText.length > SELECTION_PREVIEW_MAX
				? preservedSelectionText.substring(0, SELECTION_PREVIEW_MAX) + '...'
				: preservedSelectionText;
			usedReferences.push({
				type: "workspace",
				name: "Selected text from editor",
				path: preview
			});
		}

		// Add selected agent as a reference
		if (selectedAgent) {
			usedReferences.push({
				type: "agent",
				name: selectedAgent.name,
				path: selectedAgent.path
			});
		}

		// Add loaded instructions as references
		const loadedInstructions = this.service.getLoadedInstructions();
		for (const instruction of loadedInstructions) {
			usedReferences.push({
				type: "instruction",
				name: instruction.name,
				path: instruction.path
			});
		}

		// Add fetched URLs as references
		for (const url of fetchedUrls) {
			usedReferences.push({
				type: "url",
				name: new URL(url).hostname,
				path: url
			});
		}

		// Add inline [[note]] references
		for (let i = 0; i < loadedInlineNotes.length; i++) {
			const noteName = loadedInlineNotes[i];
			const noteRef = inlineNoteRefs[i];
			const file = this.app.metadataCache.getFirstLinkpathDest(noteRef || "", "");
			usedReferences.push({
				type: "context",
				name: noteName || noteRef || "Unknown",
				path: file?.path || noteRef || ""
			});
		}

		// Add chip file references
		for (let i = 0; i < chipFileNames.length; i++) {
			usedReferences.push({
				type: "context",
				name: chipFileNames[i] || "Unknown",
				path: chipFilePaths[i] || ""
			});
		}

		// Add attached notes as context
		for (const file of attachedNotes) {
			usedReferences.push({
				type: "context",
				name: file.basename,
				path: file.path
			});
		}

		// Add implicit context sources
		if (implicitContext.selectedText) {
			usedReferences.push({
				type: "context",
				name: `Selected text from ${implicitContext.selectedText.file.basename}`,
				path: implicitContext.selectedText.file.path
			});
		}

		if (implicitContext.activeFile) {
			usedReferences.push({
				type: "context",
				name: `Active file: ${implicitContext.activeFile.basename}`,
				path: implicitContext.activeFile.path
			});
		}

		// Add other open tabs (excluding active file to avoid duplication)
		const otherTabs = this.contextAugmentation.getOtherOpenTabs(implicitContext);
		for (const tab of otherTabs) {
			usedReferences.push({
				type: "context",
				name: `Open tab: ${tab.file.basename}`,
				path: tab.file.path
			});
		}

		return { fullMessage, usedReferences };
	}

	/**
	 * Extract [[filename]] inline note references from text.
	 * Handles aliases like [[note|alias]] by extracting just the note name.
	 */
	static extractInlineNoteReferences(message: string): string[] {
		const noteRefs: string[] = [];
		const regex = /\[\[([^\]]+)\]\]/g;
		let match;
		while ((match = regex.exec(message)) !== null) {
			const fullRef = match[1];
			if (fullRef) {
				const noteName = fullRef.split("|")[0]?.trim();
				if (noteName && !noteRefs.includes(noteName)) {
					noteRefs.push(noteName);
				}
			}
		}
		return noteRefs;
	}
}
