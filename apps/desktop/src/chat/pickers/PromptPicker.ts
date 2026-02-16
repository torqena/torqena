import { CachedPromptInfo } from "../../ai/customization/PromptCache";
import { CachedSkillInfo } from "../../ai/customization/SkillCache";
import { SLASH_COMMANDS } from "../processing/SlashCommands";

/**
 * Type of picker item — used for visual badges and routing
 */
type PickerItemType = 'builtin' | 'prompt' | 'skill';

/**
 * Extended picker item with type information for badges and routing
 */
interface PickerItem extends CachedPromptInfo {
	/** Item type for badge display and selection routing */
	itemType: PickerItemType;
}

/**
 * Manages the prompt picker dropdown UI that appears when user types '/'
 * Shows built-in commands, custom prompts, and agent skills
 */
export class PromptPicker {
	private containerEl: HTMLElement;
	private inputEl: HTMLDivElement;  // contenteditable div
	private visible = false;
	private selectedIndex = 0;
	private filteredItems: PickerItem[] = [];
	private onSelect: (prompt: CachedPromptInfo) => Promise<void>;
	private onSelectSkill?: (skill: CachedSkillInfo) => Promise<void>;
	private getPrompts: () => CachedPromptInfo[];
	private getSkills: () => CachedSkillInfo[];
	private justSelected = false;  // Flag to prevent Enter auto-submit after selection

	constructor(options: {
		containerEl: HTMLElement;
		inputEl: HTMLDivElement;
		getPrompts: () => CachedPromptInfo[];
		getSkills?: () => CachedSkillInfo[];
		onSelect: (prompt: CachedPromptInfo) => Promise<void>;
		onSelectSkill?: (skill: CachedSkillInfo) => Promise<void>;
	}) {
		this.containerEl = options.containerEl;
		this.inputEl = options.inputEl;
		this.getPrompts = options.getPrompts;
		this.getSkills = options.getSkills || (() => []);
		this.onSelect = options.onSelect;
		this.onSelectSkill = options.onSelectSkill;
	}

	/**
	 * Check if the picker is currently visible
	 */
	isVisible(): boolean {
		return this.visible;
	}

	/**
	 * Check if a selection just happened (and clear the flag)
	 * Used to prevent Enter from auto-submitting right after selection
	 */
	checkAndClearJustSelected(): boolean {
		if (this.justSelected) {
			this.justSelected = false;
			return true;
		}
		return false;
	}

