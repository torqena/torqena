/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/DescriptionScreen
 * @description Extension description and image upload/generation screen
 */

import { Setting, ButtonComponent, TFile } from "obsidian";
import type { ScreenContext, ScreenCallbacks } from "./types";
import { generateDescriptionWithAI } from "./utils";

/**
 * Renders the description step
 */
export function renderDescriptionScreen(
	container: HTMLElement,
	context: ScreenContext,
	callbacks: ScreenCallbacks,
	renderNavigationButtons: (container: HTMLElement, showBack: boolean, showNext: boolean) => void,
	onGenerateImage: (button: ButtonComponent) => Promise<void>
): void {
	container.createEl("h2", { text: "Extension Description" });
	container.createEl("p", { 
		text: "Provide a description, version, and image for your extension."
	});
	
	// Show extension ID
	const idText = context.submissionData.extensionId || "(unknown)";
	const identityInfo = container.createDiv({ cls: "validation-info" });
	identityInfo.createEl("p", {
		text: `📦 Extension ID: ${idText}`
	});
	
	// Show update notice if this is an existing catalog extension
	if (context.isUpdate && context.catalogVersion) {
		const updateNotice = container.createDiv({ cls: "inline-message inline-message-info" });
		updateNotice.createSpan({ cls: "inline-message-icon", text: "ℹ️" });
		updateNotice.createSpan({
			cls: "inline-message-text",
			text: `This extension already exists in the catalog (v${context.catalogVersion}). Your submission will be treated as an update.`
		});
	}
	
	// Version input
	new Setting(container)
		.setName("Version")
		.setDesc("Semantic version (e.g. 1.0.0). Auto-populated from manifest.json if present, but you can override it.")
		.addText(text => {
			context.versionInput = text;
			text
				.setPlaceholder("1.0.0")
				.setValue(context.submissionData.version || "")
				.onChange(value => {
					context.submissionData.version = value.trim();
				});
			text.inputEl.style.width = "120px";
		});
	
	// Extension description (AI-generated and pre-populated)
	const descWrapper = container.createDiv({ cls: "setting-item-stacked" });
	new Setting(descWrapper)
		.setName("Extension Description")
		.setDesc(
			context.generatedDescription
				? "AI-generated description (editable, max 200 characters). Use the README for longer details."
				: "Brief description of your extension (optional, max 200 characters). Use the README for longer details."
		)
		.addButton(button => {
			button
				.setButtonText(context.isGeneratingContent ? "Generating..." : "Generate with AI")
				.setClass("btn-ai")
				.setDisabled(context.isGeneratingContent)
				.onClick(async () => {
					context.isGeneratingContent = true;
					callbacks.onRender();
					
					const description = await generateDescriptionWithAI(
						context.app,
						context.plugin,
						context.submissionData.extensionPath || "",
						context.submissionData.extensionId,
						context.submissionData.extensionName,
						context.descriptionInput,
						container.querySelector('.step-message-container') as HTMLElement,
						callbacks.showInlineMessage
					);
					
					context.generatedDescription = description;
					context.submissionData.description = description;
					context.isGeneratingContent = false;
					callbacks.onRender();
				});
		});
	
	context.descriptionInput = descWrapper.createEl("textarea", {
		cls: "stacked-textarea",
		attr: {
			placeholder: "A helpful extension that...",
			rows: "3"
		}
	});
	// Pre-populate with AI-generated content or previously entered value
	context.descriptionInput.value = context.submissionData.description || context.generatedDescription || "";
	// Persist user changes to submissionData
	context.descriptionInput.addEventListener("input", () => {
		context.submissionData.description = context.descriptionInput?.value ?? "";
	});
	
	// Icon image upload with AI generation option
	new Setting(container)
		.setName("Extension Icon & Preview Image")
		.setDesc("Upload or generate an image for your extension (used as both icon and preview)")
		.addButton(button => {
			button
				.setButtonText(context.iconImagePath || context.generatedImagePath ? "Attach Image" : "Attach Image")
				.onClick(async () => {
					const input = document.createElement('input');
					input.type = 'file';
					input.accept = '.svg,.png';
					input.onchange = (e: Event) => {
						const target = e.target as HTMLInputElement;
						if (target.files && target.files.length > 0) {
							const selectedFile = target.files[0];
							if (!selectedFile) return;
							context.iconImagePath = (selectedFile as unknown as {path?: string}).path || selectedFile.name;
							context.previewImagePath = context.iconImagePath;
							context.generatedImagePath = null;
							button.setButtonText("Attach Image");
							callbacks.onRender();
						}
					};
					input.click();
				});
		})
		.addButton(button => {
			button
				.setButtonText(context.isGeneratingImage ? "Generating..." : "Generate with AI")
				.setClass("btn-ai")
				.setDisabled(context.isGeneratingImage)
				.onClick(async () => {
					await onGenerateImage(button);
				});
		});
	
	// Always show image preview box if image was generated or selected
	if (context.iconImagePath || context.generatedImagePath) {
		const imagePath = context.iconImagePath || context.generatedImagePath;
		const isAIGenerated = !!context.generatedImagePath;
		
		// Show visual preview box
		const previewBox = container.createEl("div", {
			cls: "image-preview-box"
		});
		previewBox.createEl("div", {
			text: isAIGenerated ? "🖼️ AI-Generated Image" : "🖼️ Selected Image",
			cls: "image-preview-placeholder"
		});
		
		// Render actual image preview when possible. Support both vault paths
		// and in-memory data URLs (for auto-generated previews).
		if (imagePath) {
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
				// If anything goes wrong, silently fall back to text-only placeholder
				console.warn("Could not render image preview", e);
			}
		}
		previewBox.createEl("div", {
			text: isAIGenerated 
				? "✓ Generated during loading phase - will be included in PR submission" 
				: `📎 Selected: ${imagePath}`,
			cls: "image-preview-note"
		});
	}
	
	// Info box
	const infoContainer = container.createDiv({ cls: "validation-info" });
	infoContainer.createEl("p", {
		text: context.generatedDescription 
			? "💡 Description has been AI-generated based on your extension. You can edit it as needed."
			: "💡 Provide a brief description of your extension to help users understand its purpose."
	});
	
	// Message container for validation feedback
	container.createDiv({ cls: "step-message-container" });
	
	// Navigation buttons
	renderNavigationButtons(container, true, true);
}
