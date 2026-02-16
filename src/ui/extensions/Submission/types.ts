/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/types
 * @description Shared types for extension submission screens
 */

import type {
	ExtensionSubmissionData,
	ExtensionType,
	ValidationResult,
	ExtensionManifest,
} from "../../../types/extension-submission";
import type { AIServiceManager as VaultCopilotPlugin } from "../../../app/AIServiceManager";
import type { App, TextComponent } from "obsidian";
import type { CatalogEntryMetadata } from "./utils";

/**
 * Submission task status for progress tracking
 */
export interface SubmissionTask {
	id: string;
	label: string;
	icon: string;
	status: "pending" | "in-progress" | "complete" | "error";
}

/**
 * Loading task for interim screens
 */
export interface LoadingTask {
	name: string;
	status: "pending" | "in-progress" | "complete";
}

/**
 * Screen component context - shared data passed to all screens
 */
export interface ScreenContext {
	app: App;
	plugin: VaultCopilotPlugin | undefined;
	submissionData: Partial<ExtensionSubmissionData>;
	
	// Form elements (shared across screens)
	extensionPathInput: TextComponent | null;
	versionInput: TextComponent | null;
	authorNameInput: TextComponent | null;
	authorUrlInput: TextComponent | null;
	descriptionInput: HTMLTextAreaElement | null;
	readmeInput: HTMLTextAreaElement | null;
	
	// Image paths
	iconImagePath: string | null;
	previewImagePath: string | null;
	generatedImagePath: string | null;
	
	// AI generation state
	isGeneratingContent: boolean;
	isGeneratingImage: boolean;
	generatedDescription: string;
	generatedReadme: string;
	
	// Validation state
	hasCompletedInitialValidation: boolean;
	skipAIGeneration: boolean;
	
	// Update detection
	/** Whether this submission is an update to an existing catalog extension */
	isUpdate: boolean;
	/** The version currently published in the catalog (if updating) */
	catalogVersion: string | null;
	/** The actual extension ID in the catalog (may differ from derived ID) */
	catalogExtensionId: string | null;
	/** Metadata from the existing catalog entry (categories, tags, etc.) */
	catalogMetadata: CatalogEntryMetadata | null;
	
	// Changelog state (for updates)
	/** Generated changelog content for this version */
	generatedChangelog: string;
	/** Whether changelog generation is in progress */
	isGeneratingChangelog: boolean;
	/** Reference to the changelog textarea element */
	changelogInput: HTMLTextAreaElement | null;
}

/**
 * Callbacks for screen navigation and actions
 */
export interface ScreenCallbacks {
	onNext: () => void;
	onBack: () => void;
	onClose: () => void;
	onSubmit: () => void;
	onRender: () => void;
	showInlineMessage: (container: HTMLElement, message: string, type: 'error' | 'warning' | 'success' | 'info') => void;
}

// Re-export types from extension-submission for convenience
export type {
	ExtensionSubmissionData,
	ExtensionType,
	ValidationResult,
	ExtensionManifest,
};
