/**
 * Vault implementation backed by the browser File System Access API.
 *
 * Replicates Obsidian's Vault class: file reading/writing, in-memory
 * index of TFile/TFolder objects, and event emission for create/modify/
 * delete/rename operations.
 */

import { Events, EventRef } from "../core/Events.js";
import { TAbstractFile } from "./TAbstractFile.js";
import { TFile } from "./TFile.js";
import { TFolder } from "./TFolder.js";
import { VaultAdapter } from "./VaultAdapter.js";

export class Vault extends Events {
	/** The adapter providing raw file system operations. */
	adapter: VaultAdapter;

	/** In-memory file/folder index keyed by vault-relative path. */
	private _index: Map<string, TAbstractFile> = new Map();

	/** Root folder of the vault. */
	private _root: TFolder;

	/** Cache for cachedRead. */
	private _readCache: Map<string, string> = new Map();

	constructor(rootHandleOrPath: FileSystemDirectoryHandle | string) {
		super();
		this.adapter = new VaultAdapter(rootHandleOrPath);
		this._root = new TFolder("");
		this._root.vault = this as any;
		this._index.set("", this._root);
	}

	/**
	 * Scan the directory tree and populate the in-memory index.
	 * Must be called once after construction, before the plugin loads.
	 */
	async initialize(): Promise<void> {
		if (this.adapter.isElectronMode) {
			await this._scanElectron();
		} else {
			await this._scanDir(this.adapter.getRootHandle()!, "", this._root);
		}
	}

	/**
	 * Scan using Electron IPC — gets a flat list of all files and builds
	 * the folder/file index from the relative paths.
	 */
	private async _scanElectron(): Promise<void> {
		const rootPath = this.adapter.rootPath!;
		const files: string[] = await (window as any).electronAPI.listFilesRecursive(rootPath);
		for (const relativePath of files) {
			const parts = relativePath.split("/");
			// Ensure parent folders exist in index
			let parentFolder = this._root;
			for (let i = 0; i < parts.length - 1; i++) {
				const folderPath = parts.slice(0, i + 1).join("/");
				let folder = this._index.get(folderPath) as TFolder;
				if (!folder) {
					folder = new TFolder(folderPath);
					folder.parent = parentFolder;
					folder.vault = this as any;
					parentFolder.children.push(folder);
					this._index.set(folderPath, folder);
				}
				parentFolder = folder;
			}
			// Create file entry
			const file = new TFile(relativePath);
			file.parent = parentFolder;
			file.vault = this as any;
			parentFolder.children.push(file);
			this._index.set(relativePath, file);
		}
	}

	private async _scanDir(
		dirHandle: FileSystemDirectoryHandle,
		parentPath: string,
		parentFolder: TFolder,
	): Promise<void> {
		for await (const [name, handle] of (dirHandle as any).entries()) {
			const entryPath = parentPath ? `${parentPath}/${name}` : name;
			if (handle.kind === "file") {
				const file = new TFile(entryPath);
				file.parent = parentFolder;
				file.vault = this as any;
				try {
					const rawFile = await (handle as FileSystemFileHandle).getFile();
					file.stat = {
						mtime: rawFile.lastModified,
						ctime: rawFile.lastModified,
						size: rawFile.size,
					};
				} catch {
					// stat unavailable, defaults are fine
				}
				parentFolder.children.push(file);
				this._index.set(entryPath, file);
			} else if (handle.kind === "directory") {
				const folder = new TFolder(entryPath);
				folder.parent = parentFolder;
				folder.vault = this as any;
				parentFolder.children.push(folder);
				this._index.set(entryPath, folder);
				await this._scanDir(
					handle as FileSystemDirectoryHandle,
					entryPath,
					folder,
				);
			}
		}
	}

	// --- Read operations ---

	/** Read file contents as a string. */
	async read(file: TFile): Promise<string> {
		return this.adapter.read(file.path);
	}

	/** Read with a simple cache. Falls back to disk on cache miss. */
	async cachedRead(file: TFile): Promise<string> {
		const cached = this._readCache.get(file.path);
		if (cached !== undefined) return cached;
		const content = await this.read(file);
		this._readCache.set(file.path, content);
		return content;
	}

	// --- Write operations ---

	/** Overwrite file contents. */
	async modify(file: TFile, content: string): Promise<void> {
		await this.adapter.write(file.path, content);
		file.stat.mtime = Date.now();
		this._readCache.set(file.path, content);
		this.trigger("modify", file);
	}

	/** Create a new file with the given content. */
	async create(path: string, content: string): Promise<TFile> {
		await this.adapter.write(path, content);
		const file = new TFile(path);
		file.vault = this as any;
		// Ensure parent folder exists in index
		const parentPath = path.includes("/")
			? path.slice(0, path.lastIndexOf("/"))
			: "";
		const parentFolder = (this._index.get(parentPath) as TFolder) || this._root;
		file.parent = parentFolder;
		parentFolder.children.push(file);
		this._index.set(path, file);
		this._readCache.set(path, content);
		this.trigger("create", file);
		return file;
	}

