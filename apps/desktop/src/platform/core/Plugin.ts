/**
 * Plugin — base class for Obsidian plugins.
 *
 * Replicates Obsidian's Plugin class: command/view/settingTab registration,
 * data persistence, ribbon icons, and status bar items.
 */

import { Component } from "./Component.js";
import { App } from "./App.js";
import { viewRegistry, type ViewCreator } from "../workspace/WorkspaceLeaf.js";
import type { ItemView } from "../ui/ItemView.js";
import type { PluginSettingTab } from "../ui/PluginSettingTab.js";
import { setIcon } from "../utils/icons.js";

/** Manifest shape matching Obsidian's PluginManifest. */
export interface PluginManifest {
	id: string;
	name: string;
	version: string;
	minAppVersion?: string;
	description?: string;
	author?: string;
	authorUrl?: string;
	isDesktopOnly?: boolean;
}

/** Command shape matching Obsidian's Command. */
export interface Command {
	id: string;
	name: string;
	callback?: () => any;
	checkCallback?: (checking: boolean) => boolean | void;
	icon?: string;
	hotkeys?: Array<{ modifiers: string[]; key: string }>;
}

export class Plugin extends Component {
	app: App;
	manifest: PluginManifest;

	/** All commands registered by this plugin. */
	private _commands: Command[] = [];

	/** All setting tabs registered. */
	private _settingTabs: PluginSettingTab[] = [];

	/** Data storage key for localStorage. */
	private _storageKey: string;

	constructor(app: App, manifest: PluginManifest) {
		super();
		this.app = app;
		this.manifest = manifest;
		this._storageKey = `plugin:${manifest.id}:data`;
	}

	/** Register a command. */
	addCommand(command: Command): Command {
		this._commands.push(command);
		return command;
	}

	/** Get all registered commands. */
	getCommands(): Command[] {
		return this._commands;
	}

	/**
	 * Add an icon to the left ribbon bar.
	 * Returns the created button element.
	 */
	addRibbonIcon(
		icon: string,
		title: string,
		callback: (evt: MouseEvent) => any,
	): HTMLElement {
		const container = document.querySelector(".workspace-ribbon.mod-left")
			|| document.querySelector(".workspace-ribbon");
		const btn = document.createElement("div");
		btn.addClass("side-dock-ribbon-action");
		btn.setAttribute("aria-label", title);
		btn.setAttribute("title", title);
		setIcon(btn, icon);
		btn.addEventListener("click", callback);
		if (container) {
			container.appendChild(btn);
		}
		return btn;
	}

	/** Add a status bar item. Returns the created element. */
	addStatusBarItem(): HTMLElement {
		const statusBar = document.querySelector(".status-bar");
		const item = document.createElement("div");
		item.addClass("status-bar-item");
		if (statusBar) {
			statusBar.appendChild(item);
		}
		return item;
	}

	/** Register a settings tab. */
	addSettingTab(settingTab: PluginSettingTab): void {
		this._settingTabs.push(settingTab);
		this.app._settingTabs.push(settingTab);
	}

	/** Get all registered setting tabs. */
	getSettingTabs(): PluginSettingTab[] {
		return this._settingTabs;
	}

	/**
	 * Register a view factory for a given view type.
	 * When the workspace needs to create a view of this type, it calls the factory.
	 */
	registerView(
		type: string,
		viewCreator: (leaf: import("../workspace/WorkspaceLeaf.js").WorkspaceLeaf) => ItemView,
	): void {
		viewRegistry.set(type, viewCreator as ViewCreator);
	}

	/** Load persisted plugin data. */
	async loadData(): Promise<any> {
		try {
			const raw = localStorage.getItem(this._storageKey);
			return raw ? JSON.parse(raw) : {};
		} catch {
			return {};
		}
	}

	/** Persist plugin data. */
	async saveData(data: any): Promise<void> {
		localStorage.setItem(this._storageKey, JSON.stringify(data));
	}
}
