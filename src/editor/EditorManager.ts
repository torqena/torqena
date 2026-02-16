/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module EditorManager
 * @description Tabbed CodeMirror 6 markdown editor for the center pane.
 *
 * Manages multiple open files as tabs, each backed by a CodeMirror EditorView
 * with markdown syntax highlighting. Only the active tab's editor is visible.
 *
 * @since 0.0.27
 */

import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit } from "@codemirror/language";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { vim } from "@replit/codemirror-vim";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { marked } from "marked";
import "katex/dist/katex.min.css";
import { frontmatterPlugin } from "./frontmatterPlugin.js";
import { livePreviewPlugin } from "./LivePreviewPlugin.js";
import { getEditorThemeExtension } from "./EditorThemeCatalog.js";
import { getLezerExtensions } from "./LezerExtensions.js";
import {
	configureMarked,
	postProcessMermaid,
	postProcessCodeBlocks,
	postProcessCallouts,
	postProcessLinks,
} from "./MarkedExtensions.js";
import { buildHyperLinkExtension } from "./HyperLinkExtension.js";
import {
	parseFrontmatter,
	stripFrontmatter,
	renderPropertiesHtml,
	renderFrontmatterSource,
} from "./FrontmatterService.js";
import type { LayoutManager } from "../layout/LayoutManager.js";
import { loadSettings, resolveThemeMode, settingsChanged } from "../shell-settings/WebShellSettings.js";

/** View mode for a tab: source (raw markdown), live-preview (inline formatting), or reading (rendered HTML) */
export type ViewMode = "source" | "live-preview" | "reading";

/** Stats about the active document for the status bar. */
export interface DocumentStats {
	properties: number;
	words: number;
	characters: number;
}

/** Represents a single open editor tab */
interface EditorTab {
	/** File path within the vault */
	path: string;
	/** Display name for the tab */
	name: string;
	/** CodeMirror editor view */
	view: EditorView;
	/** Tab header element */
	tabEl: HTMLElement;
	/** Whether the file has unsaved changes */
	dirty: boolean;
	/** Original content for dirty tracking */
	originalContent: string;
	/** Current view mode */
	mode: ViewMode;
	/** Last editing mode used before switching to reading (for Ctrl+E toggle-back) */
	lastEditingMode: "source" | "live-preview";
	/** The wrapper that holds both the editor view and preview */
	wrapperEl: HTMLElement;
	/** The rendered markdown preview element */
	previewEl: HTMLElement;
}

/**
 * Manages a tabbed editor interface in the center pane.
 */
/** Serialized tab state for cross-pane transfer */
export interface TabState {
	path: string;
	name: string;
	content: string;
	dirty: boolean;
	originalContent: string;
	mode: ViewMode;
}

export class EditorManager {
	private container: HTMLElement;
	private tabBar: HTMLElement;
	private newTabBtn: HTMLElement;
	private splitBtn!: HTMLButtonElement;
	/** Kebab button in tab header for split/pane actions (wired by PaneManager) */
	paneMenuBtn!: HTMLButtonElement;
	/** Pane ID for drag-and-drop identification */
	paneId = "";
	/** LayoutManager reference for sidebar toggle delegation */
	private layoutManager: LayoutManager | null = null;
	private breadcrumbBar: HTMLElement;
	private breadcrumbPath: HTMLElement;
	private viewToggleBtn!: HTMLButtonElement;
	private editorContainer: HTMLElement;
	private emptyState: HTMLElement;
	private blankTabs: Map<string, HTMLElement> = new Map();
	private blankTabCounter = 0;
	private activeBlankTabId: string | null = null;
	private tabs: Map<string, EditorTab> = new Map();
	private activeTabPath: string | null = null;
	private vault: any;
	private workspace: any;
	private onSave: ((path: string, content: string) => Promise<void>) | null = null;
	/** Ordered history of visited tab paths for back/forward navigation */
	private tabHistory: string[] = [];
	private tabHistoryIndex = -1;
	/** Active dropdown menu element (for cleanup) */
	private activeMenu: HTMLElement | null = null;
	private activeMenuCleanup: (() => void) | null = null;
	private onCloseLastTabRequested: (() => void) | null = null;
	private paneMenuClickHandler: ((e: MouseEvent) => void) | null = null;
	/** Callback fired when document stats change (selection, content, tab switch) */
	private onStatsChange: ((stats: DocumentStats) => void) | null = null;
	/** Callback fired when the active file/tab changes (label derived from filePath) */
	private onActiveFileChange: ((filePath: string | null) => void) | null = null;

	// ── CodeMirror Compartments for dynamic reconfiguration ──
	private lineNumbersCompartment = new Compartment();
	private tabSizeCompartment = new Compartment();
	private indentUnitCompartment = new Compartment();
	private bracketMatchingCompartment = new Compartment();
	private foldGutterCompartment = new Compartment();
	private spellcheckCompartment = new Compartment();
	private rtlCompartment = new Compartment();
	private fontThemeCompartment = new Compartment();
	private readableLineLengthCompartment = new Compartment();
	private vimCompartment = new Compartment();
	private indentationMarkersCompartment = new Compartment();
	private propertiesCompartment = new Compartment();
	private editorThemeCompartment = new Compartment();
	private livePreviewCompartment = new Compartment();
	private sourceModeFontCompartment = new Compartment();
	private hyperLinkCompartment = new Compartment();

	/** Unsubscribe from settings change events */
	private unsubscribeSettings: (() => void) | null = null;