	/** Append content to an existing file. */
	async append(file: TFile, content: string): Promise<void> {
		const existing = await this.read(file);
		await this.modify(file, existing + content);
	}

	/** Move file to trash (delete in browser since there's no system trash). */
	async trash(file: TAbstractFile, _system?: boolean): Promise<void> {
		await this.adapter.remove(
			file.path,
			file instanceof TFolder,
		);
		// Remove from parent's children
		if (file.parent) {
			const idx = file.parent.children.indexOf(file);
			if (idx !== -1) file.parent.children.splice(idx, 1);
		}
		// Remove from index (and descendants if folder)
		if (file instanceof TFolder) {
			this._removeFromIndex(file);
		} else {
			this._index.delete(file.path);
			this._readCache.delete(file.path);
		}
		this.trigger("delete", file);
	}

	/** Alias for trash. */
	async delete(file: TAbstractFile, force?: boolean): Promise<void> {
		await this.trash(file, force);
	}

	/** Create a folder (and intermediate parents). */
	async createFolder(path: string): Promise<TFolder> {
		await this.adapter.mkdir(path);
		// Build index entries for each segment
		const parts = path.split("/").filter(Boolean);
		let currentPath = "";
		let parentFolder = this._root;
		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			let existing = this._index.get(currentPath);
			if (!existing) {
				const folder = new TFolder(currentPath);
				folder.parent = parentFolder;
				folder.vault = this as any;
				parentFolder.children.push(folder);
				this._index.set(currentPath, folder);
				existing = folder;
			}
			parentFolder = existing as TFolder;
		}
		return parentFolder;
	}

	// --- Lookup operations ---

	/** Get a file or folder by its vault-relative path. */
	getAbstractFileByPath(path: string): TAbstractFile | null {
		return this._index.get(path) ?? null;
	}

	/** Get a file (not folder) by path. */
	getFileByPath(path: string): TFile | null {
		const f = this._index.get(path);
		return f instanceof TFile ? f : null;
	}

	/** Get all markdown files in the vault. */
	getMarkdownFiles(): TFile[] {
		const result: TFile[] = [];
		for (const entry of this._index.values()) {
			if (entry instanceof TFile && entry.extension === "md") {
				result.push(entry);
			}
		}
		return result;
	}

	/** Get all files in the vault. */
	getFiles(): TFile[] {
		const result: TFile[] = [];
		for (const entry of this._index.values()) {
			if (entry instanceof TFile) {
				result.push(entry);
			}
		}
		return result;
	}

	/** Get the root folder. */
	getRoot(): TFolder {
		return this._root;
	}

	/** Get the vault name (root directory name). */
	getName(): string {
		return this.adapter.getBasePath();
	}

	// --- Rename ---

	/** Rename/move a file or folder. */
	async rename(file: TAbstractFile, newPath: string): Promise<void> {
		const oldPath = file.path;
		// Read content, create at new path, delete old
		if (file instanceof TFile) {
			const content = await this.read(file);
			// Remove old
			await this.adapter.remove(oldPath);
			// Write new
			await this.adapter.write(newPath, content);
		} else {
			// For folders, this is complex — skip for now
			throw new Error("Folder rename not yet supported in web shim");
		}

		// Update index
		this._index.delete(oldPath);
		this._readCache.delete(oldPath);

		// Update the file object in place
		const oldParent = file.parent;
		if (oldParent) {
			const idx = oldParent.children.indexOf(file);
			if (idx !== -1) oldParent.children.splice(idx, 1);
		}

		file.path = newPath;
		file.name = newPath.split("/").pop() || "";
		if (file instanceof TFile) {
			const dotIndex = file.name.lastIndexOf(".");
			file.extension = dotIndex >= 0 ? file.name.slice(dotIndex + 1) : "";
			file.basename = dotIndex >= 0 ? file.name.slice(0, dotIndex) : file.name;
		}

		const newParentPath = newPath.includes("/")
			? newPath.slice(0, newPath.lastIndexOf("/"))
			: "";
		const newParent =
			(this._index.get(newParentPath) as TFolder) || this._root;
		file.parent = newParent;
		newParent.children.push(file);
		this._index.set(newPath, file);

		this.trigger("rename", file, oldPath);
	}

	// --- Helpers ---

	private _removeFromIndex(folder: TFolder): void {
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				this._removeFromIndex(child);
			}
			this._index.delete(child.path);
			this._readCache.delete(child.path);
		}
		this._index.delete(folder.path);
	}
}
