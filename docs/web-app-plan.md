# Obsidian Compatibility Shim — Web App Implementation Plan

## Overview

Vault Copilot is an Obsidian plugin tightly coupled to Obsidian across 93 source files. This plan describes how to build a **compatibility shim** — a separate package that re-implements Obsidian's API surface using standard web APIs — so the existing plugin code runs as a standalone web app with minimal source changes.

The key technique: at build time, Vite aliases `"obsidian"` to our shim package. This is the same pattern already proven by our test infrastructure (`vitest.config.ts` aliases `obsidian` to `src/__mocks__/platform.ts`). The production shim is a full-fidelity version of that test mock.

**Goals**:
- Zero import changes to existing `src/` files
- The Obsidian build (`esbuild.config.mjs`) continues to work unmodified
- A separate Vite entry point produces a standalone web app
- File storage uses the browser File System Access API to read/write a local folder

---

## Project Structure

```
obsidian-vault-copilot/
  src/                              (existing plugin source — no import changes)
  packages/
    obsidian-shim/                  (NEW — replaces 'obsidian' module)
      src/
        index.ts                    (barrel export matching obsidian's API shape)
        dom/dom-extensions.ts       (createDiv, createEl, empty, addClass, setText)
        core/Events.ts              (EventRef, Events base class)
        core/Component.ts           (lifecycle + cleanup tracking)
        core/Plugin.ts              (addCommand, registerView, loadData/saveData)
        core/App.ts                 (wiring: vault + workspace + metadataCache)
        vault/TAbstractFile.ts
        vault/TFile.ts
        vault/TFolder.ts
        vault/Vault.ts              (File System Access API backend)
        vault/VaultAdapter.ts       (adapter.read/write/exists/getBasePath)
        workspace/Workspace.ts      (leaf management, getActiveFile, events)
        workspace/WorkspaceLeaf.ts  (view container, setViewState)
        ui/ItemView.ts              (containerEl, onOpen/onClose lifecycle)
        ui/Modal.ts                 (overlay + contentEl/titleEl)
        ui/Setting.ts               (setName/setDesc/addText/addToggle/addDropdown/addButton)
        ui/FormComponents.ts        (TextComponent, ToggleComponent, DropdownComponent, ButtonComponent)
        ui/FuzzySuggestModal.ts
        ui/AbstractInputSuggest.ts
        ui/Menu.ts                  (addItem, showAtMouseEvent)
        ui/Notice.ts                (toast notifications)
        ui/PluginSettingTab.ts
        ui/MarkdownRenderer.ts      (marked + internal-link post-processing)
        utils/icons.ts              (setIcon via lucide)
        utils/requestUrl.ts         (fetch wrapper)
        utils/platform.ts           (Platform object, isDesktop=false)
        utils/parseYaml.ts          (js-yaml wrapper)
        utils/normalizePath.ts
        metadata/MetadataCache.ts   (getFirstLinkpathDest — path-based lookup)
        metadata/FileManager.ts     (renameFile — delegates to vault)
      package.json
      tsconfig.json
    web-shell/                      (NEW — web app entry point + layout)
      src/
        index.html
        main.ts                     (bootstrap: pick folder, create App, load plugin)
        layout.ts                   (sidebar + center + right panel DOM)
        theme.css                   (Obsidian CSS variable definitions)
      vite.config.ts                (alias "obsidian" -> @vault-copilot/obsidian-shim)
      package.json
```

---

## Complete Obsidian API Surface to Implement

These are all named imports from `"obsidian"` used across the 93 source files. The shim's `index.ts` must export every one of these:

