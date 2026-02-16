/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module QuestionModal
 * @description Modal for displaying agent questions to the user.
 * 
 * This modal renders different types of questions:
 * - Text input: Simple or multiline text entry
 * - Multiple choice: Checkbox list for selecting multiple options
 * - Radio: Radio button list for single selection
 * - Mixed: Combination of checkbox list and text input
 * 
 * @since 0.0.17
 */

import { App, Modal, ButtonComponent } from "obsidian";
import type {
	QuestionRequest,
	QuestionResponse,
	TextQuestionRequest,
	MultipleChoiceQuestionRequest,
	RadioQuestionRequest,
	MixedQuestionRequest,
} from "../../types/questions";

/**
 * Modal for asking questions to the user
 */
export class QuestionModal extends Modal {
	private question: QuestionRequest;
	private resolve: (response: QuestionResponse | null) => void;
	private response: QuestionResponse | null = null;

	// UI elements
	private selectedOptions: Set<string> = new Set();
	private textInput: HTMLInputElement | HTMLTextAreaElement | null = null;

	constructor(app: App, question: QuestionRequest, resolve: (response: QuestionResponse | null) => void) {
		super(app);
		this.question = question;
		this.resolve = resolve;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("copilot-question-modal");

		// Title
		const titleEl = contentEl.createEl("h2", { text: this.question.question });
		titleEl.addClass("copilot-question-title");

		// Context (if provided)
		if (this.question.context) {
			const contextEl = contentEl.createDiv({ text: this.question.context });
			contextEl.addClass("copilot-question-context");
		}

		// Render question type-specific UI
		switch (this.question.type) {
			case "text":
				this.renderTextQuestion(contentEl, this.question as TextQuestionRequest);
				break;
			case "multipleChoice":
				this.renderMultipleChoiceQuestion(contentEl, this.question as MultipleChoiceQuestionRequest);
				break;
			case "radio":
				this.renderRadioQuestion(contentEl, this.question as RadioQuestionRequest);
				break;
			case "mixed":
				this.renderMixedQuestion(contentEl, this.question as MixedQuestionRequest);
				break;
		}

		// Buttons
		const buttonsEl = contentEl.createDiv();
		buttonsEl.addClass("copilot-question-buttons");

		// Submit button
		new ButtonComponent(buttonsEl)
			.setButtonText("Submit")
			.setCta()
			.onClick(() => {
				this.submitResponse();
			});

		// Cancel button (only if question is not required)
		if (this.question.required === false) {
			new ButtonComponent(buttonsEl)
				.setButtonText("Skip")
				.onClick(() => {
					this.close();
				});
		}
	}

