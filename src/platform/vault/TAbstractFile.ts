/**
 * Base class for vault file system entries, replicating Obsidian's TAbstractFile.
 */

import type { Vault } from "./Vault.js";

export class TAbstractFile {
	/** Full vault-relative path (e.g. "folder/note.md"). */
	path: string;

	/** File or folder name including extension (e.g. "note.md"). */
	name: string;

	/** Parent folder, or null for the vault root. */
	parent: import("./TFolder.js").TFolder | null;

	/** The vault this file belongs to. */
	vault!: Vault;

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() || "";
		this.parent = null;
	}
}
