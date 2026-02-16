/**
 * Mock for Obsidian API used in testing
 */

import { vi } from "vitest";

// Mock TFile
export class TFile {
	path: string;
	basename: string;
	extension: string;
	name: string;

	constructor(path: string) {
		this.path = path;
		const fileName = path.split("/").pop() || "";
		const dotIndex = fileName.lastIndexOf(".");
		this.extension = dotIndex >= 0 ? fileName.slice(dotIndex + 1) : "";
		this.basename = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
		this.name = fileName;
	}
}

// Mock TFolder
export class TFolder {
	path: string;
	name: string;
	children: (TFile | TFolder)[] = [];

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() || "";
	}
}

// Mock TAbstractFile
export class TAbstractFile {
	path: string;
	name: string;

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() || "";
	}
}

// Mock Vault
export class Vault {
	private files: Map<string, string> = new Map();
	private folders: Set<string> = new Set();

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		if (this.files.has(path)) {
			return new TFile(path);
		}
		if (this.folders.has(path)) {
			return new TFolder(path);
		}
		return null;
	}

	getMarkdownFiles(): TFile[] {
		return Array.from(this.files.keys()).map((path) => new TFile(path));
	}

	getFiles(): TFile[] {
		return Array.from(this.files.keys()).map((path) => new TFile(path));
	}

	async read(file: TFile): Promise<string> {
		return this.files.get(file.path) || "";
	}

	async modify(file: TFile, content: string): Promise<void> {
		this.files.set(file.path, content);
	}

	async create(path: string, content: string): Promise<TFile> {
		this.files.set(path, content);
		return new TFile(path);
	}

	async createFolder(path: string): Promise<TFolder> {
		this.folders.add(path);
		return new TFolder(path);
	}

	async delete(file: TFile | TFolder): Promise<void> {
		this.files.delete(file.path);
		this.folders.delete(file.path);
	}

	// Test helpers
	_setFile(path: string, content: string): void {
		this.files.set(path, content);
	}

	_getFile(path: string): string | undefined {
		return this.files.get(path);
	}

	_clear(): void {
		this.files.clear();
		this.folders.clear();
	}
}

// Mock Workspace
export class Workspace {
	private activeFile: TFile | null = null;

	getActiveFile(): TFile | null {
		return this.activeFile;
	}

	// Test helper
	_setActiveFile(file: TFile | null): void {
		this.activeFile = file;
	}
}

// Mock App
export class App {
	vault: Vault;
	workspace: Workspace;

	constructor() {
		this.vault = new Vault();
		this.workspace = new Workspace();
	}
}

// Mock Notice
export class Notice {
	message: string;
	static instances: Notice[] = [];

	constructor(message: string, _timeout?: number) {
		this.message = message;
		Notice.instances.push(this);
	}

	static _clear(): void {
		Notice.instances = [];
	}

	static _getLastMessage(): string | undefined {
		return Notice.instances[Notice.instances.length - 1]?.message;
	}
}

// Mock Modal
export class Modal {
	app: App;
	contentEl: HTMLElement;
	modalEl: HTMLElement;
	titleEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
		this.contentEl = document.createElement("div");
		this.modalEl = document.createElement("div");
		this.titleEl = document.createElement("div");
	}

	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

// Mock requestUrl for fetch operations
export const requestUrl = vi.fn();

// Mock Platform
export const Platform = {
	isDesktop: true,
	isMobile: false,
	isDesktopApp: true,
	isMobileApp: false,
};

// Mock Plugin
export class Plugin {
	app: App;
	manifest: { id: string; name: string; version: string };

	constructor(app: App, manifest: { id: string; name: string; version: string }) {
		this.app = app;
		this.manifest = manifest;
	}

	loadData = vi.fn().mockResolvedValue({});
	saveData = vi.fn().mockResolvedValue(undefined);
	addCommand = vi.fn();
	addSettingTab = vi.fn();
	registerView = vi.fn();
	registerEvent = vi.fn();
	registerDomEvent = vi.fn();
	registerInterval = vi.fn();
}

// Mock PluginSettingTab
export class PluginSettingTab {
	app: App;
	plugin: Plugin;
	containerEl: HTMLElement;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = document.createElement("div");
	}

	display(): void {}
	hide(): void {}
}

// Mock Setting
export class Setting {
	settingEl: HTMLElement;
	infoEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;

	constructor(_containerEl: HTMLElement) {
		this.settingEl = document.createElement("div");
		this.infoEl = document.createElement("div");
		this.nameEl = document.createElement("div");
		this.descEl = document.createElement("div");
		this.controlEl = document.createElement("div");
	}

