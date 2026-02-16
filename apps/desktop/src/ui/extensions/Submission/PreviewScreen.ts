/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/PreviewScreen
 * @description Preview and confirmation screen before submission
 */

import { MarkdownRenderer, TFile } from "obsidian";
import type { ScreenContext } from "./types";
import { addSummaryItem } from "./utils";

/**
 * Renders the preview step
 */
export function renderPreviewScreen(
	container: HTMLElement,
	context: ScreenContext,
	renderNavigationButtons: (container: HTMLElement, showBack: boolean, showNext: boolean, showSubmit?: boolean) => void
): void {
	container.createEl("h2", { text: "Preview & Confirm" });
	container.createEl("p", { 
		text: "Review your submission details before proceeding."
	});
	
	// Summary
	const summaryContainer = container.createDiv({ cls: "submission-summary" });
	
	summaryContainer.createEl("h3", { text: "Extension Details" });
	// Capitalize extension type for display
	const displayType = context.submissionData.extensionType 
		? context.submissionData.extensionType.charAt(0).toUpperCase() + context.submissionData.extensionType.slice(1)
		: "Agent"; // Default to Agent if not set
	addSummaryItem(summaryContainer, "Type", displayType);
	addSummaryItem(summaryContainer, "Path", context.submissionData.extensionPath || "");
	addSummaryItem(summaryContainer, "ID", context.submissionData.extensionId || "");
	addSummaryItem(summaryContainer, "Name", context.submissionData.extensionName || "");
	
	// Version with update context
	const versionDisplay = context.isUpdate && context.catalogVersion
		? `${context.submissionData.version || ""} (updating from v${context.catalogVersion})`
		: context.submissionData.version || "";
	addSummaryItem(summaryContainer, "Version", versionDisplay);
	addSummaryItem(summaryContainer, "Submission", context.isUpdate ? "Update" : "New");
	
	summaryContainer.createEl("h3", { text: "Author" });
	addSummaryItem(summaryContainer, "Name", context.submissionData.authorName || "");
	addSummaryItem(summaryContainer, "URL", context.submissionData.authorUrl || "");
	
	if (context.iconImagePath || context.previewImagePath || context.generatedImagePath) {
		summaryContainer.createEl("h3", { text: "Assets" });
		// Prefer user-selected preview image, then icon, then AI-generated
		const imagePath = context.previewImagePath || context.iconImagePath || context.generatedImagePath;
		const imageLabel = context.generatedImagePath && !context.iconImagePath && !context.previewImagePath
			? "Image (AI-Generated)"
			: "Image";
		if (imagePath) {
			const displayValue = imagePath.startsWith("data:")
				? "AI-generated inline preview image"
				: imagePath;
			addSummaryItem(summaryContainer, imageLabel, displayValue);
			
			// Show actual image preview (selected or AI-generated)
			const previewBox = summaryContainer.createEl("div", {
				cls: "image-preview-box"
			});
			previewBox.createEl("div", {
				text: context.generatedImagePath && imagePath === context.generatedImagePath
					? "🖼️ AI-Generated Image Preview"
					: "🖼️ Selected Image Preview",
				cls: "image-preview-placeholder"
			});
			
			try {
				if (imagePath.startsWith("data:")) {
					const imgEl = previewBox.createEl("img", {
						cls: "image-preview-img"
					});
					imgEl.src = imagePath;
				} else {
					const file = context.app.vault.getAbstractFileByPath(imagePath);
					if (file instanceof TFile) {
						const imgSrc = context.app.vault.getResourcePath(file);
						const imgEl = previewBox.createEl("img", {
							cls: "image-preview-img"
						});
						imgEl.src = imgSrc;
					}
				}
			} catch (e) {
				// If anything goes wrong, silently fall back to text-only preview
				console.warn("Could not render preview image on Preview screen", e);
			}
			
			previewBox.createEl("div", {
				text: context.generatedImagePath && imagePath === context.generatedImagePath
					? "Image was generated during the loading step and will be included in the PR submission."
					: "Selected image will be included in the PR submission.",
				cls: "image-preview-note"
			});
			
			summaryContainer.createEl("div", { 
				text: "Note: Same image will be used for both icon and preview",
				cls: "summary-note"
			});
		}
	}
	
	if (context.descriptionInput && context.descriptionInput.value) {
		summaryContainer.createEl("h3", { text: "Description" });
		const descText = summaryContainer.createDiv({ cls: "summary-description" });
		descText.setText(context.descriptionInput.value);
	}
	
	if (context.readmeInput && context.readmeInput.value) {
		summaryContainer.createEl("h3", { text: "README" });
		const readmeText = summaryContainer.createDiv({ cls: "summary-readme" });
		readmeText.setText(context.readmeInput.value);
	}
	
	// Changelog (for updates)
	if (context.isUpdate && (context.generatedChangelog || context.submissionData.changelog)) {
		summaryContainer.createEl("h3", { text: "Changelog" });
		const changelogDiv = summaryContainer.createDiv({ cls: "summary-changelog" });
		const changelogMarkdown = context.generatedChangelog || context.submissionData.changelog || "";
		if (context.plugin) {
			MarkdownRenderer.render(
				context.plugin.app,
				changelogMarkdown,
				changelogDiv,
				"",
				context.plugin
			);
		} else {
			changelogDiv.setText(changelogMarkdown);
		}
		summaryContainer.createEl("div", {
			text: "A CHANGELOG.md file will be created and referenced in the manifest.",
			cls: "summary-note"
		});
	}
	
	// What will happen
	const processContainer = container.createDiv({ cls: "submission-process" });
	processContainer.createEl("h3", { text: "What will happen next:" });
	const ol = processContainer.createEl("ol");
	ol.createEl("li", { text: "Your extension will be validated" });
	ol.createEl("li", { text: "Assets (icons, images) will be prepared for submission" });
	ol.createEl("li", { text: "A pull request will be created automatically" });
	ol.createEl("li", { text: "Maintainers will review your submission" });
	
	// Message container for validation feedback
	container.createDiv({ cls: "step-message-container" });
	
	// Navigation buttons
	renderNavigationButtons(container, true, false, true);
}
