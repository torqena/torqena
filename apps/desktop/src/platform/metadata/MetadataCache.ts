/**
 * MetadataCache — minimal implementation replicating only the methods
 * actually used by the plugin.
 *
 * Only getFirstLinkpathDest() is used (3 files). Resolves wiki-link
 * paths to TFile objects by looking up in the vault's file index.
 */

import type { Vault } from "../vault/Vault.js";
import { TFile } from "../vault/TFile.js";

export class MetadataCache {
	private _vault: Vault;

	constructor(vault: Vault) {
		this._vault = vault;
	}

	/**
	 * Resolve a wiki-link path to a TFile.
	 *
	 * Tries several resolution strategies:
	 * 1. Exact path match
	 * 2. Path with .md extension appended
	 * 3. Relative to the source file's folder
	 */
	getFirstLinkpathDest(
		linkPath: string,
		sourcePath: string,
	): TFile | null {
		// Strategy 1: exact match
		const exact = this._vault.getAbstractFileByPath(linkPath);
		if (exact instanceof TFile) return exact;

		// Strategy 2: append .md
		if (!linkPath.endsWith(".md")) {
			const withMd = this._vault.getAbstractFileByPath(`${linkPath}.md`);
			if (withMd instanceof TFile) return withMd;
		}

		// Strategy 3: relative to source path's folder
		const sourceDir = sourcePath.includes("/")
			? sourcePath.slice(0, sourcePath.lastIndexOf("/"))
			: "";
		if (sourceDir) {
			const relative = this._vault.getAbstractFileByPath(
				`${sourceDir}/${linkPath}`,
			);
			if (relative instanceof TFile) return relative;

			if (!linkPath.endsWith(".md")) {
				const relativeMd = this._vault.getAbstractFileByPath(
					`${sourceDir}/${linkPath}.md`,
				);
				if (relativeMd instanceof TFile) return relativeMd;
			}
		}

		// Strategy 4: search all files for basename match
		const linkBasename = linkPath.split("/").pop() || linkPath;
		for (const file of this._vault.getMarkdownFiles()) {
			if (
				file.basename === linkBasename ||
				file.name === linkBasename
			) {
				return file;
			}
		}

		return null;
	}
}