### Classes (22)
| Export | Category | Implementation Complexity |
|--------|----------|--------------------------|
| `App` | Core | Low — wiring object |
| `Plugin` | Core | Medium — lifecycle, commands, settings, data persistence |
| `Component` | Core | Low — event/interval tracking for cleanup |
| `Vault` | Vault | **High** — File System Access API backend, file index, events |
| `TFile` | Vault | Low — data class |
| `TFolder` | Vault | Low — data class |
| `TAbstractFile` | Vault | Low — base data class |
| `FileSystemAdapter` | Vault | Low — delegates to VaultAdapter |
| `Workspace` | Workspace | Medium-High — layout zones, leaf routing |
| `WorkspaceLeaf` | Workspace | Medium — view container, state management |
| `MetadataCache` | Metadata | Low — only `getFirstLinkpathDest` used (3 files) |
| `ItemView` | UI | Medium — abstract base with containerEl lifecycle |
| `Modal` | UI | Medium — overlay + positioning + keyboard |
| `Setting` | UI | Medium — chainable form builder with multiple component types |
| `TextComponent` | UI | Low — `<input type="text">` wrapper |
| `DropdownComponent` | UI | Low — `<select>` wrapper |
| `ButtonComponent` | UI | Low — `<button>` wrapper |
| `PluginSettingTab` | UI | Low — container with display()/hide() |
| `FuzzySuggestModal` | UI | Medium — modal + fuzzy search + list |
| `AbstractInputSuggest` | UI | Medium — dropdown suggestions attached to input |
| `Menu` | UI | Low-Medium — positioned popup with items |
| `Notice` | UI | Low — toast notification |
| `MarkdownRenderer` | UI | Medium — `marked` + wiki-link post-processing |
| `MarkdownView` | UI | Low — stub (return null from `getActiveViewOfType`) |

### Functions (3)
| Export | Implementation |
|--------|---------------|
| `setIcon(el, iconId)` | Use `lucide` npm package to render SVG into element |
| `requestUrl(params)` | Thin `fetch()` wrapper (see CORS notes) |
| `parseYaml(str)` | `js-yaml` wrapper |

### Constants/Objects (1)
| Export | Implementation |
|--------|---------------|
| `Platform` | `{ isDesktop: false, isMobile: false, isDesktopApp: false, isMobileApp: false }` |

### Types/Interfaces (3)
| Export | Notes |
|--------|-------|
| `EventRef` | Opaque handle for event unsubscription |
| `RequestUrlParam` | `{ url, method?, headers?, body?, throw? }` |
| `RequestUrlResponse` | `{ status, headers, text, json }` |
| `ViewStateResult` | `{ type: string; state?: any }` |

---

## Implementation Phases

### Phase 1: Foundation

**Files**: `dom/dom-extensions.ts`, `vault/TAbstractFile.ts`, `vault/TFile.ts`, `vault/TFolder.ts`, `core/Events.ts`, `core/Component.ts`

#### DOM Extensions (highest priority — 1,097 usages across 56 files)

Obsidian augments `HTMLElement.prototype` with convenience methods. The shim must do the same at initialization time.

**Methods to implement on HTMLElement.prototype**:

```typescript
interface DomElementInfo {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string>;
  title?: string;
  placeholder?: string;
  type?: string;
  value?: string;
  href?: string;
  prepend?: boolean;
  parent?: HTMLElement;
}

// Add to HTMLElement.prototype:
createDiv(options?: DomElementInfo | string): HTMLDivElement;
createSpan(options?: DomElementInfo | string): HTMLSpanElement;
createEl(tag: string, options?: DomElementInfo | string): HTMLElement;
empty(): void;                    // Remove all children (73 usages)
addClass(cls: string): void;     // classList.add wrapper
removeClass(cls: string): void;  // classList.remove wrapper
setText(text: string): void;     // Set textContent
```

Implementation notes:
- `createDiv/createSpan/createEl`: Create element, apply cls/text/attr from options, `appendChild` to parent (or `prepend` if `options.prepend`), return the new element
- `empty()`: `while (this.firstChild) this.removeChild(this.firstChild)`
- `addClass/removeClass`: Delegate to `classList.add/remove`
- `setText`: Set `textContent`
- Also augment `HTMLInputElement.prototype` with `trigger(eventType: string)` -> `this.dispatchEvent(new Event(eventType))` (used in `src/ui/FileSuggest.ts:69`)

#### TFile / TFolder / TAbstractFile

Data classes. Must be real classes (not interfaces) because `instanceof` checks are used in `VaultOperations.ts:123`, `CustomizationLoader.ts`, `FileSuggest.ts:91`.

```typescript
class TAbstractFile {
  path: string;
  name: string;
  parent: TFolder | null;
  vault: Vault;
}

class TFile extends TAbstractFile {
  basename: string;    // filename without extension
  extension: string;   // file extension without dot
  stat: { mtime: number; ctime: number; size: number };
}

class TFolder extends TAbstractFile {
  children: TAbstractFile[];
  isRoot(): boolean;
}
```

Reference implementation: `src/__mocks__/platform.ts:7-45`

#### Events System

Standard EventEmitter used by Vault and Workspace.

