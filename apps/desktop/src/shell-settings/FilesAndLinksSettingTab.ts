/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module FilesAndLinksSettingTab
 * @description Files & Links settings — default paths, link format, deletion behavior.
 */

import { Setting } from "../platform/ui/Setting.js";
import { SettingTab } from "./SettingTab.js";
import { loadSettings, saveSettings } from "./WebShellSettings.js";
import type { App } from "../platform/core/App.js";

export class FilesAndLinksSettingTab extends SettingTab {
	constructor(app: App) {
		super(app, "files-and-links", "Files and links", "folder-open");
	}

	display(): void {
		const el = this.containerEl;
		el.empty();

		const settings = loadSettings();

		new Setting(el).setName("Links").setHeading();

		new Setting(el)
			.setName("Automatically update internal links")
			.setDesc("When a file is moved or renamed, update all internal links to it.")
			.addToggle((toggle) => {
				toggle.setValue(settings.autoUpdateLinks)
					.onChange((val) => {
						settings.autoUpdateLinks = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("New link format")
			.setDesc("What format to use when inserting links via autocomplete.")
			.addDropdown((dd) => {
				dd.addOption("shortest", "Shortest path when possible")
					.addOption("relative", "Relative path to file")
					.addOption("absolute", "Absolute path in vault")
					.setValue(settings.linkFormat)
					.onChange((val) => {
						settings.linkFormat = val as any;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Use [[Wikilinks]]")
			.setDesc("Disable to use standard Markdown links instead of Wikilinks.")
			.addToggle((toggle) => {
				toggle.setValue(!settings.useMarkdownLinks)
					.onChange((val) => {
						settings.useMarkdownLinks = !val;
						saveSettings(settings);
					});
			});

		new Setting(el).setName("Files").setHeading();

		new Setting(el)
			.setName("Default location for new notes")
			.setDesc("Where newly-created notes should be placed.")
			.addText((text) => {
				text.setPlaceholder("Vault root")
					.setValue(settings.newNotePath)
					.onChange((val) => {
						settings.newNotePath = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Attachment folder path")
			.setDesc("Default path for attachments (images, files).")
			.addText((text) => {
				text.setPlaceholder("Same folder as current file")
					.setValue(settings.attachmentFolder)
					.onChange((val) => {
						settings.attachmentFolder = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Deleted files")
			.setDesc("What to do with deleted files.")
			.addDropdown((dd) => {
				dd.addOption("trash", "Move to system trash")
					.addOption("permanent", "Permanently delete")
					.setValue(settings.deleteOption)
					.onChange((val) => {
						settings.deleteOption = val as any;
						saveSettings(settings);
					});
			});
	}
}




