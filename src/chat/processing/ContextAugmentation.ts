/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ContextAugmentation
 * @description Manages implicit context augmentation for chat messages.
 * 
 * This module automatically gathers contextual information from the vault
 * to enhance chat interactions without requiring explicit user input.
 * 
 * Features:
 * - Active file content inclusion
 * - All open tabs content
 * - Selected text in editor
 * - Open tabs metadata
 * 
 * @example
 * ```typescript
 * const augmentation = new ContextAugmentation(app);
 * const context = await augmentation.gatherImplicitContext();
 * ```
 * 
 * @since 0.0.14
 */

import { App, TFile, MarkdownView } from "obsidian";

/**
 * Represents the selected text and its source file
 */
export interface SelectedTextContext {
	/** The selected text content */
	text: string;
	/** The file where the text was selected */
	file: TFile;
}

/**
 * Represents an open tab in the workspace
 */
export interface OpenTabInfo {
	/** The file in this tab */
	file: TFile;
	/** Whether this is the active tab */
	isActive: boolean;
}

/**
 * Complete implicit context gathered from the workspace
 */
export interface ImplicitContext {
	/** The currently active file */
	activeFile: TFile | null;
	/** Content of the active file */
	activeFileContent: string | null;
	/** Currently selected text in the editor */
	selectedText: SelectedTextContext | null;
	/** All open tabs (files) */
	openTabs: OpenTabInfo[];
	/** Content from all open tabs */
	openTabsContent: Map<string, string>;
}

/**
 * Service for gathering implicit context from the Obsidian workspace
 */
export class ContextAugmentation {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Get the currently selected text in the active editor
	 * 
	 * @returns Selected text and its source file, or null if no selection
	 * 
	 * @example
	 * ```typescript
	 * const selection = augmentation.getSelectedText();
	 * if (selection) {
	 *   console.log(`Selected: ${selection.text} from ${selection.file.path}`);
	 * }
	 * ```
	 */
	getSelectedText(): SelectedTextContext | null {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || !activeView.editor) {
			return null;
		}

		const editor = activeView.editor;
		const selection = editor.getSelection();
		
		if (!selection || selection.trim().length === 0) {
			return null;
		}

		const file = activeView.file;
		if (!file) {
			return null;
		}