```typescript
interface EventRef { /* opaque handle */ }

class Events {
  on(name: string, callback: (...args: any[]) => void): EventRef;
  off(name: string, callback: (...args: any[]) => void): void;
  offref(ref: EventRef): void;
  trigger(name: string, ...args: any[]): void;
}
```

Used via: `app.vault.on('create'|'modify'|'delete'|'rename', ...)` (16 occurrences), `app.workspace.on('file-open', ...)`

#### Component

Lifecycle base class. Tracks registered events/intervals for cleanup.

```typescript
class Component {
  registerEvent(eventRef: EventRef): void;
  registerDomEvent(el: HTMLElement | Window, event: string, callback: EventListener): void;
  registerInterval(id: number): number;
  load(): void;
  unload(): void;  // Cleans up all registered events/intervals
  onload(): void;
  onunload(): void;
}
```

---

### Phase 2: Vault (File System Access API)

**Files**: `vault/Vault.ts`, `vault/VaultAdapter.ts`

The hardest piece. 31 files use `app.vault` methods.

#### Initialization Flow

1. User picks a folder via `window.showDirectoryPicker()` -> `FileSystemDirectoryHandle`
2. Recursively scan the directory to build an in-memory tree of `TFile`/`TFolder` objects
3. Store a `Map<string, FileSystemFileHandle>` for path-based handle lookups
4. Persist the directory handle in IndexedDB via `idb-keyval` for page reload survival

#### Method Implementations

| Vault Method | File System Access API Implementation |
|---|---|
| `read(file: TFile): Promise<string>` | Get handle from map -> `handle.getFile()` -> `file.text()` |
| `cachedRead(file: TFile): Promise<string>` | Alias to `read()` initially; add LRU cache later |
| `modify(file: TFile, content: string): Promise<void>` | Get handle -> `handle.createWritable()` -> `writable.write(content)` -> `writable.close()` |
| `create(path: string, content: string): Promise<TFile>` | Navigate to parent dir handle -> `getFileHandle(name, {create:true})` -> write content -> update index -> emit 'create' event |
| `append(file: TFile, content: string): Promise<void>` | `read()` + `modify()` with concatenated content |
| `trash(file: TFile, system?: boolean): Promise<void>` | Navigate to parent dir handle -> `removeEntry(name)` -> update index -> emit 'delete' event |
| `createFolder(path: string): Promise<TFolder>` | Chain `getDirectoryHandle(segment, {create:true})` recursively -> update index |
| `getAbstractFileByPath(path: string): TAbstractFile \| null` | Lookup in in-memory `Map<string, TAbstractFile>` |
| `getFileByPath(path: string): TFile \| null` | Same, with `instanceof TFile` check |
| `getMarkdownFiles(): TFile[]` | Filter in-memory index for `.md` extension |
| `getFiles(): TFile[]` | Return all TFile entries from index |
| `getRoot(): TFolder` | Return the root TFolder node |
| `on(event, callback): EventRef` | Inherited from Events base class |
| `offref(ref: EventRef): void` | Inherited from Events base class |

#### VaultAdapter (vault.adapter)

```typescript
class VaultAdapter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getBasePath(): string;  // Return directory handle name (no real absolute path in browser)
}
```

Delegates to the same `FileSystemDirectoryHandle`-based operations.

#### FileSystemAdapter

Used in 3 files for `instanceof FileSystemAdapter` checks. Make `VaultAdapter` extend or be aliased as `FileSystemAdapter`.

#### File Watching

No native file watching in the File System Access API. Implement polling:
- Only poll when tab is visible (Page Visibility API)
- 5-10 second interval
- Compare file `lastModified` timestamps against cached values
- Emit appropriate vault events on detected changes

---

### Phase 3: Plugin + App + Workspace

**Files**: `core/Plugin.ts`, `core/App.ts`, `workspace/Workspace.ts`, `workspace/WorkspaceLeaf.ts`

#### App

Wiring object. Constructor takes pre-built subsystems:

```typescript
class App {
  vault: Vault;
  workspace: Workspace;
  metadataCache: MetadataCache;
  fileManager: FileManager;
}
```

#### Plugin

Extends Component. The plugin entry point (`src/main.ts`) calls all these methods in `onload()`:

```typescript
class Plugin extends Component {
  app: App;
  manifest: PluginManifest;

  addCommand(command: Command): Command;
  addRibbonIcon(icon: string, title: string, callback: () => void): HTMLElement;
  addStatusBarItem(): HTMLElement;
  addSettingTab(settingTab: PluginSettingTab): void;
  registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => ItemView): void;
  loadData(): Promise<any>;
  saveData(data: any): Promise<void>;
}
```

