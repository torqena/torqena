/**
 * File suggester for settings inputs
 * Provides inline autocomplete for file paths in text inputs
 */
import { AbstractInputSuggest, App, TAbstractFile, TFile, TFolder } from "obsidian";

/**
 * Options for the file suggester
 */
export interface FileSuggestOptions {
	/** File extension filter (e.g., "md" for markdown files) */
	extension?: string;
	/** Only show files matching this suffix (e.g., ".voice-agent.md") */
	suffix?: string;
	/** Placeholder text */
	placeholder?: string;
}

/**
 * Inline file path suggester for text inputs
 * Shows suggestions as you type, similar to Obsidian's native file pickers
 */
export class FileSuggest extends AbstractInputSuggest<TFile> {
	private extension?: string;
	private suffix?: string;
	private textInputEl: HTMLInputElement;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
		options: FileSuggestOptions = {}
	) {
		super(app, inputEl);
		this.textInputEl = inputEl;
		this.extension = options.extension;
		this.suffix = options.suffix;
		
		if (options.placeholder) {
			inputEl.placeholder = options.placeholder;
		}
	}

	getSuggestions(inputStr: string): TFile[] {
		const lowerInput = inputStr.toLowerCase();
		const files = this.app.vault.getFiles();
		
		return files.filter((file) => {
			// Filter by extension if specified
			if (this.extension && file.extension !== this.extension) {
				return false;
			}
			
			// Filter by suffix if specified
			if (this.suffix && !file.name.endsWith(this.suffix)) {
				return false;
			}
			
			// Match input string against path
			return file.path.toLowerCase().includes(lowerInput);
		}).slice(0, 20); // Limit results
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.createEl("div", { text: file.path, cls: "suggestion-content" });
	}

	selectSuggestion(file: TFile): void {
		this.textInputEl.value = file.path;
		this.textInputEl.trigger("input");
		this.close();
	}
}

/**
 * Folder path suggester for text inputs
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private textInputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.textInputEl = inputEl;
	}

	getSuggestions(inputStr: string): TFolder[] {
		const lowerInput = inputStr.toLowerCase();
		const folders: TFolder[] = [];
		
		// Get all folders recursively
		const collectFolders = (folder: TAbstractFile) => {
			if (folder instanceof TFolder) {
				if (folder.path.toLowerCase().includes(lowerInput) || lowerInput === "") {
					folders.push(folder);
				}
				for (const child of folder.children) {
					collectFolders(child);
				}
			}
		};
		
		collectFolders(this.app.vault.getRoot());
		
		return folders.slice(0, 20); // Limit results
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.createEl("div", { text: folder.path || "/", cls: "suggestion-content" });
	}

	selectSuggestion(folder: TFolder): void {
		this.textInputEl.value = folder.path;
		this.textInputEl.trigger("input");
		this.close();
	}
}
