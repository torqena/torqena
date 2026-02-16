// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module InputAreaManager
 * @description Manages the chat input area, including note attachments,
 * inline chips, input history navigation, content extraction, and code blocks.
 *
 * @see {@link CopilotChatView} for integration
 * @since 0.0.15
 */

import { TFile } from "obsidian";
import CopilotPlugin from "../../main";
import { NoteSuggestModal } from "../modals/NoteSuggestModal";

/**
 * Manages the chat input area and its features
 */
export class InputAreaManager {
	private plugin: CopilotPlugin;
	private inputEl: HTMLDivElement;
	private attachmentsContainer: HTMLElement | null;

	// Attachment state
	private attachedNotes: TFile[] = [];

	// Input history for up/down arrow navigation
	private inputHistory: string[] = [];
	private historyIndex = -1;  // -1 means not navigating history
	private savedCurrentInput = '';  // Save current input when navigating

	constructor(
		plugin: CopilotPlugin,
		inputEl: HTMLDivElement,
		attachmentsContainer: HTMLElement | null
	) {
		this.plugin = plugin;
		this.inputEl = inputEl;
		this.attachmentsContainer = attachmentsContainer;
	}

	/**
	 * Get the list of currently attached notes
	 */
	getAttachedNotes(): TFile[] {
		return this.attachedNotes;
	}

	/**
	 * Clear all attachments
	 */
	clearAttachments(): void {
		this.attachedNotes = [];
		this.renderAttachments();
	}

	/**
	 * Clear the input element content
	 */
	clearInput(): void {
		this.inputEl.innerHTML = "";
		this.autoResizeInput();
	}

	/**
	 * Reset input history (used when switching sessions)
	 */
	resetHistory(): void {
		this.inputHistory = [];
		this.historyIndex = -1;
	}

	/**
	 * Open the note selection modal
	 */
	openNotePicker(): void {
		new NoteSuggestModal(this.plugin, (file) => {
			this.attachNote(file);
		}).open();
	}

	/**
	 * Attach a note file (avoids duplicates)
	 */
	attachNote(file: TFile): void {
		if (this.attachedNotes.some(n => n.path === file.path)) {
			return;
		}

		this.attachedNotes.push(file);
		this.renderAttachments();
	}

	/**
	 * Remove a file from attachments
	 */
	removeAttachment(file: TFile): void {
		this.attachedNotes = this.attachedNotes.filter(n => n.path !== file.path);
		this.renderAttachments();
	}

