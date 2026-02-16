/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/SelectExtensionScreen
 * @description Extension selection and type chooser screen.
 *
 * Two-column layout with inline step header:
 * - Header: Step badge + "Step 1 of N — Select Extension" + subtitle
 * - Left: Extension Type card, Extension Location card, AI Assistance card
 * - Right: Quick-tips benefits list + Manifest Handling callout (dynamic text)
 *
 * @see {@link ExtensionSubmissionModal} for the wizard orchestrator
 * @since 0.0.14
 */

import { ButtonComponent } from "obsidian";
import type { ScreenContext, ScreenCallbacks, ExtensionType } from "./types";
import { openExtensionPathDialog } from "./utils";

/**
 * Returns an example filename for the given extension type.
 *
 * @param type - The extension type
 * @returns A placeholder filename string
 * @internal
 */
function getExampleFileName(type: ExtensionType | undefined): string {
	switch (type) {
		case "voice-agent":
			return "my-voice-agent.voice-agent.md";
		case "prompt":
			return "my-prompt.prompt.md";
		case "skill":
			return "my-skill.skill.md";
		case "mcp-server":
			return "my-mcp-server.mcp-server.md";
		case "agent":
		default:
			return "my-agent.agent.md";
	}
}

/**
 * Returns the subfolder path example for the Extension Location placeholder.
 *
 * @param type - The extension type
 * @returns A placeholder string showing folder convention
 * @internal
 */
function getPlaceholder(type: ExtensionType | undefined): string {
	switch (type) {
		case "voice-agent":
			return "extensions/voice-agents/my-voice-agent/";
		case "prompt":
			return "extensions/prompts/my-prompt/";
		case "skill":
			return "extensions/skills/my-skill/";
		case "mcp-server":
			return "extensions/mcp-servers/my-mcp-server/";
		case "agent":
		default:
			return "extensions/agents/my-agent/";
	}
}

/**
 * Renders the Select Extension step (step 0) of the submission wizard.
 *
 * @param container - The parent element to render into
 * @param context - Shared wizard state
 * @param callbacks - Navigation callbacks
 * @param renderNavigationButtons - Renders Back / Next buttons
 * @param totalSteps - Total number of wizard steps (varies when updating)
 *
 * @example
 * ```typescript
 * renderSelectExtensionScreen(el, ctx, cbs, renderNav, 5);
 * ```
 */
