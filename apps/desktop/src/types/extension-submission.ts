/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ExtensionSubmission
 * @description Type definitions for extension submission workflow
 * 
 * Defines interfaces and types for the automated extension submission process,
 * including form data, validation, and submission status tracking.
 * 
 * @since 0.1.0
 */

/**
 * Extension type category
 */
export type ExtensionType = "agent" | "voice-agent" | "prompt" | "skill" | "mcp-server";

/**
 * Form data for extension submission
 */
export interface ExtensionSubmissionData {
	/** Extension type (agent, prompt, etc.) */
	extensionType: ExtensionType;
	
	/** Local path to the extension folder */
	extensionPath: string;
	
	/** Extension ID (from manifest) */
	extensionId: string;
	
	/** Extension name (from manifest) */
	extensionName: string;
	
	/** Extension version (from manifest) */
	version: string;
	
	/** GitHub username */
	githubUsername: string;
	
	/** Fork repository name (usually torqena-extensions) */
	forkRepoName: string;
	
	/** Branch name for the submission */
	branchName: string;
	
	/** Pull request title (optional, generated from extension info) */
	prTitle?: string;
	
	/** Pull request description (optional, generated from submission data) */
	prDescription?: string;
	
	/** Extension description (user-editable, may be AI-generated) */
	description?: string;
	
	/** Extension README content (user-editable, may be AI-generated) */
	readme?: string;
	
	/** Author name */
	authorName: string;
	
	/** Author URL (GitHub profile or personal website) */
	authorUrl: string;

	/** Changelog content for this version (used during updates) */
	changelog?: string;

	/** Version history entries */
	versions?: Array<{
		version: string;
		date: string;
		changes: string[];
	}>;
}

/**
 * Validation result for extension submission
 */
export interface ValidationResult {
	/** Whether validation passed */
	isValid: boolean;
	
	/** Validation errors (if any) */
	errors: string[];
	
	/** Validation warnings (if any) */
	warnings: string[];
	
	/** Extension manifest data */
	manifest?: ExtensionManifest;
}

/**
 * Extension manifest structure
 */
export interface ExtensionManifest {
	id: string;
	name: string;
	version: string;
	type: ExtensionType;
	description: string;
	author: {
		name: string;
		url: string;
	};
	repository?: string;
	license?: string;
	minVaultCopilotVersion: string;
	categories: string[];
	tags: string[];
	files: Array<{
		source: string;
		installPath: string;
	}>;
	tools?: string[];
	dependencies?: string[];
	preview?: string;
	featured?: boolean;
	changelog?: string;
	versions?: Array<{
		version: string;
		date: string;
		changes: string[];
	}>;
}

/**
 * Submission step status
 */
export type SubmissionStepStatus = "pending" | "in-progress" | "complete" | "error";

/**
 * Submission workflow step
 */
export interface SubmissionStep {
	/** Step identifier */
	id: string;
	
	/** Step display name */
	name: string;
	
	/** Step description */
	description: string;
	
	/** Current status */
	status: SubmissionStepStatus;
	
	/** Error message (if status is error) */
	error?: string;
}

/**
 * Complete submission workflow state
 */
export interface SubmissionWorkflowState {
	/** Current step index */
	currentStep: number;
	
	/** All workflow steps */
	steps: SubmissionStep[];
	
	/** Overall workflow status */
	status: "not-started" | "in-progress" | "complete" | "failed";
	
	/** Submission data */
	data?: ExtensionSubmissionData;
}
