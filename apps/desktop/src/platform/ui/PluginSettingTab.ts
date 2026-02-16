/**
 * PluginSettingTab — base class for plugin settings tabs.
 *
 * Replicates Obsidian's PluginSettingTab which provides a containerEl
 * and display()/hide() lifecycle.
 */

import type { App } from "../core/App.js";
import type { Plugin } from "../core/Plugin.js";

export abstract class PluginSettingTab {
	app: App;
	plugin: Plugin;

	/** Container element into which the settings UI is rendered. */
	containerEl: HTMLElement;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = document.createElement("div");
		this.containerEl.addClass("vertical-tab-content");
	}

	/** Override to render settings. Called when the tab becomes visible. */
	abstract display(): void;

	/** Called when the tab is hidden. Clears the container by default. */
	hide(): void {
		this.containerEl.empty();
	}
}
