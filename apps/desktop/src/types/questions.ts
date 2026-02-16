/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Questions
 * @description Types and interfaces for user question functionality.
 * 
 * This module defines the structure for questions that Agents, Skills, and
 * the RealTime Agent can ask users to gather additional information for the LLM.
 * 
 * ## Question Types
 * 
 * - **text**: Simple text input from the user
 * - **multipleChoice**: User selects one or more options from a list
 * - **radio**: User selects exactly one option from a list
 * - **mixed**: Multiple choice with an optional text input field
 * 
 * @example Text Question
 * ```typescript
 * const question: QuestionRequest = {
 *   id: 'q1',
 *   type: 'text',
 *   question: 'What is the title of the note you want to create?',
 *   placeholder: 'Enter note title...'
 * };
 * ```
 * 
 * @example Multiple Choice Question
 * ```typescript
 * const question: QuestionRequest = {
 *   id: 'q2',
 *   type: 'multipleChoice',
 *   question: 'Which tags should I add to this note?',
 *   options: ['#project', '#meeting', '#ideas', '#todo'],
 *   allowMultiple: true
 * };
 * ```
 * 
 * @since 0.0.17
 */

/**
 * Type of question to ask the user
 */
export type QuestionType = "text" | "multipleChoice" | "radio" | "mixed";

/**
 * Base interface for all question requests
 */
export interface BaseQuestionRequest {
	/** Unique identifier for this question */
	id: string;
	/** Type of question */
	type: QuestionType;
	/** The question to ask the user */
	question: string;
	/** Optional context or explanation */
	context?: string;
	/** Whether this question is required (default: true) */
	required?: boolean;
}

/**
 * Text input question - user provides free-form text
 */
export interface TextQuestionRequest extends BaseQuestionRequest {
	type: "text";
	/** Placeholder text for the input field */
	placeholder?: string;
	/** Default value */
	defaultValue?: string;
	/** Whether to use a multiline textarea (default: false) */
	multiline?: boolean;
}

/**
 * Multiple choice question - user selects one or more options
 */
export interface MultipleChoiceQuestionRequest extends BaseQuestionRequest {
	type: "multipleChoice";
	/** Available options to choose from */
	options: string[];
	/** Allow selecting multiple options (default: false) */
	allowMultiple?: boolean;
	/** Pre-selected options */
	defaultSelected?: string[];
}

/**
 * Radio button question - user selects exactly one option
 */
export interface RadioQuestionRequest extends BaseQuestionRequest {
	type: "radio";
	/** Available options to choose from */
	options: string[];
	/** Pre-selected option */
	defaultSelected?: string;
}

/**
 * Mixed question - multiple choice with optional text input
 */
export interface MixedQuestionRequest extends BaseQuestionRequest {
	type: "mixed";
	/** Available options to choose from */
	options: string[];
	/** Allow selecting multiple options (default: false) */
	allowMultiple?: boolean;
	/** Pre-selected options */
	defaultSelected?: string[];
	/** Placeholder for the text input */
	textPlaceholder?: string;
	/** Label for the text input field */
	textLabel?: string;
}

/**
 * Union type for all question request types
 */
export type QuestionRequest =
	| TextQuestionRequest
	| MultipleChoiceQuestionRequest
	| RadioQuestionRequest
	| MixedQuestionRequest;

/**
 * Response from a text question
 */
export interface TextQuestionResponse {
	type: "text";
	/** The text provided by the user */
	text: string;
}

/**
 * Response from a multiple choice or radio question
 */
export interface ChoiceQuestionResponse {
	type: "multipleChoice" | "radio";
	/** The selected options */
	selected: string[];
}

/**
 * Response from a mixed question
 */
export interface MixedQuestionResponse {
	type: "mixed";
	/** The selected options */
	selected: string[];
	/** Additional text provided by the user */
	text?: string;
}

/**
 * Union type for all question response types
 */
export type QuestionResponse =
	| TextQuestionResponse
	| ChoiceQuestionResponse
	| MixedQuestionResponse;

/**
 * Complete question result including the request and response
 */
export interface QuestionResult {
	/** The original question request */
	request: QuestionRequest;
	/** The user's response */
	response: QuestionResponse | null;
	/** Whether the user answered or skipped/cancelled */
	answered: boolean;
	/** Timestamp when the question was asked */
	askedAt: Date;
	/** Timestamp when the question was answered */
	answeredAt?: Date;
}

/**
 * Callback type for handling question requests
 * 
 * @param question - The question to ask the user
 * @returns Promise that resolves to the user's response or null if cancelled
 */
export type QuestionHandler = (question: QuestionRequest) => Promise<QuestionResponse | null>;
