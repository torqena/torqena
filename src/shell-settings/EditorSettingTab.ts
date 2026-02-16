/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module EditorSettingTab
 * @description Editor settings matching Obsidian's full Editor settings panel:
 * general, display, behavior, and advanced sections.
 */

import { Setting } from "../platform/ui/Setting.js";
import { SettingTab } from "./SettingTab.js";
import { loadSettings, saveSettings } from "./WebShellSettings.js";
import type { App } from "../platform/core/App.js";

export class EditorSettingTab extends SettingTab {
	constructor(app: App) {
		super(app, "editor", "Editor", "pencil");
	}

	display(): void {
		const el = this.containerEl;
		el.empty();

		const settings = loadSettings();

		// ── Top section (no heading) ──

		new Setting(el)
			.setName("Always focus new tabs")
			.setDesc("When you open a link in a new tab, switch to it immediately.")
			.addToggle((toggle) => {
				toggle.setValue(settings.alwaysFocusNewTabs)
					.onChange((val) => {
						settings.alwaysFocusNewTabs = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Default view for new tabs")
			.setDesc("The default view that a new Markdown tab gets opened in.")
			.addDropdown((dd) => {
				dd.addOption("editing", "Editing view")
					.addOption("reading", "Reading view")
					.setValue(settings.defaultViewForNewTabs)
					.onChange((val) => {
						settings.defaultViewForNewTabs = val as "editing" | "reading";
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Default editing mode")
			.setDesc("The default editing mode a new tab will start with.")
			.addDropdown((dd) => {
				dd.addOption("live-preview", "Live Preview")
					.addOption("source", "Source mode")
					.setValue(settings.defaultEditingMode)
					.onChange((val) => {
						settings.defaultEditingMode = val as "live-preview" | "source";
						saveSettings(settings);
					});
			});

		// ── Display ──

		new Setting(el).setName("Display").setHeading();

		new Setting(el)
			.setName("Readable line length")
			.setDesc("Limit maximum line length. Less content fits onscreen, but long blocks of text are more readable.")
			.addToggle((toggle) => {
				toggle.setValue(settings.readableLineLength)
					.onChange((val) => {
						settings.readableLineLength = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Strict line breaks")
			.setDesc("Markdown specs ignore single line breaks in reading view. Turn this off to make single line breaks visible.")
			.addToggle((toggle) => {
				toggle.setValue(settings.strictLineBreaks)
					.onChange((val) => {
						settings.strictLineBreaks = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Properties in document")
			.setDesc('Choose how properties are displayed at the top of notes. Select "source" to show properties as raw YAML.')
			.addDropdown((dd) => {
				dd.addOption("visible", "Visible")
					.addOption("hidden", "Hidden")
					.addOption("source", "Source")
					.setValue(settings.propertiesInDocument)
					.onChange((val) => {
						settings.propertiesInDocument = val as "visible" | "hidden" | "source";
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Fold heading")
			.setDesc("Lets you fold all content under a heading.")
			.addToggle((toggle) => {
				toggle.setValue(settings.foldHeadings)
					.onChange((val) => {
						settings.foldHeadings = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Fold indent")
			.setDesc("Lets you fold part of an indentation, such as lists.")
			.addToggle((toggle) => {
				toggle.setValue(settings.foldIndent)
					.onChange((val) => {
						settings.foldIndent = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Line numbers")
			.setDesc("Show line numbers in the gutter.")
			.addToggle((toggle) => {
				toggle.setValue(settings.showLineNumbers)
					.onChange((val) => {
						settings.showLineNumbers = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Indentation guides")
			.setDesc("Show vertical relationship lines between list items.")
			.addToggle((toggle) => {
				toggle.setValue(settings.indentationGuides)
					.onChange((val) => {
						settings.indentationGuides = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Right-to-left (RTL)")
			.setDesc("Sets the default text direction of notes to right-to-left.")
			.addToggle((toggle) => {
				toggle.setValue(settings.rightToLeft)
					.onChange((val) => {
						settings.rightToLeft = val;
						saveSettings(settings);
					});
			});

		// ── Behavior ──

		new Setting(el).setName("Behavior").setHeading();

		new Setting(el)
			.setName("Spellcheck")
			.setDesc("Turn on the spellchecker.")
			.addToggle((toggle) => {
				toggle.setValue(settings.spellcheck)
					.onChange((val) => {
						settings.spellcheck = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Auto-pair brackets")
			.setDesc("Pair brackets and quotes automatically.")
			.addToggle((toggle) => {
				toggle.setValue(settings.autoPairBrackets)
					.onChange((val) => {
						settings.autoPairBrackets = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Auto-pair Markdown syntax")
			.setDesc("Pair symbols automatically for bold, italic, code, and more.")
			.addToggle((toggle) => {
				toggle.setValue(settings.autoPairMarkdownSyntax)
					.onChange((val) => {
						settings.autoPairMarkdownSyntax = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Smart lists")
			.setDesc("Automatically set indentation and place list items correctly.")
			.addToggle((toggle) => {
				toggle.setValue(settings.smartLists)
					.onChange((val) => {
						settings.smartLists = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Indent using tabs")
			.setDesc('Use tabs to indent by pressing the "Tab" key. Turn this off to indent using 4 spaces.')
			.addToggle((toggle) => {
				toggle.setValue(settings.indentUsingTabs)
					.onChange((val) => {
						settings.indentUsingTabs = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Indent visual width")
			.setDesc("Number of spaces a tab character will render as.")
			.addExtraButton((btn) => {
				btn.setIcon("rotate-ccw")
					.setTooltip("Restore default")
					.onClick(() => {
						settings.tabSize = 4;
						saveSettings(settings);
						this.display();
					});
			})
			.addSlider((slider) => {
				slider.setLimits(1, 8, 1)
					.setValue(settings.tabSize)
					.setDynamicTooltip()
					.onChange((val) => {
						settings.tabSize = val;
						saveSettings(settings);
					});
			});

		// ── Advanced ──

		new Setting(el).setName("Advanced").setHeading();

		new Setting(el)
			.setName("Convert pasted HTML to Markdown")
			.setDesc("Automatically convert HTML to Markdown when pasting and drag-and-drop from web pages. Use Ctrl/Cmd+Shift+V to paste HTML without converting.")
			.addToggle((toggle) => {
				toggle.setValue(settings.convertPastedHtmlToMarkdown)
					.onChange((val) => {
						settings.convertPastedHtmlToMarkdown = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Vim key bindings")
			.setDesc("Use Vim key bindings when editing.")
			.addToggle((toggle) => {
				toggle.setValue(settings.vimKeyBindings)
					.onChange((val) => {
						settings.vimKeyBindings = val;
						saveSettings(settings);
					});
			});
	}
}




