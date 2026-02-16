/**
 * Note picker modal for attaching notes to chat context
 */
import { FuzzySuggestModal, TFile } from "obsidian";
import { AIServiceManager as CopilotPlugin } from "../../app/AIServiceManager";

/**
 * Fuzzy suggest modal for selecting notes from the vault
 */
export class NoteSuggestModal extends FuzzySuggestModal<TFile> {
	private onSelect: (file: TFile) => void;

	constructor(plugin: CopilotPlugin, onSelect: (file: TFile) => void) {
		super(plugin.app);
		this.onSelect = onSelect;
		this.setPlaceholder("Select a note to attach...");
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onSelect(file);
	}
}
