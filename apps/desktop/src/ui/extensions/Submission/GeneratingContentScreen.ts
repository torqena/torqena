/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Submission/GeneratingContentScreen
 * @description Loading screen with progress for content generation
 */

import type { LoadingTask } from "./types";

/**
 * Renders the loading screen with progressive task status
 */
export function renderGeneratingContentScreen(
	container: HTMLElement,
	currentTask: string,
	tasks: LoadingTask[]
): void {
	container.empty();
	container.addClass("extension-submission-modal");
	container.addClass("loading-screen");
	
	const loadingContainer = container.createDiv({ cls: "loading-container" });
	
	// Spinner
	loadingContainer.createDiv({ cls: "loading-spinner" });
	
	// Message
	loadingContainer.createEl("h2", { text: "Reviewing information...", cls: "loading-message" });
	
	// Current task
	loadingContainer.createEl("p", { 
		text: currentTask,
		cls: "loading-current-task"
	});
	
	// Task list
	const taskList = loadingContainer.createDiv({ cls: "loading-task-list" });
	tasks.forEach(task => {
		const taskItem = taskList.createDiv({ cls: `loading-task ${task.status}` });
		
		// Status icon
		let icon = "○"; // pending
		if (task.status === 'in-progress') icon = "◐";
		if (task.status === 'complete') icon = "✓";
		
		taskItem.createSpan({ text: icon, cls: "task-icon" });
		taskItem.createSpan({ text: task.name, cls: "task-name" });
	});
}