		return {
			text: selection,
			file: file
		};
	}

	/**
	 * Get all currently open tabs (files) in the workspace
	 * 
	 * @returns Array of open tab information
	 * 
	 * @example
	 * ```typescript
	 * const tabs = augmentation.getOpenTabs();
	 * console.log(`${tabs.length} tabs open`);
	 * ```
	 */
	getOpenTabs(): OpenTabInfo[] {
		const openTabs: OpenTabInfo[] = [];
		const activeFile = this.app.workspace.getActiveFile();

		// Get all markdown leaves (tabs)
		const leaves = this.app.workspace.getLeavesOfType('markdown');
		
		for (const leaf of leaves) {
			const view = leaf.view as any;
			// Check if view has a file property (duck typing for MarkdownView)
			if (view && view.file) {
				openTabs.push({
					file: view.file,
					isActive: view.file.path === activeFile?.path
				});
			}
		}

		return openTabs;
	}

	/**
	 * Read content from all open tabs
	 * 
	 * @returns Map of file paths to their content
	 * 
	 * @example
	 * ```typescript
	 * const contents = await augmentation.getOpenTabsContent();
	 * for (const [path, content] of contents) {
	 *   console.log(`${path}: ${content.length} chars`);
	 * }
	 * ```
	 */
	async getOpenTabsContent(): Promise<Map<string, string>> {
		const contents = new Map<string, string>();
		const openTabs = this.getOpenTabs();

		for (const tab of openTabs) {
			try {
				const content = await this.app.vault.cachedRead(tab.file);
				contents.set(tab.file.path, content);
			} catch (error) {
				console.warn(`[VC] Failed to read open tab: ${tab.file.path}`, error);
				// Continue with other tabs even if one fails
			}
		}

		return contents;
	}

	/**
	 * Gather all implicit context from the workspace
	 * 
	 * This method collects:
	 * - Active file and its content
	 * - Selected text (if any)
	 * - All open tabs and their content
	 * 
	 * @returns Complete implicit context object
	 * 
	 * @example
	 * ```typescript
	 * const context = await augmentation.gatherImplicitContext();
	 * if (context.selectedText) {
	 *   console.log('User has selected text');
	 * }
	 * ```
	 */
	async gatherImplicitContext(): Promise<ImplicitContext> {
		const activeFile = this.app.workspace.getActiveFile();
		let activeFileContent: string | null = null;

		// Read active file content
		if (activeFile) {
			try {
				activeFileContent = await this.app.vault.cachedRead(activeFile);
			} catch (error) {
				console.warn(`[VC] Failed to read active file: ${activeFile.path}`, error);
			}
		}

		// Get selected text
		const selectedText = this.getSelectedText();

		// Get open tabs
		const openTabs = this.getOpenTabs();

		// Read content from all open tabs
		const openTabsContent = await this.getOpenTabsContent();

		return {
			activeFile,
			activeFileContent,
			selectedText,
			openTabs,
			openTabsContent
		};
	}

	/**
	 * Format implicit context as a string for inclusion in chat messages
	 * 
	 * @param context The implicit context to format
	 * @returns Formatted context string
	 * 
	 * @example
	 * ```typescript
	 * const context = await augmentation.gatherImplicitContext();
	 * const formatted = augmentation.formatImplicitContext(context);
	 * ```
	 */
	formatImplicitContext(context: ImplicitContext): string {
		const parts: string[] = [];

		// Add selected text if available (highest priority)
		if (context.selectedText) {
			parts.push(`--- Selected Text from "${context.selectedText.file.path}" ---`);
			parts.push(context.selectedText.text);
			parts.push(`--- End of Selected Text ---`);
			parts.push('');
		}

		// Add active file content
		if (context.activeFile && context.activeFileContent) {
			parts.push(`--- Active File: "${context.activeFile.path}" ---`);
			parts.push(context.activeFileContent);
			parts.push(`--- End of Active File ---`);
			parts.push('');
		}

		// Add other open tabs (excluding the active file to avoid duplication)
		const otherTabs = this.getOtherOpenTabs(context);
		if (otherTabs.length > 0) {
			parts.push(`--- Other Open Tabs (${otherTabs.length}) ---`);
			
			for (const tab of otherTabs) {
				const content = context.openTabsContent.get(tab.file.path);
				if (content) {
					parts.push('');
					parts.push(`File: "${tab.file.basename}"`); // Use basename for better readability
					parts.push(content);
				}
			}
			
			parts.push('--- End of Open Tabs ---');
			parts.push('');
		}

		return parts.join('\n');
	}

	/**
	 * Get a summary of implicit context for display purposes
	 * 
	 * @param context The implicit context to summarize
	 * @returns Array of summary lines
	 * 
	 * @example
	 * ```typescript
	 * const context = await augmentation.gatherImplicitContext();
	 * const summary = augmentation.getContextSummary(context);
	 * summary.forEach(line => console.log(line));
	 * ```
	 */
	getContextSummary(context: ImplicitContext): string[] {
		const summary: string[] = [];

		if (context.selectedText) {
			summary.push(`Selected text (${context.selectedText.text.length} chars) from ${context.selectedText.file.basename}`);
		}

		if (context.activeFile) {
			summary.push(`Active file: ${context.activeFile.basename}`);
		}

		const otherTabs = this.getOtherOpenTabs(context);
		if (otherTabs.length > 0) {
			summary.push(`${otherTabs.length} other open tab${otherTabs.length === 1 ? '' : 's'}`);
		}

		return summary;
	}

	/**
	 * Get open tabs excluding the active file to avoid duplication
	 * 
	 * @param context The implicit context
	 * @returns Array of non-active open tabs
	 * 
	 * @internal
	 */
	getOtherOpenTabs(context: ImplicitContext): OpenTabInfo[] {
		return context.openTabs.filter(tab => !tab.isActive);
	}
}
