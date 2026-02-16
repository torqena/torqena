/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module EditorThemeCatalog
 * @description Catalog of available CodeMirror editor themes for the web shell.
 *
 * Includes all ThemeMirror themes, grouped by light/dark mode, and helpers for
 * resolving theme metadata and CodeMirror extensions.
 *
 * @since 0.1.0
 */

import type { Extension } from "@codemirror/state";
import {
	amy,
	ayuLight,
	barf,
	bespin,
	birdsOfParadise,
	boysAndGirls,
	clouds,
	cobalt,
	coolGlow,
	dracula,
	espresso,
	noctisLilac,
	rosePineDawn,
	smoothy,
	solarizedLight,
	tomorrow,
} from "thememirror";

/** Available editor theme mode. */
export type EditorThemeMode = "light" | "dark";

/**
 * Supported editor theme IDs.
 *
 * Includes `default` for using built-in editor styling without a ThemeMirror theme.
 */
export type EditorThemeId =
	| "default"
	| "amy"
	| "ayu-light"
	| "barf"
	| "bespin"
	| "birds-of-paradise"
	| "boys-and-girls"
	| "clouds"
	| "cobalt"
	| "cool-glow"
	| "dracula"
	| "espresso"
	| "noctis-lilac"
	| "rose-pine-dawn"
	| "smoothy"
	| "solarized-light"
	| "tomorrow";

/** Theme definition used by settings UI and editor configuration. */
export interface EditorThemeDefinition {
	id: Exclude<EditorThemeId, "default">;
	label: string;
	mode: EditorThemeMode;
	previewImageUrl: string;
	extension: Extension;
}

const SCREENSHOT_BASE_URL =
	"https://raw.githubusercontent.com/vadimdemedes/thememirror/main/screenshots";

/** All ThemeMirror themes available for editor selection. */
export const EDITOR_THEME_DEFINITIONS: EditorThemeDefinition[] = [
	{ id: "amy", label: "Amy", mode: "dark", previewImageUrl: `${SCREENSHOT_BASE_URL}/amy.jpg`, extension: amy },
	{ id: "ayu-light", label: "Ayu Light", mode: "light", previewImageUrl: `${SCREENSHOT_BASE_URL}/ayu-light.jpg`, extension: ayuLight },
	{ id: "barf", label: "Barf", mode: "dark", previewImageUrl: `${SCREENSHOT_BASE_URL}/barf.jpg`, extension: barf },
	{ id: "bespin", label: "Bespin", mode: "dark", previewImageUrl: `${SCREENSHOT_BASE_URL}/bespin.jpg`, extension: bespin },
	{ id: "birds-of-paradise", label: "Birds of Paradise", mode: "dark", previewImageUrl: `${SCREENSHOT_BASE_URL}/birds-of-paradise.jpg`, extension: birdsOfParadise },
	{ id: "boys-and-girls", label: "Boys and Girls", mode: "dark", previewImageUrl: `${SCREENSHOT_BASE_URL}/boys-and-girls.jpg`, extension: boysAndGirls },
	{ id: "clouds", label: "Clouds", mode: "light", previewImageUrl: `${SCREENSHOT_BASE_URL}/clouds.jpg`, extension: clouds },
	{ id: "cobalt", label: "Cobalt", mode: "dark", previewImageUrl: `${SCREENSHOT_BASE_URL}/cobalt.jpg`, extension: cobalt },
	{ id: "cool-glow", label: "Cool Glow", mode: "dark", previewImageUrl: `${SCREENSHOT_BASE_URL}/cool-glow.jpg`, extension: coolGlow },
	{ id: "dracula", label: "Dracula", mode: "dark", previewImageUrl: `${SCREENSHOT_BASE_URL}/dracula.jpg`, extension: dracula },
	{ id: "espresso", label: "Espresso", mode: "light", previewImageUrl: `${SCREENSHOT_BASE_URL}/espresso.jpg`, extension: espresso },
	{ id: "noctis-lilac", label: "Noctis Lilac", mode: "light", previewImageUrl: `${SCREENSHOT_BASE_URL}/noctis-lilac.jpg`, extension: noctisLilac },
	{ id: "rose-pine-dawn", label: "Rosé Pine Dawn", mode: "light", previewImageUrl: `${SCREENSHOT_BASE_URL}/rose-pine-dawn.jpg`, extension: rosePineDawn },
	{ id: "smoothy", label: "Smoothy", mode: "light", previewImageUrl: `${SCREENSHOT_BASE_URL}/smoothy.jpg`, extension: smoothy },
	{ id: "solarized-light", label: "Solarized Light", mode: "light", previewImageUrl: `${SCREENSHOT_BASE_URL}/solarized-light.jpg`, extension: solarizedLight },
	{ id: "tomorrow", label: "Tomorrow", mode: "light", previewImageUrl: `${SCREENSHOT_BASE_URL}/tomorrow.jpg`, extension: tomorrow },
];

/**
 * Returns theme definitions for a specific mode.
 *
 * @param mode - Light or dark mode.
 * @returns Theme definitions matching the provided mode.
 */
export function getEditorThemesForMode(mode: EditorThemeMode): EditorThemeDefinition[] {
	return EDITOR_THEME_DEFINITIONS.filter((theme) => theme.mode === mode);
}

/**
 * Returns a theme definition by ID.
 *
 * @param id - Theme identifier.
 * @returns Matching theme definition or undefined.
 */
export function getEditorThemeById(id: EditorThemeId): EditorThemeDefinition | undefined {
	if (id === "default") {
		return undefined;
	}

	return EDITOR_THEME_DEFINITIONS.find((theme) => theme.id === id);
}

/**
 * Returns the CodeMirror extension for the selected editor theme.
 *
 * @param id - Theme identifier.
 * @returns Theme extension or an empty extension array for the default theme.
 */
export function getEditorThemeExtension(id: EditorThemeId): Extension | [] {
	return getEditorThemeById(id)?.extension ?? [];
}
