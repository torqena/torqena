# Torqena

## Project overview

- Target: Desktop application (Electron 40 + Vite 5 + TypeScript).
- Architecture: Three-layer Electron app — main process, preload bridge, Vite-bundled renderer.
- Structure: npm workspaces monorepo — `apps/desktop/` (Electron + renderer), `apps/api/` (Azure Functions), `packages/` (shared config & types).
- Release artifacts: Platform installers (Windows NSIS, macOS DMG, Linux AppImage) packaged by electron-builder.

```
┌───────────────────────────────────────────┐
│ Electron Main Process (apps/desktop/electron/) │
│  ├── WindowManager (main + child windows) │
│  ├── ProcessManager (MCP stdio servers)   │
│  ├── FS IPC handlers (read/write/list)    │
│  ├── Secrets (safeStorage encrypted)      │
│  └── Shell exec/spawn                     │
├───────────────────────────────────────────┤
│ Preload (contextBridge → electronAPI)     │
├───────────────────────────────────────────┤
│ Renderer (Vite + native web APIs)         │
│  ├── WebShellApp (lifecycle controller)   │
│  ├── LayoutManager (3-column workspace)   │
│  ├── PaneManager (tabbed editor panes)    │
│  ├── EditorManager (CodeMirror 6)         │
│  └── Feature code (apps/desktop/src/)          │
│     ├── AI providers & MCP               │
│     ├── Chat UI, settings, extensions    │
│     └── Automation, tools, voice         │
└───────────────────────────────────────────┘
```

## Environment & tooling

- **Runtime**: Electron 40 (Chromium renderer + Node.js main process).
- **Bundler**: Vite 5 — builds the renderer app. Config at `apps/desktop/vite.config.ts` (includes Vitest config).
- **Package manager**: npm workspaces monorepo.
- **Editor**: CodeMirror 6 (full markdown editing with live preview, syntax highlighting, frontmatter support).
- **Packaging**: electron-builder — config in `apps/desktop/electron-builder.yml`, produces platform-specific installers to `release/`.
- **Types**: TypeScript 5.8+ with strict mode. Shared base config at `packages/config/tsconfig.base.json`.
- **Testing**: Vitest 4 — config merged into `apps/desktop/vite.config.ts`. Tests in `apps/desktop/src/tests/`.

### Install

> Use PowerShell (`pwsh`) for all terminal commands.

```bash
npm install
```

### Development (Electron + Vite hot reload)

```bash
npm run dev:electron
```

This runs Vite dev server and Electron concurrently. The renderer hot-reloads on file changes. In dev mode, `F5` reloads the window and `Ctrl+Shift+I` opens DevTools.

### Production build

```bash
npm run build:electron
```

Builds the renderer via Vite, then packages the Electron app via electron-builder. Output goes to `release/`.

### Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run dev:shell` | `vite` | Vite dev server only (renderer at localhost:5173) |
| `npm run dev:electron` | `concurrently "vite" "wait-on ... && electron ."` | Full Electron dev mode with hot reload |
| `npm run build:shell` | `vite build` | Build renderer to `dist/` |
| `npm run build:electron` | `vite build && electron-builder` | Build + package desktop app |
| `npm run lint` | `eslint .` | Lint all source files |
| `npm test` | `vitest run` | Run tests once |
| `npm run test:watch` | `vitest` | Run tests in watch mode |
| `npm run test:coverage` | `vitest run --coverage` | Run tests with coverage report |
| `npm run electron` | `electron electron/main.cjs` | Launch Electron only (Vite must be running) |

## Linting

- ESLint shared config at `packages/config/eslint.config.mts`, root config at `eslint.config.mts`.
- To lint all source files: `npm run lint`
- To lint a specific folder: `npx eslint ./apps/desktop/src/`

## Key conventions

- **Split large files**: Keep files under ~200-300 lines.
- **Single responsibility**: Each file/module has one well-defined purpose.
- **Do not commit**: `node_modules/`, `dist/`, `release/`.
- **CSS**: Component files in `apps/desktop/src/styles/`, imported into `styles.css`.

## File & folder conventions

### Folder structure