	/**
	 * Render attachment chips in the UI
	 */
	renderAttachments(): void {
		if (!this.attachmentsContainer) return;

		this.attachmentsContainer.empty();

		for (const file of this.attachedNotes) {
			const chip = this.attachmentsContainer.createSpan({ cls: "vc-attachment-chip" });

			const icon = chip.createSpan({ cls: "vc-attachment-icon" });
			icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

			chip.createSpan({ text: file.basename, cls: "vc-attachment-name" });

			const removeBtn = chip.createSpan({ cls: "vc-attachment-remove" });
			removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
			removeBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.removeAttachment(file);
			});
		}
	}

	/**
	 * Insert an inline chip at the current cursor position inside the contenteditable input
	 */
	insertInlineChip(file: TFile): void {
		// Create the chip element
		const chip = document.createElement("span");
		chip.className = "vc-inline-chip";
		chip.contentEditable = "false";
		chip.setAttribute("data-file-path", file.path);

		const icon = document.createElement("span");
		icon.className = "vc-attachment-icon";
		icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
		chip.appendChild(icon);

		const name = document.createElement("span");
		name.className = "vc-attachment-name";
		name.textContent = file.basename;
		chip.appendChild(name);

		const removeBtn = document.createElement("span");
		removeBtn.className = "vc-attachment-remove";
		removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
		removeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			chip.remove();
			this.inputEl.focus();
		});
		chip.appendChild(removeBtn);

		// Insert at cursor position
		const selection = window.getSelection();
		if (selection && selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);

			// Only insert if cursor is within our input element
			if (this.inputEl.contains(range.commonAncestorContainer)) {
				range.deleteContents();
				range.insertNode(chip);

				// Add a space after the chip and move cursor there
				const space = document.createTextNode(" ");
				range.setStartAfter(chip);
				range.insertNode(space);
				range.setStartAfter(space);
				range.setEndAfter(space);
				selection.removeAllRanges();
				selection.addRange(range);
			} else {
				// Cursor not in input, append at end
				this.inputEl.appendChild(chip);
				this.inputEl.appendChild(document.createTextNode(" "));
			}
		} else {
			// No selection, append at end
			this.inputEl.appendChild(chip);
			this.inputEl.appendChild(document.createTextNode(" "));
		}

		this.autoResizeInput();
		this.inputEl.focus();
	}

	/**
	 * Extract text and inline chips from the contenteditable input.
	 * Returns the plain text message and array of file paths from chips.
	 */
	extractInputContent(): { text: string; chipFilePaths: string[] } {
		const chipFilePaths: string[] = [];
		let text = "";

		const extractFromNode = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				text += node.textContent || "";
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const element = node as HTMLElement;
				if (element.classList.contains("vc-inline-chip")) {
					const filePath = element.getAttribute("data-file-path");
					if (filePath) {
						chipFilePaths.push(filePath);
						const name = element.querySelector(".vc-attachment-name")?.textContent || "";
						text += `[[${name}]]`;
					}
				} else if (element.tagName === "BR") {
					text += "\n";
				} else {
					node.childNodes.forEach(extractFromNode);
				}
			}
		};

		this.inputEl.childNodes.forEach(extractFromNode);

		return { text: text.trim(), chipFilePaths };
	}

	/**
	 * Insert a code block at the cursor position or wrap selected text
	 */
	insertCodeBlock(): void {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			const codeBlock = document.createTextNode("```\n\n```");
			this.inputEl.appendChild(codeBlock);
		} else {
			const range = selection.getRangeAt(0);
			if (this.inputEl.contains(range.commonAncestorContainer)) {
				const selectedText = range.toString();
				range.deleteContents();
				const codeText = selectedText ?
					`\`\`\`\n${selectedText}\n\`\`\`` :
					"```\n\n```";
				const codeBlock = document.createTextNode(codeText);
				range.insertNode(codeBlock);

				// Move cursor inside the code block if empty
				if (!selectedText) {
					range.setStart(codeBlock, 4);
					range.collapse(true);
					selection.removeAllRanges();
					selection.addRange(range);
				}
			}
		}
		this.inputEl.focus();
		this.autoResizeInput();
	}

	/**
	 * Auto-resize input based on content
	 */
	autoResizeInput(): void {
		this.inputEl.style.height = "auto";
		const newHeight = Math.min(this.inputEl.scrollHeight, 200);
		this.inputEl.style.height = newHeight + "px";
	}

	/**
	 * Add a message to the input history (avoids duplicating the last entry)
	 */
	addToHistory(message: string): void {
		if (this.inputHistory.length === 0 || this.inputHistory[this.inputHistory.length - 1] !== message) {
			this.inputHistory.push(message);
		}
		this.historyIndex = -1;
	}

	/**
	 * Navigate through input history with up/down arrows
	 */
	navigateHistory(direction: 'up' | 'down'): void {
		if (this.inputHistory.length === 0) return;

		// Save current input before starting navigation
		if (this.historyIndex === -1) {
			this.savedCurrentInput = this.inputEl.textContent || '';
		}

		if (direction === 'up') {
			if (this.historyIndex === -1) {
				this.historyIndex = this.inputHistory.length - 1;
			} else if (this.historyIndex > 0) {
				this.historyIndex--;
			}
		} else {
			if (this.historyIndex >= 0) {
				this.historyIndex++;
				if (this.historyIndex >= this.inputHistory.length) {
					this.historyIndex = -1;
				}
			}
		}

		// Update input content
		if (this.historyIndex === -1) {
			this.inputEl.textContent = this.savedCurrentInput;
		} else {
			this.inputEl.textContent = this.inputHistory[this.historyIndex] ?? '';
		}

		// Move cursor to end
		const range = document.createRange();
		const sel = window.getSelection();
		if (this.inputEl.childNodes.length > 0) {
			range.selectNodeContents(this.inputEl);
			range.collapse(false);
			sel?.removeAllRanges();
			sel?.addRange(range);
		}
	}

	/**
	 * Insert text at the current cursor position in the input
	 */
	insertTextAtCursor(text: string): void {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			this.inputEl.textContent = (this.inputEl.textContent || '') + text;
		} else {
			const range = selection.getRangeAt(0);
			if (this.inputEl.contains(range.commonAncestorContainer)) {
				range.deleteContents();
				const textNode = document.createTextNode(text);
				range.insertNode(textNode);
				range.setStartAfter(textNode);
				range.setEndAfter(textNode);
				selection.removeAllRanges();
				selection.addRange(range);
			} else {
				this.inputEl.textContent = (this.inputEl.textContent || '') + text;
			}
		}
		this.autoResizeInput();
		this.inputEl.focus();
	}
}