**Data persistence**: `loadData()`/`saveData()` — two options:
1. **localStorage** (simpler): `localStorage.getItem/setItem('vault-copilot-settings')`
2. **Vault-based** (full fidelity): Read/write `.obsidian/plugins/obsidian-vault-copilot/data.json` via the vault adapter

Recommendation: Start with localStorage, move to vault-based later.

**Command registration**: `addCommand()` stores commands in an array. The web shell can render a command palette (Ctrl+P) from this array.

**View registration**: `registerView(type, factory)` stores factories in a `Map<string, ViewCreator>`. Workspace uses this map when `setViewState({type})` is called.

#### Workspace

Manages "leaves" (view containers) across three layout zones:

```typescript
class Workspace extends Events {
  getActiveFile(): TFile | null;
  getLeavesOfType(viewType: string): WorkspaceLeaf[];
  getLeaf(newTab?: boolean | 'window'): WorkspaceLeaf;
  getRightLeaf(shouldSplit: boolean): WorkspaceLeaf | null;
  getLeftLeaf(shouldSplit: boolean): WorkspaceLeaf | null;
  revealLeaf(leaf: WorkspaceLeaf): void;
  openLinkText(linktext: string, sourcePath: string): Promise<void>;
  getActiveViewOfType<T extends ItemView>(type: Constructor<T>): T | null;
}
```

The web shell provides a three-zone layout (left sidebar, center, right sidebar). Each zone hosts leaves. `getLeavesOfType` scans all zones. `getRightLeaf` creates or reuses a leaf in the right sidebar.

#### WorkspaceLeaf

```typescript
class WorkspaceLeaf {
  view: ItemView;
  setViewState(state: { type: string; active?: boolean; state?: any }): Promise<void>;
  openFile(file: TFile): Promise<void>;
  detach(): void;
}
```

`setViewState` looks up the registered view factory by type string and creates the view instance.

---

### Phase 4: UI Components

#### ItemView

Abstract base class for all plugin views. 5 view types are registered:
- `"copilot-chat-view"` — main chat
- `"extension-browser-view"` — extension marketplace
- `"extension-web-view"` — extension web content
- `"vc-tracing-view"` — debug tracing
- `"vc-voice-history-view"` — voice history

```typescript
abstract class ItemView extends Component {
  app: App;
  leaf: WorkspaceLeaf;
  containerEl: HTMLElement;   // Root DOM element for this view
  contentEl: HTMLElement;     // containerEl.children[1] (Obsidian convention)

  abstract getViewType(): string;
  abstract getDisplayText(): string;
  getIcon(): string;
  onOpen(): Promise<void>;
  onClose(): Promise<void>;
}
```

The web shell creates `containerEl` as a `<div>` and appends it to the appropriate layout zone. `contentEl` is `containerEl.children[1]` — Obsidian creates two children (a header and content area); the shim should do the same.

#### Modal

Used by 14+ modal subclasses. Creates an overlay with dismiss-on-ESC:

```typescript
class Modal {
  app: App;
  containerEl: HTMLElement;   // Overlay backdrop
  modalEl: HTMLElement;       // The modal box
  contentEl: HTMLElement;     // Content area inside modal
  titleEl: HTMLElement;       // Title bar

  constructor(app: App);
  open(): void;    // Append overlay to document.body
  close(): void;   // Remove overlay from DOM
  onOpen(): void;  // Called after open() — subclasses populate contentEl here
  onClose(): void; // Called before close()
}
```

DOM structure:
```html
<div class="modal-container">          <!-- containerEl / overlay -->
  <div class="modal-bg"></div>         <!-- click to dismiss -->
  <div class="modal">                  <!-- modalEl -->
    <div class="modal-title"></div>    <!-- titleEl -->
    <div class="modal-content"></div>  <!-- contentEl -->
    <div class="modal-close-button">  <!-- X button -->
  </div>
</div>
```

#### Setting

The most complex UI component. Used 302+ times across 18 files. Chainable builder pattern:

