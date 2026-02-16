/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module InlineQuestionRenderer
 * @description Renders interactive question UI elements inline within the chat
 * conversation flow, replacing the modal-based approach for a more natural experience.
 *
 * Questions appear as styled cards in the messages container, allowing users to
 * answer text, multipleChoice, radio, and mixed questions without leaving the chat.
 *
 * @example
 * ```typescript
 * const renderer = new InlineQuestionRenderer(messagesContainer);
 * const response = await renderer.render(questionRequest);
 * ```
 *
 * @see {@link QuestionModal} for the legacy modal-based implementation
 * @since 0.0.18
 */

import type {
	QuestionRequest,
	QuestionResponse,
	TextQuestionRequest,
	MultipleChoiceQuestionRequest,
	RadioQuestionRequest,
	MixedQuestionRequest,
} from "../../types/questions";

/**
 * Renders a question inline in the chat messages container and returns
 * a Promise that resolves with the user's response.
 *
 * After the user submits or skips, the interactive controls are replaced
 * with a static summary of the answer.
 *
 * @since 0.0.18
 */
export class InlineQuestionRenderer {
	private container: HTMLElement;
	private questionEl: HTMLElement | null = null;
	private selectedOptions: Set<string> = new Set();
	private textInput: HTMLInputElement | HTMLTextAreaElement | null = null;
	private resolve: ((response: QuestionResponse | null) => void) | null = null;

	/**
	 * @param container - The messages container element to append the question into
	 */
	constructor(container: HTMLElement) {
		this.container = container;
	}

	/**
	 * Render a question inline in the chat and wait for the user's response.
	 *
	 * @param question - The question request to render
	 * @returns Promise resolving to the user's response, or null if skipped/cancelled
	 *
	 * @example
	 * ```typescript
	 * const renderer = new InlineQuestionRenderer(this.messagesContainer);
	 * const response = await renderer.render({
	 *   id: 'mood',
	 *   type: 'radio',
	 *   question: 'How are you feeling today?',
	 *   options: ['Great', 'Good', 'Okay', 'Not great'],
	 *   required: true
	 * });
	 * ```
	 */
	render(question: QuestionRequest): Promise<QuestionResponse | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.selectedOptions.clear();
			this.textInput = null;

			// Create the inline question card
			this.questionEl = this.container.createDiv({ cls: "vc-inline-question" });

			// Question icon + text header
			const headerEl = this.questionEl.createDiv({ cls: "vc-inline-question-header" });
			headerEl.createSpan({ text: "❓", cls: "vc-inline-question-icon" });
			headerEl.createSpan({ text: question.question, cls: "vc-inline-question-title" });

			// Context (if provided)
			if (question.context) {
				this.questionEl.createDiv({
					text: question.context,
					cls: "vc-inline-question-context",
				});
			}

			// Render type-specific UI
			const bodyEl = this.questionEl.createDiv({ cls: "vc-inline-question-body" });
			switch (question.type) {
				case "text":
					this.renderTextQuestion(bodyEl, question as TextQuestionRequest);
					break;
				case "multipleChoice":
					this.renderMultipleChoiceQuestion(bodyEl, question as MultipleChoiceQuestionRequest);
					break;
				case "radio":
					this.renderRadioQuestion(bodyEl, question as RadioQuestionRequest);
					break;
				case "mixed":
					this.renderMixedQuestion(bodyEl, question as MixedQuestionRequest);
					break;
			}

			// Action buttons
			const actionsEl = this.questionEl.createDiv({ cls: "vc-inline-question-actions" });

			const submitBtn = actionsEl.createEl("button", {
				text: "Submit",
				cls: "vc-inline-question-btn vc-inline-question-submit",
			});
			submitBtn.addEventListener("click", () => this.submitResponse(question));

			if (question.required === false) {
				const skipBtn = actionsEl.createEl("button", {
					text: "Skip",
					cls: "vc-inline-question-btn vc-inline-question-skip",
				});
				skipBtn.addEventListener("click", () => this.finalize(null, question));
			}

			// Scroll into view
			this.container.scrollTop = this.container.scrollHeight;

