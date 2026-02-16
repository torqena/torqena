// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module SessionPanel
 * @description Sidebar panel for listing, filtering, and managing chat sessions.
 *
 * Renders session metadata, supports archiving/deleting, and exposes context menu
 * actions for Vault Copilot chat workflows.
 *
 * @since 0.0.14
 */

import { Menu } from "obsidian";
import { setIcon } from "../../platform/utils/icons";
import { AIServiceManager as CopilotPlugin } from "../../app/AIServiceManager";
import { CopilotSession } from "../../ui/settings";

/**
 * Format a timestamp as a relative time string (e.g., "5 mins ago")
 */
function formatTimeAgo(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	
	if (seconds < 60) return "just now";
	if (minutes < 60) return `${minutes} min${minutes !== 1 ? 's' : ''} ago`;
	if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
	if (days === 1) return "yesterday";
	if (days < 7) return `${days} days ago`;
	return new Date(timestamp).toLocaleDateString();
}

/**
 * Format duration in milliseconds to a readable string
 */
function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	
	if (seconds < 60) return `${seconds}s`;
	if (minutes < 60) return `${minutes} min${minutes !== 1 ? 's' : ''}`;
	return `${hours}h ${minutes % 60}m`;
}

/**
 * Check if a timestamp is from today
 */
function isToday(timestamp: number): boolean {
	const today = new Date();
	const date = new Date(timestamp);
	return date.getDate() === today.getDate() &&
		date.getMonth() === today.getMonth() &&
		date.getFullYear() === today.getFullYear();
}

export interface SessionPanelCallbacks {
	onSessionSelect: (session: CopilotSession) => void;
	onNewSession: () => void;
	onClose: () => void;
	onExpand?: () => void;
}

export class SessionPanel {
	private plugin: CopilotPlugin;
	private containerEl: HTMLElement;
	private callbacks: SessionPanelCallbacks;
	private archivedExpanded = false;
	private searchQuery = "";
	private filterMode: "all" | "today" | "archived" = "all";

	constructor(
		plugin: CopilotPlugin,
		containerEl: HTMLElement,
		callbacks: SessionPanelCallbacks
	) {
		this.plugin = plugin;
		this.containerEl = containerEl;
		this.callbacks = callbacks;
	}