```typescript
class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement);   // Creates and appends setting-item div
  setName(name: string | DocumentFragment): this;
  setDesc(desc: string | DocumentFragment): this;
  setClass(cls: string): this;
  addText(cb: (text: TextComponent) => void): this;
  addToggle(cb: (toggle: ToggleComponent) => void): this;
  addDropdown(cb: (dropdown: DropdownComponent) => void): this;
  addButton(cb: (button: ButtonComponent) => void): this;
  addExtraButton(cb: (button: ExtraButtonComponent) => void): this;
  addTextArea(cb: (textArea: TextAreaComponent) => void): this;
}
```

DOM structure per Setting:
```html
<div class="setting-item">
  <div class="setting-item-info">
    <div class="setting-item-name">Name</div>
    <div class="setting-item-description">Description</div>
  </div>
  <div class="setting-item-control">
    <!-- Form components added here -->
  </div>
</div>
```

#### Form Components

Each is a thin wrapper around an HTML form element:

```typescript
class TextComponent {
  inputEl: HTMLInputElement;
  setValue(value: string): this;
  setPlaceholder(placeholder: string): this;
  onChange(callback: (value: string) => void): this;
  setDisabled(disabled: boolean): this;
}

class ToggleComponent {
  toggleEl: HTMLElement;      // <div class="checkbox-container">
  setValue(on: boolean): this;
  onChange(callback: (value: boolean) => void): this;
  setDisabled(disabled: boolean): this;
}

class DropdownComponent {
  selectEl: HTMLSelectElement;
  addOption(value: string, display: string): this;
  addOptions(options: Record<string, string>): this;
  setValue(value: string): this;
  onChange(callback: (value: string) => void): this;
}

class ButtonComponent {
  buttonEl: HTMLButtonElement;
  setButtonText(name: string): this;
  setCta(): this;
  setIcon(icon: string): this;
  setTooltip(tooltip: string): this;
  onClick(callback: () => void): this;
  setDisabled(disabled: boolean): this;
  setWarning(): this;
}

class ExtraButtonComponent {
  extraSettingsEl: HTMLElement;
  setIcon(icon: string): this;
  setTooltip(tooltip: string): this;
  onClick(callback: () => void): this;
  setDisabled(disabled: boolean): this;
}
```

#### Menu

Context menu. 12 usages across SessionPanel, ToolbarManager, ExtensionBrowserView:

```typescript
class Menu {
  addItem(cb: (item: MenuItem) => MenuItem): this;
  addSeparator(): this;
  showAtMouseEvent(event: MouseEvent): void;
  showAtPosition(position: { x: number; y: number }): void;
  hide(): void;
}

class MenuItem {
  setTitle(title: string): this;
  setIcon(icon: string): this;
  onClick(callback: () => void): this;
  setSection(section: string): this;
  setDisabled(disabled: boolean): this;
}
```

DOM: Create a `<div class="menu">` positioned absolutely at the specified coordinates. Each item is a `<div class="menu-item">` with icon + title. Dismiss on click-outside or ESC.

#### Notice

Toast notification. Only 1 direct usage (AutomationEngine):

```typescript
class Notice {
  constructor(message: string | DocumentFragment, timeout?: number);
  // Creates a toast, auto-removes after timeout (default 5000ms)
}
```

DOM: Append `<div class="notice">` to a fixed-position container at top-right. Fade out and remove after timeout.

#### FuzzySuggestModal

Used by `NoteSuggestModal` for file/note selection:

```typescript
abstract class FuzzySuggestModal<T> extends Modal {
  inputEl: HTMLInputElement;
  setPlaceholder(placeholder: string): void;
  abstract getItems(): T[];
  abstract getItemText(item: T): string;
  abstract onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;
}
```

Implementation: Modal with text input at top, scrollable list below. On input, filter items using `fuzzysort` library, render matches, handle keyboard navigation (up/down/enter) and click selection.

#### AbstractInputSuggest

Used by `FileSuggest` and `FolderSuggest`:

```typescript
abstract class AbstractInputSuggest<T> {
  constructor(app: App, inputEl: HTMLInputElement | HTMLTextAreaElement);
  abstract getSuggestions(query: string): T[] | Promise<T[]>;
  abstract renderSuggestion(item: T, el: HTMLElement): void;
  abstract selectSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;
  close(): void;
}
```

Implementation: Attach input listener to the element. On input, call `getSuggestions()`, render a dropdown positioned below the input, handle keyboard navigation.

#### PluginSettingTab

```typescript
abstract class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: App, plugin: Plugin);
  abstract display(): void;
  hide(): void;
}
```

In the web shell, the settings tab renders into a dedicated settings route/panel.

#### MarkdownRenderer