	constructor(container: HTMLElement, vault: any) {
		this.container = container;
		this.vault = vault;
		this.container.innerHTML = "";
		this.container.classList.add("ws-editor-pane");

		// Tab header row (tabs + new tab button + header actions)
		const tabHeader = document.createElement("div");
		tabHeader.className = "ws-tab-header";
		this.container.appendChild(tabHeader);

		// Tab bar (scrollable tabs)
		this.tabBar = document.createElement("div");
		this.tabBar.className = "ws-tab-bar";
		tabHeader.appendChild(this.tabBar);

		// New tab "+" button
		this.newTabBtn = document.createElement("button");
		this.newTabBtn.className = "ws-new-tab-btn";
		this.newTabBtn.setAttribute("aria-label", "New tab");
		this.newTabBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
		this.newTabBtn.addEventListener("click", () => this.addBlankTab());
		this.tabBar.appendChild(this.newTabBtn);

		// Tab header right actions (chevron + layout)
		const tabHeaderActions = document.createElement("div");
		tabHeaderActions.className = "ws-tab-header-actions";
		tabHeader.appendChild(tabHeaderActions);

		const chevronBtn = document.createElement("button");
		chevronBtn.setAttribute("aria-label", "Tab list");
		chevronBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
		chevronBtn.addEventListener("click", (e) => this.showTabListMenu(chevronBtn, e));
		tabHeaderActions.appendChild(chevronBtn);

		this.splitBtn = document.createElement("button");
		this.splitBtn.setAttribute("aria-label", "Toggle right sidebar");
		this.splitBtn.innerHTML = this.getRightSidebarIcon(false);
		this.splitBtn.addEventListener("click", () => {
			if (this.layoutManager) this.layoutManager.toggleRight();
		});

		// Kebab menu button for split/pane actions (wired by PaneManager)
		this.paneMenuBtn = document.createElement("button");
		this.paneMenuBtn.className = "ws-pane-menu-btn";
		this.paneMenuBtn.setAttribute("aria-label", "More options");
		this.paneMenuBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;
		this.paneMenuBtn.addEventListener("click", (e) => this.handlePaneMenuClick(e));

		// Breadcrumb bar (below tabs): back/forward, path, view toggle, kebab menu
		this.breadcrumbBar = document.createElement("div");
		this.breadcrumbBar.className = "ws-breadcrumb-bar is-hidden";
		this.container.appendChild(this.breadcrumbBar);

		// Nav arrows
		const breadcrumbNav = document.createElement("div");
		breadcrumbNav.className = "ws-breadcrumb-nav";
		this.breadcrumbBar.appendChild(breadcrumbNav);

		const backBtn = document.createElement("button");
		backBtn.setAttribute("aria-label", "Navigate back");
		backBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
		backBtn.addEventListener("click", () => this.navigateBack());
		breadcrumbNav.appendChild(backBtn);

		const forwardBtn = document.createElement("button");
		forwardBtn.setAttribute("aria-label", "Navigate forward");
		forwardBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
		forwardBtn.addEventListener("click", () => this.navigateForward());
		breadcrumbNav.appendChild(forwardBtn);

		// Breadcrumb path
		this.breadcrumbPath = document.createElement("div");
		this.breadcrumbPath.className = "ws-breadcrumb-path";
		this.breadcrumbBar.appendChild(this.breadcrumbPath);

		// Breadcrumb right actions (view toggle + kebab menu)
		const breadcrumbActions = document.createElement("div");
		breadcrumbActions.className = "ws-breadcrumb-actions";
		this.breadcrumbBar.appendChild(breadcrumbActions);

		this.viewToggleBtn = document.createElement("button");
		this.viewToggleBtn.className = "ws-view-toggle-btn";
		this.viewToggleBtn.setAttribute("aria-label", "Toggle reading view");
		this.viewToggleBtn.innerHTML = this.getViewIcon("source");
		this.viewToggleBtn.addEventListener("click", () => this.cycleActiveTabMode());
		breadcrumbActions.appendChild(this.viewToggleBtn);
		breadcrumbActions.appendChild(this.paneMenuBtn);

		// Editor container (holds CodeMirror instances)
		this.editorContainer = document.createElement("div");
		this.editorContainer.className = "ws-editor-container";
		this.container.appendChild(this.editorContainer);

		// Empty state (shown when no tabs open)
		this.emptyState = document.createElement("div");
		this.emptyState.className = "ws-center-placeholder";
		this.emptyState.innerHTML = `
			<a class="ws-empty-action" data-action="new-note">Create new note (Ctrl + N)</a>
			<a class="ws-empty-action" data-action="go-to-file">Go to file (Ctrl + O)</a>
			<a class="ws-empty-action" data-action="close">Close</a>
		`;
		this.editorContainer.appendChild(this.emptyState);

		// Delegated click listener for internal links (WikiLinks) across all views
		this.editorContainer.addEventListener("click", (e) => {
			const target = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.internal-link[data-href]");
			if (!target) return;
			e.preventDefault();
			e.stopPropagation();
			const linkTarget = target.dataset.href;
			if (linkTarget) {
				this.navigateToInternalLink(linkTarget);
			}
		});

		// Delegated click listener for external links across all views
		this.editorContainer.addEventListener("click", (e) => {
			const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
			if (!anchor) return;
			// Skip internal links (handled above)
			if (anchor.classList.contains("internal-link")) return;
			const href = anchor.getAttribute("href") || "";
			if (href.startsWith("http://") || href.startsWith("https://")) {
				e.preventDefault();
				e.stopPropagation();
				window.open(href, "_blank", "noopener");
			}
		});

		// Create initial blank tab (must be after emptyState + breadcrumbBar are ready)
		this.addBlankTab();

		this.updateTabHeaderControls();

		// Subscribe to settings changes for dynamic editor reconfiguration
		this.unsubscribeSettings = settingsChanged.on(() => this.reconfigureAllEditors());

		// Configure marked with Obsidian-flavored extensions for reading view
		configureMarked();

		// Sync external file changes (e.g. from Properties panel) into open editors
		this.vault.on("modify", async (file: any) => {
			const tab = this.tabs.get(file.path);
			if (!tab) return;
			const editorContent = tab.view.state.doc.toString();
			const vaultContent = await this.vault.cachedRead(file);
			if (vaultContent !== editorContent) {
				tab.view.dispatch({
					changes: { from: 0, to: tab.view.state.doc.length, insert: vaultContent },
				});
				tab.originalContent = vaultContent;
				tab.dirty = false;
				this.updateTabDirtyState(tab);
			}
		});
	}

	// ── Settings-driven extension builders ──

