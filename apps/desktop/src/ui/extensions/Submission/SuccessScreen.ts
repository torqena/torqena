/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/SuccessScreen
 * @description Success confirmation screen with PR link
 */

import { ButtonComponent } from "obsidian";

/**
 * Renders the submission success screen
 */
export function renderSuccessScreen(
	container: HTMLElement,
	prUrl: string,
	onClose: () => void
): void {
	container.empty();
	container.removeClass("submission-progress-screen");
	
	const successContainer = container.createDiv({ cls: "submission-progress-screen" });
	
	// Success box
	const resultBox = successContainer.createEl("div", { cls: "submission-result-box" });
	
	resultBox.createEl("div", {
		text: "✅ Extension Submitted Successfully!",
		cls: "submission-result-title"
	});
	
	resultBox.createEl("div", {
		text: "Your pull request has been created and is ready for review.",
		cls: "submission-result-text"
	});
	
	// PR link
	const linkEl = resultBox.createEl("a", {
		text: "View Pull Request →",
		cls: "submission-pr-link",
		href: prUrl
	});
	linkEl.setAttribute("target", "_blank");
	linkEl.setAttribute("rel", "noopener noreferrer");
	
	// What happens next
	const nextSteps = successContainer.createEl("div", {
		cls: "next-steps-info"
	});
	nextSteps.createEl("h3", { text: "What happens next:" });
	const stepsList = nextSteps.createEl("ol");
	stepsList.createEl("li", { text: "Automated validation will run on your PR" });
	stepsList.createEl("li", { text: "Maintainers will review your extension" });
	stepsList.createEl("li", { text: "You may receive feedback or change requests" });
	stepsList.createEl("li", { text: "Once approved, your extension will be merged" });
	stepsList.createEl("li", { text: "The catalog will rebuild automatically" });
	stepsList.createEl("li", { text: "Users can then discover and install your extension!" });
	
	// Close button
	const buttonContainer = container.createDiv({ cls: "modal-button-container" });
	new ButtonComponent(buttonContainer)
		.setButtonText("Close")
		.setCta()
		.onClick(onClose);
}