```
torqena/
├── apps/
│   ├── desktop/                        # Electron desktop application
│   │   ├── electron/                   # Main process (Node.js)
│   │   │   ├── main.cjs               # App entry, IPC wiring
│   │   │   ├── preload.cjs            # contextBridge → window.electronAPI
│   │   │   ├── WindowManager.cjs      # BrowserWindow lifecycle
│   │   │   └── ProcessManager.cjs     # Child process management
│   │   │
│   │   ├── src/                        # Renderer (Vite-bundled, runs in Chromium)
│   │   │   ├── index.html             # HTML entry
│   │   │   ├── shell-main.ts          # Renderer bootstrap (Vite entry)
│   │   │   │
│   │   │   ├── app/                   # App lifecycle controller
│   │   │   │   └── WebShellApp.ts
│   │   │   │
│   │   │   ├── ai/                    # AI provider system
│   │   │   │   ├── providers/         # AIProvider base, Copilot, OpenAI, Azure
│   │   │   │   ├── mcp/              # MCP manager, stdio + HTTP clients
│   │   │   │   ├── tools/            # Tool definitions, vault operations
│   │   │   │   ├── customization/    # Skills, agents, prompts
│   │   │   │   ├── voice-chat/       # Voice input support
│   │   │   │   ├── realtime-agent/   # Real-time agent
│   │   │   │   ├── bases/            # Document database views
│   │   │   │   └── TracingService.ts  # SDK diagnostics
│   │   │   │
│   │   │   ├── chat/                  # Chat feature
│   │   │   │   ├── components/        # ChatView, message renderers, input area
│   │   │   │   ├── managers/          # Session, input, voice managers
│   │   │   │   ├── modals/           # Tracing, history, tool picker
│   │   │   │   └── processing/       # Message processing pipeline
│   │   │   │
│   │   │   ├── editor/               # CodeMirror 6 integration
│   │   │   ├── layout/               # Shell layout, sidebar, resize handles
│   │   │   ├── automation/           # Scheduled/triggered workflows
│   │   │   ├── extensions/           # Extension manager, catalog, marketplace
│   │   │   ├── shell-settings/       # Shell-specific settings tabs
│   │   │   ├── ui/                   # UI components (settings, extensions, mcp-apps)
│   │   │   │
│   │   │   ├── platform/            # Native API implementations (obsidian shim)
│   │   │   │   ├── core/             # App, Plugin, Component
│   │   │   │   ├── dom/              # DOM extensions
│   │   │   │   ├── ui/               # Modal, Notice, Menu, Setting
│   │   │   │   ├── vault/            # Vault, TFile, TFolder
│   │   │   │   ├── workspace/        # Workspace, View, Leaf
│   │   │   │   └── utils/            # Platform, icons, YAML
│   │   │   │
│   │   │   ├── stubs/               # IPC-backed Node.js API stubs
│   │   │   ├── utils/               # Pure utility functions
│   │   │   ├── types/               # TypeScript interfaces
│   │   │   ├── styles/              # Modular CSS files
│   │   │   ├── __mocks__/           # Test mocks
│   │   │   └── tests/               # Test suites
│   │   │       ├── automation/
│   │   │       ├── copilot/
│   │   │       ├── extensions/
│   │   │       ├── realtime-agent/
│   │   │       ├── ui/
│   │   │       ├── utils/
│   │   │       ├── smoke/
│   │   │       └── setup.ts
│   │   │
│   │   ├── vite.config.ts            # Vite + Vitest config
│   │   ├── electron-builder.yml      # Electron packaging config
│   │   ├── tsconfig.json             # Extends packages/config/tsconfig.base.json
│   │   └── package.json              # @torqena/desktop
│   │
│   └── api/                           # Azure Functions backend
│       ├── src/                       # Function source code
│       ├── scripts/                   # Admin & deployment scripts
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── config/                        # Shared build configuration
│   │   ├── tsconfig.base.json        # Base TypeScript config
│   │   ├── eslint.config.mts         # Shared ESLint rules
│   │   └── package.json              # @torqena/config
│   │
│   └── shared/                        # Shared types & utilities (placeholder)
│       ├── src/
│       │   └── index.ts
│       ├── tsconfig.json
│       └── package.json              # @torqena/shared
│
├── package.json                       # Root (workspaces, delegating scripts)
├── tsconfig.json                      # Extends packages/config/tsconfig.base.json
├── eslint.config.mts                  # Root ESLint config
└── AGENTS.md
```

