/**
 * @module WebShellEntry
 * @description Web Shell renderer entry point.
 *
 * Thin bootstrap that:
 * 1. Installs global shims (DOM extensions, moment, process)
 * 2. Delegates full initialization to {@link WebShellApp}
 * 3. Keeps file explorer, context menus, and ribbon rendering local
 *
 * @see {@link WebShellApp} for the application lifecycle controller
 * @since 0.0.27
 */

import { initDomExtensions } from "./platform/dom/dom-extensions.js";
import moment from "moment";
import { get, set } from "idb-keyval";

import { DockPaneManager } from "./layout/DockPaneManager.js";
import { LayoutManager } from "./layout/LayoutManager.js";
import { WebShellApp } from "./app/WebShellApp.js";
import { WorkspaceService } from "./ui/WorkspaceService.js";

// Import plugin styles via JS so Vite processes @import chains correctly
import "./styles/styles.css";

// ---- Step 1: DOM extensions ----
initDomExtensions();

// ---- Step 2: Global moment (Obsidian provides this) ----
(window as any).moment = moment;

// Note: Buffer, process, and setImmediate polyfills are installed by
// polyfills.ts which loads before this module via index.html script order.

// ---- Main bootstrap ----
const DIR_HANDLE_KEY = "vault-copilot-dir-handle";
let activePaneManager: DockPaneManager | null = null;
const pendingDockedFiles: string[] = [];

function flushPendingDockedFiles(): void {
	if (!activePaneManager || pendingDockedFiles.length === 0) return;
	const pending = pendingDockedFiles.splice(0, pendingDockedFiles.length);
	for (const filePath of pending) {
		void activePaneManager.openFile(filePath);
	}
}

/**
 * Try to restore a previously picked directory handle (browser mode).
 * Throws "NEEDS_PICKER" if no valid handle is available.
 */
async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
	// Try restoring a previously picked handle
	try {
		const stored: FileSystemDirectoryHandle | undefined =
			await get(DIR_HANDLE_KEY);
		if (stored) {
			try {
				const permission = await stored.queryPermission({ mode: "readwrite" });
				if (permission === "granted") return stored;
				const requested = await stored.requestPermission({ mode: "readwrite" });
				if (requested === "granted") return stored;
			} catch {
				// Handle may be stale or corrupted — clear it
				await set(DIR_HANDLE_KEY, undefined).catch(() => {});
			}
		}
	} catch {
		// IndexedDB may be unavailable — silently fall through to picker
	}

	// Fall through to user picker
	throw new Error("NEEDS_PICKER");
}

/**
 * Try to restore a previously picked directory path (Electron mode).
 * Returns the path string or null if none stored.
 */
function getStoredDirPath(): string | null {
	return WorkspaceService.getActiveWorkspace();
}

async function bootstrap(dirHandleOrPath: FileSystemDirectoryHandle | string, initialFilePath?: string): Promise<void> {
	const rootSplit = document.querySelector(".mod-root") as HTMLElement;
	try {
		const webShellApp = await WebShellApp.create(
			dirHandleOrPath,
			initialFilePath,
			undefined,
			initRibbon,
		);

		activePaneManager = webShellApp.centerDock;
		flushPendingDockedFiles();

		// Wire workspace navigator handlers
		const navView = webShellApp.workspaceNavView;
		if (navView) {
			navView.setSwitchWorkspaceHandler((path: string) => {
				WorkspaceService.setActiveWorkspace(path);
				window.location.reload();
			});
			navView.setOpenFolderHandler(async () => {
				try {
					const dirPath = await window.electronAPI!.openDirectory();
					if (!dirPath) return;
					WorkspaceService.setActiveWorkspace(dirPath);
					window.location.reload();
				} catch { /* user cancelled */ }
			});
			navView.setCreateWorkspaceHandler(() => {
				// Show the create workspace screen
				const welcomeScreen = document.getElementById("welcome-screen");
				const selectScreen = document.getElementById("select-workspace-screen");
				const createScreen = document.getElementById("create-workspace-screen");
				const picker = document.getElementById("vault-picker");
				if (picker) picker.style.display = "";
				if (welcomeScreen) welcomeScreen.style.display = "none";
				if (selectScreen) selectScreen.style.display = "none";
				if (createScreen) createScreen.style.display = "";
			});
		}

		console.log("[web-shell] Chat view activated");
	} catch (err: any) {
		console.error("[web-shell] Bootstrap failed:", err);
		if (rootSplit) {
			rootSplit.innerHTML = `<div style="padding: 2em; color: var(--text-error, #e93147);">
				<h3>Bootstrap Error</h3>
				<pre style="white-space: pre-wrap; font-size: 0.85em;">${err?.stack || err?.message || err}</pre>
			</div>`;
		}
	}
}

