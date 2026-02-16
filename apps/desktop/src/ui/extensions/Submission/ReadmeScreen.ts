/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/ReadmeScreen
 * @description README content editor screen
 */

import { Setting } from "obsidian";
import type { ScreenContext, ScreenCallbacks } from "./types";
import { generateReadmeWithAI } from "./utils";

/**
 * Renders the README step
 */
export function renderReadmeScreen(
	container: HTMLElement,
	context: ScreenContext,
	callbacks: ScreenCallbacks,
	renderNavigationButtons: (container: HTMLElement, showBack: boolean, showNext: boolean) => void
): void {
	container.createEl("h2", { text: "Extension README" });
	container.createEl("p", { 
		text: "Provide detailed documentation for your extension."
	});
	
	// README content (AI-generated and pre-populated)
	const readmeWrapper = container.createDiv({ cls: "setting-item-stacked" });
	new Setting(readmeWrapper)
		.setName("README Content")
		.setDesc(context.generatedReadme ? "AI-generated README (editable)" : "Additional documentation or usage instructions (optional)")
		.addButton(button => {
			button
				.setButtonText(context.isGeneratingContent ? "Generating..." : "Generate with AI")
				.setClass("btn-ai")
				.setDisabled(context.isGeneratingContent)
				.onClick(async () => {
					context.isGeneratingContent = true;
					callbacks.onRender();
					
					const readme = await generateReadmeWithAI(
						context.app,
						context.plugin,
						context.submissionData.extensionPath || "",
						context.submissionData.extensionId,
						context.submissionData.extensionName,
						context.readmeInput,
						container.querySelector('.step-message-container') as HTMLElement,
						callbacks.showInlineMessage
					);
					
					context.generatedReadme = readme;
					context.submissionData.readme = readme;
					context.isGeneratingContent = false;
					callbacks.onRender();
				});
		});
	
	context.readmeInput = readmeWrapper.createEl("textarea", {
		cls: "stacked-textarea stacked-textarea-tall",
		attr: {
			placeholder: "# My Extension\n\nUsage instructions...",
			rows: "6"
		}
	});
	// Pre-populate with AI-generated content or previously entered value
	context.readmeInput.value = context.submissionData.readme || context.generatedReadme || "";
	// Persist user changes to submissionData
	context.readmeInput.addEventListener("input", () => {
		context.submissionData.readme = context.readmeInput?.value ?? "";
	});
	
	// Info box
	const infoContainer = container.createDiv({ cls: "validation-info" });
	infoContainer.createEl("p", {
		text: context.generatedReadme
			? "💡 README has been AI-generated based on your extension. You can edit it as needed."
			: "💡 Provide a comprehensive README to help users understand how to use your extension."
	});
	
	// Message container for validation feedback
	container.createDiv({ cls: "step-message-container" });
	
	// Navigation buttons
	renderNavigationButtons(container, true, true);
}
