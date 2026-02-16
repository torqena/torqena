/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/SubmissionProgressScreen
 * @description Progress screen showing GitHub automation tasks
 */

import { ButtonComponent } from "obsidian";
import type { SubmissionTask } from "./types";

/**
 * Renders the submission progress screen
 */
export async function renderSubmissionProgressScreen(
	container: HTMLElement,
	onSuccess: (prUrl: string) => void,
	onError: (error: Error) => void,
	showInlineMessage: (container: HTMLElement, message: string, type: 'error' | 'warning' | 'success' | 'info') => void
): Promise<void> {
	container.empty();
	container.addClass("submission-progress-screen");
	
	const progressContainer = container.createDiv({ cls: "loading-container" });
	
	// Title
	progressContainer.createEl("h2", {
		text: "Submitting Extension...",
		cls: "submission-progress-title"
	});
	
	// Spinner
	progressContainer.createDiv({ cls: "loading-spinner" });
	
	// Task list
	const taskList = progressContainer.createDiv({ cls: "submission-task-list" });
	
	// Define submission tasks
	const tasks: SubmissionTask[] = [
		{ id: "validate", label: "Validating extension files", icon: "○", status: "pending" },
		{ id: "fork", label: "Creating fork (if needed)", icon: "○", status: "pending" },
		{ id: "branch", label: "Creating branch", icon: "○", status: "pending" },
		{ id: "files", label: "Preparing extension files", icon: "○", status: "pending" },
		{ id: "manifest", label: "Generating manifest.json", icon: "○", status: "pending" },
		{ id: "commit", label: "Committing files", icon: "○", status: "pending" },
		{ id: "push", label: "Pushing to fork", icon: "○", status: "pending" },
		{ id: "pr", label: "Creating pull request", icon: "○", status: "pending" }
	];
	
	// Render tasks
	const taskElements: { [key: string]: HTMLElement } = {};
	tasks.forEach(task => {
		const taskEl = taskList.createEl("div", { cls: "submission-task pending" });
		const iconEl = taskEl.createEl("span", {
			text: task.icon,
			cls: "submission-task-icon"
		});
		taskEl.createEl("span", {
			text: task.label,
			cls: "submission-task-text"
		});
		taskElements[task.id] = taskEl;
		taskElements[`${task.id}-icon`] = iconEl;
	});
	
	// Execute tasks sequentially
	// TODO: Replace with actual GitHub CLI automation
	try {
		for (const task of tasks) {
			// Update to in-progress
			const taskEl = taskElements[task.id];
			const iconEl = taskElements[`${task.id}-icon`];
			
			if (taskEl) {
				taskEl.removeClass("pending", "complete", "error");
				taskEl.addClass("in-progress");
			}
			if (iconEl) {
				iconEl.setText("◐");
			}
			
			// Simulate task execution
			// TODO: Replace this delay with actual GitHub CLI operations
			await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));
			
			// Update to complete
			if (taskEl) {
				taskEl.removeClass("in-progress");
				taskEl.addClass("complete");
			}
			if (iconEl) {
				iconEl.setText("✓");
			}
		}
		
		// Show success screen
		// TODO: Replace placeholder URL with actual PR URL from gh pr create command
		onSuccess("https://github.com/danielshue/torqena-extensions/pull/123");
		
	} catch (error) {
		console.error("Submission error:", error);
		
		// Show error in modal
		container.empty();
		container.removeClass("submission-progress-screen");
		
		const errorContainer = container.createDiv({ cls: "submission-progress-screen" });
		const messageContainer = errorContainer.createDiv({ cls: "step-message-container" });
		showInlineMessage(messageContainer, "Extension submission failed. Please try again or submit manually.", 'error');
		
		// Add a close button
		new ButtonComponent(errorContainer)
			.setButtonText("Close")
			.onClick(() => {
				onError(error instanceof Error ? error : new Error("Unknown error"));
			});
	}
}