**Key principles**:
- **Feature-first** — `ai/`, `chat/`, `editor/`, `automation/`, `extensions/` are self-contained domains.
- **Monorepo** — npm workspaces with `apps/*` and `packages/*`. Root delegates scripts to workspace packages.
- **Native shim** — `apps/desktop/src/platform/` provides implementations for `"obsidian"` imports.
- **Tests co-located** — `apps/desktop/src/tests/` lives alongside source code.

### CSS architecture

Styles are split into modular component files under `apps/desktop/src/styles/` and bundled by Vite. The entry point is `apps/desktop/src/styles/styles.css`. Base theme and CSS custom properties are in `apps/desktop/src/theme.css`.

**Component styles** (`apps/desktop/src/styles/`):

| File | Purpose |
|------|---------|
| `automations.css` | Automation engine UI |
| `chat.css` | Chat container and header layout |
| `welcome.css` | Welcome message and capabilities card |
| `messages.css` | Message styles, errors, thinking indicator |
| `references.css` | Collapsible used-references panel |
| `input.css` | Input area, context picker, attachment chips |
| `toolbar.css` | Input toolbar, model/agent selectors, send button |
| `statusbar.css` | Status bar, scrollbar, settings help |
| `settings.css` | Settings tab sections, buttons, CLI status |
| `session-panel.css` | Session panel, layout wrapper, rename modal |
| `tool-picker.css` | Tool picker modal |
| `skills-mcp.css` | Skills and MCP server tables |
| `directory-list.css` | Directory list UI |
| `prompt-picker.css` | Prompt picker dropdown |
| `mcp-apps.css` | MCP apps inline rendering |
| `voice.css` | Voice recording button states |
| `realtime.css` | Realtime agent button states, transcript |
| `tracing.css` | Tracing modal and SDK logs |
| `conversation-history.css` | Conversation history modal |
| `tool-approval.css` | Tool approval prompt |
| `prompt-input.css` | Prompt input modal |
| `whisper.css` | Whisper.cpp settings section |
| `extensions.css` | Extension marketplace, cards, submission wizard |

When adding new styles, create a component file in `apps/desktop/src/styles/` and import it from `apps/desktop/src/styles/styles.css`.

## Electron architecture

### Main process (`apps/desktop/electron/`)

The main process runs in Node.js and handles privileged operations via IPC:

- **`main.cjs`** — Orchestrator. Wires IPC handlers for filesystem, secrets, platform info, and shell operations. Delegates window and process management to dedicated modules.
- **`WindowManager.cjs`** — Creates and manages BrowserWindows. Supports frameless titlebar (hidden frame with overlay on Windows), child pop-out windows with `?view=` query params, tab docking from child windows back to main.
- **`ProcessManager.cjs`** — Manages spawned child processes for MCP stdio servers. Tracks active processes by ID, routes stdout/stderr/close/error events to the renderer.

### Preload (`apps/desktop/electron/preload.cjs`)

Exposes safe APIs to the renderer via `contextBridge` as `window.electronAPI`. TypeScript declarations in `apps/desktop/src/electron-api.d.ts`.

### IPC surface (`window.electronAPI`)

| Category | Methods |
|----------|---------|
| **Shell** | `exec`, `spawn`, `stdin`, `kill`, `onStdout`, `onStderr`, `onClose`, `onError` |
| **Filesystem** | `readFile`, `writeFile`, `exists`, `listFilesRecursive`, `readdir`, `remove`, `mkdir` |
| **Secrets** | `saveSecret`, `loadSecret`, `deleteSecret`, `listSecrets`, `isSecretStorageAvailable` |
| **Window** | `openDirectory`, `setWindowFrame`, `getWindowFrame`, `setTitleBarOverlay`, `openWindow`, `dockTab`, `onDockTab` |
| **Platform** | `getPlatformInfo` |

### Renderer (`apps/desktop/src/`)

The renderer is a Vite-bundled web app that uses standard DOM APIs, CodeMirror 6 for editing, and `window.electronAPI` for privileged operations. Entry point is `apps/desktop/src/shell-main.ts`.

### Node.js API stubs (`apps/desktop/src/stubs/`)

IPC-backed stubs for Node.js built-ins used by feature code. These redirect Node API calls through the Electron IPC bridge so code that uses `fs`, `path`, `child_process`, etc. works in the renderer:

`child_process.ts`, `crypto.ts`, `fs.ts`, `fs_promises.ts`, `http.ts`, `https.ts`, `net.ts`, `os.ts`, `path.ts`, `util.ts`

