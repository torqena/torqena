// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module EditorSelectionManager
 * @description Manages editor text selection preservation for the chat view.
 *
 * When a user selects text in the Obsidian editor and then clicks into the chat
 * input, the browser clears the selection. This manager captures the selection
 * before it's lost and creates a visual highlight overlay so the user can see
 * what text will be used as context.
 *
 * ## Strategy
 * 1. Listen for `selectionchange` events (debounced) and cache selection rects
 * 2. When the chat input gains focus, create a visual overlay from cached rects
 * 3. When focus returns to the editor, clean up the overlay
 *
 * @see {@link CopilotChatView} for integration
 * @since 0.0.15
 */

import { App, ItemView } from "obsidian";

/**
 * Manages editor selection caching and visual highlight preservation
 */
export class EditorSelectionManager {
	private app: App;

	// Selection state
	private static readonly SELECTION_PREVIEW_MAX_LENGTH = 100;
	private preservedSelectionText: string = '';
	private selectionHighlightOverlay: HTMLElement | null = null;
	private editorSelectionCleanup: (() => void) | null = null;

	// Cached selection data (captured before focus change)
	private cachedSelectionRects: DOMRectList | null = null;
	private cachedEditorRect: DOMRect | null = null;
	private cachedCmEditor: HTMLElement | null = null;
	private selectionCacheTimeout: NodeJS.Timeout | null = null;

	// Event handlers (stored for cleanup)
	private selectionChangeHandler: (() => void) | null = null;
	private windowResizeHandler: (() => void) | null = null;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Get the currently preserved selection text for use as context
	 */
	getPreservedSelectionText(): string {
		return this.preservedSelectionText;
	}

