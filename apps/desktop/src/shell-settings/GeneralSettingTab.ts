/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module GeneralSettingTab
 * @description General settings panel focused on app updates, account actions,
 * and startup diagnostics.
 */

import { Setting } from "../platform/ui/Setting.js";
import { SettingTab } from "./SettingTab.js";
import { loadSettings, saveSettings } from "./WebShellSettings.js";
import type { App } from "../platform/core/App.js";

export class GeneralSettingTab extends SettingTab {
	/** LocalStorage key used by the main plugin to persist settings. */
	private static readonly PLUGIN_SETTINGS_KEY = "plugin:torqena:data";

	/** Version shown in the General settings About row. */
	private static readonly APP_VERSION = "1.12.1";

	/** Installer version shown in the General settings About row. */
	private static readonly INSTALLER_VERSION = "1.11.5";

	constructor(app: App) {
		super(app, "general", "General", "circle-user");
	}

	/**
	 * Render the General settings content.
	 */
	display(): void {
		const el = this.containerEl;
		el.empty();

		const settings = loadSettings();

		const aboutFragment = document.createDocumentFragment();
		const version = document.createElement("div");
		version.textContent = `Version ${GeneralSettingTab.APP_VERSION}`;
		aboutFragment.appendChild(version);

		const installer = document.createElement("div");
		installer.style.color = "var(--text-muted)";
		installer.style.fontSize = "var(--font-ui-smaller)";
		installer.textContent = `Installer version: ${GeneralSettingTab.INSTALLER_VERSION}`;
		aboutFragment.appendChild(installer);

		const changelog = document.createElement("a");
		changelog.href = "https://obsidian.md/changelog";
		changelog.target = "_blank";
		changelog.rel = "noopener noreferrer";
		changelog.textContent = "Read the changelog.";
		changelog.style.fontSize = "var(--font-ui-smaller)";
		aboutFragment.appendChild(changelog);

		new Setting(el)
			.setName(aboutFragment)
			.addButton((btn) => {
				btn.setButtonText("Check for updates")
					.setCta();
			});

		new Setting(el)
			.setName("Automatic updates")
			.setDesc("Turn this off to prevent the app from checking for updates.")
			.addToggle((toggle) => {
				toggle.setValue(settings.automaticUpdates)
					.onChange((val) => {
						settings.automaticUpdates = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Receive early access versions")
			.setDesc("Auto-update to the latest early access version. These versions include new features but may be less stable.")
			.addToggle((toggle) => {
				toggle.setValue(settings.receiveEarlyAccessVersions)
					.onChange((val) => {
						settings.receiveEarlyAccessVersions = val;
						saveSettings(settings);
					});
			});

		new Setting(el).setName("Account").setHeading();
		const accountIdentity = this.resolveSignedInIdentity();

		new Setting(el)
			.setName("Your account")
			.setDesc(accountIdentity
				? `You're currently signed in as ${accountIdentity}.`
				: "You're currently signed in.")
			.addButton((btn) => {
				btn.setButtonText("Manage");
			})
			.addButton((btn) => {
				btn.setButtonText("Log out")
					.setWarning();
			});

		new Setting(el).setName("Advanced").setHeading();

		new Setting(el)
			.setName("Notify if startup takes longer than expected")
			.setDesc("Diagnose issues with your app by seeing what is causing the app to load slowly.")
			.addToggle((toggle) => {
				toggle.setValue(settings.notifySlowStartup)
					.onChange((val) => {
						settings.notifySlowStartup = val;
						saveSettings(settings);
					});
			});
	}

	/**
	 * Resolve signed-in account identity from persisted plugin settings.
	 *
	 * Prefers email-like values; falls back to GitHub username when available.
	 *
	 * @returns Best available identity string, or null if none found
	 */
	private resolveSignedInIdentity(): string | null {
		const raw = localStorage.getItem(GeneralSettingTab.PLUGIN_SETTINGS_KEY);
		if (!raw) return null;

		try {
			const data = JSON.parse(raw) as Record<string, unknown>;

			const directEmail = this.pickFirstString(data, [
				"email",
				"userEmail",
				"accountEmail",
				"githubEmail",
				"copilotEmail",
			]);
			if (directEmail) return directEmail;

			const githubUsername = this.pickFirstString(data, ["githubUsername", "username", "login"]);
			if (githubUsername) {
				return githubUsername.includes("@") ? githubUsername : `@${githubUsername}`;
			}

			const nestedEmail = this.findFirstEmailLikeValue(data);
			if (nestedEmail) return nestedEmail;
		} catch {
			return null;
		}

		return null;
	}

	/**
	 * Pick first non-empty string from named keys.
	 *
	 * @param source - Source object to inspect
	 * @param keys - Keys to evaluate in order
	 * @returns First non-empty string value or null
	 */
	private pickFirstString(source: Record<string, unknown>, keys: string[]): string | null {
		for (const key of keys) {
			const value = source[key];
			if (typeof value === "string" && value.trim().length > 0) {
				return value.trim();
			}
		}
		return null;
	}

	/**
	 * Recursively search for an email-like value in an object graph.
	 *
	 * @param value - Root value to inspect
	 * @returns First email-like string found, or null
	 */
	private findFirstEmailLikeValue(value: unknown): string | null {
		if (!value || typeof value !== "object") return null;
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

		const stack: unknown[] = [value];
		while (stack.length > 0) {
			const current = stack.pop();
			if (!current || typeof current !== "object") continue;

			for (const nestedValue of Object.values(current as Record<string, unknown>)) {
				if (typeof nestedValue === "string") {
					const trimmed = nestedValue.trim();
					if (emailRegex.test(trimmed)) return trimmed;
				} else if (nestedValue && typeof nestedValue === "object") {
					stack.push(nestedValue);
				}
			}
		}

		return null;
	}
}