Used in 2 places (MessageRenderer, PreviewScreen):

```typescript
class MarkdownRenderer {
  static render(
    app: App,
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    component: Component
  ): Promise<void>;
}
```

Implementation: Use `marked` library to render markdown to HTML. Post-process `[[wiki-links]]` into `<a class="internal-link" data-href="note-path">` elements. Set result as `el.innerHTML`.

#### MarkdownView

Used in `ContextAugmentation.ts` for editor selection detection. The web app has no markdown editor, so `getActiveViewOfType(MarkdownView)` should return `null`. The code already handles this gracefully.

```typescript
class MarkdownView extends ItemView {
  editor: { getSelection(): string };
  getViewType(): string { return 'markdown'; }
  getDisplayText(): string { return ''; }
}
```

#### setIcon

73 usages. Obsidian uses Lucide icons:

```typescript
function setIcon(el: HTMLElement, iconId: string): void;
```

Implementation: Use the `lucide` npm package. Look up the icon by name, generate SVG markup, set as `el.innerHTML`.

---

### Phase 5: Utilities + Metadata

#### requestUrl

```typescript
interface RequestUrlParam {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
  throw?: boolean;
}

interface RequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: any;
  arrayBuffer: ArrayBuffer;
}

function requestUrl(params: RequestUrlParam): Promise<RequestUrlResponse>;
```

Implementation: Thin `fetch()` wrapper.

**CORS note**: Obsidian's `requestUrl` bypasses CORS (it runs in Electron's main process). In a browser, we cannot bypass CORS. However, the primary use cases work fine:
- OpenAI API — supports CORS
- Azure OpenAI API — supports CORS
- HTTP MCP servers — typically same-origin or CORS-enabled
- Other external APIs may need a CORS proxy

#### Platform

```typescript
const Platform = {
  isDesktop: false,
  isMobile: false,
  isDesktopApp: false,
  isMobileApp: false,
};
```

The existing `src/utils/platform.ts` derives `isMobile` and `isDesktop` from `Platform.isMobile` and `Platform.isDesktop` (lines 56-68). Setting both to `false` correctly disables:
- GitHub Copilot CLI provider (desktop-only, line 94)
- Stdio MCP transport (line 138)
- `supportsLocalProcesses()` returns false (line 162)

This means the web app automatically falls through to OpenAI/Azure providers and HTTP MCP only — which is the correct behavior.

#### parseYaml

```typescript
import yaml from 'js-yaml';
function parseYaml(str: string): any {
  return yaml.load(str);
}
```

Reference: `src/__mocks__/platform.ts:286-432` has a hand-rolled implementation; the production shim should use `js-yaml` instead.

#### normalizePath

```typescript
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '');
}
```

#### MetadataCache

Only `getFirstLinkpathDest(linkPath: string, sourcePath: string): TFile | null` is used (3 files). Implement as a path-based lookup:

```typescript
class MetadataCache {
  getFirstLinkpathDest(linkPath: string, sourcePath: string): TFile | null;
  // Resolve wiki-link to actual TFile in vault
  // Check: linkPath as-is, linkPath + '.md', relative to sourcePath's folder
}
```

#### FileManager

Only `renameFile(file: TAbstractFile, newPath: string): Promise<void>` is used (1 file). Delegates to vault operations.

---

### Phase 6: Web Shell + Theme

#### Layout

The web shell provides an Obsidian-like workspace layout:

```html
<div class="app-container">
  <div class="workspace">
    <div class="workspace-ribbon side-dock-ribbon"></div>       <!-- Left icon ribbon -->
    <div class="workspace-split mod-left-split"></div>          <!-- Left sidebar -->
    <div class="workspace-split mod-root"></div>                <!-- Center/main area -->
    <div class="workspace-split mod-right-split"></div>         <!-- Right sidebar -->
  </div>
  <div class="status-bar"></div>                                <!-- Bottom status bar -->
</div>
```

The Workspace shim manages which views are rendered in which zone.

#### Theme CSS

The plugin's 20 CSS files reference these CSS variables. The web shell's `theme.css` must define all of them:

