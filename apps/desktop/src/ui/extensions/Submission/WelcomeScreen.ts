/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/WelcomeScreen
 * @description Welcome screen for extension submission wizard.
 * 
 * Presents a polished landing page with:
 * - Hero header with title and subtitle
 * - Three-step "How It Works" cards
 * - "Why Use This?" benefits list
 * - Privacy & Permissions callout
 * - Get Started / Cancel actions
 * 
 * @see {@link ExtensionSubmissionModal} for the wizard orchestrator
 * @since 0.0.14
 */

import { ButtonComponent } from "obsidian";
import type { ScreenCallbacks } from "./types";

/**
 * Renders the welcome/landing screen for the extension submission wizard.
 * 
 * @param container - The parent element to render into
 * @param callbacks - Navigation callbacks (onNext, onClose)
 * 
 * @example
 * ```typescript
 * renderWelcomeScreen(contentEl, { onNext: () => goToStep(0), onClose: () => modal.close() });
 * ```
 */
export function renderWelcomeScreen(container: HTMLElement, callbacks: ScreenCallbacks): void {
	const wrapper = container.createDiv({ cls: "welcome-wrapper" });

	// --- Hero ---
	wrapper.createEl("h1", { text: "Submit an Extension to Torqena", cls: "welcome-title" });
	wrapper.createEl("p", {
		text: "Turn your extension into a ready-to-merge pull request — in minutes.",
		cls: "welcome-subtitle"
	});

	const aiNote = wrapper.createDiv({ cls: "welcome-ai-note" });
	aiNote.createSpan({ text: "(Optional AI assistance, full review before anything is submitted.)" });
	aiNote.createSpan({ text: " 🤖", cls: "welcome-ai-icon" });

	// --- Divider ---
	wrapper.createEl("hr", { cls: "welcome-divider" });

	// --- Two-column body ---
	const columns = wrapper.createDiv({ cls: "welcome-columns" });

	// ── Left column: How It Works ──
	const leftCol = columns.createDiv({ cls: "welcome-col-left" });

	leftCol.createEl("h2", { text: "How It Works", cls: "welcome-section-heading" });

	const steps = [
		{ number: "1", title: "Gather", description: "Collect extension details from your folder or markdown files" },
		{ number: "2", title: "Generate", tag: "(Optional)", description: "Create README, description, and images using AI — or bring your own" },
		{ number: "3", title: "Submit", description: "Prepare files, fork the repo, and open a pull request on GitHub" }
	];

	steps.forEach(step => {
		const card = leftCol.createDiv({ cls: "welcome-step-card" });
		const header = card.createDiv({ cls: "welcome-step-header" });
		header.createSpan({ text: step.number, cls: "welcome-step-number" });
		header.createEl("strong", { text: step.title });
		if (step.tag) {
			header.createSpan({ text: step.tag, cls: "welcome-step-tag" });
		}
		card.createEl("p", { text: step.description, cls: "welcome-step-desc" });
	});

	const stepsHint = leftCol.createDiv({ cls: "welcome-steps-hint" });
	stepsHint.createSpan({ text: "💡 " });
	stepsHint.createSpan({ text: "You'll review and edit " });
	stepsHint.createEl("em", { text: "everything" });
	stepsHint.createSpan({ text: " before submission." });

	// ── Right column: Why Use This? + Privacy ──
	const rightCol = columns.createDiv({ cls: "welcome-col-right" });

	rightCol.createEl("h2", { text: "Why Use This?", cls: "welcome-section-heading" });

	const benefitsList = rightCol.createDiv({ cls: "welcome-benefits" });

	const benefits = [
		{ icon: "⚡", bold: "2–3 minute", rest: " submission" },
		{ icon: "🤖", bold: "", rest: "Optional AI saves repetitive writing" },
		{ icon: "⚙️", bold: "", rest: "Smart defaults from git config" },
		{ icon: "✏️", bold: "", rest: "Everything is editable" },
		{ icon: "🛡️", bold: "", rest: "Duplicate detection prevents wasted effort" }
	];

	benefits.forEach(b => {
		const row = benefitsList.createDiv({ cls: "welcome-benefit-row" });
		row.createSpan({ text: b.icon, cls: "welcome-benefit-icon" });
		if (b.bold) {
			const textSpan = row.createSpan();
			textSpan.createEl("strong", { text: b.bold });
			textSpan.appendText(b.rest);
		} else {
			row.createSpan({ text: b.rest });
		}
	});

	// Privacy box inside right column
	const privacyBox = rightCol.createDiv({ cls: "welcome-privacy" });
	privacyBox.createEl("h3", { text: "🔒  Privacy & Permissions" });

	const privacyItems = [
		"Use your GitHub credentials to fork and open a pull request",
		"Read selected extension files to generate content (AI optional)",
		"Read your git config for name and email (editable)",
		"No background access",
		"You confirm every step"
	];

	const privacyList = privacyBox.createDiv({ cls: "welcome-privacy-list" });
	privacyItems.forEach(item => {
		const row = privacyList.createDiv({ cls: "welcome-privacy-item" });
		row.createSpan({ text: "✅ ", cls: "welcome-privacy-check" });
		row.createSpan({ text: item });
	});

	// --- Bottom bar ---
	const bottomBar = wrapper.createDiv({ cls: "welcome-bottom-bar" });
	bottomBar.createSpan({ text: "You can stop or go back at any time.", cls: "welcome-bottom-hint" });

	const buttonGroup = bottomBar.createDiv({ cls: "welcome-button-group" });

	new ButtonComponent(buttonGroup)
		.setButtonText("Get Started →")
		.setCta()
		.onClick(() => callbacks.onNext());

	new ButtonComponent(buttonGroup)
		.setButtonText("Cancel")
		.onClick(() => callbacks.onClose());
}
