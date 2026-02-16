/**
 * VaultAdapter (FileSystemAdapter) backed by the browser File System Access API
 * or Electron IPC (path-based mode).
 *
 * Provides the `vault.adapter` interface: read/write/exists/getBasePath
 * for path-based operations. Also exported as `FileSystemAdapter` for
 * instanceof checks in existing plugin code.
 *
 * Construction modes:
 * - `new VaultAdapter(handle)` — browser mode using File System Access API
 * - `new VaultAdapter(absolutePath)` — Electron mode using window.electronAPI IPC
 */

export class VaultAdapter {
	private _rootHandle: FileSystemDirectoryHandle | null;
	private _rootPath: string | null;
	/** Public basePath matching Obsidian's FileSystemAdapter.basePath. */
	basePath: string;

	constructor(rootHandleOrPath: FileSystemDirectoryHandle | string) {
		if (typeof rootHandleOrPath === "string") {
			// Electron mode — path-based
			this._rootHandle = null;
			this._rootPath = rootHandleOrPath;
			const segments = rootHandleOrPath.replace(/[\\/]+$/, "").split(/[\\/]/);
			this.basePath = segments[segments.length - 1] || rootHandleOrPath;
		} else {
			// Browser mode — File System Access API
			this._rootHandle = rootHandleOrPath;
			this._rootPath = null;
			this.basePath = rootHandleOrPath.name;
		}
	}

	/** Whether this adapter uses Electron IPC for file operations. */
	get isElectronMode(): boolean {
		return this._rootPath !== null;
	}

	/** The absolute root path (Electron mode only). */
	get rootPath(): string | null {
		return this._rootPath;
	}

	/** Build the full OS path from a vault-relative path (Electron mode). */
	private _fullPath(relativePath: string): string {
		if (!this._rootPath) throw new Error("No root path in browser mode");
		return this._rootPath + "/" + relativePath;
	}

	/** Returns the root directory name (no absolute path in browser). */
	getBasePath(): string {
		return this.basePath;
	}

	/**
	 * Navigate to a directory handle for the given path segments.
	 * Creates intermediate directories if `create` is true.
	 * Browser mode only.
	 */
	async _getDirHandle(
		segments: string[],
		create = false,
	): Promise<FileSystemDirectoryHandle> {
		let handle = this._rootHandle!;
		for (const seg of segments) {
			handle = await handle.getDirectoryHandle(seg, { create });
		}
		return handle;
	}

	/** Get a file handle by vault-relative path. Browser mode only. */
	async _getFileHandle(
		path: string,
		create = false,
	): Promise<FileSystemFileHandle> {
		const parts = path.split("/").filter(Boolean);
		const fileName = parts.pop();
		if (!fileName) throw new Error(`Invalid path: ${path}`);
		const dirHandle = await this._getDirHandle(parts, create);
		return dirHandle.getFileHandle(fileName, { create });
	}

	/** Read file contents as text. */
	async read(path: string): Promise<string> {
		if (this.isElectronMode) {
			return (window as any).electronAPI.readFile(this._fullPath(path));
		}
		const handle = await this._getFileHandle(path);
		const file = await handle.getFile();
		return file.text();
	}

	/** Write text content to a file (creates if needed). */
	async write(path: string, content: string): Promise<void> {
		if (this.isElectronMode) {
			// Ensure parent directory exists
			const lastSlash = path.lastIndexOf("/");
			if (lastSlash > 0) {
				const parentDir = path.slice(0, lastSlash);
				await (window as any).electronAPI.mkdir(this._fullPath(parentDir));
			}
			return (window as any).electronAPI.writeFile(this._fullPath(path), content);
		}
		const handle = await this._getFileHandle(path, true);
		const writable = await handle.createWritable();
		await writable.write(content);
		await writable.close();
	}

	/** Check whether a file or directory exists at the given path. */
	async exists(path: string): Promise<boolean> {
		if (this.isElectronMode) {
			return (window as any).electronAPI.exists(this._fullPath(path));
		}
		const parts = path.split("/").filter(Boolean);
		if (parts.length === 0) return true; // root always exists
		try {
			// Try as file first
			const fileName = parts[parts.length - 1]!;
			const dirParts = parts.slice(0, -1);
			const dirHandle = await this._getDirHandle(dirParts);
			try {
				await dirHandle.getFileHandle(fileName);
				return true;
			} catch {
				// Try as directory
				await dirHandle.getDirectoryHandle(fileName);
				return true;
			}
		} catch {
			return false;
		}
	}

	/** Remove a file or directory entry. */
	async remove(path: string, recursive = false): Promise<void> {
		if (this.isElectronMode) {
			return (window as any).electronAPI.remove(this._fullPath(path), { recursive });
		}
		const parts = path.split("/").filter(Boolean);
		const name = parts.pop();
		if (!name) throw new Error(`Cannot remove root`);
		const parentHandle = await this._getDirHandle(parts);
		await parentHandle.removeEntry(name, { recursive });
	}

	/** Create a directory (and parents) at the given path. */
	async mkdir(path: string): Promise<void> {
		if (this.isElectronMode) {
			return (window as any).electronAPI.mkdir(this._fullPath(path));
		}
		const parts = path.split("/").filter(Boolean);
		await this._getDirHandle(parts, true);
	}

	/** List entries in a directory. Returns {name, kind} pairs. */
	async list(
		path: string,
	): Promise<Array<{ name: string; kind: "file" | "directory" }>> {
		if (this.isElectronMode) {
			return (window as any).electronAPI.readdir(this._fullPath(path));
		}
		const parts = path.split("/").filter(Boolean);
		const handle = await this._getDirHandle(parts);
		const entries: Array<{ name: string; kind: "file" | "directory" }> = [];
		for await (const [name, entryHandle] of (handle as any).entries()) {
			entries.push({ name, kind: entryHandle.kind });
		}
		return entries;
	}

	/** Get the root directory handle. Browser mode only; returns null in Electron mode. */
	getRootHandle(): FileSystemDirectoryHandle | null {
		return this._rootHandle;
	}
}

/**
 * Alias so that `instanceof FileSystemAdapter` checks in the plugin
 * code resolve to this class.
 */
export { VaultAdapter as FileSystemAdapter };
