/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module SettingTab
 * @description Base class for built-in settings tabs in the web shell.
 * Unlike PluginSettingTab, these do not require a plugin reference.
 */

import type { App } from "../platform/core/App.js";

export abstract class SettingTab {
	app: App;
	id: string;
	name: string;
	icon?: string;
	containerEl: HTMLElement;

	constructor(app: App, id: string, name: string, icon?: string) {
		this.app = app;
		this.id = id;
		this.name = name;
		this.icon = icon;
		this.containerEl = document.createElement("div");
		this.containerEl.addClass("vertical-tab-content");
	}

	/** Render the tab content. */
	abstract display(): void;

	/** Clear the container. */
	hide(): void {
		this.containerEl.empty();
	}
}




