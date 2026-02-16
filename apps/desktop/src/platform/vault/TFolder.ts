/**
 * Represents a folder in the vault, replicating Obsidian's TFolder.
 */

import { TAbstractFile } from "./TAbstractFile.js";

export class TFolder extends TAbstractFile {
	/** Direct children (files and subfolders). */
	children: TAbstractFile[] = [];

	constructor(path: string) {
		super(path);
	}

	/** Returns true if this is the vault root folder. */
	isRoot(): boolean {
		return this.path === "" || this.path === "/";
	}
}