	/**
	 * Handle input changes to detect prompt picker trigger
	 * Works with contenteditable div
	 */
	handleInput(): void {
		const value = this.inputEl.innerText || "";
		
		// Check if the user is typing a prompt command (starts with /)
		if (value.startsWith('/') && !value.includes(' ')) {
			this.show();
			this.update(value);
		} else {
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
	 * Show the prompt picker dropdown
	 */
	show(): void {
		this.visible = true;
		this.selectedIndex = 0;
		this.containerEl.style.display = "block";
	}

	/**
	 * Hide the prompt picker dropdown
	 */
	hide(): void {
		this.visible = false;
		this.containerEl.style.display = "none";
	}

	/**
	 * Update the prompt picker with filtered items matching the query
	 */
	update(query: string): void {
		// Get the search term (remove the leading /)
		const searchTerm = query.slice(1).toLowerCase();
		
		// Get prompts from cache
		const allPrompts = this.getPrompts();
		
		// Get skills from cache
		const allSkills = this.getSkills();
		
		// Built-in slash commands
		const builtInItems: PickerItem[] = SLASH_COMMANDS.map(cmd => ({
			name: cmd.name,
			description: cmd.description,
			path: `builtin:${cmd.name}`,
			itemType: 'builtin' as PickerItemType,
		}));
		
		// Custom prompts
		const promptItems: PickerItem[] = allPrompts.map(p => ({
			...p,
			itemType: 'prompt' as PickerItemType,
		}));
		
		// Skills as picker items
		const skillItems: PickerItem[] = allSkills.map(s => ({
			name: s.name,
			description: s.description,
			path: `skill:${s.path}`,
			itemType: 'skill' as PickerItemType,
		}));
		
		// Combine and filter
		const allItems = [...builtInItems, ...promptItems, ...skillItems];
		this.filteredItems = allItems.filter(p => 
			p.name.toLowerCase().includes(searchTerm) ||
			p.description.toLowerCase().includes(searchTerm)
		);
		
		// Ensure selected index is within bounds
		this.selectedIndex = Math.min(
			this.selectedIndex,
			Math.max(0, this.filteredItems.length - 1)
		);
		
		// Render the picker
		this.render();
	}

	/**
	 * Render the prompt picker dropdown
	 */
	private render(): void {
		this.containerEl.empty();
		
		if (this.filteredItems.length === 0) {
			const emptyEl = this.containerEl.createDiv({ cls: "vc-prompt-picker-empty" });
			emptyEl.setText("No prompts found");
			return;
		}
		
		// Add items (VS Code style: badge + command on left, description on right)
		this.filteredItems.forEach((item, index) => {
			const itemEl = this.containerEl.createDiv({ 
				cls: `vc-prompt-picker-item ${index === this.selectedIndex ? 'vc-selected' : ''}`
			});
			
			// Left side: badge + name
			const leftEl = itemEl.createDiv({ cls: "vc-prompt-picker-left" });
			
			// Type badge
			if (item.itemType !== 'builtin') {
				const badgeEl = leftEl.createSpan({ cls: `vc-prompt-picker-badge vc-badge-${item.itemType}` });
				badgeEl.setText(item.itemType);
			}
			
			// Command name
			const nameEl = leftEl.createSpan({ cls: "vc-prompt-picker-name" });
			nameEl.setText(`/${item.name}`);
			
			// Description on the right
			const descEl = itemEl.createDiv({ cls: "vc-prompt-picker-desc" });
			descEl.setText(item.description);
			
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
	 * Highlight the currently selected prompt picker item
	 */
	private highlightItem(): void {
		const items = this.containerEl.querySelectorAll(".vc-prompt-picker-item");
		items.forEach((item, index) => {
			if (index === this.selectedIndex) {
				item.addClass("vc-selected");
				// Scroll into view if needed
				(item as HTMLElement).scrollIntoView({ block: "nearest" });
			} else {
				item.removeClass("vc-selected");
			}
		});
	}

	/**
	 * Select the currently highlighted item from the picker
	 */
	private async selectCurrent(): Promise<void> {
		const selectedItem = this.filteredItems[this.selectedIndex];
		if (!selectedItem) {
			this.hide();
			return;
		}
		
		// Hide the picker
		this.hide();
		
		// Set flag to prevent Enter from auto-submitting
		this.justSelected = true;
		
		// Insert the item name into the input field
		// Replace spaces with hyphens for slash command compatibility
		const normalizedName = selectedItem.name.replace(/\s+/g, '-');
		
		// Show argument-hint as ghost text if available
		const hint = selectedItem.argumentHint;
		if (hint) {
			this.inputEl.innerHTML = '';
			const textNode = document.createTextNode(`/${normalizedName} `);
			this.inputEl.appendChild(textNode);
			const hintSpan = document.createElement('span');
			hintSpan.className = 'vc-prompt-picker-hint';
			hintSpan.textContent = hint;
			hintSpan.contentEditable = 'false';
			this.inputEl.appendChild(hintSpan);
		} else {
			this.inputEl.innerText = `/${normalizedName} `;
		}
		
		this.inputEl.focus();
		
		// Move cursor to after the command name (before hint if present)
		const range = document.createRange();
		const textNode = this.inputEl.firstChild;
		if (textNode) {
			range.setStartAfter(textNode);
			range.collapse(true);
		} else {
			range.selectNodeContents(this.inputEl);
			range.collapse(false);
		}
		const sel = window.getSelection();
		if (sel) {
			sel.removeAllRanges();
			sel.addRange(range);
		}
		
		// Trigger input event to update any listeners
		this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
	}
}