			// Focus input if text type
			if (this.textInput) {
				setTimeout(() => this.textInput?.focus(), 50);
			}
		});
	}

	// ─── Type-specific renderers ──────────────────────────────────

	/**
	 * Render a text input question
	 * @internal
	 */
	private renderTextQuestion(container: HTMLElement, question: TextQuestionRequest): void {
		const inputContainer = container.createDiv({ cls: "vc-inline-question-input-container" });

		if (question.multiline) {
			this.textInput = inputContainer.createEl("textarea", {
				placeholder: question.placeholder || "Enter your response...",
				cls: "vc-inline-question-textarea",
			});
			(this.textInput as HTMLTextAreaElement).rows = 4;
		} else {
			this.textInput = inputContainer.createEl("input", {
				type: "text",
				placeholder: question.placeholder || "Enter your response...",
				cls: "vc-inline-question-input",
			});

			// Enter to submit for single-line
			this.textInput.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter") {
					e.preventDefault();
					this.submitResponse(question);
				}
			});
		}

		if (question.defaultValue) {
			this.textInput.value = question.defaultValue;
		}
	}

	/**
	 * Render a multiple choice question with checkboxes
	 * @internal
	 */
	private renderMultipleChoiceQuestion(
		container: HTMLElement,
		question: MultipleChoiceQuestionRequest
	): void {
		const optionsContainer = container.createDiv({ cls: "vc-inline-question-options" });

		if (question.defaultSelected) {
			question.defaultSelected.forEach((opt: string) => this.selectedOptions.add(opt));
		}

		for (const option of question.options) {
			const optionEl = optionsContainer.createDiv({ cls: "vc-inline-question-option" });

			const checkbox = optionEl.createEl("input", { type: "checkbox" });
			checkbox.addClass("vc-inline-question-checkbox");
			checkbox.checked = this.selectedOptions.has(option);

			const label = optionEl.createEl("label", { text: option });
			label.addClass("vc-inline-question-label");

			const toggleSelection = () => {
				if (this.selectedOptions.has(option)) {
					this.selectedOptions.delete(option);
					checkbox.checked = false;
				} else {
					if (!question.allowMultiple) {
						this.selectedOptions.clear();
						optionsContainer
							.querySelectorAll('input[type="checkbox"]')
							.forEach((el) => {
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

	/**
	 * Render a radio button question
	 * @internal
	 */
	private renderRadioQuestion(container: HTMLElement, question: RadioQuestionRequest): void {
		const optionsContainer = container.createDiv({ cls: "vc-inline-question-options" });

		if (question.defaultSelected) {
			this.selectedOptions.add(question.defaultSelected);
		}

		const radioName = `vc-iq-radio-${question.id}`;

		for (const option of question.options) {
			const optionEl = optionsContainer.createDiv({ cls: "vc-inline-question-option" });

			const radio = optionEl.createEl("input", {
				type: "radio",
				attr: { name: radioName },
			});
			radio.addClass("vc-inline-question-radio");
			radio.checked = this.selectedOptions.has(option);

			const label = optionEl.createEl("label", { text: option });
			label.addClass("vc-inline-question-label");

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

	/**
	 * Render a mixed question (checkboxes + text input)
	 * @internal
	 */
	private renderMixedQuestion(container: HTMLElement, question: MixedQuestionRequest): void {
		// Checkbox options
		const optionsContainer = container.createDiv({ cls: "vc-inline-question-options" });

		if (question.defaultSelected) {
			question.defaultSelected.forEach((opt: string) => this.selectedOptions.add(opt));
		}

		for (const option of question.options) {
			const optionEl = optionsContainer.createDiv({ cls: "vc-inline-question-option" });

			const checkbox = optionEl.createEl("input", { type: "checkbox" });
			checkbox.addClass("vc-inline-question-checkbox");
			checkbox.checked = this.selectedOptions.has(option);

			const label = optionEl.createEl("label", { text: option });
			label.addClass("vc-inline-question-label");

			const toggleSelection = () => {
				if (this.selectedOptions.has(option)) {
					this.selectedOptions.delete(option);
					checkbox.checked = false;
				} else {
					if (!question.allowMultiple) {
						this.selectedOptions.clear();
						optionsContainer
							.querySelectorAll('input[type="checkbox"]')
							.forEach((el) => {
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

		// Separator
		container.createDiv({ cls: "vc-inline-question-separator" });

		// Text input
		const inputContainer = container.createDiv({ cls: "vc-inline-question-input-container" });

		if (question.textLabel) {
			inputContainer.createEl("label", {
				text: question.textLabel,
				cls: "vc-inline-question-text-label",
			});
		}

		this.textInput = inputContainer.createEl("input", {
			type: "text",
			placeholder: question.textPlaceholder || "Additional notes (optional)...",
			cls: "vc-inline-question-input",
		});
	}

	// ─── Submission logic ─────────────────────────────────────────

	/**
	 * Gather the response from the UI and finalize
	 * @internal
	 */
	private submitResponse(question: QuestionRequest): void {
		let response: QuestionResponse | null = null;

		switch (question.type) {
			case "text": {
				const text = this.textInput?.value || "";
				if (question.required && !text.trim()) {
					return; // Validation: required + empty
				}
				response = { type: "text", text: text.trim() };
				break;
			}
			case "multipleChoice":
			case "radio": {
				if (question.required && this.selectedOptions.size === 0) {
					return; // Validation: required + no selection
				}
				response = {
					type: question.type,
					selected: Array.from(this.selectedOptions),
				};
				break;
			}
			case "mixed": {
				const mixedText = (this.textInput as HTMLInputElement)?.value || "";
				if (question.required && this.selectedOptions.size === 0 && !mixedText.trim()) {
					return; // Validation: both empty but required
				}
				response = {
					type: "mixed",
					selected: Array.from(this.selectedOptions),
					text: mixedText.trim() || undefined,
				};
				break;
			}
		}

		this.finalize(response, question);
	}

	/**
	 * Replace the interactive question card with a static summary and resolve the promise.
	 * @internal
	 */
	private finalize(response: QuestionResponse | null, question: QuestionRequest): void {
		if (!this.questionEl || !this.resolve) {
			return;
		}

		// Replace the card content with a static answered summary
		this.questionEl.empty();
		this.questionEl.removeClass("vc-inline-question");
		this.questionEl.addClass("vc-inline-question-answered");

		// Compact header showing what was asked
		const headerEl = this.questionEl.createDiv({ cls: "vc-inline-question-answered-header" });
		headerEl.createSpan({ text: "✅", cls: "vc-inline-question-icon" });
		headerEl.createSpan({
			text: question.question,
			cls: "vc-inline-question-answered-title",
		});

		// Show the answer
		const answerEl = this.questionEl.createDiv({ cls: "vc-inline-question-answered-value" });

		if (!response) {
			answerEl.createSpan({ text: "Skipped", cls: "vc-inline-question-skipped" });
		} else {
			switch (response.type) {
				case "text":
					answerEl.createSpan({ text: response.text || "(empty)" });
					break;
				case "multipleChoice":
				case "radio":
					if (response.selected.length > 0) {
						const tagsEl = answerEl.createDiv({ cls: "vc-inline-question-answer-tags" });
						for (const sel of response.selected) {
							tagsEl.createSpan({ text: sel, cls: "vc-inline-question-answer-tag" });
						}
					} else {
						answerEl.createSpan({ text: "(none selected)" });
					}
					break;
				case "mixed": {
					const parts: string[] = [];
					if (response.selected.length > 0) {
						const tagsEl = answerEl.createDiv({ cls: "vc-inline-question-answer-tags" });
						for (const sel of response.selected) {
							tagsEl.createSpan({ text: sel, cls: "vc-inline-question-answer-tag" });
						}
					}
					if (response.text) {
						parts.push(response.text);
					}
					if (response.text) {
						answerEl.createDiv({
							text: response.text,
							cls: "vc-inline-question-answer-text",
						});
					}
					if (response.selected.length === 0 && !response.text) {
						answerEl.createSpan({ text: "(empty)" });
					}
					break;
				}
			}
		}

		// Scroll to show the finalized answer
		this.container.scrollTop = this.container.scrollHeight;

		// Resolve the promise
		this.resolve(response);
		this.resolve = null;
	}
}
