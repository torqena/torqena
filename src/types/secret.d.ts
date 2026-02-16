/**
 * Local augmentations for Obsidian SecretStorage/SecretComponent APIs.
 * Remove once the upstream `obsidian` package publishes these typings.
 */
import 'obsidian';

declare module 'obsidian' {
	/**
	 * Allows users to select or create secrets managed by Obsidian.
	 * https://docs.obsidian.md/plugins/guides/secret-storage
	 */
	class SecretComponent extends BaseComponent {
		constructor(app: App, containerEl: HTMLElement);
		setValue(value: string | null | undefined): this;
		getValue(): string | null;
		onChange(callback: (value: string | null) => void): this;
	}

	/**
	 * Vault-scoped secure storage for secrets shared across plugins.
	 */
	class SecretStorage {
		getSecret(id: string): string | null;
		listSecrets(): string[];
		setSecret(id: string, secret: string): void;
	}

	interface App {
		secretStorage: SecretStorage;
	}
}