	/** Build the extensions array for a new CodeMirror editor, reading current settings. */
	private buildExtensions(filePath: string, initialMode: ViewMode = "live-preview"): import("@codemirror/state").Extension[] {
		const settings = loadSettings();
		const self = this;
		const resolvedThemeMode = resolveThemeMode(settings.theme);
		const editorThemeId = resolvedThemeMode === "dark" ? settings.editorThemeDark : settings.editorThemeLight;
		const isSource = initialMode === "source";
		const isLivePreview = initialMode === "live-preview";
		const propsMode = settings.propertiesInDocument ?? "visible";

		return [
			// Configurable via compartments
			this.lineNumbersCompartment.of(settings.showLineNumbers ? lineNumbers() : []),
			this.tabSizeCompartment.of(EditorState.tabSize.of(settings.tabSize)),
			this.indentUnitCompartment.of(indentUnit.of(settings.indentUsingTabs ? "\t" : " ".repeat(settings.tabSize))),
			this.bracketMatchingCompartment.of(settings.autoPairBrackets ? bracketMatching() : []),
			this.foldGutterCompartment.of((settings.foldHeadings || settings.foldIndent) ? foldGutter() : []),
			this.spellcheckCompartment.of(
				EditorView.contentAttributes.of({ spellcheck: settings.spellcheck ? "true" : "false" })
			),
			this.rtlCompartment.of(
				settings.rightToLeft ? EditorView.contentAttributes.of({ dir: "rtl" }) : []
			),
			this.fontThemeCompartment.of(EditorView.theme({
				"&": { fontSize: `${settings.fontSize}px` },
			})),
			this.readableLineLengthCompartment.of(EditorView.theme(
				settings.readableLineLength
					? { ".cm-content": { maxWidth: "700px", marginLeft: "auto", marginRight: "auto" } }
					: {}
			)),
			this.vimCompartment.of(settings.vimKeyBindings ? vim() : []),
			this.indentationMarkersCompartment.of(settings.indentationGuides ? indentationMarkers() : []),
			this.propertiesCompartment.of(frontmatterPlugin(isSource ? "source" : propsMode)),
			this.editorThemeCompartment.of(getEditorThemeExtension(editorThemeId)),
			this.livePreviewCompartment.of(livePreviewPlugin(isLivePreview)),
			this.sourceModeFontCompartment.of(isSource ? EditorView.theme({
				".cm-content": { fontFamily: "var(--font-monospace, 'JetBrains Mono', 'Fira Code', monospace)" },
			}) : []),
			this.hyperLinkCompartment.of(buildHyperLinkExtension()),

			// Static extensions (not reconfigurable)
			highlightActiveLine(),
			highlightActiveLineGutter(),
			history(),
			drawSelection(),
			rectangularSelection(),
			indentOnInput(),
			syntaxHighlighting(oneDarkHighlightStyle),
			syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
			markdown({ base: markdownLanguage, codeLanguages: languages, extensions: getLezerExtensions() }),
			keymap.of([
				...defaultKeymap,
				...historyKeymap,
				...foldKeymap,
				indentWithTab,
				{
					key: "Mod-s",
					run: () => {
						self.saveActiveTab();
						return true;
					}
				},
				{
					key: "Mod-e",
					run: () => {
						self.toggleReadingEditing();
						return true;
					}
				}
			]),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					const tab = self.tabs.get(filePath);
					if (tab) {
						const currentContent = update.state.doc.toString();
						const isDirty = currentContent !== tab.originalContent;
						if (isDirty !== tab.dirty) {
							tab.dirty = isDirty;
							self.updateTabDirtyState(tab);
						}

						if (self.workspace && self.activeTabPath === filePath) {
							const activeFile = self.vault.getAbstractFileByPath(filePath);
							if (activeFile) {
								self.workspace.trigger("file-content-change", activeFile, currentContent);
							}
						}
					}
				}
				// Fire stats on doc change or selection change for the active tab
				if ((update.docChanged || update.selectionSet) && self.activeTabPath === filePath) {
					self.fireStatsChange(update.state);
				}
			}),
			EditorView.theme({
				"&": { height: "100%" },
				".cm-content": {
					fontFamily: "var(--font-text, -apple-system, BlinkMacSystemFont, sans-serif)",
					padding: "16px 0",
				},
				".cm-line": { padding: "0 24px" },
				".cm-gutters": {
					backgroundColor: "var(--background-secondary)",
					color: "var(--text-faint)",
					borderRight: "1px solid var(--background-modifier-border)",
				},
				".cm-activeLineGutter": { backgroundColor: "var(--background-modifier-hover)" },
				".cm-activeLine": { backgroundColor: "var(--background-modifier-hover)" },
				".cm-cursor": { borderLeftColor: "var(--text-normal)" },
				".cm-selectionBackground": { backgroundColor: "var(--text-selection) !important" },
				"&.cm-focused .cm-selectionBackground": { backgroundColor: "var(--text-selection) !important" },
			}),
		];
	}

	/**
	 * Compute a safe initial cursor position for a document.
	 *
	 * When frontmatter is rendered via replace decorations (visible/hidden),
	 * placing selection at position 0 can collide with CM measurement during
	 * initial view construction. Move cursor to body start in those modes.
	 */
	private getInitialSelectionAnchor(content: string): number {
		const settings = loadSettings();
		const mode = settings.propertiesInDocument ?? "visible";
		if (mode === "source") return 0;

		const fm = parseFrontmatter(content);
		if (!fm) return 0;

		return Math.min(Math.max(fm.bodyStart, 0), content.length);
	}

	/** Reconfigure all open editors to reflect current settings. */
	private reconfigureAllEditors(): void {
		const settings = loadSettings();
		const resolvedThemeMode = resolveThemeMode(settings.theme);
		const editorThemeId = resolvedThemeMode === "dark" ? settings.editorThemeDark : settings.editorThemeLight;
		const propsMode = settings.propertiesInDocument ?? "visible";

		// Update CSS custom property for font size
		document.body.style.setProperty("--font-text-size", `${settings.fontSize}px`);

		for (const [, tab] of this.tabs) {
			const isSource = tab.mode === "source";
			const isLivePreview = tab.mode === "live-preview";

			tab.view.dispatch({
				effects: [
					this.lineNumbersCompartment.reconfigure(
						settings.showLineNumbers ? lineNumbers() : []
					),
					this.tabSizeCompartment.reconfigure(
						EditorState.tabSize.of(settings.tabSize)
					),
					this.indentUnitCompartment.reconfigure(
						indentUnit.of(settings.indentUsingTabs ? "\t" : " ".repeat(settings.tabSize))
					),
					this.bracketMatchingCompartment.reconfigure(
						settings.autoPairBrackets ? bracketMatching() : []
					),
					this.foldGutterCompartment.reconfigure(
						(settings.foldHeadings || settings.foldIndent) ? foldGutter() : []
					),
					this.spellcheckCompartment.reconfigure(
						EditorView.contentAttributes.of({ spellcheck: settings.spellcheck ? "true" : "false" })
					),
					this.rtlCompartment.reconfigure(
						settings.rightToLeft ? EditorView.contentAttributes.of({ dir: "rtl" }) : []
					),
					this.fontThemeCompartment.reconfigure(EditorView.theme({
						"&": { fontSize: `${settings.fontSize}px` },
					})),
					this.readableLineLengthCompartment.reconfigure(EditorView.theme(
						settings.readableLineLength
							? { ".cm-content": { maxWidth: "700px", marginLeft: "auto", marginRight: "auto" } }
							: {}
					)),
					this.vimCompartment.reconfigure(
						settings.vimKeyBindings ? vim() : []
					),
					this.indentationMarkersCompartment.reconfigure(
						settings.indentationGuides ? indentationMarkers() : []
					),
					this.propertiesCompartment.reconfigure(
						frontmatterPlugin(isSource ? "source" : propsMode)
					),
					this.editorThemeCompartment.reconfigure(
						getEditorThemeExtension(editorThemeId)
					),
					this.livePreviewCompartment.reconfigure(
						livePreviewPlugin(isLivePreview)
					),
					this.sourceModeFontCompartment.reconfigure(
						isSource ? EditorView.theme({
							".cm-content": { fontFamily: "var(--font-monospace, 'JetBrains Mono', 'Fira Code', monospace)" },
						}) : []
					),
				],
			});
		}
	}

	/** Append a tab element immediately before the new-tab button. */
	private insertTabBeforeNewButton(tabEl: HTMLElement): void {
		this.tabBar.insertBefore(tabEl, this.newTabBtn);
	}

	/** Set callback invoked when user attempts to close the final tab in this pane. */
	setCloseLastTabHandler(handler: () => void): void {
		this.onCloseLastTabRequested = handler;
	}

	/**
	 * Set a callback for when the active file/tab changes.
	 * @param handler - Receives the active file path, or null when no file is open
	 */
	setActiveFileChangeHandler(handler: (filePath: string | null) => void): void {
		this.onActiveFileChange = handler;
	}

	/** Allow host containers (PaneManager) to override pane-menu button behavior. */
	setPaneMenuHandler(handler: ((e: MouseEvent) => void) | null): void {
		this.paneMenuClickHandler = handler;
	}

	/** Total number of visible tabs (file + blank) in this pane. */
	private getTabCount(): number {
		return this.tabs.size + this.blankTabs.size;
	}

	/** Handle pane-menu button clicks with standalone fallback behavior. */
	private handlePaneMenuClick(e: MouseEvent): void {
		e.stopPropagation();
		if (this.paneMenuClickHandler) {
			this.paneMenuClickHandler(e);
			return;
		}
		if (this.activeTabPath) {
			this.showTabContextMenu(this.paneMenuBtn, this.activeTabPath, e);
			return;
		}
		this.showTabListMenu(this.paneMenuBtn, e);
	}

	/** Request closure of the last tab, with detached-window fallback. */
	private requestCloseLastTab(): void {
		if (this.onCloseLastTabRequested) {
			this.onCloseLastTabRequested();
			return;
		}
		if (this.isDetachedFileTabView()) {
			window.close();
		}
	}

	/** Returns true when running in detached file-tab view window mode. */
	private isDetachedFileTabView(): boolean {
		return new URLSearchParams(window.location.search).get("view") === "ws-file-tab-view";
	}

	/**
	 * Set the Workspace reference for active-file tracking.
	 */
	setWorkspace(workspace: any): void {
		this.workspace = workspace;
	}

	/**
	 * Set the save callback for when Ctrl+S is pressed.
	 */
	setSaveHandler(handler: (path: string, content: string) => Promise<void>): void {
		this.onSave = handler;
	}

	/**
	 * Open a file in a tab. If already open, activates that tab.
	 */
	async openFile(filePath: string): Promise<void> {
		// Already open — just activate
		if (this.tabs.has(filePath)) {
			this.activateTab(filePath);
			return;
		}

		// If the active tab is a blank tab, remove it (file will replace it)
		if (this.activeBlankTabId) {
			this.removeBlankTab(this.activeBlankTabId, false);
		}

		// Read file content from vault
		const file = this.vault.getAbstractFileByPath(filePath);
		if (!file) {
			console.warn(`[EditorManager] File not found: ${filePath}`);
			return;
		}

		let content: string;
		try {
			content = await this.vault.read(file);
		} catch (err) {
			console.error(`[EditorManager] Failed to read ${filePath}:`, err);
			return;
		}

		// Create tab header
		const tabEl = document.createElement("div");
		tabEl.className = "ws-tab";
		tabEl.draggable = true;
		const tabName = filePath.split("/").pop()?.replace(/\.md$/, "") || filePath;

		const nameSpan = document.createElement("span");
		nameSpan.className = "ws-tab-name";
		nameSpan.textContent = tabName;
		tabEl.appendChild(nameSpan);

		const closeBtn = document.createElement("span");
		closeBtn.className = "ws-tab-close";
		closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
		tabEl.appendChild(closeBtn);
		let dragStartClientX = 0;
		let dragStartClientY = 0;
		let poppedOutAtEdge = false;
		const handleDragAtEdge = (ev: DragEvent) => {
			if (poppedOutAtEdge) return;
			if (this.isDetachedFileTabView()) return;
			const atEdge = ev.clientX <= 0
				|| ev.clientY <= 0
				|| ev.clientX >= window.innerWidth - 1
				|| ev.clientY >= window.innerHeight - 1;
			if (!atEdge) return;
			poppedOutAtEdge = true;
			tabEl.classList.remove("is-dragging");
			tabEl.removeEventListener("drag", handleDragAtEdge);
			void this.popOutFileTab(filePath);
		};

		// Tab drag-and-drop
		tabEl.addEventListener("dragstart", (e) => {
			if (e.dataTransfer) {
				poppedOutAtEdge = false;
				dragStartClientX = e.clientX;
				dragStartClientY = e.clientY;
				e.dataTransfer.setData("text/x-pane-tab", JSON.stringify({ fromPaneId: this.paneId, filePath }));
				e.dataTransfer.effectAllowed = "copyMove";
				tabEl.classList.add("is-dragging");
				tabEl.addEventListener("drag", handleDragAtEdge);
			}
		});
		tabEl.addEventListener("dragend", (e: DragEvent) => {
			tabEl.classList.remove("is-dragging");
			tabEl.removeEventListener("drag", handleDragAtEdge);
			if (poppedOutAtEdge) return;
			const wasHandledDrop = e.dataTransfer?.dropEffect === "move";
			if (wasHandledDrop && this.isDetachedFileTabView()) {
				const shouldCloseWindow = this.tabs.size <= 1;
				if (this.tabs.has(filePath)) this.closeTab(filePath);
				if (shouldCloseWindow) window.close();
				return;
			}
			const dx = Math.abs(e.clientX - dragStartClientX);
			const dy = Math.abs(e.clientY - dragStartClientY);
			const wasDragged = Math.max(dx, dy) > 12;
			if (!wasHandledDrop && wasDragged) {
				if (this.isDetachedFileTabView()) {
					void this.dockFileToMain(filePath);
				} else {
					void this.popOutFileTab(filePath);
				}
			}
		});

		tabEl.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.showTabContextMenu(tabEl, filePath, e);
		});

		// Tab click → activate
		tabEl.addEventListener("click", (e) => {
			if (!(e.target as HTMLElement).closest(".ws-tab-close")) {
				this.activateTab(filePath);
			}
		});

		// Close button
		closeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.closeTab(filePath);
		});

		this.insertTabBeforeNewButton(tabEl);

		// Create wrapper that holds both editor and preview
		const wrapperEl = document.createElement("div");
		wrapperEl.className = "ws-editor-wrapper";
		this.editorContainer.appendChild(wrapperEl);

		// Create CodeMirror editor
		const editorEl = document.createElement("div");
		editorEl.className = "ws-editor-view";
		wrapperEl.appendChild(editorEl);

		// Create preview pane
		const previewEl = document.createElement("div");
		previewEl.className = "ws-preview-view markdown-rendered";
		previewEl.style.display = "none";
		wrapperEl.appendChild(previewEl);

		// Determine initial mode from settings
		const settings = loadSettings();
		const defaultView = settings.defaultViewForNewTabs ?? "editing";
		const defaultEditing = settings.defaultEditingMode ?? "live-preview";
		const initialMode: ViewMode = defaultView === "reading" ? "reading" : defaultEditing;

		const state = EditorState.create({
			doc: content,
			selection: { anchor: this.getInitialSelectionAnchor(content) },
			extensions: this.buildExtensions(filePath, initialMode === "reading" ? defaultEditing : initialMode),
		});

		const view = new EditorView({
			state,
			parent: editorEl,
		});

		const tab: EditorTab = {
			path: filePath,
			name: tabName,
			view,
			tabEl,
			dirty: false,
			originalContent: content,
			mode: initialMode,
			lastEditingMode: defaultEditing as "source" | "live-preview",
			wrapperEl,
			previewEl,
		};

		// If starting in reading mode, render preview immediately
		if (initialMode === "reading") {
			this.renderReadingView(tab);
		}

		this.tabs.set(filePath, tab);
		this.updateTabHeaderControls();
		this.activateTab(filePath);
	}

	/**
	 * Activate a tab, showing its editor and hiding others.
	 * @param fromHistory - If true, skip pushing to history (used by back/forward nav)
	 */
	private activateTab(filePath: string, fromHistory = false): void {
		this.activeTabPath = filePath;
		this.activeBlankTabId = null;

		// Notify host (DockPanel) so it can update the dock tab label
		if (this.onActiveFileChange) {
			this.onActiveFileChange(filePath);
		}

		// Deactivate all blank tabs
		for (const [, bEl] of this.blankTabs) {
			bEl.classList.remove("is-active");
		}

		// Push to navigation history (unless navigating via back/forward)
		if (!fromHistory) {
			// Trim forward history when navigating to a new tab
			if (this.tabHistoryIndex < this.tabHistory.length - 1) {
				this.tabHistory = this.tabHistory.slice(0, this.tabHistoryIndex + 1);
			}
			// Avoid duplicate consecutive entries
			if (this.tabHistory[this.tabHistory.length - 1] !== filePath) {
				this.tabHistory.push(filePath);
			}
			this.tabHistoryIndex = this.tabHistory.length - 1;
		}

		// Hide empty state, show breadcrumb bar
		this.emptyState.style.display = "none";
		this.breadcrumbBar.classList.remove("is-hidden");

		// Update breadcrumb path (show folder / filename)
		const parts = filePath.replace(/\.md$/, "").split("/");
		this.breadcrumbPath.textContent = parts.join(" / ");

		for (const [path, tab] of this.tabs) {
			const isActive = path === filePath;
			tab.tabEl.classList.toggle("is-active", isActive);
			tab.wrapperEl.style.display = isActive ? "" : "none";
			if (isActive) {
				this.updateToggleIcon(tab.mode);
				this.fireStatsChange(tab.view.state);
				if (tab.mode === "source" || tab.mode === "live-preview") {
					tab.view.focus();
				}
			}
		}

		// Notify workspace of the active file for sidebar panels (PropertiesView)
		if (this.workspace) {
			const file = this.vault.getAbstractFileByPath(filePath);
			if (file) {
				this.workspace.setActiveFile(file);
				const activeTab = this.tabs.get(filePath);
				if (activeTab) {
					this.workspace.trigger("file-content-change", file, activeTab.view.state.doc.toString());
				}
			}
		}
	}

	/**
	 * Close a tab and dispose its editor.
	 */
	closeTab(filePath: string): void {
		const tab = this.tabs.get(filePath);
		if (!tab) return;

		tab.view.destroy();
		tab.tabEl.remove();
		tab.wrapperEl.remove();
		this.tabs.delete(filePath);
		this.updateTabHeaderControls();

		// Activate another tab or show empty state
		if (this.activeTabPath === filePath) {
			const remaining = Array.from(this.tabs.keys());
			const lastRemaining = remaining[remaining.length - 1];
			if (remaining.length > 0 && lastRemaining) {
				this.activateTab(lastRemaining);
			} else {
				this.activeTabPath = null;
				// Activate a blank tab, or create one
				const blankIds = Array.from(this.blankTabs.keys());
				const lastBlank = blankIds[blankIds.length - 1];
				if (blankIds.length > 0 && lastBlank) {
					this.activateBlankTab(lastBlank);
				} else {
					this.addBlankTab();
				}
			}
		}
	}

	/** Add a blank "New tab" tab to the tab bar. */
	private addBlankTab(): void {
		const id = `blank-${++this.blankTabCounter}`;
		const tabEl = document.createElement("div");
		tabEl.className = "ws-tab";
		tabEl.draggable = true;

		const nameSpan = document.createElement("span");
		nameSpan.className = "ws-tab-name";
		nameSpan.textContent = "New tab";
		tabEl.appendChild(nameSpan);

		const closeBtn = document.createElement("span");
		closeBtn.className = "ws-tab-close";
		closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
		tabEl.appendChild(closeBtn);
		let dragStartClientX = 0;
		let dragStartClientY = 0;

		tabEl.addEventListener("click", (e) => {
			if (!(e.target as HTMLElement).closest(".ws-tab-close")) {
				this.activateBlankTab(id);
			}
		});

		closeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (this.getTabCount() <= 1) {
				this.requestCloseLastTab();
				return;
			}
			this.removeBlankTab(id);
		});

		tabEl.addEventListener("dragstart", (e) => {
			if (e.dataTransfer) {
				e.dataTransfer.setData("text/x-pane-tab", JSON.stringify({ fromPaneId: this.paneId, blankTabId: id }));
				e.dataTransfer.effectAllowed = "move";
				tabEl.classList.add("is-dragging");
			}
		});
		tabEl.addEventListener("dragend", (e: DragEvent) => {
			tabEl.classList.remove("is-dragging");
		});

		this.insertTabBeforeNewButton(tabEl);
		this.blankTabs.set(id, tabEl);
		this.activateBlankTab(id);
	}

	/** Activate a blank tab, deactivating any file tab. */
	private activateBlankTab(id: string): void {
		this.activeTabPath = null;
		this.activeBlankTabId = id;

		// Deactivate all file tabs
		for (const [, tab] of this.tabs) {
			tab.tabEl.classList.remove("is-active");
			tab.wrapperEl.style.display = "none";
		}

		// Deactivate all blank tabs, activate this one
		for (const [bId, bEl] of this.blankTabs) {
			bEl.classList.toggle("is-active", bId === id);
		}

		// Show empty state
		this.emptyState.style.display = "";
		this.breadcrumbBar.classList.add("is-hidden");
		if (this.onStatsChange) {
			this.onStatsChange({ properties: 0, words: 0, characters: 0 });
		}
	}

	/** Returns true when a blank "New tab" is currently active. */
	isBlankTabActive(): boolean {
		return this.activeBlankTabId !== null;
	}

	/** Add and activate a blank tab (for cross-pane tab moves). */
	createBlankTab(): void {
		const existingBlankIds = Array.from(this.blankTabs.keys());
		const lastExisting = existingBlankIds[existingBlankIds.length - 1];
		if (existingBlankIds.length > 0 && lastExisting) {
			this.activateBlankTab(lastExisting);
			return;
		}
		this.addBlankTab();
	}

	/** Remove a blank tab without forcing replacement (for cross-pane moves). */
	removeBlankTabForTransfer(blankTabId: string): boolean {
		if (!this.blankTabs.has(blankTabId)) return false;
		this.removeBlankTab(blankTabId, false);
		return true;
	}

	/** Remove a blank tab. If it was active, activate another tab. */
	private removeBlankTab(id: string, ensureReplacement = true): void {
		const el = this.blankTabs.get(id);
		if (!el) return;
		el.remove();
		this.blankTabs.delete(id);

		if (this.activeBlankTabId === id) {
			this.activeBlankTabId = null;
			// Activate another blank tab, or last file tab, or show empty state
			const remainingBlank = Array.from(this.blankTabs.keys());
			const lastBlank = remainingBlank[remainingBlank.length - 1];
			if (remainingBlank.length > 0 && lastBlank) {
				this.activateBlankTab(lastBlank);
			} else {
				const remaining = Array.from(this.tabs.keys());
				const lastRemaining = remaining[remaining.length - 1];
				if (remaining.length > 0 && lastRemaining) {
					this.activateTab(lastRemaining);
				} else if (ensureReplacement) {
					// No tabs at all — create a new blank tab
					this.addBlankTab();
				}
			}
		}
	}

	/** Keep header controls in sync with current tab state. */
	private updateTabHeaderControls(): void {
		// Hide all blank tabs when file tabs exist and a file is active
		// (blank tabs remain accessible in the tab bar)
	}

	/**
	 * Save the currently active tab.
	 */
	private async saveActiveTab(): Promise<void> {
		if (!this.activeTabPath) return;
		const tab = this.tabs.get(this.activeTabPath);
		if (!tab) return;

		const content = tab.view.state.doc.toString();
		try {
			if (this.onSave) {
				await this.onSave(tab.path, content);
			} else {
				const file = this.vault.getAbstractFileByPath(tab.path);
				if (file) {
					await this.vault.modify(file, content);
				}
			}
			tab.originalContent = content;
			tab.dirty = false;
			this.updateTabDirtyState(tab);
		} catch (err) {
			console.error(`[EditorManager] Failed to save ${tab.path}:`, err);
		}
	}

	/**
	 * Update the tab's visual dirty indicator.
	 */
	private updateTabDirtyState(tab: EditorTab): void {
		tab.tabEl.classList.toggle("is-dirty", tab.dirty);
	}

	/** Render the reading view HTML for a tab. */
	private renderReadingView(tab: EditorTab): void {
		const fullContent = tab.view.state.doc.toString();
		const settings = loadSettings();
		const mode = settings.propertiesInDocument ?? "visible";
		const fm = parseFrontmatter(fullContent);
		let fmHtml = "";
		let bodyContent = fullContent;

		if (fm) {
			bodyContent = stripFrontmatter(fullContent);
			if (mode === "visible") {
				fmHtml = renderPropertiesHtml(fm.properties);
			} else if (mode === "source") {
				fmHtml = renderFrontmatterSource(fm.raw);
			}
		}

		try {
			tab.previewEl.innerHTML = fmHtml + (marked.parse(bodyContent) as string);
		} catch (err) {
			console.error("[EditorManager] Reading view parse error:", err);
			tab.previewEl.innerHTML = fmHtml + `<pre style="color:var(--text-error)">${String(err)}</pre>`;
		}

		// Post-process rendered HTML for interactive features
		postProcessCodeBlocks(tab.previewEl);
		postProcessCallouts(tab.previewEl);
		postProcessLinks(tab.previewEl, (target) => this.navigateToInternalLink(target));
		void postProcessMermaid(tab.previewEl);

		const editorEl = tab.view.dom.parentElement as HTMLElement;
		editorEl.style.display = "none";
		tab.previewEl.style.display = "";
	}

	/**
	 * Switch the active tab to a specific view mode.
	 *
	 * This is the core mode-switching method. It handles transitions between
	 * source, live-preview, and reading modes, including CM6 compartment
	 * reconfiguration and DOM visibility toggling.
	 */
	setActiveTabMode(mode: ViewMode): void {
		if (!this.activeTabPath) return;
		const tab = this.tabs.get(this.activeTabPath);
		if (!tab || tab.mode === mode) return;

		const editorEl = tab.view.dom.parentElement as HTMLElement;
		const prevMode = tab.mode;

		// Track last editing mode for Ctrl+E toggle
		if (prevMode === "source" || prevMode === "live-preview") {
			tab.lastEditingMode = prevMode;
		}

		tab.mode = mode;
		this.updateToggleIcon(mode);

		// Update wrapper CSS classes for mode-specific styling
		tab.wrapperEl.classList.remove("is-source-mode", "is-live-preview", "is-reading-view");
		tab.wrapperEl.classList.add(
			mode === "source" ? "is-source-mode" :
			mode === "live-preview" ? "is-live-preview" : "is-reading-view"
		);

		if (mode === "reading") {
			this.renderReadingView(tab);
		} else {
			// Switching to an editing mode (source or live-preview)
			tab.previewEl.style.display = "none";
			editorEl.style.display = "";

			const settings = loadSettings();
			const propsMode = settings.propertiesInDocument ?? "visible";
			const isSource = mode === "source";
			const isLivePreview = mode === "live-preview";

			// Reconfigure CM6 compartments for the new mode
			tab.view.dispatch({
				effects: [
					this.livePreviewCompartment.reconfigure(livePreviewPlugin(isLivePreview)),
					this.sourceModeFontCompartment.reconfigure(
						isSource ? EditorView.theme({
							".cm-content": { fontFamily: "var(--font-monospace, 'JetBrains Mono', 'Fira Code', monospace)" },
						}) : []
					),
					this.propertiesCompartment.reconfigure(
						frontmatterPlugin(isSource ? "source" : propsMode)
					),
				],
			});

			tab.view.focus();
		}
	}

	/**
	 * Cycle through modes via the breadcrumb toggle button.
	 * Source → Live Preview → Reading → Source
	 */
	private cycleActiveTabMode(): void {
		if (!this.activeTabPath) return;
		const tab = this.tabs.get(this.activeTabPath);
		if (!tab) return;

		const nextMode: ViewMode =
			tab.mode === "source" ? "live-preview" :
			tab.mode === "live-preview" ? "reading" : "source";
		this.setActiveTabMode(nextMode);
	}

	/**
	 * Toggle between reading and editing (Ctrl+E / Cmd+E).
	 * Reading → last editing mode; Editing → Reading.
	 */
	private toggleReadingEditing(): void {
		if (!this.activeTabPath) return;
		const tab = this.tabs.get(this.activeTabPath);
		if (!tab) return;

		if (tab.mode === "reading") {
			this.setActiveTabMode(tab.lastEditingMode);
		} else {
			this.setActiveTabMode("reading");
		}
	}

	/** SVG icon for the current view mode (indicates current state) */
	private getViewIcon(currentMode: ViewMode): string {
		if (currentMode === "source") {
			// Source mode → code icon
			return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
		}
		if (currentMode === "live-preview") {
			// Live preview mode → pencil icon
			return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
		}
		// Reading view → book icon
		return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;
	}

	/** Update the toggle button icon to reflect current mode. */
	private updateToggleIcon(mode: ViewMode): void {
		this.viewToggleBtn.innerHTML = this.getViewIcon(mode);
		const labels: Record<ViewMode, string> = {
			"source": "Source mode (click to cycle)",
			"live-preview": "Live preview (click to cycle)",
			"reading": "Reading view (click to cycle)",
		};
		this.viewToggleBtn.setAttribute("aria-label", labels[mode]);
	}

	/** Set a callback for document stats changes (properties, words, characters). */
	setStatsChangeHandler(handler: (stats: DocumentStats) => void): void {
		this.onStatsChange = handler;
	}

	/** Compute and fire stats from an EditorState. */
	private fireStatsChange(state: EditorState): void {
		if (!this.onStatsChange) return;
		const content = state.doc.toString();
		const fm = parseFrontmatter(content);
		const properties = fm ? Object.keys(fm.properties).length : 0;
		const sel = state.selection.main;
		const hasSelection = sel.from !== sel.to;
		const text = hasSelection
			? state.sliceDoc(sel.from, sel.to)
			: stripFrontmatter(content);
		const trimmed = text.trim();
		const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
		const characters = trimmed.length;
		this.onStatsChange({ properties, words, characters });
	}

	/**
	 * Check if a file is currently open.
	 */
	isFileOpen(filePath: string): boolean {
		return this.tabs.has(filePath);
	}

	/**
	 * Get the currently active file path.
	 */
	getActiveFilePath(): string | null {
		return this.activeTabPath;
	}

	/** Get file paths of all open tabs in order. */
	getOpenTabPaths(): string[] {
		return Array.from(this.tabs.keys());
	}

	/**
	 * Export a tab's state and close it locally. Used for cross-pane tab moves.
	 */
	exportTab(filePath: string): TabState | null {
		const tab = this.tabs.get(filePath);
		if (!tab) return null;

		const state: TabState = {
			path: tab.path,
			name: tab.name,
			content: tab.view.state.doc.toString(),
			dirty: tab.dirty,
			originalContent: tab.originalContent,
			mode: tab.mode,
		};

		this.closeTab(filePath);
		return state;
	}

	/**
	 * Import a tab from a serialized state (without reading from vault).
	 */
	async importTab(state: TabState): Promise<void> {
		// If already open, just activate
		if (this.tabs.has(state.path)) {
			this.activateTab(state.path);
			return;
		}

		// Remove active blank tab
		if (this.activeBlankTabId) {
			this.removeBlankTab(this.activeBlankTabId, false);
		}

		// Create tab header
		const tabEl = document.createElement("div");
		tabEl.className = "ws-tab";
		tabEl.draggable = true;

		const nameSpan = document.createElement("span");
		nameSpan.className = "ws-tab-name";
		nameSpan.textContent = state.name;
		tabEl.appendChild(nameSpan);

		const closeBtn = document.createElement("span");
		closeBtn.className = "ws-tab-close";
		closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
		tabEl.appendChild(closeBtn);

		const filePath = state.path;
		let dragStartClientX = 0;
		let dragStartClientY = 0;
		let poppedOutAtEdge = false;
		const handleDragAtEdge = (ev: DragEvent) => {
			if (poppedOutAtEdge) return;
			if (this.isDetachedFileTabView()) return;
			const atEdge = ev.clientX <= 0
				|| ev.clientY <= 0
				|| ev.clientX >= window.innerWidth - 1
				|| ev.clientY >= window.innerHeight - 1;
			if (!atEdge) return;
			poppedOutAtEdge = true;
			tabEl.classList.remove("is-dragging");
			tabEl.removeEventListener("drag", handleDragAtEdge);
			void this.popOutFileTab(filePath);
		};

		// Tab drag-and-drop
		tabEl.addEventListener("dragstart", (e) => {
			if (e.dataTransfer) {
				poppedOutAtEdge = false;
				dragStartClientX = e.clientX;
				dragStartClientY = e.clientY;
				e.dataTransfer.setData("text/x-pane-tab", JSON.stringify({ fromPaneId: this.paneId, filePath }));
				e.dataTransfer.effectAllowed = "copyMove";
				tabEl.classList.add("is-dragging");
				tabEl.addEventListener("drag", handleDragAtEdge);
			}
		});
		tabEl.addEventListener("dragend", (e: DragEvent) => {
			tabEl.classList.remove("is-dragging");
			tabEl.removeEventListener("drag", handleDragAtEdge);
			if (poppedOutAtEdge) return;
			const wasHandledDrop = e.dataTransfer?.dropEffect === "move";
			if (wasHandledDrop && this.isDetachedFileTabView()) {
				const shouldCloseWindow = this.tabs.size <= 1;
				if (this.tabs.has(filePath)) this.closeTab(filePath);
				if (shouldCloseWindow) window.close();
				return;
			}
			const dx = Math.abs(e.clientX - dragStartClientX);
			const dy = Math.abs(e.clientY - dragStartClientY);
			const wasDragged = Math.max(dx, dy) > 12;
			if (!wasHandledDrop && wasDragged) {
				if (this.isDetachedFileTabView()) {
					void this.dockFileToMain(filePath);
				} else {
					void this.popOutFileTab(filePath);
				}
			}
		});

		tabEl.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.showTabContextMenu(tabEl, filePath, e);
		});

		tabEl.addEventListener("click", (e) => {
			if (!(e.target as HTMLElement).closest(".ws-tab-close")) {
				this.activateTab(filePath);
			}
		});

		closeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.closeTab(filePath);
		});

		this.insertTabBeforeNewButton(tabEl);

		// Create wrapper
		const wrapperEl = document.createElement("div");
		wrapperEl.className = "ws-editor-wrapper";
		this.editorContainer.appendChild(wrapperEl);

		const editorEl = document.createElement("div");
		editorEl.className = "ws-editor-view";
		wrapperEl.appendChild(editorEl);

		const previewEl = document.createElement("div");
		previewEl.className = "ws-preview-view markdown-rendered";
		previewEl.style.display = "none";
		wrapperEl.appendChild(previewEl);

		const importMode = state.mode === "reading"
			? (state as any).lastEditingMode || "live-preview"
			: state.mode;

		const editorState = EditorState.create({
			doc: state.content,
			selection: { anchor: this.getInitialSelectionAnchor(state.content) },
			extensions: this.buildExtensions(filePath, importMode),
		});

		const view = new EditorView({ state: editorState, parent: editorEl });

		const tab: EditorTab = {
			path: state.path,
			name: state.name,
			view,
			tabEl,
			dirty: state.dirty,
			originalContent: state.originalContent,
			mode: state.mode,
			lastEditingMode: (state as any).lastEditingMode || "live-preview",
			wrapperEl,
			previewEl,
		};

		if (state.mode === "reading") {
			this.renderReadingView(tab);
		}

		if (state.dirty) this.updateTabDirtyState(tab);

		this.tabs.set(state.path, tab);
		this.updateTabHeaderControls();
		this.activateTab(state.path);
	}

	/** Navigate to the previous tab in history. */
	private navigateBack(): void {
		if (this.tabHistoryIndex <= 0) return;
		this.tabHistoryIndex--;
		const path = this.tabHistory[this.tabHistoryIndex];
		if (path && this.tabs.has(path)) {
			this.activateTab(path, true);
		} else {
			// Tab was closed, skip it
			this.navigateBack();
		}
	}

	/** Navigate to the next tab in history. */
	private navigateForward(): void {
		if (this.tabHistoryIndex >= this.tabHistory.length - 1) return;
		this.tabHistoryIndex++;
		const path = this.tabHistory[this.tabHistoryIndex];
		if (path && this.tabs.has(path)) {
			this.activateTab(path, true);
		} else {
			this.navigateForward();
		}
	}

	/** Show a dropdown menu listing all open tabs, with a checkmark on the active one. */
	private showTabListMenu(anchor: HTMLElement, e: MouseEvent): void {
		e.stopPropagation();
		this.dismissMenu();

		const menu = document.createElement("div");
		menu.className = "menu ws-tab-list-menu";
		document.body.appendChild(menu);

		// "Stack tabs" option
		const stackItem = document.createElement("div");
		stackItem.className = "menu-item";
		stackItem.innerHTML = `<span class="menu-item-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg></span><span>Stack tabs</span>`;
		menu.appendChild(stackItem);

		// "Close all" option
		const closeAllItem = document.createElement("div");
		closeAllItem.className = "menu-item";
		closeAllItem.innerHTML = `<span class="menu-item-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span><span>Close all</span>`;
		closeAllItem.addEventListener("click", () => {
			this.dismissMenu();
			const paths = Array.from(this.tabs.keys());
			for (const p of paths) {
				this.closeTab(p);
			}
		});
		menu.appendChild(closeAllItem);

		// Separator
		const sep = document.createElement("div");
		sep.className = "menu-separator";
		menu.appendChild(sep);

		// List of open tabs
		for (const [path, tab] of this.tabs) {
			const item = document.createElement("div");
			item.className = "menu-item";
			const isActive = path === this.activeTabPath;
			const check = document.createElement("span");
			check.className = "menu-item-check";
			check.innerHTML = isActive
				? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
				: "";
			item.appendChild(check);
			const title = document.createElement("span");
			title.className = "menu-item-title";
			title.textContent = tab.name;
			item.appendChild(title);
			item.addEventListener("click", () => {
				this.dismissMenu();
				this.activateTab(path);
			});
			menu.appendChild(item);
		}

		// Position below the anchor
		const rect = anchor.getBoundingClientRect();
		menu.style.top = `${rect.bottom + 4}px`;
		menu.style.right = `${document.documentElement.clientWidth - rect.right}px`;

		// Click outside to dismiss
		const dismiss = (ev: MouseEvent) => {
			if (!menu.contains(ev.target as Node)) {
				this.dismissMenu();
			}
		};
		setTimeout(() => document.addEventListener("click", dismiss), 0);
		this.activeMenu = menu;
		this.activeMenuCleanup = () => document.removeEventListener("click", dismiss);
	}

	/** Dismiss the active dropdown menu. */
	private dismissMenu(): void {
		if (this.activeMenu) {
			this.activeMenu.remove();
			this.activeMenu = null;
		}
		if (this.activeMenuCleanup) {
			this.activeMenuCleanup();
			this.activeMenuCleanup = null;
		}
	}

	/** Pop out a file tab to a separate window (Electron only). */
	private async popOutFileTab(filePath: string): Promise<void> {
		if (!window.electronAPI?.openWindow) return;
		const tab = this.tabs.get(filePath);
		if (!tab) return;
		try {
			await window.electronAPI.openWindow("ws-file-tab-view", {
				title: tab.name || "Vault Copilot",
				width: 1000,
				height: 760,
				query: { openFile: filePath },
			});
			this.closeTab(filePath);
		} catch (err) {
			console.error("[EditorManager] Failed to pop out tab:", err);
		}
	}

	/** Dock a file tab from detached window back into the main window. */
	private async dockFileToMain(filePath: string): Promise<void> {
		if (!window.electronAPI?.dockTab) return;
		const shouldCloseWindow = this.isDetachedFileTabView() && this.tabs.size <= 1;
		const result = await window.electronAPI.dockTab(filePath);
		if (!result?.ok) return;
		if (this.tabs.has(filePath)) this.closeTab(filePath);
		if (shouldCloseWindow) window.close();
	}

	/**
	 * Navigate to an internal (WikiLink) target by resolving it to a file path.
	 *
	 * Resolution strategy:
	 * 1. Exact path match
	 * 2. Append .md extension
	 * 3. Relative to active tab's directory
	 * 4. Basename match across all vault files
	 *
	 * @param linkTarget - The WikiLink target (e.g. "My Note", "folder/note")
	 * @internal
	 */
	private navigateToInternalLink(linkTarget: string): void {
		const resolved = this.resolveInternalLink(linkTarget);
		if (resolved) {
			void this.openFile(resolved);
		} else {
			console.warn(`[EditorManager] Could not resolve internal link: ${linkTarget}`);
		}
	}

	/**
	 * Resolve a WikiLink target to a file path in the vault.
	 * @param linkTarget - The link target string
	 * @returns Resolved file path, or null if not found
	 * @internal
	 */
	private resolveInternalLink(linkTarget: string): string | null {
		// Strip any heading/block references (e.g. "Note#heading" → "Note")
		const hashIdx = linkTarget.indexOf("#");
		const cleanTarget = hashIdx >= 0 ? linkTarget.slice(0, hashIdx) : linkTarget;
		if (!cleanTarget) return null;

		// Strategy 1: exact path match
		const exact = this.vault.getAbstractFileByPath(cleanTarget);
		if (exact) return cleanTarget;

		// Strategy 2: append .md
		if (!cleanTarget.endsWith(".md")) {
			const withMd = this.vault.getAbstractFileByPath(`${cleanTarget}.md`);
			if (withMd) return `${cleanTarget}.md`;
		}

		// Strategy 3: relative to active tab's folder
		const sourceDir = this.activeTabPath
			? this.activeTabPath.includes("/")
				? this.activeTabPath.slice(0, this.activeTabPath.lastIndexOf("/"))
				: ""
			: "";
		if (sourceDir) {
			const relative = this.vault.getAbstractFileByPath(`${sourceDir}/${cleanTarget}`);
			if (relative) return `${sourceDir}/${cleanTarget}`;
			if (!cleanTarget.endsWith(".md")) {
				const relativeMd = this.vault.getAbstractFileByPath(`${sourceDir}/${cleanTarget}.md`);
				if (relativeMd) return `${sourceDir}/${cleanTarget}.md`;
			}
		}

		// Strategy 4: basename match across all files
		const linkBasename = cleanTarget.split("/").pop() || cleanTarget;
		const files = this.vault.getFiles?.() || [];
		for (const file of files) {
			const basename = file.basename ?? file.name?.replace(/\.md$/, "");
			if (basename === linkBasename || file.name === linkBasename) {
				return file.path;
			}
		}

		return null;
	}

	/** Get the current active tab mode when a file tab is active. */
	getActiveTabMode(): ViewMode | null {
		if (!this.activeTabPath) return null;
		const tab = this.tabs.get(this.activeTabPath);
		return tab?.mode ?? null;
	}

	/** Pop out the active file tab into a separate window. */
	async popOutActiveTab(): Promise<void> {
		if (!this.activeTabPath) return;
		await this.popOutFileTab(this.activeTabPath);
	}

	/** Show context menu for a file tab. */
	private showTabContextMenu(anchor: HTMLElement, filePath: string, e: MouseEvent): void {
		e.stopPropagation();
		this.dismissMenu();

		const menu = document.createElement("div");
		menu.className = "menu ws-tab-list-menu";
		document.body.appendChild(menu);

		if (window.electronAPI?.openWindow) {
			const item = document.createElement("div");
			item.className = "menu-item";
			item.innerHTML = `<span class="menu-item-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg></span><span>Open in new window</span>`;
			item.addEventListener("click", async () => {
				this.dismissMenu();
				await this.popOutFileTab(filePath);
			});
			menu.appendChild(item);

			if (typeof window.electronAPI?.dockTab === "function" && this.isDetachedFileTabView()) {
				const dockItem = document.createElement("div");
				dockItem.className = "menu-item";
				dockItem.innerHTML = `<span class="menu-item-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 4 4 8 8 12"/><path d="M4 8h10a4 4 0 1 1 0 8h-1"/></svg></span><span>Dock to main window</span>`;
				dockItem.addEventListener("click", async () => {
					this.dismissMenu();
					await this.dockFileToMain(filePath);
				});
				menu.appendChild(dockItem);
			}
		}

		const rect = anchor.getBoundingClientRect();
		menu.style.top = `${rect.bottom + 4}px`;
		menu.style.left = `${rect.left}px`;

		const dismiss = (ev: MouseEvent) => {
			if (!menu.contains(ev.target as Node)) {
				this.dismissMenu();
			}
		};
		setTimeout(() => document.addEventListener("click", dismiss), 0);
		this.activeMenu = menu;
		this.activeMenuCleanup = () => document.removeEventListener("click", dismiss);
	}

	/** Connect to the LayoutManager for sidebar toggle delegation. */
	setLayoutManager(lm: LayoutManager): void {
		this.layoutManager = lm;
		// Keep split button icon in sync with layout state changes
		lm.addStateChangeListener(() => {
			const collapsed = lm.isRightCollapsed;
			this.splitBtn.innerHTML = this.getRightSidebarIcon(collapsed);
			this.splitBtn.setAttribute("aria-label", collapsed ? "Show right sidebar" : "Collapse right sidebar");
		});
	}

	/** Icon for right sidebar toggle button. */
	private getRightSidebarIcon(collapsed: boolean): string {
		if (collapsed) {
			return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="11 8 16 12 11 16"/></svg>`;
		}
		return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="13 8 8 12 13 16"/></svg>`;
	}
}
