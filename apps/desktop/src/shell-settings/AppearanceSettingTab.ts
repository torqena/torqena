/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AppearanceSettingTab
 * @description Appearance settings matching Obsidian's full Appearance panel:
 * color scheme, accent color, themes, interface, font, and advanced sections.
 */

import { Setting } from "../platform/ui/Setting.js";
import { SettingTab } from "./SettingTab.js";
import {
	getEditorThemeById,
	getEditorThemesForMode,
	type EditorThemeId,
} from "../editor/EditorThemeCatalog.js";
import { loadSettings, resolveThemeMode, saveSettings } from "./WebShellSettings.js";
import type { App } from "../platform/core/App.js";

export class AppearanceSettingTab extends SettingTab {
	private systemThemeListenerCleanup: (() => void) | null = null;

	constructor(app: App) {
		super(app, "appearance", "Appearance", "palette");
	}

	display(): void {
		if (this.systemThemeListenerCleanup) {
			this.systemThemeListenerCleanup();
			this.systemThemeListenerCleanup = null;
		}

		const el = this.containerEl;
		el.empty();

		const settings = loadSettings();

		// ── Top section (no heading) ──

		const baseThemeSetting = new Setting(el)
			.setName("Base color scheme")
			.setDesc("Choose Obsidian's default color scheme.")
			.addDropdown((dd) => {
				dd.addOption("system", "Adapt to system")
					.addOption("light", "Light")
					.addOption("dark", "Dark")
					.setValue(settings.theme)
					.onChange((val) => {
						settings.theme = val as "light" | "dark" | "system";
						saveSettings(settings);
						this.applyTheme(settings.theme);
						this.display();
					});
			});

		const runtimeThemeBadge = document.createElement("span");
		runtimeThemeBadge.className = "ws-runtime-theme-badge";
		baseThemeSetting.descEl.appendChild(runtimeThemeBadge);

		const updateRuntimeThemeBadge = (): void => {
			if (settings.theme !== "system") {
				runtimeThemeBadge.classList.add("is-hidden");
				return;
			}

			const mode = resolveThemeMode("system");
			runtimeThemeBadge.textContent = `Runtime mode: ${mode === "dark" ? "Dark" : "Light"}`;
			runtimeThemeBadge.classList.remove("is-hidden");
		};

		updateRuntimeThemeBadge();

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleThemeChange = () => updateRuntimeThemeBadge();
		if (typeof mediaQuery.addEventListener === "function") {
			mediaQuery.addEventListener("change", handleThemeChange);
			this.systemThemeListenerCleanup = () => mediaQuery.removeEventListener("change", handleThemeChange);
		} else {
			mediaQuery.addListener(handleThemeChange);
			this.systemThemeListenerCleanup = () => mediaQuery.removeListener(handleThemeChange);
		}

		const resolvedThemeMode = resolveThemeMode(settings.theme);
		const currentThemeId: EditorThemeId =
			resolvedThemeMode === "dark" ? settings.editorThemeDark : settings.editorThemeLight;
		const themesForMode = getEditorThemesForMode(resolvedThemeMode);

		const editorThemeSetting = new Setting(el)
			.setName("Editor theme")
			.setDesc("Choose the editor theme used for this color scheme.")
			.addDropdown((dd) => {
				dd.addOption("default", "Default");

				for (const theme of themesForMode) {
					dd.addOption(theme.id, theme.label);
				}

				const validThemeId = themesForMode.some((theme) => theme.id === currentThemeId)
					? currentThemeId
					: "default";

				dd.setValue(validThemeId)
					.onChange((value) => {
						const themeId = value as EditorThemeId;
						if (resolvedThemeMode === "dark") {
							settings.editorThemeDark = themeId;
						} else {
							settings.editorThemeLight = themeId;
						}

						saveSettings(settings);
						updatePreview(themeId);
					});
			});

		const previewEl = document.createElement("div");
		previewEl.className = "ws-editor-theme-preview";
		editorThemeSetting.controlEl.appendChild(previewEl);

		const updatePreview = (themeId: EditorThemeId): void => {
			const theme = getEditorThemeById(themeId);
			previewEl.textContent = "";

			if (!theme) {
				previewEl.classList.add("is-hidden");
				return;
			}

			const imageEl = document.createElement("img");
			imageEl.src = theme.previewImageUrl;
			imageEl.alt = `${theme.label} preview`;
			imageEl.loading = "lazy";
			previewEl.appendChild(imageEl);
			previewEl.classList.remove("is-hidden");
		};

		updatePreview(currentThemeId);

		new Setting(el)
			.setName("Accent color")
			.setDesc("Choose the accent color used throughout the app.")
			.addExtraButton((btn) => {
				btn.setIcon("rotate-ccw")
					.setTooltip("Restore default")
					.onClick(() => {
						settings.accentColor = "";
						saveSettings(settings);
						document.body.style.removeProperty("--interactive-accent");
						this.display();
					});
			})
			.addToggle((toggle) => {
				// Use toggle as a visual color swatch
				toggle.setValue(!!settings.accentColor);
				if (settings.accentColor) {
					toggle.toggleEl.style.backgroundColor = settings.accentColor;
				}
				// Add a hidden color input triggered on click
				const colorInput = document.createElement("input");
				colorInput.type = "color";
				colorInput.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none;";
				colorInput.value = settings.accentColor || "#7c4dff";
				toggle.toggleEl.style.cursor = "pointer";
				toggle.toggleEl.style.position = "relative";
				toggle.toggleEl.appendChild(colorInput);
				toggle.toggleEl.addEventListener("click", (e) => {
					e.stopPropagation();
					colorInput.click();
				});
				colorInput.addEventListener("input", () => {
					settings.accentColor = colorInput.value;
					saveSettings(settings);
					document.body.style.setProperty("--interactive-accent", colorInput.value);
					toggle.toggleEl.style.backgroundColor = colorInput.value;
					toggle.setValue(true);
				});
			});

		// ── Interface ──

		new Setting(el).setName("Interface").setHeading();

		new Setting(el)
			.setName("Inline title")
			.setDesc("Display the filename as an editable title inline with the file contents.")
			.addToggle((toggle) => {
				toggle.setValue(settings.inlineTitle)
					.onChange((val) => {
						settings.inlineTitle = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Show tab title bar")
			.setDesc("Display the header at the top of every tab.")
			.addToggle((toggle) => {
				toggle.setValue(settings.showTabTitleBar)
					.onChange((val) => {
						settings.showTabTitleBar = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Show ribbon")
			.setDesc("Display vertical toolbar on the side of the window.")
			.addToggle((toggle) => {
				toggle.setValue(settings.showRibbon)
					.onChange((val) => {
						settings.showRibbon = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Ribbon menu configuration")
			.setDesc("Configure what commands appear in the ribbon menu.")
			.addButton((btn) => {
				btn.setButtonText("Manage");
			});

		// ── Font ──

		new Setting(el).setName("Font").setHeading();

		new Setting(el)
			.setName("Interface font")
			.setDesc("Set base font for all of Obsidian.")
			.addButton((btn) => {
				btn.setButtonText("Manage")
					.onClick(() => {
						const val = prompt("Enter font family name:", settings.fontFamily || "");
						if (val !== null) {
							settings.fontFamily = val;
							saveSettings(settings);
							if (val) {
								document.body.style.setProperty("--font-default", val);
							} else {
								document.body.style.removeProperty("--font-default");
							}
						}
					});
			});

		new Setting(el)
			.setName("Text font")
			.setDesc("Set font for editing and reading views.")
			.addButton((btn) => {
				btn.setButtonText("Manage")
					.onClick(() => {
						const val = prompt("Enter text font family:", settings.textFont || "");
						if (val !== null) {
							settings.textFont = val;
							saveSettings(settings);
							if (val) {
								document.body.style.setProperty("--font-text", val);
							} else {
								document.body.style.removeProperty("--font-text");
							}
						}
					});
			});

		new Setting(el)
			.setName("Monospace font")
			.setDesc("Set font for places like code blocks and frontmatter.")
			.addButton((btn) => {
				btn.setButtonText("Manage")
					.onClick(() => {
						const val = prompt("Enter monospace font family:", settings.monospaceFont || "");
						if (val !== null) {
							settings.monospaceFont = val;
							saveSettings(settings);
							if (val) {
								document.body.style.setProperty("--font-monospace", val);
							} else {
								document.body.style.removeProperty("--font-monospace");
							}
						}
					});
			});

		new Setting(el)
			.setName("Font size")
			.setDesc("Font size in pixels that affects editing and reading views.")
			.addExtraButton((btn) => {
				btn.setIcon("rotate-ccw")
					.setTooltip("Restore default")
					.onClick(() => {
						settings.fontSize = 16;
						saveSettings(settings);
						this.display();
					});
			})
			.addSlider((slider) => {
				slider.setLimits(8, 48, 1)
					.setValue(settings.fontSize)
					.setDynamicTooltip()
					.onChange((val) => {
						settings.fontSize = val;
						saveSettings(settings);
						document.body.style.setProperty("--font-text-size", `${val}px`);
					});
			});

		new Setting(el)
			.setName("Quick font size adjustment")
			.setDesc("Adjust the font size using Ctrl + Scroll, or using the trackpad pinch-zoom gesture.")
			.addToggle((toggle) => {
				toggle.setValue(settings.quickFontSizeAdjustment)
					.onChange((val) => {
						settings.quickFontSizeAdjustment = val;
						saveSettings(settings);
					});
			});

		// ── Advanced ──

		new Setting(el).setName("Advanced").setHeading();

		new Setting(el)
			.setName("Zoom level")
			.setDesc("Controls the overall zoom level of the app.")
			.addExtraButton((btn) => {
				btn.setIcon("rotate-ccw")
					.setTooltip("Restore default")
					.onClick(() => {
						settings.zoomLevel = 0;
						saveSettings(settings);
						this.display();
					});
			})
			.addSlider((slider) => {
				slider.setLimits(-5, 5, 0.5)
					.setValue(settings.zoomLevel)
					.setDynamicTooltip()
					.onChange((val) => {
						settings.zoomLevel = val;
						saveSettings(settings);
					});
			});

		new Setting(el)
			.setName("Window frame style")
			.setDesc("Determines the styling of the title bar of Obsidian windows. Requires a full restart to take effect.")
			.addDropdown((dd) => {
				dd.addOption("hidden", "Hidden (default)")
					.addOption("native", "Native")
					.setValue(settings.windowFrameStyle)
					.onChange(async (val) => {
						settings.windowFrameStyle = val as "hidden" | "native";
						saveSettings(settings);
						if (window.electronAPI) {
							await window.electronAPI.setWindowFrame(val as "hidden" | "native");
						}
					});
			});
	}

	/** Apply the selected theme to the document. */
	private applyTheme(theme: "light" | "dark" | "system"): void {
		applyTheme(theme);
	}

	hide(): void {
		if (this.systemThemeListenerCleanup) {
			this.systemThemeListenerCleanup();
			this.systemThemeListenerCleanup = null;
		}
		super.hide();
	}
}

/**
 * Apply the given theme to the document body.
 *
 * Exported so it can be called at startup before any settings tab is created.
 *
 * @param theme - The theme mode to apply
 */
export function applyTheme(theme: "light" | "dark" | "system"): void {
	let darkMode: boolean;
	if (theme === "system") {
		darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
	} else {
		darkMode = theme === "dark";
	}
	document.body.classList.toggle("theme-dark", darkMode);
	document.body.classList.toggle("theme-light", !darkMode);
}




