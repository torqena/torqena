/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module native
 * @description Native implementations replacing obsidian imports.
 *
 * This module provides native web and Electron implementations of
 * functionality previously provided by the "obsidian" module.
 * Files should be migrated from importing `"obsidian"` to importing
 * from this module.
 *
 * ## Migration Guide
 *
 * ### Before (obsidian import)
 * ```typescript
 * import { Platform, setIcon, Modal, Setting } from "obsidian";
 * ```
 *
 * ### After (native import)
 * ```typescript
 * import { Platform, setIcon, Modal, Setting } from "../native";
 * ```
 *
 * @since 0.1.0
 */

// ---- DOM extensions (must be initialized via initDomExtensions) ----
export { initDomExtensions } from "./dom/dom-extensions.js";
export type { DomElementInfo } from "./dom/dom-extensions.js";

// ---- Core ----
export { App } from "./core/App.js";
export { Component } from "./core/Component.js";
export { Events } from "./core/Events.js";
export type { EventRef } from "./core/Events.js";
export { Plugin } from "./core/Plugin.js";
export type { PluginManifest, Command } from "./core/Plugin.js";

// ---- Vault ----
export { TAbstractFile } from "./vault/TAbstractFile.js";
export { TFile } from "./vault/TFile.js";
export { TFolder } from "./vault/TFolder.js";
export { Vault } from "./vault/Vault.js";
export { VaultAdapter, FileSystemAdapter } from "./vault/VaultAdapter.js";

// ---- Workspace ----
export { Workspace } from "./workspace/Workspace.js";
export { WorkspaceLeaf } from "./workspace/WorkspaceLeaf.js";

// ---- UI ----
export { ItemView, MarkdownView, type ViewStateResult } from "./ui/ItemView.js";
export { Modal } from "./ui/Modal.js";
export { Setting } from "./ui/Setting.js";
export {
	TextComponent,
	TextAreaComponent,
	ToggleComponent,
	DropdownComponent,
	SliderComponent,
	ButtonComponent,
	ExtraButtonComponent,
} from "./ui/FormComponents.js";
export { Menu, MenuItem } from "./ui/Menu.js";
export { Notice } from "./ui/Notice.js";
export { PluginSettingTab } from "./ui/PluginSettingTab.js";
export { FuzzySuggestModal } from "./ui/FuzzySuggestModal.js";
export { AbstractInputSuggest } from "./ui/AbstractInputSuggest.js";
export { MarkdownRenderer } from "./ui/MarkdownRenderer.js";

// ---- Utils ----
export { setIcon } from "./utils/icons.js";
export { requestUrl } from "./utils/requestUrl.js";
export type { RequestUrlParam, RequestUrlResponse } from "./utils/requestUrl.js";
export { Platform } from "./utils/platform.js";
export { parseYaml, stringifyYaml } from "./utils/parseYaml.js";
export { normalizePath } from "./utils/normalizePath.js";

// ---- Metadata ----
export { MetadataCache } from "./metadata/MetadataCache.js";
export { FileManager } from "./metadata/FileManager.js";
