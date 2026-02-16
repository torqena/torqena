/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ui/FileExplorerView
 * @description ItemView wrapper for the file explorer tree.
 *
 * Turns the raw file-tree rendering (previously in shell-main.ts) into a
 * first-class ItemView so it can live inside a DockPanel tab alongside
 * editors and other widgets.
 *
 * @example
 * ```ts
 * import { FileExplorerView, FILE_EXPLORER_VIEW_TYPE } from "./ui/FileExplorerView";
 * plugin.registerView(FILE_EXPLORER_VIEW_TYPE, (leaf) => new FileExplorerView(leaf, vault, app));
 * ```
 *
 * @since 0.1.0
 */

import { ItemView } from "../platform/ui/ItemView.js";
import type { WorkspaceLeaf } from "../platform/workspace/WorkspaceLeaf.js";
import type { App } from "../platform/core/App.js";

/** Unique view type identifier for the file explorer. */
export const FILE_EXPLORER_VIEW_TYPE = "file-explorer-view";

// ── Internal tree helpers ────────────────────────────────────

/** @internal */
interface TreeNode {
	name: string;
	path: string;
	isFolder: boolean;
	children: TreeNode[];
}

/**
 * Build a hierarchical file tree from flat file paths.
 * @internal
 */
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

// ── SVG icon constants ───────────────────────────────────────

/** @internal */
const icons = {
	newNote: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
	newFolder: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/></svg>`,
	sort: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>`,
	collapseAll: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg>`,
	moreOptions: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
	vault: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M12 2v6"/><path d="M2 10h20"/></svg>`,
	gear: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
	chevron: `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
};

/**
 * File explorer view that can be hosted in any DockPanel tab.
 *
 * Renders a navigable tree of vault files with toolbar, context
 * menus, and a vault-name footer.
 */
export class FileExplorerView extends ItemView {
	private vault: any;
	private _app: App;

	/** Optional callback to open a file in the center pane. */
	private _openFileHandler: ((filePath: string) => void) | null = null;

	constructor(leaf: WorkspaceLeaf, vault: any, app: App) {
		super(leaf);
		this.vault = vault;
		this._app = app;
	}

	getViewType(): string {
		return FILE_EXPLORER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Files";
	}

	getIcon(): string {
		return "folder";
	}

	/**
	 * Set the handler called when a file is clicked.
	 *
	 * @param handler - Receives the vault-relative file path
	 */
	setOpenFileHandler(handler: (filePath: string) => void): void {
		this._openFileHandler = handler;
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.innerHTML = "";
	}

	// ── Rendering ────────────────────────────────────────────

	/** @internal */
	private render(): void {
		const container = this.contentEl;
		container.innerHTML = "";
		container.classList.add("ws-file-explorer");

		// Toolbar
		const toolbar = document.createElement("div");
		toolbar.className = "ws-file-explorer-toolbar";

		const makeBtn = (icon: string, label: string, action?: () => void): HTMLButtonElement => {
			const btn = document.createElement("button");
			btn.className = "clickable-icon nav-action-button";
			btn.setAttribute("aria-label", label);
			btn.innerHTML = icon;
			if (action) btn.addEventListener("click", action);
			return btn;
		};

		toolbar.appendChild(makeBtn(icons.newNote, "New note"));
		toolbar.appendChild(makeBtn(icons.newFolder, "New folder"));
		toolbar.appendChild(makeBtn(icons.sort, "Change sort order"));
		toolbar.appendChild(makeBtn(icons.collapseAll, "Collapse all", () => {
			list.querySelectorAll(".ws-file-children").forEach(el => {
				(el as HTMLElement).style.display = "none";
			});
			list.querySelectorAll(".ws-tree-chevron.is-open").forEach(el => {
				el.classList.remove("is-open");
			});
		}));
		toolbar.appendChild(makeBtn(icons.moreOptions, "More options"));

		container.appendChild(toolbar);

		// File list
		const list = document.createElement("div");
		list.className = "ws-file-list";
		container.appendChild(list);

		const files = this.vault.getFiles();
		const tree = buildFileTree(files);
		this.renderTreeNodes(list, tree);

		// Footer
		const footer = document.createElement("div");
		footer.className = "ws-file-explorer-footer";
		const vaultName = this.vault._dirHandle?.name || "vault";

		const vaultLabel = document.createElement("span");
		vaultLabel.className = "ws-footer-vault-name";
		vaultLabel.innerHTML = `${icons.vault} ${vaultName}`;
		footer.appendChild(vaultLabel);

		const gearBtn = document.createElement("button");
		gearBtn.className = "ws-footer-gear clickable-icon";
		gearBtn.setAttribute("aria-label", "Settings");
		gearBtn.innerHTML = icons.gear;
		gearBtn.addEventListener("click", () => {
			this._app?.setting?.open?.();
		});
		footer.appendChild(gearBtn);

		container.appendChild(footer);
	}

	/** @internal */
	private renderTreeNodes(container: HTMLElement, nodes: TreeNode[]): void {
		for (const node of nodes) {
			const item = document.createElement("div");
			item.className = "ws-file-item" + (node.isFolder ? " ws-folder-item" : "");

			if (node.isFolder) {
				const chevron = document.createElement("span");
				chevron.className = "ws-tree-chevron";
				chevron.innerHTML = icons.chevron;
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

				this.renderTreeNodes(childContainer, node.children);
			} else {
				const spacer = document.createElement("span");
				spacer.className = "ws-tree-spacer";
				item.appendChild(spacer);
				const displayName = node.name.replace(/\.md$/, "");
				item.appendChild(document.createTextNode(displayName));
				item.addEventListener("click", () => {
					this._openFileHandler?.(node.path);
				});
				container.appendChild(item);
			}
		}
	}
}