Vite aliases these modules to the stubs at build time via `apps/desktop/vite.config.ts`.

## Native API approach

Torqena uses **raw web APIs** and Electron's IPC bridge — no abstraction frameworks.

### Target API surface

| Need | Solution |
|------|----------|
| **DOM manipulation** | Standard DOM APIs (`document.createElement`, `classList`, `addEventListener`, etc.) |
| **Markdown editing** | CodeMirror 6 (direct integration, no wrappers) |
| **File I/O** | `window.electronAPI.readFile/writeFile/exists/readdir/remove/mkdir` |
| **Process spawning** | `window.electronAPI.spawn/stdin/kill` with event listeners |
| **Secret storage** | `window.electronAPI.saveSecret/loadSecret/deleteSecret` (Electron `safeStorage` encrypted) |
| **HTTP requests** | `fetch` API (renderer has full network access) |
| **Data persistence** | `localStorage` for settings, filesystem for vault data |
| **YAML parsing** | `js-yaml` (direct import) |
| **Icons** | `lucide` icons (direct import) |
| **Window management** | `window.electronAPI.openWindow/dockTab` |

### Migration from legacy imports

The shared feature code in `apps/desktop/src/` currently imports from `"obsidian"`. These imports are being migrated to native APIs. During the transition, Vite aliases `"obsidian"` → the shim package. The target state is zero `import ... from "obsidian"` statements — all code uses native DOM, `window.electronAPI`, or direct library imports.

## AI providers

Torqena supports multiple AI providers:

### GitHub Copilot (Primary)
- **Provider Type**: `copilot`
- **Requirements**: GitHub Copilot subscription and CLI installed
- **Implementation**: `apps/desktop/src/ai/providers/GitHubCopilotCliService.ts`
- **Features**: 
  - Full GitHub Copilot CLI SDK integration
  - Agent Skills support
  - MCP via StdioMcpClient
  - Multiple models (GPT-4.1, GPT-5-mini, Claude, Gemini, etc.)
  - Context-aware vault operations

### OpenAI
- **Provider Type**: `openai`
- **Requirements**: OpenAI API key
- **Implementation**: `apps/desktop/src/ai/providers/OpenAIService.ts`
- **Features**:
  - Direct OpenAI API access with streaming
  - Tool/function calling support
  - MCP tool integration via McpManager
- **Models**: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo, o1, o1-mini, o1-preview, o3-mini

### Azure OpenAI
- **Provider Type**: `azure-openai`
- **Requirements**: Azure OpenAI resource and API key
- **Implementation**: `apps/desktop/src/ai/providers/AzureOpenAIService.ts`
- **Features**:
  - Azure OpenAI API access with streaming
  - Tool/function calling support
  - MCP tool integration via McpManager
  - Deployment-based model selection

### Provider architecture
- **Base Abstraction**: `AIProvider` abstract class (`apps/desktop/src/ai/providers/AIProvider.ts`)
  - Common interface: `initialize()`, `sendMessage()`, `sendMessageStreaming()`, `abort()`, `isReady()`, `destroy()`
  - Tools management: `setTools()`, `convertMcpToolsToToolDefinitions()`
  - History management: `getMessageHistory()`, `clearHistory()`
- **Factory**: `AIProviderFactory` (`apps/desktop/src/ai/providers/AIProviderFactory.ts`) — creates providers based on user configuration
- **Configuration**: Settings UI allows selecting provider and entering API keys/endpoints

### Model Context Protocol (MCP)

- **Stdio MCP**: Via `StdioMcpClient` (`apps/desktop/src/ai/mcp/StdioMcpClient.ts`)
  - Spawns local MCP server processes via `window.electronAPI.spawn`
  - Configured in `.github/copilot-mcp-servers.json`
  - Process lifecycle managed by Electron's `ProcessManager`
- **HTTP MCP**: Via `HttpMcpClient` (`apps/desktop/src/ai/mcp/HttpMcpClient.ts`)
  - Connects to remote MCP servers over HTTP/HTTPS
  - Uses JSON-RPC 2.0 protocol
- **MCP Manager**: `McpManager` (`apps/desktop/src/ai/mcp/McpManager.ts`) coordinates both transport types and exposes tools to all AI providers

## Utilities

### Secret storage
- API keys stored securely via Electron's `safeStorage` encryption
- Accessed through `window.electronAPI.saveSecret/loadSecret/deleteSecret/listSecrets`

