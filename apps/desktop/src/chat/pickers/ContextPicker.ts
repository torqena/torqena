import { TFile } from "obsidian";

/**
 * Manages the context picker dropdown UI that appears when user types '#'
 * Allows users to quickly attach notes as context
 */
export class ContextPicker {
	private containerEl: HTMLElement;
	private inputEl: HTMLDivElement;  // contenteditable div
	private visible = false;
	private selectedIndex = 0;
	private filteredItems: TFile[] = [];
	private getFiles: () => TFile[];
	private onSelect: (file: TFile) => void;
	private hashRange: Range | null = null;  // Track the # and query text position

	constructor(options: {
		containerEl: HTMLElement;
		inputEl: HTMLDivElement;
		getFiles: () => TFile[];
		onSelect: (file: TFile) => void;
	}) {
		this.containerEl = options.containerEl;
		this.inputEl = options.inputEl;
		this.getFiles = options.getFiles;
		this.onSelect = options.onSelect;
	}

	/**
	 * Check if the picker is currently visible
	 */
	isVisible(): boolean {
		return this.visible;
	}

	/**
	 * Handle input changes to detect context picker trigger (#)
	 * Works with contenteditable div
	 */
	handleInput(): void {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			this.hide();
			return;
		}
		
		const range = selection.getRangeAt(0);
		if (!this.inputEl.contains(range.commonAncestorContainer)) {
			this.hide();
			return;
		}
		
		// Get text before cursor in the current text node
		const node = range.startContainer;
		if (node.nodeType !== Node.TEXT_NODE) {
			this.hide();
			return;
		}
		
		const textBeforeCursor = node.textContent?.slice(0, range.startOffset) || "";
		const hashMatch = textBeforeCursor.match(/(^|\s)#([^\s]*)$/);
		
		if (hashMatch) {
			// Store the range of the # and query for later removal
			const hashIndex = textBeforeCursor.lastIndexOf('#');
			this.hashRange = document.createRange();
			this.hashRange.setStart(node, hashIndex);
			this.hashRange.setEnd(node, range.startOffset);
			
			this.show();
			this.update(hashMatch[2] || ""); // The text after #
		} else {
			this.hashRange = null;
			this.hide();
		}
	}

	/**
	 * Handle keyboard navigation
	 * @returns true if the key was handled, false otherwise
	 */
	handleKeyDown(e: KeyboardEvent): boolean {
		if (!this.visible) return false;
		
		if (e.key === "ArrowDown") {
			e.preventDefault();
			this.selectedIndex = Math.min(
				this.selectedIndex + 1,
				this.filteredItems.length - 1
			);
			this.highlightItem();
			return true;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
			this.highlightItem();
			return true;
		}
		if (e.key === "Enter" || e.key === "Tab") {
			e.preventDefault();
			this.selectCurrent();
			return true;
		}
		if (e.key === "Escape") {
			e.preventDefault();
			this.hide();
			return true;
		}
		return false;
	}

	/**
	 * Show the context picker dropdown
	 */
	show(): void {
		this.visible = true;
		this.selectedIndex = 0;
		this.containerEl.style.display = "block";
	}

	/**
	 * Hide the context picker dropdown
	 */
	hide(): void {
		this.visible = false;
		this.containerEl.style.display = "none";
	}

	/**
	 * Update the context picker with filtered files matching the query
	 */
	update(query: string): void {
		const searchTerm = query.toLowerCase();
		
		// Get all markdown files from the vault
		const allFiles = this.getFiles();
		
		// Filter by search term (match on file name or path)
		this.filteredItems = allFiles.filter(f => 
			f.basename.toLowerCase().includes(searchTerm) ||
			f.path.toLowerCase().includes(searchTerm)
		).slice(0, 10); // Limit to 10 results
		
		// Ensure selected index is within bounds
		this.selectedIndex = Math.min(
			this.selectedIndex,
			Math.max(0, this.filteredItems.length - 1)
		);
		
		// Render the picker
		this.render();
	}

	/**
	 * Render the context picker dropdown (VS Code style: name on left, path on right)
	 */
	private render(): void {
		this.containerEl.empty();
		
		if (this.filteredItems.length === 0) {
			const emptyEl = this.containerEl.createDiv({ cls: "vc-context-picker-empty" });
			emptyEl.setText("No files found");
			return;
		}
		
		// Add items (VS Code style: name on left, path on right)
		this.filteredItems.forEach((file, index) => {
			const itemEl = this.containerEl.createDiv({ 
				cls: `vc-context-picker-item ${index === this.selectedIndex ? 'vc-selected' : ''}`
			});
			
			// File name on the left
			const nameEl = itemEl.createDiv({ cls: "vc-context-picker-name" });
			nameEl.setText(file.basename);
			
			// Path on the right
			const pathEl = itemEl.createDiv({ cls: "vc-context-picker-path" });
			pathEl.setText(file.parent?.path || "");
			
			// Click handler
			itemEl.addEventListener("click", () => {
				this.selectedIndex = index;
				this.selectCurrent();
			});
			
			// Hover handler
			itemEl.addEventListener("mouseenter", () => {
				this.selectedIndex = index;
				this.highlightItem();
			});
		});
	}

	/**
	 * Highlight the currently selected context picker item
	 */
	private highlightItem(): void {
		const items = this.containerEl.querySelectorAll(".vc-context-picker-item");
		items.forEach((item, index) => {
			if (index === this.selectedIndex) {
				item.addClass("vc-selected");
				(item as HTMLElement).scrollIntoView({ block: "nearest" });
			} else {
				item.removeClass("vc-selected");
			}
		});
	}

	/**
	 * Select the currently highlighted file from the context picker
	 * Calls onSelect callback and removes the #query text
	 */
	private selectCurrent(): void {
		const selectedFile = this.filteredItems[this.selectedIndex];
		if (!selectedFile) {
			this.hide();
			return;
		}
		
		// Hide the picker
		this.hide();
		
		// Remove the #query text from contenteditable using stored range
		if (this.hashRange) {
			const selection = window.getSelection();
			if (selection) {
				// Delete the # and query text
				this.hashRange.deleteContents();
				
				// Place cursor at the deletion point
				selection.removeAllRanges();
				selection.addRange(this.hashRange);
			}
			this.hashRange = null;
		}
		
		// Call onSelect to insert inline chip at cursor position
		this.onSelect(selectedFile);
		
		this.inputEl.focus();
	}
}