	render(): void {
		this.containerEl.empty();
		this.containerEl.addClass("vc-session-panel");

		// Title bar with SESSIONS and toolbar icons
		const titleBar = this.containerEl.createDiv({ cls: "vc-session-titlebar" });
		titleBar.createSpan({ cls: "vc-session-titlebar-text", text: "SESSIONS" });
		
		// Toolbar icons (right-justified on the same line)
		const toolbar = titleBar.createDiv({ cls: "vc-session-toolbar" });
		
		// Refresh button
		const refreshBtn = toolbar.createEl("button", { 
			cls: "vc-header-btn vc-session-toolbar-btn",
			attr: { "aria-label": "Refresh" }
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.addEventListener("click", () => this.render());
		
		// Search button
		const searchBtn = toolbar.createEl("button", { 
			cls: "vc-header-btn vc-session-toolbar-btn",
			attr: { "aria-label": "Search" }
		});
		setIcon(searchBtn, "search");
		searchBtn.addEventListener("click", () => this.toggleSearch());
		
		// Filter button
		const filterBtn = toolbar.createEl("button", { 
			cls: "vc-header-btn vc-session-toolbar-btn",
			attr: { "aria-label": "Filter" }
		});
		setIcon(filterBtn, "filter");
		filterBtn.addEventListener("click", (e) => this.showFilterMenu(e));
		
		// Close panel button
		const closeBtn = toolbar.createEl("button", { 
			cls: "vc-header-btn vc-session-toolbar-btn",
			attr: { "aria-label": "Close" }
		});
		// Match the working expand-session icon
		setIcon(closeBtn, "panel-right");
		closeBtn.addEventListener("click", () => {
			if (this.callbacks.onClose) this.callbacks.onClose();
		});

		// Search bar (hidden by default)
		const searchBar = this.containerEl.createDiv({ cls: "vc-session-search-bar vc-hidden" });
		const searchInput = searchBar.createEl("input", {
			cls: "vc-session-search-input",
			attr: { 
				type: "text", 
				placeholder: "Search sessions...",
				value: this.searchQuery
			}
		});
		searchInput.addEventListener("input", (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
			this.renderSessionList();
		});

		// Header with New Session button
		const header = this.containerEl.createDiv({ cls: "vc-session-panel-header" });
		
		const newSessionBtn = header.createEl("button", { 
			cls: "vc-session-new-btn"
		});
		const plusIcon = newSessionBtn.createSpan();
		setIcon(plusIcon, "plus");
		newSessionBtn.createSpan({ text: " New Session" });
		newSessionBtn.addEventListener("click", () => this.callbacks.onNewSession());

		// Content area for sessions
		this.containerEl.createDiv({ cls: "vc-session-panel-content" });
		this.renderSessionList();
	}

	private toggleSearch(): void {
		const searchBar = this.containerEl.querySelector(".vc-session-search-bar");
		if (searchBar) {
			searchBar.classList.toggle("vc-hidden");
			if (!searchBar.classList.contains("vc-hidden")) {
				const input = searchBar.querySelector("input");
				if (input) input.focus();
			} else {
				this.searchQuery = "";
				this.renderSessionList();
			}
		}
	}

	private showFilterMenu(event: MouseEvent): void {
		const menu = new Menu();
		
		menu.addItem((item) => {
			item.setTitle("All sessions");
			item.setIcon(this.filterMode === "all" ? "check" : "");
			item.onClick(() => {
				this.filterMode = "all";
				this.renderSessionList();
			});
		});
		
		menu.addItem((item) => {
			item.setTitle("Today only");
			item.setIcon(this.filterMode === "today" ? "check" : "");
			item.onClick(() => {
				this.filterMode = "today";
				this.renderSessionList();
			});
		});
		
		menu.addItem((item) => {
			item.setTitle("Archived only");
			item.setIcon(this.filterMode === "archived" ? "check" : "");
			item.onClick(() => {
				this.filterMode = "archived";
				this.renderSessionList();
			});
		});
		
		menu.showAtMouseEvent(event);
	}

	private renderSessionList(): void {
		const content = this.containerEl.querySelector(".vc-session-panel-content");
		if (!content) return;
		content.empty();

		// Get sessions
		let sessions = [...this.plugin.settings.sessions];
		
		// Apply search filter
		if (this.searchQuery) {
			const query = this.searchQuery.toLowerCase();
			sessions = sessions.filter(s => s.name.toLowerCase().includes(query));
		}
		
		// Apply filter mode
		if (this.filterMode === "today") {
			sessions = sessions.filter(s => !s.archived && isToday(s.lastUsedAt));
		} else if (this.filterMode === "archived") {
			sessions = sessions.filter(s => s.archived);
		}

		const activeSessions = sessions.filter(s => !s.archived);
		const archivedSessions = sessions.filter(s => s.archived);

		// Sort by last used
		activeSessions.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
		archivedSessions.sort((a, b) => b.lastUsedAt - a.lastUsedAt);

		// Split active sessions into today and previous
		const todaySessions = activeSessions.filter(s => isToday(s.lastUsedAt));
		const previousSessions = activeSessions.filter(s => !isToday(s.lastUsedAt));

		// TODAY section
		if (todaySessions.length > 0 && this.filterMode !== "archived") {
			this.renderSection(content as HTMLElement, "TODAY", todaySessions);
		}

		// PREVIOUS DAYS section
		if (previousSessions.length > 0 && this.filterMode !== "archived") {
			this.renderSection(content as HTMLElement, "PREVIOUS DAYS", previousSessions);
		}

		// ARCHIVED section (collapsible)
		if (archivedSessions.length > 0 && this.filterMode !== "today") {
			this.renderArchivedSection(content as HTMLElement, archivedSessions);
		}

		// Empty state
		if (sessions.length === 0) {
			const emptyState = (content as HTMLElement).createDiv({ cls: "vc-session-empty" });
			if (this.searchQuery) {
				emptyState.createEl("p", { text: "No matching sessions" });
				emptyState.createEl("p", { 
					text: "Try a different search term",
					cls: "vc-session-empty-hint"
				});
			} else {
				emptyState.createEl("p", { text: "No chat sessions yet" });
				emptyState.createEl("p", { 
					text: "Start a conversation to create your first session",
					cls: "vc-session-empty-hint"
				});
			}
		}
	}

	private renderSection(container: HTMLElement, title: string, sessions: CopilotSession[]): void {
		const section = container.createDiv({ cls: "vc-session-section" });
		section.createDiv({ cls: "vc-session-section-title", text: title });

		for (const session of sessions) {
			this.renderSessionItem(section, session, false);
		}
	}

	private renderArchivedSection(container: HTMLElement, sessions: CopilotSession[]): void {
		const section = container.createDiv({ cls: "vc-session-section vc-session-archived-section" });
		
		const header = section.createDiv({ cls: "vc-session-section-title vc-session-archived-header" });
		header.innerHTML = `<span class="vc-archived-toggle">${this.archivedExpanded ? '▼' : '▶'}</span> ARCHIVED (${sessions.length})`;
		header.addEventListener("click", () => {
			this.archivedExpanded = !this.archivedExpanded;
			this.render();
		});

		if (this.archivedExpanded) {
			for (const session of sessions) {
				this.renderSessionItem(section, session, true);
			}
		}
	}

	private renderSessionItem(container: HTMLElement, session: CopilotSession, isArchived: boolean): void {
		const item = container.createDiv({ cls: "vc-session-item" });
		
		// Main content (clickable)
		const mainContent = item.createDiv({ cls: "vc-session-item-content" });
		mainContent.addEventListener("click", () => this.callbacks.onSessionSelect(session));

		// Icon for archived sessions
		if (isArchived) {
			const icon = mainContent.createSpan({ cls: "vc-session-item-icon" });
			setIcon(icon, "archive");
		}

		// Session name
		const name = mainContent.createDiv({ cls: "vc-session-item-name" });
		name.setText(session.name);

		// Meta info (time ago, duration)
		const meta = mainContent.createDiv({ cls: "vc-session-item-meta" });
		
		if (session.durationMs) {
			meta.createSpan({ 
				cls: "vc-session-duration",
				text: `Completed in ${formatDuration(session.durationMs)}.`
			});
		}
		
		meta.createSpan({ 
			cls: "vc-session-time",
			text: formatTimeAgo(session.lastUsedAt)
		});

		// Actions
		const actions = item.createDiv({ cls: "vc-session-item-actions" });
		
		if (isArchived) {
			// Unarchive button
			const unarchiveBtn = actions.createEl("button", { 
				cls: "vc-session-action-btn",
				attr: { "aria-label": "Unarchive" }
			});
			setIcon(unarchiveBtn, "archive-restore");
			unarchiveBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.unarchiveSession(session);
			});
		} else {
			// Archive button
			const archiveBtn = actions.createEl("button", { 
				cls: "vc-session-action-btn",
				attr: { "aria-label": "Archive" }
			});
			setIcon(archiveBtn, "archive");
			archiveBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.archiveSession(session);
			});
		}

		// Right-click context menu
		item.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.showContextMenu(e, session, isArchived);
		});
	}

	private showContextMenu(event: MouseEvent, session: CopilotSession, isArchived: boolean): void {
		const menu = new Menu();

		if (isArchived) {
			menu.addItem((item) => {
				item.setTitle("Unarchive");
				item.setIcon("archive-restore");
				item.onClick(() => this.unarchiveSession(session));
			});
			
			menu.addSeparator();
			
			menu.addItem((item) => {
				item.setTitle("Delete...");
				item.setIcon("trash-2");
				item.onClick(() => this.deleteSession(session));
			});
		} else {
			menu.addItem((item) => {
				item.setTitle("Open");
				item.setIcon("external-link");
				item.onClick(() => this.callbacks.onSessionSelect(session));
			});
			
			menu.addSeparator();
			
			menu.addItem((item) => {
				item.setTitle("Archive");
				item.setIcon("archive");
				item.onClick(() => this.archiveSession(session));
			});
			
			menu.addItem((item) => {
				item.setTitle("Rename...");
				item.setIcon("pencil");
				item.onClick(() => this.renameSession(session));
			});
			
			menu.addSeparator();
			
			menu.addItem((item) => {
				item.setTitle("Delete...");
				item.setIcon("trash-2");
				item.onClick(() => this.deleteSession(session));
			});
		}

		menu.showAtMouseEvent(event);
	}

	async archiveSession(session: CopilotSession): Promise<void> {
		session.archived = true;
		session.completedAt = Date.now();
		
		// Calculate duration if we have messages
		const messages = session.messages || [];
		if (messages.length > 0) {
			const firstMsg = messages[0];
			const lastMsg = messages[messages.length - 1];
			if (firstMsg && lastMsg) {
				const firstMsgTime = new Date(firstMsg.timestamp).getTime();
				const lastMsgTime = new Date(lastMsg.timestamp).getTime();
				session.durationMs = lastMsgTime - firstMsgTime;
			}
		}
		
		await this.plugin.saveSettings();
		this.render();
	}

	async unarchiveSession(session: CopilotSession): Promise<void> {
		session.archived = false;
		await this.plugin.saveSettings();
		this.render();
	}

	async deleteSession(session: CopilotSession): Promise<void> {
		// Simple confirmation via console log
		const sessions = this.plugin.settings.sessions;
		const index = sessions.findIndex(s => s.id === session.id);
		if (index !== -1) {
			sessions.splice(index, 1);
			
			// Clear active session if it was deleted
			if (this.plugin.settings.activeSessionId === session.id) {
				this.plugin.settings.activeSessionId = null;
			}
			
			await this.plugin.saveSettings();
			this.render();
			console.log(`Deleted: ${session.name}`);
		}
	}

	async renameSession(session: CopilotSession): Promise<void> {
		// Create a simple input modal
		const modal = document.createElement("div");
		modal.className = "vc-rename-modal";
		modal.innerHTML = `
			<div class="vc-rename-modal-content">
				<h3>Rename Session</h3>
				<input type="text" class="vc-rename-input" value="${session.name}" />
				<div class="vc-rename-buttons">
					<button class="vc-btn-secondary vc-rename-cancel">Cancel</button>
					<button class="vc-btn-primary vc-rename-save">Save</button>
				</div>
			</div>
		`;
		
		document.body.appendChild(modal);
		
		const input = modal.querySelector(".vc-rename-input") as HTMLInputElement;
		const cancelBtn = modal.querySelector(".vc-rename-cancel") as HTMLButtonElement;
		const saveBtn = modal.querySelector(".vc-rename-save") as HTMLButtonElement;
		
		input.focus();
		input.select();
		
		const close = () => modal.remove();
		
		const save = async () => {
			const newName = input.value.trim();
			if (newName && newName !== session.name) {
				session.name = newName;
				await this.plugin.saveSettings();
				this.render();
			}
			close();
		};
		
		cancelBtn.addEventListener("click", close);
		saveBtn.addEventListener("click", save);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") save();
			if (e.key === "Escape") close();
		});
		modal.addEventListener("click", (e) => {
			if (e.target === modal) close();
		});
	}
}

