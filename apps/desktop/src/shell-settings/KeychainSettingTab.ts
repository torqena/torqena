/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module KeychainSettingTab
 * @description Keychain settings panel for managing encrypted secrets.
 * Provides a searchable list of secrets with add, edit, and delete capabilities.
 * Uses Electron safeStorage for OS-level encryption when available.
 *
 * @since 0.0.28
 */

import { Setting } from "../platform/ui/Setting.js";
import { setIcon } from "../platform/utils/icons.js";
import { SettingTab } from "./SettingTab.js";
import type { App } from "../platform/core/App.js";

/** Regex for validating secret IDs: lowercase letters, numbers, and dashes only. */
const SECRET_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

interface SecretEntry {
	id: string;
	lastAccessed: number | null;
	createdAt?: number;
	updatedAt?: number;
}

export class KeychainSettingTab extends SettingTab {
	/** Cached secrets list for filtering. */
	private secrets: SecretEntry[] = [];

	/** Current search query. */
	private searchQuery = "";

	/** Container for the secrets list. */
	private listContainer: HTMLElement | null = null;

	constructor(app: App) {
		super(app, "keychain", "Keychain", "key-round");
	}

	/**
	 * Render the Keychain settings content.
	 */
	display(): void {
		const el = this.containerEl;
		el.empty();

		// Header row: "Secrets" heading with add button
		const headerRow = el.createDiv("ws-keychain-header");
		const heading = headerRow.createEl("h3", { text: "Secrets" });
		heading.addClass("ws-keychain-heading");

		const addBtn = headerRow.createEl("button", { cls: "ws-keychain-add-btn clickable-icon" });
		setIcon(addBtn, "plus");
		addBtn.setAttribute("aria-label", "Add secret");
		addBtn.addEventListener("click", () => this.showAddForm());

		// Search bar
		const searchContainer = el.createDiv("ws-keychain-search");
		const searchIcon = searchContainer.createSpan("ws-keychain-search-icon");
		setIcon(searchIcon, "search");
		const searchInput = searchContainer.createEl("input", {
			type: "search",
			placeholder: "Find secret...",
			cls: "ws-keychain-search-input",
		}) as HTMLInputElement;
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value.toLowerCase();
			this.renderList();
		});

		// Secrets list container
		this.listContainer = el.createDiv("ws-keychain-list");

		// Load and render
		this.loadSecrets();
	}

	/**
	 * Load secrets from storage and render the list.
	 */
	private async loadSecrets(): Promise<void> {
		try {
			this.secrets = await this.app.listSecrets();
			// Sort by most recently created/updated
			this.secrets.sort((a, b) => {
				const aTime = (a as any).updatedAt || (a as any).createdAt || 0;
				const bTime = (b as any).updatedAt || (b as any).createdAt || 0;
				return bTime - aTime;
			});
		} catch {
			this.secrets = [];
		}
		this.renderList();
	}

	/**
	 * Render the filtered secrets list.
	 */
	private renderList(): void {
		if (!this.listContainer) return;
		this.listContainer.empty();

		const filtered = this.searchQuery
			? this.secrets.filter((s) => s.id.toLowerCase().includes(this.searchQuery))
			: this.secrets;

		if (filtered.length === 0) {
			const empty = this.listContainer.createDiv("ws-keychain-empty");
			empty.textContent = this.secrets.length === 0
				? "No secrets stored."
				: "No matching secrets.";
			return;
		}

		for (const secret of filtered) {
			this.renderSecretItem(secret);
		}
	}

	/**
	 * Render a single secret list item.
	 */
	private renderSecretItem(secret: SecretEntry): void {
		if (!this.listContainer) return;

		const item = this.listContainer.createDiv("ws-keychain-item");

		const info = item.createDiv("ws-keychain-item-info");
		info.createDiv({ text: secret.id, cls: "ws-keychain-item-name" });
		const timeText = secret.lastAccessed
			? this.formatRelativeTime(secret.lastAccessed)
			: "Never accessed";
		info.createDiv({ text: timeText, cls: "ws-keychain-item-time" });

		const actions = item.createDiv("ws-keychain-item-actions");

		const editBtn = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Edit" } });
		setIcon(editBtn, "pencil");
		editBtn.addEventListener("click", () => this.showEditForm(secret.id));

		const deleteBtn = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Delete" } });
		setIcon(deleteBtn, "trash-2");
		deleteBtn.addEventListener("click", () => this.deleteSecret(secret.id));
	}

	/**
	 * Show the inline add form.
	 */
	private showAddForm(): void {
		this.showForm(null);
	}

	/**
	 * Show the inline edit form for an existing secret.
	 */
	private async showEditForm(id: string): Promise<void> {
		this.showForm(id);
	}

	/**
	 * Show the inline add/edit form. If id is provided, it's an edit.
	 */
	private async showForm(existingId: string | null): Promise<void> {
		if (!this.listContainer) return;

		// Remove any existing form
		this.containerEl.querySelector(".ws-keychain-form")?.remove();

		const isEdit = existingId !== null;

		const form = this.containerEl.createDiv("ws-keychain-form");
		// Insert form after search, before list
		this.listContainer.before(form);

		const formTitle = form.createEl("h4", {
			text: isEdit ? "Edit secret" : "Add secret",
			cls: "ws-keychain-form-title",
		});

		// Close button for the form
		const closeBtn = formTitle.createEl("button", { cls: "ws-keychain-form-close clickable-icon" });
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", () => form.remove());

		let idValue = existingId || "";
		let secretValue = "";
		let errorEl: HTMLElement | null = null;

		// ID field
		const idSetting = new Setting(form)
			.setName("ID")
			.setDesc("Lowercase letters, numbers and dashes only.")
			.addText((text) => {
				text.setPlaceholder("my-api-key")
					.setValue(idValue)
					.onChange((val) => { idValue = val; });
				if (isEdit) {
					text.setDisabled(true);
				}
			});

		// Secret field with show/hide toggle
		const secretSetting = new Setting(form)
			.setName("Secret")
			.setDesc("Enter your secret.");

		// Build password field manually for show/hide toggle
		const secretControl = secretSetting.controlEl;
		const secretWrapper = secretControl.createDiv("ws-keychain-secret-wrapper");

		const toggleVisBtn = secretWrapper.createEl("button", {
			cls: "ws-keychain-toggle-vis clickable-icon",
			attr: { "aria-label": "Toggle visibility" },
		});
		setIcon(toggleVisBtn, "eye-off");

		const secretInput = secretWrapper.createEl("input", {
			type: "password",
			cls: "ws-keychain-secret-input",
			placeholder: "",
		}) as HTMLInputElement;

		let isVisible = false;
		toggleVisBtn.addEventListener("click", () => {
			isVisible = !isVisible;
			secretInput.type = isVisible ? "text" : "password";
			setIcon(toggleVisBtn, isVisible ? "eye" : "eye-off");
		});

		secretInput.addEventListener("input", () => {
			secretValue = secretInput.value;
		});

		// If editing, pre-fill the secret value
		if (isEdit && existingId) {
			try {
				const existing = await this.app.loadSecret(existingId);
				if (existing) {
					secretInput.value = existing;
					secretValue = existing;
				}
			} catch { /* ignore */ }
		}

		// Error message area
		errorEl = form.createDiv("ws-keychain-form-error");

		// Action buttons
		const btnRow = form.createDiv("ws-keychain-form-buttons");
		const saveBtn = btnRow.createEl("button", { text: "Save", cls: "mod-cta" });
		const cancelBtn = btnRow.createEl("button", { text: "Cancel" });

		saveBtn.addEventListener("click", async () => {
			// Validate ID
			const trimmedId = idValue.trim();
			if (!trimmedId) {
				this.showFormError(errorEl!, "ID is required.");
				return;
			}
			if (!SECRET_ID_PATTERN.test(trimmedId)) {
				this.showFormError(errorEl!, "ID must contain only lowercase letters, numbers, and dashes, and start with a letter or number.");
				return;
			}
			if (!secretValue) {
				this.showFormError(errorEl!, "Secret value is required.");
				return;
			}

			// Check for duplicate ID when adding
			if (!isEdit && this.secrets.some((s) => s.id === trimmedId)) {
				this.showFormError(errorEl!, "A secret with this ID already exists.");
				return;
			}

			try {
				await this.app.saveSecret(trimmedId, secretValue);
				form.remove();
				await this.loadSecrets();
			} catch (e) {
				this.showFormError(errorEl!, `Failed to save: ${e instanceof Error ? e.message : String(e)}`);
			}
		});

		cancelBtn.addEventListener("click", () => form.remove());

		// Focus the appropriate field
		if (isEdit) {
			secretInput.focus();
		} else {
			const idInput = idSetting.controlEl.querySelector("input");
			if (idInput) idInput.focus();
		}
	}

	/**
	 * Show an error message in the form.
	 */
	private showFormError(el: HTMLElement, message: string): void {
		el.textContent = message;
		el.style.display = "block";
		setTimeout(() => {
			el.style.display = "none";
		}, 5000);
	}

	/**
	 * Delete a secret after confirmation.
	 */
	private async deleteSecret(id: string): Promise<void> {
		// Simple confirmation
		const confirmed = confirm(`Delete secret "${id}"?`);
		if (!confirmed) return;

		try {
			await this.app.deleteSecret(id);
			await this.loadSecrets();
		} catch (e) {
			console.error("[keychain] Failed to delete secret:", e);
		}
	}

	/**
	 * Format a timestamp as relative time (e.g., "5 minutes ago", "2 hours ago").
	 */
	private formatRelativeTime(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;

		const seconds = Math.floor(diff / 1000);
		if (seconds < 60) return "just now";

		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;

		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;

		const days = Math.floor(hours / 24);
		if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;

		const months = Math.floor(days / 30);
		return `${months} month${months !== 1 ? "s" : ""} ago`;
	}
}