	/**
	 * Set up the document-level selectionchange listener (debounced).
	 * Call this once during view initialization.
	 */
	setupSelectionChangeListener(): void {
		this.selectionChangeHandler = () => {
			if (this.selectionCacheTimeout) {
				clearTimeout(this.selectionCacheTimeout);
			}
			this.selectionCacheTimeout = setTimeout(() => {
				// Only cache if selection exists
				const selection = window.getSelection();
				if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
					this.cacheEditorSelection();
				}
			}, 100); // Debounce 100ms
		};
		document.addEventListener("selectionchange", this.selectionChangeHandler);
	}

	/**
	 * Set up focus listener on the input element to create highlight on focus.
	 * Call this once during view initialization.
	 */
	setupInputFocusListener(inputEl: HTMLElement): void {
		inputEl.addEventListener("focus", () => {
			this.createSelectionHighlightFromCache();
		});
	}

	/**
	 * Cache the current editor selection rectangles.
	 * Called in capture phase of mousedown, BEFORE the selection is cleared.
	 */
	private cacheEditorSelection(): void {
		// Get the active markdown view
		const activeLeaf = this.app.workspace.getActiveViewOfType(ItemView);
		if (!activeLeaf || !('editor' in activeLeaf)) {
			this.cachedSelectionRects = null;
			this.cachedEditorRect = null;
			this.cachedCmEditor = null;
			return;
		}

		const editor = (activeLeaf as any).editor;
		if (!editor || typeof editor.getSelection !== 'function') {
			this.cachedSelectionRects = null;
			this.cachedEditorRect = null;
			this.cachedCmEditor = null;
			return;
		}

		const selectedText = editor.getSelection();
		if (!selectedText) {
			this.cachedSelectionRects = null;
			this.cachedEditorRect = null;
			this.cachedCmEditor = null;
			return;
		}

		// Store the selected text for context
		this.preservedSelectionText = selectedText;

		// Find the CodeMirror editor container
		const viewContentEl = (activeLeaf as any).contentEl as HTMLElement;
		if (!viewContentEl) {
			this.cachedSelectionRects = null;
			this.cachedEditorRect = null;
			this.cachedCmEditor = null;
			return;
		}

		const cmEditor = viewContentEl.querySelector('.cm-editor') as HTMLElement;
		if (!cmEditor) {
			this.cachedSelectionRects = null;
			this.cachedEditorRect = null;
			this.cachedCmEditor = null;
			return;
		}

		// Get the selection rects from the browser
		const windowSelection = window.getSelection();
		if (!windowSelection || windowSelection.rangeCount === 0) {
			this.cachedSelectionRects = null;
			this.cachedEditorRect = null;
			this.cachedCmEditor = null;
			return;
		}

		const range = windowSelection.getRangeAt(0);
		const rects = range.getClientRects();
		if (rects.length === 0) {
			this.cachedSelectionRects = null;
			this.cachedEditorRect = null;
			this.cachedCmEditor = null;
			return;
		}

		// Cache everything we need for later
		this.cachedSelectionRects = rects;
		this.cachedEditorRect = cmEditor.getBoundingClientRect();
		this.cachedCmEditor = cmEditor;
	}

	/**
	 * Create the visual selection highlight from cached rectangles.
	 * Called after the input gains focus and the selection has been cleared.
	 */
	private createSelectionHighlightFromCache(): void {

		// Check if we have cached selection data FIRST, before any cleanup
		if (!this.cachedSelectionRects || !this.cachedEditorRect || !this.cachedCmEditor) {
			return;
		}

		// Save cached values to local variables BEFORE any cleanup
		const rects = this.cachedSelectionRects;
		const editorRect = this.cachedEditorRect;
		const cmEditor = this.cachedCmEditor;

		// NOW we can clean up any existing highlight (but don't clear the cache yet)
		if (this.selectionHighlightOverlay) {
			this.selectionHighlightOverlay.remove();
			this.selectionHighlightOverlay = null;
		}
		if (this.editorSelectionCleanup) {
			this.editorSelectionCleanup();
			this.editorSelectionCleanup = null;
		}


		// Create overlay container
		this.selectionHighlightOverlay = document.createElement('div');
		this.selectionHighlightOverlay.className = 'vc-selection-highlight-overlay';
		this.selectionHighlightOverlay.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 10;';

		// Create highlight rects for each line of the selection and store references for resize handling
		const highlightElements: HTMLElement[] = [];
		for (let i = 0; i < rects.length; i++) {
			const rect = rects[i];
			if (!rect) continue;

			const highlight = document.createElement('div');
			highlight.className = 'vc-selection-highlight';
			highlight.style.cssText = `
				position: absolute;
				left: ${rect.left - editorRect.left}px;
				top: ${rect.top - editorRect.top}px;
				width: ${rect.width}px;
				height: ${rect.height}px;
				background-color: var(--text-selection, rgba(0, 122, 255, 0.15));
				pointer-events: none;
				border-radius: 2px;
			`;
			this.selectionHighlightOverlay.appendChild(highlight);
			highlightElements.push(highlight);
		}

		// Insert the overlay into the editor
		cmEditor.style.position = 'relative';
		cmEditor.appendChild(this.selectionHighlightOverlay);

		// Handle window resize to reposition the overlay
		const resizeHandler = () => {
			if (!this.selectionHighlightOverlay || !cmEditor.contains(this.selectionHighlightOverlay)) {
				// Overlay was removed, clean up this listener
				window.removeEventListener('resize', resizeHandler);
				this.windowResizeHandler = null;
				return;
			}

			// Get the new editor position
			const newEditorRect = cmEditor.getBoundingClientRect();

			// Update each highlight rectangle position using cached element references
			const count = Math.min(highlightElements.length, rects.length);
			for (let i = 0; i < count; i++) {
				const highlightElement = highlightElements[i];
				const originalRect = rects[i];
				if (!highlightElement || !originalRect) continue;

				// Recalculate position relative to new editor position
				highlightElement.style.left = `${originalRect.left - newEditorRect.left}px`;
				highlightElement.style.top = `${originalRect.top - newEditorRect.top}px`;
			}
		};

		this.windowResizeHandler = resizeHandler;
		window.addEventListener('resize', resizeHandler);

		// Set up cleanup when focus returns to editor
		const cleanupHandler = () => {
			this.clearHighlight();
		};

		// Listen for focus returning to the editor
		cmEditor.addEventListener('focusin', cleanupHandler, { once: true });

		this.editorSelectionCleanup = () => {
			cmEditor.removeEventListener('focusin', cleanupHandler);
			// Also clean up resize handler
			if (this.windowResizeHandler) {
				window.removeEventListener('resize', this.windowResizeHandler);
				this.windowResizeHandler = null;
			}
		};

		// Clear the cache after using it
		this.cachedSelectionRects = null;
		this.cachedEditorRect = null;
		this.cachedCmEditor = null;

	}

	/**
	 * Clear the editor selection highlight overlay and reset all state
	 */
	clearHighlight(): void {
		if (this.selectionHighlightOverlay) {
			this.selectionHighlightOverlay.remove();
			this.selectionHighlightOverlay = null;
		}
		if (this.editorSelectionCleanup) {
			this.editorSelectionCleanup();
			this.editorSelectionCleanup = null;
		}
		// Clean up window resize handler
		if (this.windowResizeHandler) {
			window.removeEventListener('resize', this.windowResizeHandler);
			this.windowResizeHandler = null;
		}
		this.preservedSelectionText = '';
		// Also clear any cached selection data
		this.cachedSelectionRects = null;
		this.cachedEditorRect = null;
		this.cachedCmEditor = null;
	}

	/**
	 * Clean up all listeners and state. Call this when the view is closed.
	 */
	destroy(): void {
		this.clearHighlight();

		// Clean up selection change listener
		if (this.selectionChangeHandler) {
			document.removeEventListener("selectionchange", this.selectionChangeHandler);
			this.selectionChangeHandler = null;
		}

		// Clean up selection cache timeout
		if (this.selectionCacheTimeout) {
			clearTimeout(this.selectionCacheTimeout);
			this.selectionCacheTimeout = null;
		}
	}
}
