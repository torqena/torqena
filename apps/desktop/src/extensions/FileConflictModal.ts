/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module extensions/FileConflictModal
 * @description Modal dialog for resolving file conflicts during extension installation
 * 
 * When installing an extension, if a file already exists at the target location,
 * this modal allows the user to choose whether to override the existing file,
 * rename the incoming file, or cancel the installation.
 */

import { App, Modal, Setting } from "obsidian";

/**
 * User's choice for resolving a file conflict.
 */
export type FileConflictResolution = 
	| { action: "override" }
	| { action: "rename"; newPath: string }
	| { action: "cancel" };

/**
 * Modal for resolving file conflicts during extension installation.
 * 
 * @example
 * ```typescript
 * const resolution = await FileConflictModal.show(app, "Reference/Agents/daily-journal.agent.md");
 * if (resolution.action === "override") {
 *   // Overwrite the existing file
 * } else if (resolution.action === "rename") {
 *   // Use resolution.newPath instead
 * } else {
 *   // Cancel installation
 * }
 * ```
 */
export class FileConflictModal extends Modal {
	private result: FileConflictResolution | null = null;
	private resolver: ((value: FileConflictResolution) => void) | null = null;
	private existingPath: string;
	private newPathInput: HTMLInputElement | null = null;

	constructor(app: App, existingPath: string) {
		super(app);
		this.existingPath = existingPath;
	}

	/**
	 * Shows the modal and returns a promise that resolves with the user's choice.
	 */
	static show(app: App, existingPath: string): Promise<FileConflictResolution> {
		const modal = new FileConflictModal(app, existingPath);
		return new Promise((resolve) => {
			modal.resolver = resolve;
			modal.open();
		});
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "File Already Exists" });

		contentEl.createEl("p", {
			text: `A file already exists at this location:`,
		});

		contentEl.createEl("code", {
			text: this.existingPath,
			cls: "vc-file-conflict-path",
		});

		contentEl.createEl("p", {
			text: "How would you like to proceed?",
		});

		// Option 1: Override
		new Setting(contentEl)
			.setName("Override existing file")
			.setDesc("Replace the existing file with the extension's version")
			.addButton((btn) =>
				btn
					.setButtonText("Override")
					.setCta()
					.onClick(() => {
						this.result = { action: "override" };
						this.close();
					})
			);

		// Option 2: Rename
		const renameSetting = new Setting(contentEl)
			.setName("Rename incoming file")
			.setDesc("Keep the existing file and save the extension's version with a different name");

		// Generate default new path
		const defaultNewPath = this.generateUniqueFilename(this.existingPath);

		renameSetting.addText((text) => {
			this.newPathInput = text.inputEl;
			text
				.setPlaceholder("New file path")
				.setValue(defaultNewPath)
				.onChange((value) => {
					// Update default new path as user types
				});
		});

		renameSetting.addButton((btn) =>
			btn
				.setButtonText("Rename")
				.onClick(() => {
					const newPath = this.newPathInput?.value.trim();
					if (!newPath) {
						// Show error
						return;
					}
					this.result = { action: "rename", newPath };
					this.close();
				})
		);

		// Option 3: Cancel
		new Setting(contentEl)
			.setName("Cancel installation")
			.setDesc("Stop the installation process without making any changes")
			.addButton((btn) =>
				btn
					.setButtonText("Cancel")
					.setWarning()
					.onClick(() => {
						this.result = { action: "cancel" };
						this.close();
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		// If user closed modal without choosing, treat as cancel
		if (!this.result) {
			this.result = { action: "cancel" };
		}

		// Resolve the promise
		if (this.resolver) {
			this.resolver(this.result);
			this.resolver = null;
		}
	}

	/**
	 * Generates a unique filename by adding a number suffix.
	 * 
	 * @example
	 * ```
	 * file.md -> file-1.md
	 * file-1.md -> file-2.md
	 * ```
	 */
	private generateUniqueFilename(path: string): string {
		// Split path into directory, basename, and extension
		const lastSlash = path.lastIndexOf("/");
		const directory = lastSlash >= 0 ? path.substring(0, lastSlash + 1) : "";
		const filename = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;

		const lastDot = filename.lastIndexOf(".");
		const basename = lastDot >= 0 ? filename.substring(0, lastDot) : filename;
		const extension = lastDot >= 0 ? filename.substring(lastDot) : "";

		// Check if filename already has a numeric suffix
		const suffixMatch = basename.match(/^(.+)-(\d+)$/);
		if (suffixMatch && suffixMatch[1] && suffixMatch[2]) {
			const base = suffixMatch[1];
			const num = parseInt(suffixMatch[2], 10);
			return `${directory}${base}-${num + 1}${extension}`;
		} else {
			return `${directory}${basename}-1${extension}`;
		}
	}
}
