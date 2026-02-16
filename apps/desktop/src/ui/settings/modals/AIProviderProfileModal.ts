/**
 * @module AIProviderProfileModal
 * @description Modal for creating and editing AI Provider profiles.
 *
 * Provides a UI for configuring different AI provider types including
 * OpenAI, Azure OpenAI, and local Whisper servers. Handles API key
 * management through Obsidian's SecretStorage.
 *
 * @example
 * ```typescript
 * // Create new profile
 * const modal = new AIProviderProfileModal(app, null, (profile) => {
 *   settings.aiProviderProfiles.push(profile);
 * });
 * modal.open();
 *
 * // Edit existing profile
 * const editModal = new AIProviderProfileModal(app, existingProfile, (updated) => {
 *   Object.assign(existingProfile, updated);
 * });
 * editModal.open();
 * ```
 *
 * @see {@link SecretCreationModal} for API key management
 * @see {@link AIProviderProfile} for profile types
 * @since 0.0.1
 */

import { App, DropdownComponent, Modal, Setting } from "obsidian";
import {
	AIProviderProfile,
	AIProviderProfileType,
	AzureOpenAIProviderProfile,
	LocalProviderProfile,
	OpenAIProviderProfile,
} from "../types";
import { generateProfileId, getProfileTypeDisplayName } from "../profiles";
import { SecretCreationModal } from "./SecretCreationModal";

/**
 * Modal for creating or editing AI Provider profiles.
 *
 * This modal dynamically renders different fields based on the selected
 * provider type:
 * - **OpenAI**: API key, optional base URL
 * - **Azure OpenAI**: API key, endpoint, deployment name, API version
 * - **Local Whisper**: Server URL
 *
 * API keys are stored securely using Obsidian's SecretStorage API,
 * which leverages the system keychain for credential protection.
 *
 * @example
 * ```typescript
 * const modal = new AIProviderProfileModal(
 *   app,
 *   null, // null for new profile
 *   (profile) => {
 *     // Handle the saved profile
 *     plugin.settings.aiProviderProfiles.push(profile);
 *     plugin.saveSettings();
 *   }
 * );
 * modal.open();
 * ```
 */
export class AIProviderProfileModal extends Modal {
	private profile: Partial<AIProviderProfile>;
	private onSave: (profile: AIProviderProfile) => void;
	private isEdit: boolean;
	private conditionalContainer: HTMLElement | null = null;

	/**
	 * Creates a new AIProviderProfileModal.
	 *
	 * @param app - The Obsidian App instance
	 * @param profile - Existing profile to edit, or null to create new
	 * @param onSave - Callback when profile is saved
	 */
	constructor(app: App, profile: AIProviderProfile | null, onSave: (profile: AIProviderProfile) => void) {
		super(app);
		this.isEdit = profile !== null;
		this.profile = profile ? { ...profile } : {
			id: generateProfileId(),
			name: '',
			type: 'openai',
		};
		this.onSave = onSave;
	}

	/**
	 * Called when the modal is opened. Renders the UI.
	 */
	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('vc-ai-provider-profile-modal');
		contentEl.addClass('vc-profile-modal');

		contentEl.createEl('h2', { text: this.isEdit ? 'Edit AI Provider Profile' : 'Create AI Provider Profile' });

		// Profile name
		new Setting(contentEl)
			.setName('Profile Name')
			.setDesc('A descriptive name for this profile')
			.addText((text) => {
				text.setPlaceholder('My OpenAI Profile');
				text.setValue(this.profile.name || '');
				text.onChange((value) => {
					this.profile.name = value;
				});
			});

		// Profile type (only editable when creating)
		const typeSetting = new Setting(contentEl)
			.setName('Provider Type')
			.setDesc('The type of AI provider');

		if (this.isEdit) {
			// Show as read-only text when editing
			typeSetting.addText((text) => {
				text.setValue(getProfileTypeDisplayName(this.profile.type as AIProviderProfileType));
				text.setDisabled(true);
			});
		} else {
			typeSetting.addDropdown((dropdown) => {
				dropdown.addOption('openai', 'OpenAI');
				dropdown.addOption('azure-openai', 'Azure OpenAI');
				dropdown.addOption('local', 'Local Whisper');
				dropdown.setValue(this.profile.type || 'openai');
				dropdown.onChange((value) => {
					this.profile.type = value as AIProviderProfileType;
					// Reset type-specific fields when changing type
					if (value === 'openai') {
						delete (this.profile as any).endpoint;
						delete (this.profile as any).deploymentName;
						delete (this.profile as any).apiVersion;
						delete (this.profile as any).serverUrl;
						delete (this.profile as any).modelName;
					} else if (value === 'azure-openai') {
						delete (this.profile as any).baseURL;
						delete (this.profile as any).serverUrl;
						delete (this.profile as any).modelName;
					} else if (value === 'local') {
						delete (this.profile as any).apiKeySecretId;
						delete (this.profile as any).baseURL;
						delete (this.profile as any).endpoint;
						delete (this.profile as any).deploymentName;
						delete (this.profile as any).apiVersion;
					}
					this.renderConditionalFields();
				});
			});
		}