/**
 * Sync the Electron titlebar overlay colors with the current CSS theme.
 * Delegates to WebShellApp static method.
 */
function syncTitleBarOverlay() {
	WebShellApp._syncTitleBarOverlay();
}

/**
 * Bootstrap a standalone view in a child Electron window.
 * Delegates to WebShellApp.bootstrapStandaloneView().
 */
async function bootstrapStandaloneView(viewType: string): Promise<void> {
	return WebShellApp.bootstrapStandaloneView(viewType);
}

// ---- Wire up the folder picker button ----
console.log("[web-shell] shell-main.ts module loaded, readyState:", document.readyState);

async function initApp(): Promise<void> {
	console.log("[web-shell] initApp() starting");
	const initialOpenFilePath = new URLSearchParams(window.location.search).get("openFile") || undefined;
	if (window.electronAPI?.onDockTab) {
		window.electronAPI.onDockTab((filePath: string) => {
			if (activePaneManager) {
				void activePaneManager.openFile(filePath);
				return;
			}
			pendingDockedFiles.push(filePath);
		});
	}
	// Check for standalone view mode (child Electron window with ?view= param)
	const viewParam = new URLSearchParams(window.location.search).get("view");
	if (viewParam) {
		await bootstrapStandaloneView(viewParam);
		return;
	}

	// Electron mode: try restoring from localStorage, use native dialog for picking
	if (window.electronAPI) {
		// Apply frameless window class if using hidden frame style
		try {
			const frameStyle = await window.electronAPI.getWindowFrame();
			if (frameStyle !== "native") {
				document.body.classList.add("is-frameless");
				// Sync titlebar overlay with current theme
				syncTitleBarOverlay();
				// Watch for theme changes (class changes on <body>) and re-sync
				new MutationObserver(() => syncTitleBarOverlay()).observe(
					document.body,
					{ attributes: true, attributeFilter: ["class"] },
				);
				// Watch for modal overlays appearing/disappearing to dim titlebar
				new MutationObserver(() => syncTitleBarOverlay()).observe(
					document.body,
					{ childList: true, subtree: true },
				);
			}
		} catch { /* ignore */ }

		const storedPath = getStoredDirPath();
		console.log("[web-shell] Stored path:", storedPath);
		if (storedPath) {
			try {
				const exists = await window.electronAPI.exists(storedPath);
				if (exists) {
						await bootstrap(storedPath, initialOpenFilePath);
					return;
				}
			} catch {
				// Path no longer valid — show picker
			}
		}

		// Check for recent workspaces to decide which screen to show
		const wsService = new WorkspaceService();
		const recentWorkspaces = wsService.getRecentWorkspaces();
		console.log("[web-shell] Recent workspaces:", recentWorkspaces.length, recentWorkspaces);

		const welcomeScreen = document.getElementById("welcome-screen");
		const selectScreen = document.getElementById("select-workspace-screen");
		const createScreen = document.getElementById("create-workspace-screen");
		console.log("[web-shell] Screens found:", { welcome: !!welcomeScreen, select: !!selectScreen, create: !!createScreen });

		if (recentWorkspaces.length > 0 && selectScreen) {
			// --- Show "Select Workspace" screen ---
			if (welcomeScreen) welcomeScreen.style.display = "none";
			selectScreen.style.display = "";

			// Populate the recent workspaces list
			const recentList = document.getElementById("ws-recent-list");
			if (recentList) {
				recentList.innerHTML = "";
				for (const ws of recentWorkspaces) {
					const li = document.createElement("li");
					li.className = "ws-recent-item";
					li.innerHTML = `<span class="ws-recent-item-dot"></span><span class="ws-recent-item-name">${ws.name || ws.path.split(/[\\/]/).pop() || "Workspace"}</span>`;
					li.title = ws.path;
					li.addEventListener("click", async () => {
						try {
							const exists = await window.electronAPI!.exists(ws.path);
							if (!exists) {
								const errorEl = document.getElementById("select-error");
								if (errorEl) {
									errorEl.textContent = "This workspace folder no longer exists.";
									errorEl.style.display = "";
								}
								// Remove stale entry
								wsService.removeRecentWorkspace(ws.path);
								li.remove();
								return;
							}
							await bootstrap(ws.path, initialOpenFilePath);
						} catch (err: any) {
							const errorEl = document.getElementById("select-error");
							if (errorEl) {
								errorEl.textContent = err?.message || "Failed to open workspace.";
								errorEl.style.display = "";
							}
						}
					});
					recentList.appendChild(li);
				}
			}

			// "Create New Workspace" button
			const selectCreateBtn = document.getElementById("select-create-btn");
			console.log("[web-shell] select-create-btn found:", !!selectCreateBtn);
			selectCreateBtn?.addEventListener("click", () => {
				console.log("[web-shell] 'Create New Workspace' clicked (select screen)");
				selectScreen.style.display = "none";
				if (createScreen) createScreen.style.display = "";
			});

			// "Open Existing Folder" button
			const selectOpenBtn = document.getElementById("select-open-btn");
			console.log("[web-shell] select-open-btn found:", !!selectOpenBtn);
			selectOpenBtn?.addEventListener("click", async () => {
				console.log("[web-shell] 'Open Existing Folder' clicked (select screen)");
				try {
					const dirPath = await window.electronAPI!.openDirectory();
					if (!dirPath) return;
					await bootstrap(dirPath, initialOpenFilePath);
				} catch (err: any) {
					const errorEl = document.getElementById("select-error");
					if (errorEl) {
						errorEl.textContent = err?.message || "Failed to open folder.";
						errorEl.style.display = "";
					}
				}
			});
		}

		// --- Welcome screen buttons (visible when no recent workspaces) ---
		const pickBtn = document.getElementById("pick-folder-btn");
		const createBtn = document.getElementById("create-workspace-btn");
		const errorEl = document.getElementById("picker-error");
		console.log("[web-shell] Welcome buttons found:", { pickBtn: !!pickBtn, createBtn: !!createBtn });

		pickBtn?.addEventListener("click", async () => {
			console.log("[web-shell] 'Open Existing Folder' clicked (welcome screen)");
			try {
				const dirPath = await window.electronAPI!.openDirectory();
				if (!dirPath) return; // user cancelled
				await bootstrap(dirPath, initialOpenFilePath);
			} catch (err: any) {
				if (errorEl) {
					errorEl.textContent = err?.message || "Failed to open folder.";
					errorEl.style.display = "";
				}
			}
		});

		// Show the create form when clicking "Create New Workspace"
		createBtn?.addEventListener("click", () => {
			console.log("[web-shell] 'Create New Workspace' clicked (welcome screen)");
			if (welcomeScreen) welcomeScreen.style.display = "none";
			if (createScreen) createScreen.style.display = "";
		});

		// --- Create Team Workspace form wiring ---
		const wsTeamNameInput = document.getElementById("ws-team-name") as HTMLInputElement | null;
		const wsLocationInput = document.getElementById("ws-location") as HTMLInputElement | null;
		const wsChooseFolderBtn = document.getElementById("ws-choose-folder");
		const wsCancelBtn = document.getElementById("ws-create-cancel");
		const wsSubmitBtn = document.getElementById("ws-create-submit");
		const wsCreateError = document.getElementById("ws-create-error");
		let chosenDirPath: string | null = null;

		// Cancel → back to the appropriate screen
		wsCancelBtn?.addEventListener("click", () => {
			if (createScreen) createScreen.style.display = "none";
			if (recentWorkspaces.length > 0 && selectScreen) {
				selectScreen.style.display = "";
			} else if (welcomeScreen) {
				welcomeScreen.style.display = "";
			}
			if (wsCreateError) wsCreateError.style.display = "none";
		});

		// Choose Folder button
		const openFolderChooser = async () => {
			try {
				const dirPath = await window.electronAPI!.openDirectory();
				if (!dirPath) return;
				chosenDirPath = dirPath;
				if (wsLocationInput) wsLocationInput.value = dirPath;
			} catch { /* user cancelled */ }
		};
		wsChooseFolderBtn?.addEventListener("click", openFolderChooser);
		wsLocationInput?.addEventListener("click", openFolderChooser);

		// Create Workspace submit
		wsSubmitBtn?.addEventListener("click", async () => {
			console.log("[web-shell] Create Workspace button clicked");
			// Re-query input at click time to ensure fresh reference
			const nameInput = document.getElementById("ws-team-name") as HTMLInputElement | null;
			const errorEl = document.getElementById("ws-create-error");
			const teamName = nameInput?.value.trim() || "";
			console.log("[web-shell] teamName:", JSON.stringify(teamName), "chosenDirPath:", chosenDirPath);
			if (!teamName) {
				if (errorEl) {
					errorEl.textContent = "Please enter a team name.";
					errorEl.style.display = "";
				}
				nameInput?.focus();
				return;
			}
			if (!chosenDirPath) {
				if (errorEl) {
					errorEl.textContent = "Please choose a folder location.";
					errorEl.style.display = "";
				}
				return;
			}
			try {
				if (errorEl) errorEl.style.display = "none";
				const wsType = (document.querySelector('input[name="ws-type"]:checked') as HTMLInputElement)?.value || "team";

				const normalizedDir = chosenDirPath.replace(/[\\/]$/, "");

				// Create the workspace folder if it doesn't exist
				const exists = await window.electronAPI!.exists(normalizedDir);
				if (!exists) {
					await window.electronAPI!.mkdir(normalizedDir);
				}

				// Create .torqena config directory
				const torqenaDir = `${normalizedDir}/.torqena`;
				const torqenaExists = await window.electronAPI!.exists(torqenaDir);
				if (!torqenaExists) {
					await window.electronAPI!.mkdir(torqenaDir);
				}

				// Define default workspace folders based on type
				const defaultFolders = wsType === "personal"
					? [
						{ id: "notes", name: "Notes", description: "Personal notes and journals", icon: "file-text", folderPath: "Notes" },
						{ id: "tasks", name: "Tasks", description: "Task lists and to-dos", icon: "check-square", folderPath: "Tasks" },
						{ id: "projects", name: "Projects", description: "Project documentation", icon: "folder-kanban", folderPath: "Projects" },
						{ id: "reference", name: "Reference", description: "Reference materials and bookmarks", icon: "bookmark", folderPath: "Reference" },
					]
					: [
						{ id: "meetings", name: "Meetings", description: "Meeting notes, agendas, and recordings", icon: "calendar", folderPath: "Meetings" },
						{ id: "tasks", name: "Tasks", description: "Task lists, assignments, and progress tracking", icon: "check-square", folderPath: "Tasks" },
						{ id: "dashboards", name: "Dashboards", description: "Dashboard views and analytics", icon: "layout-dashboard", folderPath: "Dashboards" },
						{ id: "templates", name: "Templates", description: "Document templates and scaffolds", icon: "file-plus", folderPath: "Templates" },
					];

				// Scaffold .torqena/workspace.json with full schema
				const wsConfigPath = `${torqenaDir}/workspace.json`;
				const now = new Date().toISOString();
				const wsConfig = {
					schemaVersion: 1,
					workspaceId: `ws_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
					name: teamName,
					description: "",
					createdAt: now,
					lastOpenedAt: now,
					owner: {
						id: crypto.randomUUID(),
						displayName: "",
					},
					theme: {
						mode: "dark",
						accentColor: "#3B82F6",
						icon: wsType === "personal" ? "brain" : "rocket",
						customLogoPath: null,
					},
					layout: {
						defaultView: "home",
						sidebarCollapsed: false,
						agentPanelVisible: true,
						agentPanelWidth: 360,
					},
					structure: {
						folders: defaultFolders,
					},
					extensions: { installed: [] },
					ai: {
						agents: [],
						skills: [],
						prompts: [],
						enabled: true,
						defaultModel: "gpt-4.1",
						behavior: {
							executionMode: "review-first",
							approvalRequired: true,
							autoExtractTasks: false,
							autoSummarizeMeetings: wsType === "team",
						},
						permissions: {
							canModifyFiles: true,
							canCreateFiles: true,
							canDeleteFiles: false,
							canCallExternalTools: false,
						},
						memory: {
							enableEmbeddings: false,
							embeddingModel: null,
							lastIndexedAt: null,
						},
					},
					indexing: { watchMode: "filesystem", lastIndexedAt: null },
					collaboration: { enabled: false, members: [], roles: [] },
				};
				await window.electronAPI!.writeFile(wsConfigPath, JSON.stringify(wsConfig, null, 2));

				// Create the workspace structure folders
				for (const folder of defaultFolders) {
					const folderAbsPath = `${normalizedDir}/${folder.folderPath}`;
					const folderExists = await window.electronAPI!.exists(folderAbsPath);
					if (!folderExists) {
						await window.electronAPI!.mkdir(folderAbsPath);
					}
				}

				await bootstrap(normalizedDir, initialOpenFilePath);
			} catch (err: any) {
				if (errorEl) {
					errorEl.textContent = err?.message || "Failed to create workspace.";
					errorEl.style.display = "";
				}
			}
		});
		return;
	}

	// Browser mode: try restoring from IndexedDB, use showDirectoryPicker
	try {
		const handle = await getDirectoryHandle();
		await bootstrap(handle);
	} catch (e: any) {
		if (e?.message !== "NEEDS_PICKER") {
			console.error("Failed to restore vault:", e);
		}
		// Show the folder picker UI
		const pickBtn = document.getElementById("pick-folder-btn");
		const errorEl = document.getElementById("picker-error");

		pickBtn?.addEventListener("click", async () => {
			try {
				const handle = await (window as any).showDirectoryPicker({
					mode: "readwrite",
				});
				await bootstrap(handle, initialOpenFilePath);
			} catch (err: any) {
				// Ignore user cancellation of the picker dialog
				if (err?.name === "AbortError") return;
				if (errorEl) {
					errorEl.textContent = err?.message || "Failed to open folder.";
					errorEl.style.display = "";
				}
			}
		});
	}
}

// Run immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", () => void initApp());
} else {
	void initApp();
}

// ---- File Explorer ----

interface TreeNode {
	name: string;
	path: string;
	isFolder: boolean;
	children: TreeNode[];
}

function buildFileTree(files: { path: string }[]): TreeNode[] {
	const root: TreeNode[] = [];
	const folderMap = new Map<string, TreeNode>();

	const getOrCreateFolder = (folderPath: string): TreeNode => {
		if (folderMap.has(folderPath)) return folderMap.get(folderPath)!;
		const parts = folderPath.split("/");
		const name = parts[parts.length - 1] ?? "";
		const node: TreeNode = { name, path: folderPath, isFolder: true, children: [] };
		folderMap.set(folderPath, node);

		if (parts.length > 1) {
			const parentPath = parts.slice(0, -1).join("/");
			const parent = getOrCreateFolder(parentPath);
			parent.children.push(node);
		} else {
			root.push(node);
		}
		return node;
	};

	for (const file of files) {
		// Skip dotfiles/dotfolders (e.g. .obsidian, .git)
		const parts = file.path.split("/");
		if (parts.some(p => p.startsWith("."))) continue;
		const name = parts[parts.length - 1] ?? "";
		const fileNode: TreeNode = { name, path: file.path, isFolder: false, children: [] };

		if (parts.length > 1) {
			const folderPath = parts.slice(0, -1).join("/");
			const folder = getOrCreateFolder(folderPath);
			folder.children.push(fileNode);
		} else {
			root.push(fileNode);
		}
	}

	// Sort: folders first, then alphabetical
	const sortNodes = (nodes: TreeNode[]) => {
		nodes.sort((a, b) => {
			if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const n of nodes) if (n.isFolder) sortNodes(n.children);
	};
	sortNodes(root);
	return root;
}

function renderFileExplorer(container: HTMLElement, vault: any, app: any, paneManager: DockPaneManager | null): void {
	container.innerHTML = "";
	const explorer = document.createElement("div");
	explorer.className = "ws-file-explorer";

	// Toolbar above file list
	const toolbar = document.createElement("div");
	toolbar.className = "ws-file-explorer-toolbar";

	const makeToolbarBtn = (icon: string, label: string, action?: () => void): HTMLButtonElement => {
		const btn = document.createElement("button");
		btn.className = "clickable-icon nav-action-button";
		btn.setAttribute("aria-label", label);
		btn.innerHTML = icon;
		if (action) btn.addEventListener("click", action);
		return btn;
	};

	toolbar.appendChild(makeToolbarBtn(ctxIcons.newNote, "New note"));
	toolbar.appendChild(makeToolbarBtn(ctxIcons.newFolder, "New folder"));
	toolbar.appendChild(makeToolbarBtn(ctxIcons.sort, "Change sort order"));
	toolbar.appendChild(makeToolbarBtn(ctxIcons.collapseAll, "Collapse all", () => {
		list.querySelectorAll(".ws-file-children").forEach(el => {
			(el as HTMLElement).style.display = "none";
		});
		list.querySelectorAll(".ws-tree-chevron.is-open").forEach(el => {
			el.classList.remove("is-open");
		});
	}));
	toolbar.appendChild(makeToolbarBtn(ctxIcons.moreOptions, "More options"));

	explorer.appendChild(toolbar);

	const list = document.createElement("div");
	list.className = "ws-file-list";
	explorer.appendChild(list);

	const files = vault.getFiles();
	const tree = buildFileTree(files);
	renderTreeNodes(list, tree, paneManager);

	// Vault name footer with gear icon
	const footer = document.createElement("div");
	footer.className = "ws-file-explorer-footer";
	const vaultName = vault._dirHandle?.name || "vault";

	const vaultLabel = document.createElement("span");
	vaultLabel.className = "ws-footer-vault-name";
	vaultLabel.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M12 2v6"/><path d="M2 10h20"/></svg> ${vaultName}`;
	footer.appendChild(vaultLabel);

	const gearBtn = document.createElement("button");
	gearBtn.className = "ws-footer-gear clickable-icon";
	gearBtn.setAttribute("aria-label", "Settings");
	gearBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;
	gearBtn.addEventListener("click", () => {
		app?.setting?.open?.();
	});
	footer.appendChild(gearBtn);

	explorer.appendChild(footer);

	container.appendChild(explorer);
}

function renderTreeNodes(container: HTMLElement, nodes: TreeNode[], paneManager: DockPaneManager | null): void {
	for (const node of nodes) {
		const item = document.createElement("div");
		item.className = "ws-file-item" + (node.isFolder ? " ws-folder-item" : "");

		if (node.isFolder) {
			const chevron = document.createElement("span");
			chevron.className = "ws-tree-chevron";
			chevron.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
			item.appendChild(chevron);
			item.appendChild(document.createTextNode(node.name));
			container.appendChild(item);

			const childContainer = document.createElement("div");
			childContainer.className = "ws-file-children";
			childContainer.style.display = "none";
			container.appendChild(childContainer);

			item.addEventListener("click", () => {
				const isOpen = childContainer.style.display !== "none";
				childContainer.style.display = isOpen ? "none" : "";
				chevron.classList.toggle("is-open", !isOpen);
			});

			// Folder right-click context menu
			item.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				e.stopPropagation();
				showFolderContextMenu(e, node, paneManager);
			});

			renderTreeNodes(childContainer, node.children, paneManager);
		} else {
			// Add indent spacer to align with folder text
			const spacer = document.createElement("span");
			spacer.className = "ws-tree-spacer";
			item.appendChild(spacer);
			// Hide .md extension
			const displayName = node.name.replace(/\.md$/, "");
			item.appendChild(document.createTextNode(displayName));
			item.addEventListener("click", () => {
				if (paneManager) {
					paneManager.openFile(node.path);
				}
			});

			// File right-click context menu
			item.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				e.stopPropagation();
				showFileContextMenu(e, node, paneManager);
			});

			container.appendChild(item);
		}
	}
}

// ---- Center Pane Placeholder ----

/** Dismiss any active context menu */
let activeContextMenu: HTMLElement | null = null;
let activeContextMenuCleanup: (() => void) | null = null;

function dismissContextMenu(): void {
	if (activeContextMenu) {
		activeContextMenu.remove();
		activeContextMenu = null;
	}
	if (activeContextMenuCleanup) {
		activeContextMenuCleanup();
		activeContextMenuCleanup = null;
	}
}

/** SVG icons used in context menus */
const ctxIcons = {
	newNote: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
	newFolder: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/></svg>`,
	canvas: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
	base: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>`,
	openTab: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
	openRight: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`,
	openWindow: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>`,
	copy: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
	move: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/></svg>`,
	bookmark: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`,
	merge: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>`,
	copyPath: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
	openApp: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
	showExplorer: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
	rename: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
	deleteIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
	template: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
	search: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
	chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
	checkmark: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
	sidebarLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
	ribbon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>`,
	sort: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>`,
	collapseAll: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg>`,
	moreOptions: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
};

interface ContextMenuItem {
	label: string;
	icon: string;
	action?: () => void;
	hasSubmenu?: boolean;
	danger?: boolean;
	disabled?: boolean;
	checked?: boolean;
}

function createContextMenu(x: number, y: number, sections: ContextMenuItem[][]): void {
	dismissContextMenu();

	const menu = document.createElement("div");
	menu.className = "menu ws-context-menu";
	menu.style.position = "fixed";
	menu.style.zIndex = "10001";
	document.body.appendChild(menu);

	for (let si = 0; si < sections.length; si++) {
		if (si > 0) {
			const sep = document.createElement("div");
			sep.className = "menu-separator";
			menu.appendChild(sep);
		}
		const currentSection = sections[si];
		if (!currentSection) continue;
		for (const item of currentSection) {
			const el = document.createElement("div");
			el.className = "menu-item" + (item.disabled ? " is-disabled" : "");
			const checkHtml = item.checked !== undefined ? `<span class="menu-item-check" style="margin-left:auto;opacity:${item.checked ? 1 : 0}">${ctxIcons.checkmark}</span>` : "";
			el.innerHTML = `<span class="menu-item-icon">${item.icon}</span><span class="menu-item-title">${item.label}</span>${checkHtml}${item.hasSubmenu ? `<span class="menu-item-submenu">${ctxIcons.chevronRight}</span>` : ""}`;
			if (item.danger) {
				el.querySelector(".menu-item-icon")!.setAttribute("style", "color: var(--text-error)");
				el.querySelector(".menu-item-title")!.setAttribute("style", "color: var(--text-error)");
			}
			if (item.action && !item.disabled) {
				el.addEventListener("click", () => {
					dismissContextMenu();
					item.action!();
				});
			}
			menu.appendChild(el);
		}
	}

	// Position: keep menu within viewport
	const menuRect = menu.getBoundingClientRect();
	const maxX = window.innerWidth - menuRect.width - 4;
	const maxY = window.innerHeight - menuRect.height - 4;
	menu.style.left = `${Math.min(x, maxX)}px`;
	menu.style.top = `${Math.min(y, maxY)}px`;

	// Click outside to dismiss
	const dismiss = (ev: MouseEvent) => {
		if (!menu.contains(ev.target as Node)) {
			dismissContextMenu();
		}
	};
	setTimeout(() => document.addEventListener("click", dismiss), 0);
	activeContextMenu = menu;
	activeContextMenuCleanup = () => document.removeEventListener("click", dismiss);
}

function showFileContextMenu(e: MouseEvent, node: TreeNode, paneManager: DockPaneManager | null): void {
	const sections: ContextMenuItem[][] = [
		[
			{ label: "Open in new tab", icon: ctxIcons.openTab, action: () => paneManager?.openFile(node.path) },
			{ label: "Open to the right", icon: ctxIcons.openRight, action: () => { paneManager?.splitPane("horizontal"); paneManager?.openFile(node.path); } },
			{ label: "Open in new window", icon: ctxIcons.openWindow, disabled: true },
		],
		[
			{ label: "Make a copy", icon: ctxIcons.copy, disabled: true },
			{ label: "Move file to...", icon: ctxIcons.move, disabled: true },
			{ label: "Bookmark...", icon: ctxIcons.bookmark, disabled: true },
			{ label: "Merge entire file with...", icon: ctxIcons.merge, disabled: true },
		],
		[
			{ label: "Copy path", icon: ctxIcons.copyPath, hasSubmenu: true, action: () => navigator.clipboard.writeText(node.path) },
		],
		[
			{ label: "Open in default app", icon: ctxIcons.openApp, disabled: true },
			{ label: "Show in system explorer", icon: ctxIcons.showExplorer, disabled: true },
		],
		[
			{ label: "Rename...", icon: ctxIcons.rename, disabled: true },
			{ label: "Delete", icon: ctxIcons.deleteIcon, danger: true, disabled: true },
		],
	];
	createContextMenu(e.clientX, e.clientY, sections);
}

function showFolderContextMenu(e: MouseEvent, node: TreeNode, paneManager: DockPaneManager | null): void {
	const sections: ContextMenuItem[][] = [
		[
			{ label: "New note", icon: ctxIcons.newNote, disabled: true },
			{ label: "New folder", icon: ctxIcons.newFolder, disabled: true },
			{ label: "New canvas", icon: ctxIcons.canvas, disabled: true },
			{ label: "New base", icon: ctxIcons.base, disabled: true },
		],
		[
			{ label: "Make a copy", icon: ctxIcons.copy, disabled: true },
			{ label: "Move folder to...", icon: ctxIcons.move, disabled: true },
			{ label: "Bookmark...", icon: ctxIcons.bookmark, disabled: true },
		],
		[
			{ label: "Copy path", icon: ctxIcons.copyPath, hasSubmenu: true, action: () => navigator.clipboard.writeText(node.path) },
		],
		[
			{ label: "Show in system explorer", icon: ctxIcons.showExplorer, disabled: true },
		],
		[
			{ label: "Create new note from template", icon: ctxIcons.template, disabled: true },
		],
		[
			{ label: "Rename...", icon: ctxIcons.rename, disabled: true },
			{ label: "Delete", icon: ctxIcons.deleteIcon, danger: true, disabled: true },
		],
		[
			{ label: "Search in folder", icon: ctxIcons.search, disabled: true },
		],
	];
	createContextMenu(e.clientX, e.clientY, sections);
}

// ---- Center Pane Placeholder ----

function renderCenterPlaceholder(container: HTMLElement): void {
	container.innerHTML = "";
	const placeholder = document.createElement("div");
	placeholder.className = "ws-center-placeholder";
	placeholder.innerHTML = `
		<a class="ws-empty-action" data-action="new-note">Create new note (Ctrl + N)</a>
		<a class="ws-empty-action" data-action="go-to-file">Go to file (Ctrl + O)</a>
		<a class="ws-empty-action" data-action="close">Close</a>
	`;
	container.appendChild(placeholder);
}

/**
 * Wire up the left ribbon icon strip: collapse toggle, file explorer, extensions.
 */
function initRibbon(leftSplit: HTMLElement, vault: any, app: any, plugin: any, workspace: any, centerDock: DockPaneManager | null, layoutManager: LayoutManager): void {
	const toggleBtn = document.querySelector(".ws-ribbon-toggle") as HTMLElement;
	const filesBtn = document.querySelector(".ws-ribbon-files") as HTMLElement;
	const extBtn = document.querySelector(".ws-ribbon-extensions") as HTMLElement;
	if (!toggleBtn || !filesBtn || !extBtn) return;

	// Set icons
	// Sidebar toggle (left/right panel icon)
	toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`;
	// Folder icon
	filesBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`;
	// Extensions / puzzle piece icon (Lucide "puzzle" — matches ExtensionBrowserView)
	extBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.315 8.685a.98.98 0 0 1 .837-.276c.47.07.802.48.968.925a2.501 2.501 0 1 0 3.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 0 1 .276-.837l1.61-1.61a2.404 2.404 0 0 1 1.705-.707 2.402 2.402 0 0 1 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"/></svg>`;

	// Toggle collapse via LayoutManager
	toggleBtn.addEventListener("click", () => {
		layoutManager.toggleLeft();
	});

	// Right-click context menu on toggle button
	const ribbon = document.querySelector(".workspace-ribbon.side-dock-ribbon.mod-left") as HTMLElement;
	let ribbonVisible = false;

	toggleBtn.addEventListener("contextmenu", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const sidebarVisible = !layoutManager.isLeftCollapsed;
		createContextMenu(e.clientX, e.clientY, [[
			{
				label: "Left sidebar",
				icon: ctxIcons.sidebarLeft,
				checked: sidebarVisible,
				action: () => {
					layoutManager.toggleLeft();
				},
			},
			{
				label: "Ribbon",
				icon: ctxIcons.ribbon,
				checked: ribbonVisible,
				action: () => {
					ribbonVisible = !ribbonVisible;
					if (ribbon) ribbon.style.display = ribbonVisible ? "flex" : "none";
				},
			},
		]]);
	});

	const setActiveRibbonButton = (active: "files" | "extensions") => {
		filesBtn.classList.toggle("is-active", active === "files");
		extBtn.classList.toggle("is-active", active === "extensions");
	};

	// Files view — activate workspace navigator tab in the left dock
	filesBtn.addEventListener("click", () => {
		if (layoutManager.isLeftCollapsed) {
			layoutManager.expandLeft();
		}
		const leftDock = layoutManager.leftDock;
		if (leftDock) {
			void leftDock.addWidgetToActivePanel("workspace-navigator-view");
		}
		setActiveRibbonButton("files");
	});

	// Extensions view — activate extensions tab in the left dock
	extBtn.addEventListener("click", async () => {
		if (layoutManager.isLeftCollapsed) {
			layoutManager.expandLeft();
		}
		const leftDock = layoutManager.leftDock;
		if (leftDock) {
			void leftDock.addWidgetToActivePanel("extension-browser-view");
		}
		setActiveRibbonButton("extensions");
	});
}