	setName(_name: string): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	addText(_cb: (text: TextComponent) => void): this {
		return this;
	}
	addToggle(_cb: (toggle: ToggleComponent) => void): this {
		return this;
	}
	addDropdown(_cb: (dropdown: DropdownComponent) => void): this {
		return this;
	}
	addButton(_cb: (button: ButtonComponent) => void): this {
		return this;
	}
	setClass(_cls: string): this {
		return this;
	}
}

// Component mocks
export class TextComponent {
	setValue = vi.fn().mockReturnThis();
	setPlaceholder = vi.fn().mockReturnThis();
	onChange = vi.fn().mockReturnThis();
}

export class ToggleComponent {
	setValue = vi.fn().mockReturnThis();
	onChange = vi.fn().mockReturnThis();
}

export class DropdownComponent {
	addOption = vi.fn().mockReturnThis();
	setValue = vi.fn().mockReturnThis();
	onChange = vi.fn().mockReturnThis();
}

export class ButtonComponent {
	setButtonText = vi.fn().mockReturnThis();
	setCta = vi.fn().mockReturnThis();
	onClick = vi.fn().mockReturnThis();
}

/**
 * Mock parseYaml function
 * Simple YAML parser for test environments
 */
export function parseYaml(yaml: string): any {
	// Very simple YAML parser for testing
	// This is a basic implementation that handles common YAML structures
	try {
		// Handle empty or null input
		if (!yaml || yaml.trim() === "") {
			return null;
		}

		const lines = yaml.split("\n");
		const result: any = {};
		const stack: any[] = [result];
		let currentIndent = 0;
		let currentKey = "";
		let inMultiline = false;
		let multilineContent = "";
		let multilineKey = "";

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!line) continue;
			const trimmed = line.trim();

			// Skip empty lines and comments
			if (!trimmed || trimmed.startsWith("#")) {
				continue;
			}

			// Handle multiline strings (pipe |)
			if (trimmed.includes(": |")) {
				const key = trimmed.split(":")[0]?.trim() ?? "";
				multilineKey = key;
				inMultiline = true;
				multilineContent = "";
				continue;
			}

			if (inMultiline) {
				if (line.startsWith("  ") || line.startsWith("\t")) {
					multilineContent += line.trim() + "\n";
					continue;
				} else {
					// End of multiline
					inMultiline = false;
					const current = stack[stack.length - 1];
					current[multilineKey] = multilineContent.trim();
					multilineContent = "";
				}
			}

			const indent = line.search(/\S/);
			const isArrayItem = trimmed.startsWith("- ");

			if (isArrayItem) {
				const content = trimmed.substring(2);
				const arrayIndent = indent;

				// Determine parent
				while (stack.length > 1 && arrayIndent <= currentIndent) {
					stack.pop();
					currentIndent = Math.max(0, currentIndent - 2);
				}

				const parent = stack[stack.length - 1];

				if (content.includes(":")) {
					// Object in array
					const obj: any = {};
					const parts = content.split(":");
					const key = parts[0]?.trim() ?? "";
					const value = parts.slice(1).join(":").trim();
					obj[key] = parseValue(value);

					if (!Array.isArray(parent[currentKey])) {
						parent[currentKey] = [];
					}
					parent[currentKey].push(obj);
					stack.push(obj);
					currentIndent = arrayIndent + 2;
				} else {
					// Simple value in array
					if (!Array.isArray(parent[currentKey])) {
						parent[currentKey] = [];
					}
					parent[currentKey].push(parseValue(content));
				}
			} else if (trimmed.includes(":")) {
				// Key-value pair
				const parts = trimmed.split(":");
				const key = parts[0]?.trim() ?? "";
				const value = parts.slice(1).join(":").trim();

				// Adjust stack based on indentation
				while (stack.length > 1 && indent < currentIndent) {
					stack.pop();
					currentIndent = Math.max(0, currentIndent - 2);
				}

				const current = stack[stack.length - 1];

				if (!value || value === "") {
					// New nested object or array coming
					currentKey = key;
					current[key] = current[key] || {};
					stack.push(current[key]);
					currentIndent = indent + 2;
				} else {
					current[key] = parseValue(value);
					currentKey = key;
				}
			}
		}

		return result;
	} catch (error) {
		console.error("YAML parse error:", error);
		return null;
	}
}

function parseValue(value: string): any {
	if (!value) return null;

	const trimmed = value.trim();

	// Boolean
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;

	// Null/undefined
	if (trimmed === "null" || trimmed === "~") return null;

	// Number
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
		return Number(trimmed);
	}

	// String (remove quotes if present)
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}