### HTTP requests
- Use the `fetch` API directly in the renderer
- Full network access available (no CORS proxy needed for most APIs)

### Diagnostics & tracing

- **TracingService** (`apps/desktop/src/ai/TracingService.ts`) — captures SDK logs, prompts, responses, and events
- **Pop-out windows** — diagnostics and voice history can open in separate windows via `window.electronAPI.openWindow`

## Testing

- **Framework**: Vitest 4 with V8 coverage
- **Test location**: `apps/desktop/src/tests/`
- **Commands**:
  ```bash
  npm test              # Run all tests
  npm run test:watch    # Watch mode
  npm run test:coverage # With coverage report
  ```

## Security, privacy, and compliance

- Default to local/offline operation. Only make network requests when essential to the feature.
- No hidden telemetry. If you collect optional analytics or call third-party services, require explicit opt-in and document clearly in `README.md` and in settings.
- Never execute remote code, fetch and eval scripts, or auto-update app code outside of normal releases.
- Minimize scope: read/write only what's necessary inside the user's vault directory.
- Clearly disclose any external services used, data sent, and risks.
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented.
- Secrets are encrypted at rest using Electron's `safeStorage` API.
- The preload script uses `contextBridge` to expose only specific, safe APIs to the renderer — never expose the full `ipcRenderer`.

## UX & copy guidelines (for UI text, commands, settings)

- Prefer sentence case for headings, buttons, and titles.
- Use clear, action-oriented imperatives in step-by-step copy.
- Use **bold** to indicate literal UI labels. Prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Appearance**.
- Keep in-app strings short, consistent, and free of jargon.

## Performance

- Keep startup light. Defer heavy work until the app is interactive.
- Lazy-load CodeMirror extensions and heavy libraries (mermaid, katex) on first use.
- Batch filesystem access and avoid excessive directory scans.
- Debounce/throttle expensive operations in response to file system events.
- Minimize IPC round-trips by batching operations where possible.

## Coding conventions

- TypeScript with `"strict": true`.
- **ES2022** target, **ESNext** modules, **bundler** module resolution.
- **Split large files**: If any file exceeds ~200-300 lines, break it into smaller, focused modules.
- **Use clear module boundaries**: Each file should have a single, well-defined responsibility.
- Prefer `async/await` over promise chains; handle errors gracefully.
- Use standard DOM APIs directly — no abstraction layers for element creation.
- Access Node.js capabilities exclusively through `window.electronAPI` in the renderer.
- CJS format required for Electron main process files (`.cjs` extension).

## Documentation standards

**All source code files should have a standardized header comment:**
```
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
```

**All code must include comprehensive JSDoc documentation.** When touching any file, examine it and add/update documentation as needed.

### Required JSDoc tags

| Tag | When to use | Example |
|-----|-------------|---------|
| `@module` | Top of every file | `@module TaskOperations` |
| `@description` | File-level and complex functions | Overview of purpose |
| `@param` | Every function parameter | `@param path - The note file path` |
| `@returns` | Every function with return value | `@returns Parsed task or null` |
| `@example` | All public functions | Runnable code snippet |
| `@throws` | Functions that throw errors | `@throws {Error} If file not found` |
| `@see` | Cross-references | `@see {@link parseTaskLine}` |
| `@since` | New APIs | `@since 0.1.0` |
| `@deprecated` | Deprecated APIs | `@deprecated Use newMethod instead` |
| `@internal` | Private helpers | Mark non-exported functions |

### File-level documentation template

```typescript
/**
 * @module ModuleName
 * @description Brief description of what this module provides.
 * 
 * Detailed explanation of:
 * - Key features
 * - Architecture decisions
 * - Usage patterns
 * 
 * @example
 * ```typescript
 * import { mainFunction } from './ModuleName';
 * const result = mainFunction(args);
 * ```
 * 
 * @see {@link RelatedModule} for related functionality
 * @since 0.1.0
 */
```

### Function documentation template

```typescript
/**
 * Brief one-line description of what the function does.
 * 
 * Longer explanation if needed, including:
 * - Edge cases
 * - Side effects
 * - Performance considerations
 * 
 * @param paramName - Description of the parameter
 * @param optionalParam - Description (defaults to X)
 * @returns Description of return value
 * 
 * @example
 * ```typescript
 * const result = myFunction('input');
 * console.log(result); // expected output
 * ```
 * 
 * @throws {ErrorType} When this error occurs
 * @see {@link relatedFunction} for similar functionality
 */
```

