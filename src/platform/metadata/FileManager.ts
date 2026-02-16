/**
 * FileManager — minimal implementation replicating only the methods
 * actually used by the plugin.
 *
 * Only renameFile() is used (1 file). Delegates to Vault.rename().
 */

import type { Vault } from "../vault/Vault.js";
import type { TAbstractFile } from "../vault/TAbstractFile.js";

export class FileManager {
	private _vault: Vault;

	constructor(vault: Vault) {
		this._vault = vault;
	}

	/**
	 * Rename (move) a file or folder.
	 */
	async renameFile(
		file: TAbstractFile,
		newPath: string,
	): Promise<void> {
		await this._vault.rename(file, newPath);
	}
}