		// Container for type-specific fields
		this.conditionalContainer = contentEl.createDiv({ cls: 'vc-profile-conditional' });
		this.renderConditionalFields();

		// Buttons
		const buttonRow = contentEl.createDiv({ cls: 'vc-profile-buttons' });

		const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonRow.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => this.saveProfile());
	}

	/**
	 * Renders fields specific to the selected provider type.
	 */
	private renderConditionalFields(): void {
		if (!this.conditionalContainer) return;
		this.conditionalContainer.empty();

		const type = this.profile.type as AIProviderProfileType;

		if (type === 'openai') {
			this.renderOpenAIFields();
		} else if (type === 'azure-openai') {
			this.renderAzureFields();
		} else if (type === 'local') {
			this.renderLocalFields();
		}
	}

	/**
	 * Generates a unique secret ID with the given prefix.
	 *
	 * @param prefix - Prefix for the secret ID
	 * @param existing - Optional array of existing secret IDs to avoid
	 * @returns A unique secret ID
	 */
	private generateSecretId(prefix: string, existing?: string[]): string {
		const taken = new Set(existing ?? this.app.secretStorage?.listSecrets?.() ?? []);
		let candidate = '';
		do {
			candidate = `${prefix}-${Math.random().toString(36).substring(2, 8)}`;
		} while (taken.has(candidate));
		return candidate;
	}

	/**
	 * Populates a dropdown with available secrets from SecretStorage.
	 *
	 * @param dropdown - The dropdown component to populate
	 * @param selectedId - Optional ID to pre-select
	 */
	private populateSecretDropdown(dropdown: DropdownComponent, selectedId?: string | null): void {
		dropdown.selectEl.empty();
		const storage = this.app.secretStorage;
		if (!storage?.listSecrets) {
			dropdown.addOption('', 'Keychain not available');
			dropdown.setDisabled(true);
			return;
		}

		let secrets: string[] = [];
		try {
			secrets = storage.listSecrets?.() ?? [];
		} catch (error) {
			console.error('[AIProviderProfileModal] Failed to list secrets:', error);
			dropdown.addOption('', 'Unable to load secrets');
			dropdown.setDisabled(true);
			return;
		}

		dropdown.setDisabled(false);
		dropdown.addOption('', secrets.length ? 'Select a secret' : 'No secrets saved');
		secrets.forEach((id) => dropdown.addOption(id, id));
		if (selectedId && secrets.includes(selectedId)) {
			dropdown.setValue(selectedId);
		} else {
			dropdown.setValue('');
		}
	}

	/**
	 * Opens a modal for creating a new secret.
	 *
	 * @param options - Configuration for the secret creation modal
	 */
	private openSecretCreationModal(options: {
		providerName: string;
		prefix: string;
		placeholder?: string;
		onSuccess: (secretId: string) => void;
	}): void {
		if (!this.app.secretStorage) {
			console.error('SecretStorage is not available in this version of Obsidian.');
			return;
		}
		const existing = this.app.secretStorage.listSecrets?.() ?? [];
		const modal = new SecretCreationModal(this.app, {
			title: `Save ${options.providerName} API key`,
			description: 'Secrets are stored securely in Obsidian\'s Keychain and shared across plugins.',
			defaultId: this.generateSecretId(options.prefix, existing),
			placeholder: options.placeholder,
			onSubmit: (secretId, secretValue) => {
				this.app.secretStorage!.setSecret(secretId, secretValue);
				options.onSuccess(secretId);
				console.log(`${options.providerName} API key saved to Keychain.`);
			},
		});
		modal.open();
	}

	/**
	 * Renders OpenAI-specific configuration fields.
	 */
	private renderOpenAIFields(): void {
		const container = this.conditionalContainer!;

		const apiKeySetting = new Setting(container)
			.setName('API key')
			.setDesc('Select an OpenAI API key stored in Obsidian\'s Keychain. Use the (+) button to save a new key.');

		let apiKeyDropdown: DropdownComponent | null = null;
		apiKeySetting.addDropdown((dropdown) => {
			apiKeyDropdown = dropdown;
			this.populateSecretDropdown(dropdown, (this.profile as OpenAIProviderProfile).apiKeySecretId || null);
			dropdown.onChange((value) => {
				(this.profile as OpenAIProviderProfile).apiKeySecretId = value || undefined;
			});
		});

		apiKeySetting.addExtraButton((button) => {
			button.setIcon('plus');
			button.setTooltip('Create new secret');
			button.onClick(() => {
				this.openSecretCreationModal({
					providerName: 'OpenAI',
					prefix: 'openai',
					placeholder: 'sk-...',
					onSuccess: (secretId) => {
						if (apiKeyDropdown) {
							this.populateSecretDropdown(apiKeyDropdown, secretId);
						}
						(this.profile as OpenAIProviderProfile).apiKeySecretId = secretId;
					},
				});
			});
		});

		// Base URL (optional)
		new Setting(container)
			.setName('Base URL')
			.setDesc('Custom API endpoint (optional). Leave empty for default OpenAI API.')
			.addText((text) => {
				text.setPlaceholder('https://api.openai.com/v1');
				text.setValue((this.profile as OpenAIProviderProfile).baseURL || '');
				text.onChange((value) => {
					(this.profile as OpenAIProviderProfile).baseURL = value || undefined;
				});
			});
	}

	/**
	 * Renders Azure OpenAI-specific configuration fields.
	 */
	private renderAzureFields(): void {
		const container = this.conditionalContainer!;

		const apiKeySetting = new Setting(container)
			.setName('API key')
			.setDesc('Select an Azure OpenAI API key stored in Obsidian\'s Keychain. Use (+) to add a new key.');

		let azureKeyDropdown: DropdownComponent | null = null;
		apiKeySetting.addDropdown((dropdown) => {
			azureKeyDropdown = dropdown;
			this.populateSecretDropdown(dropdown, (this.profile as AzureOpenAIProviderProfile).apiKeySecretId || null);
			dropdown.onChange((value) => {
				(this.profile as AzureOpenAIProviderProfile).apiKeySecretId = value || undefined;
			});
		});

		apiKeySetting.addExtraButton((button) => {
			button.setIcon('plus');
			button.setTooltip('Create new secret');
			button.onClick(() => {
				this.openSecretCreationModal({
					providerName: 'Azure OpenAI',
					prefix: 'azure-openai',
					placeholder: 'azure-key-...',
					onSuccess: (secretId) => {
						if (azureKeyDropdown) {
							this.populateSecretDropdown(azureKeyDropdown, secretId);
						}
						(this.profile as AzureOpenAIProviderProfile).apiKeySecretId = secretId;
					},
				});
			});
		});

		// Endpoint (required)
		new Setting(container)
			.setName('Endpoint')
			.setDesc('Your Azure OpenAI resource endpoint (required)')
			.addText((text) => {
				text.setPlaceholder('https://your-resource.openai.azure.com');
				text.setValue((this.profile as AzureOpenAIProviderProfile).endpoint || '');
				text.onChange((value) => {
					(this.profile as AzureOpenAIProviderProfile).endpoint = value;
				});
			});

		// Deployment Name (required)
		new Setting(container)
			.setName('Deployment Name')
			.setDesc('The name of your model deployment (required)')
			.addText((text) => {
				text.setPlaceholder('gpt-4o');
				text.setValue((this.profile as AzureOpenAIProviderProfile).deploymentName || '');
				text.onChange((value) => {
					(this.profile as AzureOpenAIProviderProfile).deploymentName = value;
				});
			});

		// API Version (optional)
		new Setting(container)
			.setName('API Version')
			.setDesc('Azure OpenAI API version (optional, defaults to 2024-06-01)')
			.addText((text) => {
				text.setPlaceholder('2024-06-01');
				text.setValue((this.profile as AzureOpenAIProviderProfile).apiVersion || '');
				text.onChange((value) => {
					(this.profile as AzureOpenAIProviderProfile).apiVersion = value || undefined;
				});
			});
	}

	/**
	 * Renders local Whisper server configuration fields.
	 */
	private renderLocalFields(): void {
		const container = this.conditionalContainer!;

		// Server URL (required)
		new Setting(container)
			.setName('Server URL')
			.setDesc('URL of your local whisper.cpp server')
			.addText((text) => {
				text.setPlaceholder('http://127.0.0.1:8080');
				text.setValue((this.profile as LocalProviderProfile).serverUrl || 'http://127.0.0.1:8080');
				text.onChange((value) => {
					(this.profile as LocalProviderProfile).serverUrl = value;
				});
			});
	}

	/**
	 * Validates and saves the profile.
	 */
	private saveProfile(): void {
		// Validate required fields
		if (!this.profile.name?.trim()) {
			console.error('Profile name is required');
			return;
		}

		const type = this.profile.type as AIProviderProfileType;

		if (type === 'azure-openai') {
			const azure = this.profile as AzureOpenAIProviderProfile;
			if (!azure.endpoint?.trim()) {
				console.error('Azure endpoint is required');
				return;
			}
			// Deployment name is required
			if (!azure.deploymentName?.trim()) {
				console.error('Deployment name is required');
				return;
			}
		}

		if (type === 'local') {
			const local = this.profile as LocalProviderProfile;
			if (!local.serverUrl?.trim()) {
				console.error('Server URL is required');
				return;
			}
		}

		this.onSave(this.profile as AIProviderProfile);
		this.close();
	}

	/**
	 * Called when the modal is closed. Cleans up the UI.
	 */
	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.removeClass('vc-ai-provider-profile-modal');
	}
}
