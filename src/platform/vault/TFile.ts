/**
 * Represents a file in the vault, replicating Obsidian's TFile.
 */

import { TAbstractFile } from "./TAbstractFile.js";

export class TFile extends TAbstractFile {
	/** Filename without extension (e.g. "note" for "note.md"). */
	basename: string;

	/** File extension without the dot (e.g. "md"). */
	extension: string;

	/** File stats. */
	stat: { mtime: number; ctime: number; size: number };

	constructor(path: string) {
		super(path);
		const fileName = this.name;
		const dotIndex = fileName.lastIndexOf(".");
		this.extension = dotIndex >= 0 ? fileName.slice(dotIndex + 1) : "";
		this.basename = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
		this.stat = { mtime: Date.now(), ctime: Date.now(), size: 0 };
	}
}