### Documentation checklist (apply when touching any file)

- [ ] File has `@module` tag with description
- [ ] All exported functions have JSDoc with `@param`, `@returns`, `@example`
- [ ] All exported interfaces/types have doc comments
- [ ] Complex logic has inline comments explaining "why"
- [ ] Private helpers marked with `@internal`
- [ ] Cross-references added with `@see` where helpful
- [ ] Examples are runnable and accurate

## Versioning & releases

- Version is in `package.json` (SemVer `x.y.z`).
- Create a GitHub release whose tag matches the version. Do not use a leading `v`.
- electron-builder produces platform-specific installers in `release/`.
- Attach installers to the GitHub release.

## Agent do/don't

**Do**
- Use `window.electronAPI` for all privileged operations (filesystem, secrets, process spawning).
- Provide defaults and validation in settings.
- Clean up event listeners and intervals on teardown.
- Use the IPC surface defined in `electron-api.d.ts` — don't add IPC channels without updating the type declarations.

**Don't**
- Import Node.js modules directly in renderer code — use the IPC stubs or `window.electronAPI`.
- Introduce network calls without an obvious user-facing reason and documentation.
- Ship features that require cloud services without clear disclosure and explicit opt-in.
- Expose `ipcRenderer` or other Electron internals to the renderer process.
- Store secrets in plaintext — always use `window.electronAPI.saveSecret`.

## Common tasks

### Read/write files in the vault

```ts
// Read a file
const content = await window.electronAPI.readFile(filePath, "utf-8");

// Write a file
await window.electronAPI.writeFile(filePath, content);

// Check if file exists
const exists = await window.electronAPI.exists(filePath);

// List directory contents
const entries = await window.electronAPI.readdir(dirPath);
// entries: Array<{ name: string; kind: "file" | "directory" }>
```

### Spawn a child process (e.g., MCP server)

```ts
const { id, pid } = await window.electronAPI.spawn("node", ["server.js"], { cwd: "/path" });

// Listen for output
const removeStdout = window.electronAPI.onStdout(id, (data) => console.log(data));
const removeStderr = window.electronAPI.onStderr(id, (data) => console.error(data));
const removeClose = window.electronAPI.onClose(id, (code) => console.log("exited:", code));

// Send input
await window.electronAPI.stdin(id, "some input\n");

// Kill the process
await window.electronAPI.kill(id);

// Clean up listeners
removeStdout();
removeStderr();
removeClose();
```

### Store and retrieve secrets

```ts
// Save a secret (encrypted via safeStorage)
await window.electronAPI.saveSecret("openai-api-key", apiKey);

// Load a secret
const key = await window.electronAPI.loadSecret("openai-api-key");

// List all secrets (metadata only, no values)
const secrets = await window.electronAPI.listSecrets();
```

### Open a pop-out window

```ts
const { windowId } = await window.electronAPI.openWindow("tracing", {
  width: 800,
  height: 600,
  title: "Diagnostics",
});
```

### Persist settings

```ts
// Settings stored in localStorage
const settings = JSON.parse(localStorage.getItem("torqena-settings") || "{}");
settings.theme = "dark";
localStorage.setItem("torqena-settings", JSON.stringify(settings));
```

## Troubleshooting

- **App doesn't start**: Ensure `npm install` has run. Check that Vite dev server is running before launching Electron in split mode.
- **Blank window in dev**: Vite must be serving at `http://localhost:5173`. Run `npm run dev:electron` for the concurrent workflow.
- **IPC errors**: Verify the method exists in `apps/desktop/electron/preload.cjs` and is declared in `apps/desktop/src/electron-api.d.ts`. Check the main process console for errors.
- **Build fails**: Run `npm run build:shell` first to verify the renderer builds. Then `npm run build:electron` for the full package.
- **Secrets not persisting**: Electron `safeStorage` requires the OS keychain. On Linux, ensure `libsecret` is installed.

## References

- Electron documentation: https://www.electronjs.org/docs
- Vite documentation: https://vite.dev/
- CodeMirror 6: https://codemirror.net/
- electron-builder: https://www.electron.build/
- GitHub Copilot CLI SDK: https://github.com/github/copilot-sdk/blob/main/nodejs/README.md

