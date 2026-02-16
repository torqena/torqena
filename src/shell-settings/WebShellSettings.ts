/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module WebShellSettings
 * @description Shared settings interface and storage for web shell built-in tabs.
 */

import type { EditorThemeId } from "../editor/EditorThemeCatalog.js";

/** Persisted layout state for the three-column shell. */
export interface LayoutState {
	leftWidth: string;
	rightWidth: string;
	leftCollapsed: boolean;
	rightCollapsed: boolean;
}

/** Serialized pane tree for persistence. */
export interface PaneTreeState {
	/** Recursive tree of "leaf" and "split" nodes. */
	root: PaneNodeState;
	/** ID of the pane that was last active. */
	activePaneId: string;
}

export type PaneNodeState = PaneLeafState | PaneSplitState;

export interface PaneLeafState {
	type: "leaf";
	id: string;
	/** File paths of open tabs, in order. */
	openTabs: string[];
	/** Path of the active tab (null if blank tab was active). */
	activeTab: string | null;
}

export interface PaneSplitState {
	type: "split";
	id: string;
	direction: "horizontal" | "vertical";
	/** Flex sizes as CSS strings (e.g. "0 0 50%"). */
	sizes: string[];
	children: PaneNodeState[];
}

export interface WebShellSettings {
	// General
	language: string;
	automaticUpdates: boolean;
	receiveEarlyAccessVersions: boolean;
	notifySlowStartup: boolean;

	// Editor
	alwaysFocusNewTabs: boolean;
	defaultViewForNewTabs: "editing" | "reading";
	defaultEditingMode: "live-preview" | "source";
	readableLineLength: boolean;
	strictLineBreaks: boolean;
	propertiesInDocument: "visible" | "hidden" | "source";
	foldHeadings: boolean;
	foldIndent: boolean;
	showLineNumbers: boolean;
	indentationGuides: boolean;
	rightToLeft: boolean;
	spellcheck: boolean;
	autoPairBrackets: boolean;
	autoPairMarkdownSyntax: boolean;
	smartLists: boolean;
	indentUsingTabs: boolean;
	tabSize: number;
	convertPastedHtmlToMarkdown: boolean;
	vimKeyBindings: boolean;

	// Files & Links
	newNotePath: string;
	attachmentFolder: string;
	linkFormat: "shortest" | "relative" | "absolute";
	useMarkdownLinks: boolean;
	autoUpdateLinks: boolean;
	deleteOption: "trash" | "permanent";

	// Appearance
	theme: "light" | "dark" | "system";
	editorThemeLight: EditorThemeId;
	editorThemeDark: EditorThemeId;
	accentColor: string;
	inlineTitle: boolean;
	showTabTitleBar: boolean;
	showRibbon: boolean;
	fontFamily: string;
	textFont: string;
	monospaceFont: string;
	fontSize: number;
	quickFontSizeAdjustment: boolean;
	zoomLevel: number;
	nativeMenus: boolean;
	windowFrameStyle: "hidden" | "native";
	hardwareAcceleration: boolean;
	translucent: boolean;

	// Layout persistence
	layout?: LayoutState;
	paneTree?: PaneTreeState;
}

export const DEFAULT_SETTINGS: WebShellSettings = {
	language: "en",
	automaticUpdates: true,
	receiveEarlyAccessVersions: true,
	notifySlowStartup: true,
	alwaysFocusNewTabs: true,
	defaultViewForNewTabs: "editing",
	defaultEditingMode: "live-preview",
	readableLineLength: true,
	strictLineBreaks: false,
	propertiesInDocument: "visible",
	foldHeadings: true,
	foldIndent: true,
	showLineNumbers: false,
	indentationGuides: true,
	rightToLeft: false,
	spellcheck: true,
	autoPairBrackets: true,
	autoPairMarkdownSyntax: true,
	smartLists: true,
	indentUsingTabs: true,
	tabSize: 4,
	convertPastedHtmlToMarkdown: true,
	vimKeyBindings: false,
	newNotePath: "",
	attachmentFolder: "",
	linkFormat: "shortest",
	useMarkdownLinks: false,
	autoUpdateLinks: true,
	deleteOption: "trash",
	theme: "system",
	editorThemeLight: "default",
	editorThemeDark: "default",
	accentColor: "",
	inlineTitle: false,
	showTabTitleBar: true,
	showRibbon: true,
	fontFamily: "",
	textFont: "",
	monospaceFont: "",
	fontSize: 16,
	quickFontSizeAdjustment: false,
	zoomLevel: 0,
	nativeMenus: false,
	windowFrameStyle: "hidden",
	hardwareAcceleration: true,
	translucent: false,
};

const STORAGE_KEY = "web-shell-settings";

/**
 * Simple event bus for settings change notifications.
 * @internal
 */
class SettingsEventBus {
	private listeners: Set<() => void> = new Set();

	/** Subscribe to settings changes. Returns an unsubscribe function. */
	on(callback: () => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	/** Notify all listeners that settings changed. */
	emit(): void {
		for (const cb of this.listeners) {
			try { cb(); } catch (e) { console.error("[SettingsEventBus]", e); }
		}
	}
}

/** Singleton event bus emitted whenever settings are saved. */
export const settingsChanged = new SettingsEventBus();

/** Load settings from localStorage, merged with defaults. */
export function loadSettings(): WebShellSettings {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
		}
	} catch { /* ignore parse errors */ }
	return { ...DEFAULT_SETTINGS };
}

/** Save settings to localStorage. */
export function saveSettings(settings: WebShellSettings): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	settingsChanged.emit();
}

/**
 * Resolve a persisted theme setting to a concrete light/dark mode.
 *
 * @param theme - Persisted base theme setting.
 * @returns Concrete theme mode used for editor/theme-specific settings.
 */
export function resolveThemeMode(theme: "light" | "dark" | "system"): "light" | "dark" {
	if (theme === "system") {
		return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	}

	return theme;
}