```css
:root {
  /* Backgrounds */
  --background-primary: #ffffff;
  --background-primary-alt: #f5f6f8;
  --background-secondary: #f6f6f6;
  --background-secondary-alt: #ebebeb;
  --background-modifier-border: #ddd;
  --background-modifier-border-hover: #bbb;
  --background-modifier-hover: rgba(0, 0, 0, 0.05);
  --background-modifier-active-hover: rgba(0, 0, 0, 0.08);
  --background-modifier-error: rgba(255, 0, 0, 0.1);
  --background-modifier-form-field: #fff;

  /* Text */
  --text-normal: #2e3338;
  --text-muted: #888;
  --text-faint: #aaa;
  --text-error: #e93147;
  --text-success: #08b94e;
  --text-warning: #e0a500;
  --text-accent: #705dcf;
  --text-on-accent: #fff;

  /* Interactive */
  --interactive-normal: #f2f3f5;
  --interactive-hover: #e9e9e9;
  --interactive-accent: #7b6cd9;
  --interactive-accent-hover: #6c5dbe;
  --interactive-success: #08b94e;

  /* Links */
  --link-color: #705dcf;
  --link-color-hover: #5a4ab5;

  /* Code */
  --code-background: #f5f5f5;
  --code-normal: #2e3338;

  /* Colors (named) */
  --color-red: #e93147;
  --color-red-rgb: 233, 49, 71;
  --color-orange: #e0841e;
  --color-yellow: #e0a500;
  --color-yellow-rgb: 224, 165, 0;
  --color-green: #08b94e;
  --color-green-rgb: 8, 185, 78;
  --color-cyan: #00b4d8;
  --color-blue: #2e80f2;
  --color-purple: #7b6cd9;

  /* Typography */
  --font-text: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-monospace: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  --font-ui-small: 13px;
  --font-ui-medium: 15px;

  /* Sizing */
  --radius-s: 4px;
  --radius-m: 8px;
  --size-4-2: 8px;
  --size-4-4: 16px;
}
```

A dark theme variant:
```css
.theme-dark {
  --background-primary: #1e1e1e;
  --background-secondary: #262626;
  --background-secondary-alt: #333;
  --background-modifier-border: #444;
  --text-normal: #dcddde;
  --text-muted: #999;
  --interactive-normal: #2e2e2e;
  --interactive-hover: #3e3e3e;
  /* etc */
}
```

#### Bootstrap Flow

```typescript
// packages/web-shell/src/main.ts

import { initDomExtensions } from '@vault-copilot/obsidian-shim';
import { App, Vault, Workspace, Plugin } from '@vault-copilot/obsidian-shim';
import moment from 'moment';
import { get, set } from 'idb-keyval';

async function bootstrap() {
  // 1. Initialize DOM prototype extensions
  initDomExtensions();

  // 2. Provide moment globally (Obsidian does this)
  (window as any).moment = moment;

  // 3. Try to restore persisted directory handle, or prompt user
  let dirHandle: FileSystemDirectoryHandle = await get('vault-dir-handle');
  if (!dirHandle) {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await set('vault-dir-handle', dirHandle);
  }
  // Verify permission (may need re-prompt after page reload)
  if (await dirHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
    await dirHandle.requestPermission({ mode: 'readwrite' });
  }

  // 4. Create shim instances
  const vault = new Vault(dirHandle);
  await vault.initialize();  // Scan directory tree, build TFile/TFolder index

  const workspace = new Workspace(document.querySelector('.workspace'));
  const app = new App(vault, workspace);

  // 5. Load the plugin
  const manifest = { id: 'obsidian-vault-copilot', name: 'Vault Copilot', version: '0.0.26' };
  const plugin = new CopilotPlugin(app, manifest);
  await plugin.onload();

  // 6. Activate the default view (chat)
  const leaf = workspace.getRightLeaf(false);
  await leaf.setViewState({ type: 'copilot-chat-view', active: true });
  workspace.revealLeaf(leaf);
}

bootstrap();
```

#### Vite Config

```typescript
// packages/web-shell/vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      'obsidian': '@vault-copilot/obsidian-shim'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
```

This is the same alias pattern already used in `vitest.config.ts:17-19`.

---

## Plugin Source Changes Required

Only 3-4 files need minor changes. No architectural refactoring.

| Change | Files Affected | Details |
|---|---|---|
| Import path changes | **0** | Vite alias handles `"obsidian"` -> shim at build time |
| Dynamic imports for Node modules | 2-3 | `child_process` imports in `StdioMcpClient.ts`, `GitHubCopilotCliManager.ts`, `McpConfigDiscovery.ts` need `await import('child_process')` behind `supportsLocalProcesses()` guard instead of top-level `import` to avoid build errors in browser |
| Secrets API | 1 (`src/utils/secrets.ts`) | `app.loadSecret()`/`app.saveSecret()` are Obsidian internal APIs. Shim should implement using encrypted localStorage or a prompt-based flow |
| `window.moment` | 0 | Web shell attaches `moment` globally before plugin loads |

