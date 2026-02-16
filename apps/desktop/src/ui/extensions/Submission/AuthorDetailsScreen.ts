/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/AuthorDetailsScreen
 * @description Author name and URL input screen
 */

import { Setting } from "obsidian";
import type { ScreenContext } from "./types";

/**
 * Renders the author details step
 */
export function renderAuthorDetailsScreen(
	container: HTMLElement,
	context: ScreenContext,
	renderNavigationButtons: (container: HTMLElement, showBack: boolean, showNext: boolean) => void
): void {
	container.createEl("h2", { text: "Author Details" });
	container.createEl("p", { 
		text: "Provide your author information for the extension."
	});
	
	// Author name (pre-populated from git config)
	new Setting(container)
		.setName("Author Name")
		.setDesc("Your full name or display name (editable)")
		.addText(text => {
			context.authorNameInput = text;
			text
				.setPlaceholder("John Doe")
				.setValue(context.submissionData.authorName || "")
				.onChange(value => {
					context.submissionData.authorName = value;
				});
		});
	
	// Author URL (pre-populated from git config)
	new Setting(container)
		.setName("Author URL")
		.setDesc("Your GitHub profile or personal website URL (editable)")
		.addText(text => {
			context.authorUrlInput = text;
			text
				.setPlaceholder("https://github.com/yourusername")
				.setValue(context.submissionData.authorUrl || "")
				.onChange(value => {
					context.submissionData.authorUrl = value;
				});
		});
	
	// Info box
	const infoContainer = container.createDiv({ cls: "validation-info" });
	infoContainer.createEl("p", {
		text: "💡 Author information has been pre-populated from your Git configuration. You can edit it if needed."
	});
	
	// Message container for validation feedback
	container.createDiv({ cls: "step-message-container" });
	
	// Navigation buttons
	renderNavigationButtons(container, true, true);
}
