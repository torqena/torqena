/**
 * @module SecretCreationModal
 * @description Modal for creating and storing secrets in Obsidian's Keychain.
 *
 * Provides a secure UI for saving API keys and other sensitive credentials
 * that are stored in Obsidian's native SecretStorage.
 *
 * @example
 * ```typescript
 * const modal = new SecretCreationModal(app, {
 *   title: 'Save OpenAI API Key',
 *   description: 'Stored securely in Obsidian Keychain',
 *   defaultId: 'openai-prod',
 *   placeholder: 'sk-...',
 *   onSubmit: (id, value) => console.log('Saved:', id),
 * });
 * modal.open();
 * ```
 *
 * @see {@link AIProviderProfileModal} for profile creation
 * @since 0.0.1
 */

import { App, Modal, Setting } from "obsidian";

/**
 * Options for configuring the SecretCreationModal.
 */
export interface SecretCreationOptions {
	/** Title displayed at the top of the modal */
	title: string;
	/** Optional description text below the title */
	description?: string;
	/** Default ID for the secret name field */
	defaultId: string;
	/** Placeholder text for the secret value input */
	placeholder?: string;
	/** Callback when secret is successfully submitted */
	onSubmit: (secretId: string, secretValue: string) => void;
}

/**
 * Modal for creating secrets stored in Obsidian's Keychain.
 *
 * This modal provides a secure interface for users to save API keys
 * and other sensitive credentials. The secrets are stored using
 * Obsidian's native SecretStorage API which uses the system keychain.
 *
 * @example
 * ```typescript
 * const modal = new SecretCreationModal(app, {
 *   title: 'Save Azure API Key',
 *   defaultId: 'azure-openai-key',
 *   onSubmit: (id, value) => {
 *     app.secretStorage!.setSecret(id, value);
 *   },
 * });
 * modal.open();
 * ```
 *
 * @internal Used by AIProviderProfileModal for API key management
 */
export class SecretCreationModal extends Modal {
	private secretId: string;
	private secretValue = "";

	/**
	 * Creates a new SecretCreationModal.
	 *
	 * @param app - The Obsidian App instance
	 * @param options - Configuration options for the modal
	 */
	constructor(app: App, private readonly options: SecretCreationOptions) {
		super(app);
		this.secretId = options.defaultId;
	}

	/**
	 * Called when the modal is opened. Renders the UI.
	 */
	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("vc-secret-modal");
		contentEl.createEl("h2", { text: this.options.title });

		if (this.options.description) {
			contentEl.createEl("p", { text: this.options.description, cls: "vc-status-desc" });
		}

		new Setting(contentEl)
			.setName("Secret name")
			.setDesc("This label appears in Obsidian's Keychain")
			.addText((text) => {
				text.setPlaceholder("openai-production");
				text.setValue(this.secretId);
				text.onChange((value) => {
					this.secretId = value.trim();
				});
			});

		new Setting(contentEl)
			.setName("Secret value")
			.setDesc("Paste the API key")
			.addText((text) => {
				text.setPlaceholder(this.options.placeholder ?? "sk-...");
				text.inputEl.type = "password";
				text.inputEl.autocomplete = "off";
				text.inputEl.spellcheck = false;
				text.onChange((value) => {
					this.secretValue = value.trim();
				});
			});

		const buttonBar = contentEl.createDiv({ cls: "modal-button-container" });
		const cancelBtn = buttonBar.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
		const saveBtn = buttonBar.createEl("button", { text: "Save", cls: "mod-cta" });
		saveBtn.addEventListener("click", () => this.handleSubmit());
	}

	/**
	 * Handles the submit action, validating inputs and calling onSubmit.
	 */
	private handleSubmit(): void {
		const trimmedId = this.secretId.trim();
		if (!trimmedId) {
			console.error("Provide a secret name.");
			return;
		}
		if (!this.secretValue) {
			console.error("Provide a secret value.");
			return;
		}
		this.options.onSubmit(trimmedId, this.secretValue);
		this.secretValue = "";
		this.close();
	}
}