---

## Key Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| File System Access API is Chromium-only | High — won't work in Firefox/Safari | Document browser requirement (Chrome/Edge). Consider IndexedDB fallback for demo/evaluation mode |
| CORS restrictions for `requestUrl` | Medium — Obsidian bypasses CORS, browsers can't | OpenAI/Azure APIs support CORS natively. Other external APIs may need a CORS proxy |
| No file watching in File System Access API | Medium — external edits won't be detected | Poll for changes using Page Visibility API + 5-10s interval. Compare `lastModified` timestamps |
| Permission re-prompts on page reload | Medium — UX friction | Persist `FileSystemDirectoryHandle` in IndexedDB via `idb-keyval`. Chrome supports handle persistence |
| Node.js module imports fail at build time | Low — `child_process`, `path`, `os` | Dynamic `import()` behind `supportsLocalProcesses()` platform guards |
| Large vaults slow to scan | Medium — initial load time | Lazy-load file contents (scan tree structure only). Read file content on demand |
| GitHub Copilot CLI unavailable | Expected — browser can't spawn processes | Already handled: `supportsLocalProcesses()` returns false -> falls through to OpenAI/Azure providers |

---

## Dependencies

### obsidian-shim package

```json
{
  "name": "@vault-copilot/obsidian-shim",
  "version": "0.1.0",
  "main": "src/index.ts",
  "dependencies": {
    "lucide": "^0.x",
    "js-yaml": "^4.x",
    "marked": "^12.x",
    "fuzzysort": "^3.x"
  }
}
```

### web-shell package

```json
{
  "name": "@vault-copilot/web-shell",
  "version": "0.1.0",
  "dependencies": {
    "@vault-copilot/obsidian-shim": "workspace:*",
    "moment": "^2.x",
    "idb-keyval": "^6.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "typescript": "^5.x"
  }
}
```

---

## Verification Strategy

1. **Conformance test**: Every export from `src/__mocks__/platform.ts` must exist in the shim's `index.ts`. Write a test that imports both and verifies all keys are present.

2. **Unit tests**: Each shim module tested independently:
   - DOM extensions: Verify `createDiv`, `empty`, `addClass` produce correct DOM
   - Vault: Use an in-memory `Map<string, string>` backend (wrap File System Access API behind an adapter interface so tests can use a memory backend)
   - Setting: Verify correct DOM structure generation
   - Modal: Verify open/close lifecycle, DOM attachment

3. **Integration test**: Instantiate `CopilotPlugin` with the shim's `App`, call `onload()`, verify:
   - Commands are registered
   - Views are registered
   - Settings tab is registered
   - No uncaught errors

4. **Visual test**: Load the chat view in the web shell, verify it renders and can send messages via OpenAI provider.

5. **Existing test reuse**: Switch `vitest.config.ts` alias from `src/__mocks__/platform.ts` to the shim package. All existing tests should pass — this is the strongest compatibility signal.

---

## Critical Reference Files

When implementing, these files should be studied closely:

| File | Why |
|---|---|
| `src/__mocks__/platform.ts` | API shape blueprint — the shim must be a superset of this mock |
| `src/main.ts` | Plugin entry point exercising Plugin.onload(), registerView(), addCommand(), addRibbonIcon(), loadData()/saveData() |
| `src/copilot/tools/VaultOperations.ts` | Most intensive Vault API consumer — exercises read, cachedRead, modify, create, append, trash, getAbstractFileByPath, getMarkdownFiles, getFiles |
| `src/ui/ChatView/CopilotChatView.ts` | Largest UI component — exercises ItemView, setIcon, Menu, workspace, DOM helpers (createDiv/createEl) |
| `src/ui/settings/CopilotSettingTab.ts` | Settings UI — exercises PluginSettingTab and Setting component chain |
| `src/utils/platform.ts` | Platform detection that gates desktop-only features (lines 56-68, 94, 138, 162) |
| `src/utils/secrets.ts` | Secrets API that needs shimming |
| `vitest.config.ts` | Proves the alias pattern works (line 17-19) |
| `esbuild.config.mjs` | Existing build — marks `"obsidian"` as external; must continue to work |