	private renderTextQuestion(container: HTMLElement, question: TextQuestionRequest) {
		const inputContainer = container.createDiv();
		inputContainer.addClass("copilot-question-input-container");

		if (question.multiline) {
			this.textInput = inputContainer.createEl("textarea", {
				placeholder: question.placeholder || "Enter your response...",
			});
			this.textInput.addClass("copilot-question-textarea");
			this.textInput.rows = 5;
		} else {
			this.textInput = inputContainer.createEl("input", {
				type: "text",
				placeholder: question.placeholder || "Enter your response...",
			});
			this.textInput.addClass("copilot-question-input");
		}

		if (question.defaultValue) {
			this.textInput.value = question.defaultValue;
		}

		// Submit on Enter for single-line input
		if (!question.multiline) {
			this.textInput.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter") {
					e.preventDefault();
					this.submitResponse();
				}
			});
		}

		// Focus the input
		setTimeout(() => this.textInput?.focus(), 10);
	}

	private renderMultipleChoiceQuestion(
		container: HTMLElement,
		question: MultipleChoiceQuestionRequest
	) {
		const optionsContainer = container.createDiv();
		optionsContainer.addClass("copilot-question-options");

		// Pre-select default options
		if (question.defaultSelected) {
			question.defaultSelected.forEach((opt: string) => this.selectedOptions.add(opt));
		}

		for (const option of question.options) {
			const optionEl = optionsContainer.createDiv();
			optionEl.addClass("copilot-question-option");

			const checkbox = optionEl.createEl("input", {
				type: "checkbox",
			});
			checkbox.addClass("copilot-question-checkbox");
			checkbox.checked = this.selectedOptions.has(option);

			const label = optionEl.createEl("label", { text: option });
			label.addClass("copilot-question-label");

			// Handle selection
			const toggleSelection = () => {
				if (this.selectedOptions.has(option)) {
					this.selectedOptions.delete(option);
					checkbox.checked = false;
				} else {
					if (!question.allowMultiple) {
						// Single selection mode - clear others
						this.selectedOptions.clear();
						optionsContainer.querySelectorAll('input[type="checkbox"]').forEach((el) => {
							(el as HTMLInputElement).checked = false;
						});
					}
					this.selectedOptions.add(option);
					checkbox.checked = true;
				}
			};

			checkbox.addEventListener("change", toggleSelection);
			label.addEventListener("click", (e) => {
				e.preventDefault();
				toggleSelection();
			});
		}
	}

	private renderRadioQuestion(container: HTMLElement, question: RadioQuestionRequest) {
		const optionsContainer = container.createDiv();
		optionsContainer.addClass("copilot-question-options");

		// Pre-select default option
		if (question.defaultSelected) {
			this.selectedOptions.add(question.defaultSelected);
		}

		const radioName = `question-radio-${this.question.id}`;

		for (const option of question.options) {
			const optionEl = optionsContainer.createDiv();
			optionEl.addClass("copilot-question-option");

			const radio = optionEl.createEl("input", {
				type: "radio",
				attr: { name: radioName },
			});
			radio.addClass("copilot-question-radio");
			radio.checked = this.selectedOptions.has(option);

			const label = optionEl.createEl("label", { text: option });
			label.addClass("copilot-question-label");

			// Handle selection
			const selectOption = () => {
				this.selectedOptions.clear();
				this.selectedOptions.add(option);
				optionsContainer.querySelectorAll('input[type="radio"]').forEach((el) => {
					(el as HTMLInputElement).checked = false;
				});
				radio.checked = true;
			};

			radio.addEventListener("change", selectOption);
			label.addEventListener("click", (e) => {
				e.preventDefault();
				selectOption();
			});
		}
	}

	private renderMixedQuestion(container: HTMLElement, question: MixedQuestionRequest) {
		// Render checkbox options
		const optionsContainer = container.createDiv();
		optionsContainer.addClass("copilot-question-options");

		// Pre-select default options
		if (question.defaultSelected) {
			question.defaultSelected.forEach((opt: string) => this.selectedOptions.add(opt));
		}

		for (const option of question.options) {
			const optionEl = optionsContainer.createDiv();
			optionEl.addClass("copilot-question-option");

			const checkbox = optionEl.createEl("input", {
				type: "checkbox",
			});
			checkbox.addClass("copilot-question-checkbox");
			checkbox.checked = this.selectedOptions.has(option);

			const label = optionEl.createEl("label", { text: option });
			label.addClass("copilot-question-label");

			// Handle selection
			const toggleSelection = () => {
				if (this.selectedOptions.has(option)) {
					this.selectedOptions.delete(option);
					checkbox.checked = false;
				} else {
					if (!question.allowMultiple) {
						// Single selection mode - clear others
						this.selectedOptions.clear();
						optionsContainer.querySelectorAll('input[type="checkbox"]').forEach((el) => {
							(el as HTMLInputElement).checked = false;
						});
					}
					this.selectedOptions.add(option);
					checkbox.checked = true;
				}
			};

			checkbox.addEventListener("change", toggleSelection);
			label.addEventListener("click", (e) => {
				e.preventDefault();
				toggleSelection();
			});
		}

		// Add separator
		const separator = container.createDiv();
		separator.addClass("copilot-question-separator");

		// Render text input
		const inputContainer = container.createDiv();
		inputContainer.addClass("copilot-question-input-container");

		if (question.textLabel) {
			const labelEl = inputContainer.createEl("label", { text: question.textLabel });
			labelEl.addClass("copilot-question-text-label");
		}

		this.textInput = inputContainer.createEl("input", {
			type: "text",
			placeholder: question.textPlaceholder || "Additional notes (optional)...",
		});
		this.textInput.addClass("copilot-question-input");
	}

	private submitResponse() {
		let response: QuestionResponse | null = null;

		switch (this.question.type) {
			case "text":
				const text = (this.textInput as HTMLInputElement | HTMLTextAreaElement)?.value || "";
				if (this.question.required && !text.trim()) {
					// Required field is empty
					return;
				}
				response = {
					type: "text",
					text: text.trim(),
				};
				break;

			case "multipleChoice":
			case "radio":
				if (this.question.required && this.selectedOptions.size === 0) {
					// Required selection is empty
					return;
				}
				response = {
					type: this.question.type,
					selected: Array.from(this.selectedOptions),
				};
				break;

			case "mixed":
				const mixedText = (this.textInput as HTMLInputElement)?.value || "";
				if (this.question.required && this.selectedOptions.size === 0 && !mixedText.trim()) {
					// Both are empty but required
					return;
				}
				response = {
					type: "mixed",
					selected: Array.from(this.selectedOptions),
					text: mixedText.trim() || undefined,
				};
				break;
		}

		this.response = response;
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		// Resolve with response (null if cancelled)
		this.resolve(this.response);
	}
}