export function renderSelectExtensionScreen(
	container: HTMLElement,
	context: ScreenContext,
	callbacks: ScreenCallbacks,
	renderNavigationButtons: (container: HTMLElement, showBack: boolean, showNext: boolean) => void,
	totalSteps = 5
): void {
	const initialType = (context.submissionData.extensionType || "agent") as ExtensionType;
	context.submissionData.extensionType = context.submissionData.extensionType || initialType;

	// ── Inline step header ──
	const header = container.createDiv({ cls: "select-step-header" });
	const badge = header.createDiv({ cls: "select-step-badge" });
	badge.setText("1");
	const headerText = header.createDiv({ cls: "select-step-header-text" });
	headerText.createEl("h2", { text: `Step 1 of ${totalSteps} — Select Extension`, cls: "select-step-title" });
	headerText.createEl("p", { cls: "select-step-subtitle" }).innerHTML =
		"Choose the extension you want to submit to the <strong>Torqena</strong> › catalog.";

	// ── Two-column body ──
	const columns = container.createDiv({ cls: "select-columns" });

	// ── Left column ──
	const leftCol = columns.createDiv({ cls: "select-col-left" });

	// — Extension Type card —
	const typeCard = leftCol.createDiv({ cls: "select-card" });
	typeCard.createDiv({ cls: "select-card-header" }).innerHTML = "📁 <strong>Extension Type</strong>";
	typeCard.createEl("p", { text: "What are you submitting?", cls: "select-card-hint" });

	const typeDropdown = typeCard.createEl("select", { cls: "dropdown select-dropdown" });
	const options: { value: ExtensionType; label: string }[] = [
		{ value: "agent", label: "Agent" },
		{ value: "voice-agent", label: "Voice Agent" },
		{ value: "prompt", label: "Prompt" },
		{ value: "skill", label: "Skill" },
		{ value: "mcp-server", label: "MCP Server" }
	];
	options.forEach(opt => {
		const el = typeDropdown.createEl("option", { text: opt.label, value: opt.value });
		if (opt.value === initialType) el.selected = true;
	});

	typeCard.createEl("p", { text: "This determines how Torqena interprets your files.", cls: "select-card-subhint" });

	// "What's the difference?" link
	const diffLink = typeCard.createDiv({ cls: "select-type-diff-link" });
	diffLink.createEl("a", { text: "What's the difference?", href: "#" });
	diffLink.querySelector("a")?.addEventListener("click", (e) => {
		e.preventDefault();
		// Can open docs or show a tooltip in the future
		window.open("https://github.com/danielshue/vault-copilot-extensions/blob/main/docs/EXTENSION_SUBMISSION.md", "_blank");
	});

	// — Extension Location card —
	const locCard = leftCol.createDiv({ cls: "select-card" });
	locCard.createDiv({ cls: "select-card-header" }).innerHTML = "📂 <strong>Extension Location</strong>";
	locCard.createEl("p", { text: "Where is your extension?", cls: "select-card-hint" });

	const pathRow = locCard.createDiv({ cls: "select-path-row" });
	const pathInput = pathRow.createEl("input", {
		cls: "select-path-input",
		type: "text",
		placeholder: getPlaceholder(initialType),
		value: context.submissionData.extensionPath || ""
	});

	const browseBtn = new ButtonComponent(pathRow).setButtonText("Browse");
	browseBtn.buttonEl.addClass("select-browse-btn");

	const fileHint = locCard.createEl("p", { cls: "select-card-subhint" });

	const updateFileHint = (type: ExtensionType | undefined): void => {
		const example = getExampleFileName(type);
		fileHint.setText(`You can provide a folder or a single ${example.split(".").slice(-2).join(".")} file.`);
	};
	updateFileHint(initialType);

	// — AI Assistance card —
	const aiCard = leftCol.createDiv({ cls: "select-card select-ai-card" });
	const aiRow = aiCard.createDiv({ cls: "select-ai-header" });

	// Toggle (Obsidian Setting toggle)
	const aiToggle = aiRow.createDiv({ cls: "checkbox-container" + (!context.skipAIGeneration ? " is-enabled" : "") });
	aiToggle.setAttribute("role", "switch");
	aiToggle.setAttribute("tabindex", "0");

	const aiLabel = aiRow.createEl("strong", { text: "AI Assistance" });
	aiLabel.style.marginLeft = "8px";

	const descLine = aiCard.createEl("p", { cls: "select-ai-desc" });
	descLine.innerHTML = "Generate <strong>description,</strong> README, and images <strong>automatically.</strong>";
	aiCard.createEl("p", { text: "Turn this off if you already have everything prepared.", cls: "select-card-subhint" });

	// Toggle behavior
	aiToggle.addEventListener("click", () => {
		context.skipAIGeneration = !context.skipAIGeneration;
		aiToggle.toggleClass("is-enabled", !context.skipAIGeneration);
	});

	// Message container for validation feedback
	const messageContainer = container.createDiv({ cls: "step-message-container" });

	// ── Right column ──
	const rightCol = columns.createDiv({ cls: "select-col-right" });

	rightCol.createEl("h2", { text: "Where is your extension?", cls: "select-right-heading" });

	// Benefits
	const benefits = [
		{ icon: "📋", bold: "2–3 minute", rest: " submission" },
		{ icon: "🤖", bold: "Optional AI", rest: " saves repetitive writing" },
		{ icon: "⚙️", bold: "", rest: "Smart defaults from git config" },
		{ icon: "✏️", bold: "", rest: "Everything is editable" }
	];

	const benefitsList = rightCol.createDiv({ cls: "select-benefits" });
	benefits.forEach(b => {
		const row = benefitsList.createDiv({ cls: "select-benefit-row" });
		row.createSpan({ text: b.icon, cls: "select-benefit-icon" });
		if (b.bold) {
			const span = row.createSpan();
			span.createEl("strong", { text: b.bold });
			span.appendText(b.rest);
		} else {
			row.createSpan({ text: b.rest });
		}
	});

	// Manifest Handling callout
	const manifestBox = rightCol.createDiv({ cls: "select-manifest-box" });
	manifestBox.createDiv({ cls: "select-manifest-header" }).innerHTML = "💡 <strong>Manifest Handling</strong>";

	const manifestText = manifestBox.createDiv({ cls: "select-manifest-text" });

	const updateManifestText = (): void => {
		manifestText.empty();
		manifestText.createSpan({ text: "✅ ", cls: "select-manifest-check" });
		const span = manifestText.createSpan();
		span.appendText("Provide a file or folder path. If your ");
		span.createEl("strong", { text: "extension folder" });
		span.appendText(" has a ");
		span.createEl("strong", { text: "manifest.json file" });
		span.appendText(", it will be used. Otherwise, Torqena will create one automatically.");
	};
	updateManifestText();

	// ── Wire events ──
	typeDropdown.addEventListener("change", () => {
		const val = typeDropdown.value as ExtensionType;
		context.submissionData.extensionType = val;
		pathInput.placeholder = getPlaceholder(val);
		updateFileHint(val);
	});

	pathInput.addEventListener("input", () => {
		context.submissionData.extensionPath = pathInput.value;
		// Reset cached state when path changes
		context.hasCompletedInitialValidation = false;
		context.generatedDescription = "";
		context.generatedReadme = "";
		context.generatedImagePath = null;
		context.isUpdate = false;
		context.catalogVersion = null;
		context.catalogExtensionId = null;
		context.submissionData.version = "";
		if (context.versionInput) {
			context.versionInput.setValue("");
		}
	});

	browseBtn.onClick(async () => {
		const result = await openExtensionPathDialog(context.app, context.submissionData.extensionType);
		if (result.error) {
			callbacks.showInlineMessage(messageContainer, result.error, "error");
			return;
		}
		if (!result.path) {
			return;
		}
		pathInput.value = result.path;
		pathInput.dispatchEvent(new Event("input"));
	});

	// Store reference so wizard can read value
	context.extensionPathInput = {
		getValue: () => pathInput.value,
		setValue: (v: string) => { pathInput.value = v; },
		inputEl: pathInput
	} as any;

	// Navigation buttons
	renderNavigationButtons(container, false, true);
}
