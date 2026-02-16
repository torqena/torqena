// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module ConversationHistoryModal
 * @description Modal and view components for browsing voice conversation history.
 *
 * Provides sorting, expansion, and deletion controls for stored voice conversations and
 * integrates with Vault Copilot to manage conversation artifacts.
 *
 * @since 0.0.14
 */

import { App, ItemView, Modal, WorkspaceLeaf } from "obsidian";
import { setIcon } from "../../platform/utils/icons";
import { Platform } from "../../platform/utils/platform";
import { VoiceConversation, VoiceMessage } from "../../ui/settings";
import type { AIServiceManager as CopilotPlugin } from "../../app/AIServiceManager";

type SortField = 'date' | 'name' | 'messages';
type SortOrder = 'asc' | 'desc';

export class ConversationHistoryPanel {
	private conversations: VoiceConversation[];
	private onDelete: (id: string) => void;
	private onDeleteAll: () => void;
	private expandedIds: Set<string> = new Set();
	private sortField: SortField = 'date';
	private sortOrder: SortOrder = 'desc';
	private tableContainer: HTMLElement | null = null;

	constructor(
		private readonly app: App,
		private readonly containerEl: HTMLElement,
		conversations: VoiceConversation[],
		onDelete: (id: string) => void,
		onDeleteAll: () => void
	) {
		this.conversations = conversations;
		this.onDelete = onDelete;
		this.onDeleteAll = onDeleteAll;
	}

	mount(): void {
		const contentEl = this.containerEl;
		contentEl.empty();
		contentEl.addClass("vc-conversation-history-modal");

		// Header
		const headerEl = contentEl.createDiv({ cls: "vc-conv-history-header" });
		headerEl.createEl("h2", { text: "Voice Conversation History" });

		const headerActions = headerEl.createDiv({ cls: "vc-conv-history-actions" });
		
		// Delete All button
		if (this.conversations.length > 0) {
			const deleteAllBtn = headerActions.createEl("button", {
				cls: "vc-conv-history-btn vc-conv-history-btn-danger",
				text: "Delete All"
			});
			deleteAllBtn.addEventListener("click", () => {
				if (confirm("Are you sure you want to delete all voice conversations?")) {
					this.onDeleteAll();
					this.conversations = [];
					this.expandedIds.clear();
					this.render();
					console.log("All voice conversations deleted");
				}
			});
		}

		// Table container
		this.tableContainer = contentEl.createDiv({ cls: "vc-conv-history-table-container" });

		this.render();
	}

	private render() {
		if (!this.tableContainer) return;
		this.tableContainer.empty();

		if (this.conversations.length === 0) {
			this.tableContainer.createDiv({
				cls: "vc-conv-history-empty",
				text: "No voice conversations yet. Start a voice chat to begin recording history."
			});
			return;
		}

		// Sort conversations
		const sorted = this.getSortedConversations();

		// Create table
		const table = this.tableContainer.createEl("table", { cls: "vc-conv-history-table" });
		
		// Table header
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		
		// Expand column (empty header)
		headerRow.createEl("th", { cls: "vc-conv-th-expand" });
		
		// Date column with sort
		this.createSortableHeader(headerRow, "Date", "date", "vc-conv-th-date");
		
		// Name column with sort
		this.createSortableHeader(headerRow, "Session Name", "name", "vc-conv-th-name");
		
		// Messages column with sort
		this.createSortableHeader(headerRow, "Messages", "messages", "vc-conv-th-messages");
		
		// Duration column
		headerRow.createEl("th", { cls: "vc-conv-th-duration", text: "Duration" });
		
		// Actions column
		headerRow.createEl("th", { cls: "vc-conv-th-actions", text: "Actions" });

		// Table body
		const tbody = table.createEl("tbody");
		
		for (const conv of sorted) {
			this.renderConversationRow(tbody, conv);
		}
	}

	private createSortableHeader(row: HTMLTableRowElement, label: string, field: SortField, cls: string) {
		const th = row.createEl("th", { cls: `${cls} vc-conv-th-sortable` });
		const headerContent = th.createDiv({ cls: "vc-conv-th-content" });
		headerContent.createSpan({ text: label });
		
		// Sort indicator
		const sortIcon = headerContent.createSpan({ cls: "vc-conv-sort-icon" });
		if (this.sortField === field) {
			setIcon(sortIcon, this.sortOrder === 'asc' ? 'chevron-up' : 'chevron-down');
			th.addClass('vc-conv-th-sorted');
		}
		
		th.addEventListener("click", () => {
			if (this.sortField === field) {
				this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
			} else {
				this.sortField = field;
				this.sortOrder = field === 'date' ? 'desc' : 'asc';
			}
			this.render();
		});
	}

	private getSortedConversations(): VoiceConversation[] {
		return [...this.conversations].sort((a, b) => {
			let comparison = 0;
			
			switch (this.sortField) {
				case 'date':
					comparison = a.createdAt - b.createdAt;
					break;
				case 'name':
					comparison = a.name.localeCompare(b.name);
					break;
				case 'messages':
					comparison = a.messages.length - b.messages.length;
					break;
			}
			
			return this.sortOrder === 'asc' ? comparison : -comparison;
		});
	}

	private renderConversationRow(tbody: HTMLTableSectionElement, conv: VoiceConversation) {
		const isExpanded = this.expandedIds.has(conv.id);
		const row = tbody.createEl("tr", { cls: `vc-conv-row ${isExpanded ? 'vc-expanded' : ''}` });
		
		// Expand/collapse cell
		const expandCell = row.createEl("td", { cls: "vc-conv-td-expand" });
		const expandBtn = expandCell.createEl("button", { cls: "vc-conv-expand-btn" });
		setIcon(expandBtn, isExpanded ? 'chevron-down' : 'chevron-right');
		expandBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleExpand(conv.id);
		});
		
		// Date cell
		const dateCell = row.createEl("td", { cls: "vc-conv-td-date" });
		const date = new Date(conv.createdAt);
		dateCell.createDiv({ cls: "vc-conv-date-primary", text: date.toLocaleDateString() });
		dateCell.createDiv({ cls: "vc-conv-date-secondary", text: date.toLocaleTimeString() });
		
		// Name cell
		row.createEl("td", { cls: "vc-conv-td-name", text: conv.name });
		
		// Messages count cell
		row.createEl("td", { cls: "vc-conv-td-messages", text: String(conv.messages.length) });
		
		// Duration cell
		const durationCell = row.createEl("td", { cls: "vc-conv-td-duration" });
		durationCell.textContent = this.calculateDuration(conv);
		
		// Actions cell
		const actionsCell = row.createEl("td", { cls: "vc-conv-td-actions" });
		this.renderRowActions(actionsCell, conv);
		
		// Make row clickable to expand
		row.addEventListener("click", () => this.toggleExpand(conv.id));
		
		// Expanded messages row
		if (isExpanded) {
			this.renderMessagesRow(tbody, conv);
		}
	}

	private renderRowActions(cell: HTMLTableCellElement, conv: VoiceConversation) {
		const actionsDiv = cell.createDiv({ cls: "vc-conv-actions" });
		
		// Export button
		const exportBtn = actionsDiv.createEl("button", {
			cls: "vc-conv-action-btn",
			attr: { "aria-label": "Export to Markdown" }
		});
		setIcon(exportBtn, "download");
		exportBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.exportConversation(conv);
		});
		
		// Copy button
		const copyBtn = actionsDiv.createEl("button", {
			cls: "vc-conv-action-btn",
			attr: { "aria-label": "Copy to clipboard" }
		});
		setIcon(copyBtn, "copy");
		copyBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.copyConversation(conv);
		});
		
		// Delete button
		const deleteBtn = actionsDiv.createEl("button", {
			cls: "vc-conv-action-btn vc-conv-action-btn-danger",
			attr: { "aria-label": "Delete conversation" }
		});
		setIcon(deleteBtn, "trash-2");
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (confirm("Delete this conversation?")) {
				this.onDelete(conv.id);
				this.conversations = this.conversations.filter(c => c.id !== conv.id);
				this.expandedIds.delete(conv.id);
				this.render();
				console.log("Conversation deleted");
			}
		});
	}

	private renderMessagesRow(tbody: HTMLTableSectionElement, conv: VoiceConversation) {
		const messagesRow = tbody.createEl("tr", { cls: "vc-conv-messages-row" });
		const messagesCell = messagesRow.createEl("td", { attr: { colspan: "6" } });
		const messagesContainer = messagesCell.createDiv({ cls: "vc-conv-messages-container" });
		
		if (conv.messages.length === 0) {
			messagesContainer.createDiv({ cls: "vc-conv-no-messages", text: "No messages in this conversation" });
			return;
		}
		
		// Messages table
		const msgTable = messagesContainer.createEl("table", { cls: "vc-conv-messages-table" });
		const msgThead = msgTable.createEl("thead");
		const msgHeaderRow = msgThead.createEl("tr");
		msgHeaderRow.createEl("th", { text: "Time" });
		msgHeaderRow.createEl("th", { text: "Role" });
		msgHeaderRow.createEl("th", { text: "Content" });
		
		const msgTbody = msgTable.createEl("tbody");
		
		for (const msg of conv.messages) {
			this.renderMessageRow(msgTbody, msg);
		}
	}

	private renderMessageRow(tbody: HTMLTableSectionElement, msg: VoiceMessage) {
		// Determine the display type for styling
		let displayType: string = msg.role;
		let displayRole = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
		
		// Handle explicit 'tool' role or function_call type
		if (msg.role === 'tool' || msg.type === 'function_call') {
			displayType = 'tool';
			displayRole = 'Tool Call';
		} else if (msg.type === 'function_call_output') {
			displayType = 'tool-output';
			displayRole = 'Tool Result';
		}
		
		const row = tbody.createEl("tr", { cls: `vc-conv-msg-row vc-conv-msg-${displayType}` });
		
		// Time cell
		const timeCell = row.createEl("td", { cls: "vc-conv-msg-time" });
		timeCell.textContent = new Date(msg.timestamp).toLocaleTimeString();
		
		// Role/Type cell
		const roleCell = row.createEl("td", { cls: "vc-conv-msg-role" });
		const roleBadge = roleCell.createSpan({ cls: `vc-conv-role-badge vc-role-${displayType}` });
		roleBadge.textContent = displayRole;
		
		// Content cell
		const contentCell = row.createEl("td", { cls: "vc-conv-msg-content" });
		
		if ((msg.type === 'function_call' || msg.role === 'tool') && msg.toolName) {
			const toolDiv = contentCell.createDiv({ cls: "vc-conv-msg-tool-call" });
			const toolHeader = toolDiv.createDiv({ cls: "vc-conv-tool-header" });
			toolHeader.createSpan({ cls: "vc-conv-tool-icon", text: "🔧" });
			toolHeader.createSpan({ cls: "vc-conv-tool-name", text: msg.toolName });
			
			if (msg.toolArgs) {
				toolDiv.createDiv({ cls: "vc-conv-tool-label", text: "Arguments:" });
				const argsEl = toolDiv.createEl("pre", { cls: "vc-conv-tool-args" });
				try {
					// Try to pretty-print JSON arguments
					const parsed = JSON.parse(msg.toolArgs);
					argsEl.textContent = JSON.stringify(parsed, null, 2);
				} catch {
					argsEl.textContent = msg.toolArgs;
				}
			}
		} else if (msg.type === 'function_call_output' && msg.toolOutput) {
			const outputDiv = contentCell.createDiv({ cls: "vc-conv-msg-tool-output" });
			const outputHeader = outputDiv.createDiv({ cls: "vc-conv-tool-header" });
			outputHeader.createSpan({ cls: "vc-conv-tool-icon", text: "📤" });
			outputHeader.createSpan({ text: "Result" });
			
			const outputEl = outputDiv.createEl("pre", { cls: "vc-conv-tool-result" });
			try {
				// Try to pretty-print JSON output
				const parsed = JSON.parse(msg.toolOutput);
				outputEl.textContent = JSON.stringify(parsed, null, 2);
			} catch {
				outputEl.textContent = msg.toolOutput;
			}
		} else if (msg.content) {
			// Regular message content
			const contentDiv = contentCell.createDiv({ cls: "vc-conv-msg-text" });
			contentDiv.textContent = msg.content;
		}
	}

	private toggleExpand(id: string) {
		if (this.expandedIds.has(id)) {
			this.expandedIds.delete(id);
		} else {
			this.expandedIds.add(id);
		}
		this.render();
	}

	private calculateDuration(conv: VoiceConversation): string {
		if (conv.messages.length < 2) return "-";
		
		const first = conv.messages[0]?.timestamp;
		const last = conv.messages[conv.messages.length - 1]?.timestamp;
		
		if (!first || !last) return "-";
		
		const durationMs = last - first;
		const seconds = Math.floor(durationMs / 1000);
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		
		if (minutes > 0) {
			return `${minutes}m ${remainingSeconds}s`;
		}
		return `${seconds}s`;
	}

	private async copyConversation(conv: VoiceConversation) {
		const markdown = this.conversationToMarkdown(conv);
		try {
			await navigator.clipboard.writeText(markdown);
			console.log("Conversation copied to clipboard");
		} catch (error) {
			console.error("Failed to copy:", error);
			console.error("Failed to copy to clipboard");
		}
	}

	private async exportConversation(conv: VoiceConversation) {
		const markdown = this.conversationToMarkdown(conv);
		
		// Create filename
		const dateStr = new Date(conv.createdAt).toISOString().split('T')[0];
		const safeName = conv.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
		const filename = `voice-conversation-${safeName}-${dateStr}.md`;

		try {
			// Check if file already exists
			let finalPath = filename;
			let counter = 1;
			while (await this.app.vault.adapter.exists(finalPath)) {
				finalPath = filename.replace('.md', `-${counter}.md`);
				counter++;
			}

			await this.app.vault.create(finalPath, markdown);
			console.log(`Exported to ${finalPath}`);
		} catch (error) {
			console.error("Failed to export conversation:", error);
			console.error("Failed to export conversation");
		}
	}

	private conversationToMarkdown(conv: VoiceConversation): string {
		const lines: string[] = [
			`# ${conv.name}`,
			"",
			`**Date:** ${new Date(conv.createdAt).toLocaleString()}`,
			`**Messages:** ${conv.messages.length}`,
			`**Duration:** ${this.calculateDuration(conv)}`,
			"",
			"---",
			""
		];

		for (const msg of conv.messages) {
			const time = new Date(msg.timestamp).toLocaleTimeString();
			const roleLabel = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);

			if (msg.type === 'function_call' && msg.toolName) {
				lines.push(`### 🔧 Tool Call: ${msg.toolName} (${time})`);
				if (msg.toolArgs) {
					lines.push("```json");
					lines.push(msg.toolArgs);
					lines.push("```");
				}
			} else if (msg.type === 'function_call_output' && msg.toolOutput) {
				lines.push(`### 📤 Tool Output (${time})`);
				lines.push("```");
				lines.push(msg.toolOutput);
				lines.push("```");
			} else if (msg.content) {
				lines.push(`### ${roleLabel} (${time})`);
				lines.push("");
				lines.push(msg.content);
			}
			lines.push("");
		}

		return lines.join("\n");
	}

	destroy(): void {
		this.containerEl.empty();
	}
}

export class ConversationHistoryModal extends Modal {
	private panel: ConversationHistoryPanel | null = null;

	constructor(
		app: App,
		private readonly conversations: VoiceConversation[],
		private readonly onDelete: (id: string) => void,
		private readonly onDeleteAll: () => void
	) {
		super(app);
	}

	onOpen() {
		this.modalEl.addClass("vc-conversation-history-modal");
		this.panel = new ConversationHistoryPanel(this.app, this.contentEl, this.conversations, this.onDelete, this.onDeleteAll);
		this.panel.mount();
	}

	onClose() {
		this.panel?.destroy();
		this.panel = null;
	}
}

export const VOICE_HISTORY_VIEW_TYPE = "vc-voice-history-view";

export class ConversationHistoryView extends ItemView {
	private panel: ConversationHistoryPanel | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: CopilotPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VOICE_HISTORY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Voice Conversation History";
	}

	getIcon(): string {
		return "history";
	}

	async onOpen(): Promise<void> {
		const conversations = this.plugin.settings.voice?.conversations || [];
		this.panel = new ConversationHistoryPanel(
			this.app,
			this.contentEl,
			conversations,
			(id: string) => this.deleteVoiceConversation(id),
			() => this.deleteAllVoiceConversations()
		);
		this.panel.mount();
	}

	async onClose(): Promise<void> {
		this.panel?.destroy();
		this.panel = null;
	}

	private deleteVoiceConversation(id: string): void {
		if (!this.plugin.settings.voice?.conversations) return;
		const idx = this.plugin.settings.voice.conversations.findIndex(c => c.id === id);
		if (idx > -1) {
			this.plugin.settings.voice.conversations.splice(idx, 1);
			this.plugin.saveSettings();
		}
	}

	private deleteAllVoiceConversations(): void {
		if (this.plugin.settings.voice) {
			this.plugin.settings.voice.conversations = [];
			this.plugin.saveSettings();
		}
	}
}

/**
 * Open Voice Conversation History in a pop-out window (desktop) or modal (mobile)
 */
export function openVoiceHistoryPopout(
	app: App,
	conversations: VoiceConversation[],
	onDelete: (id: string) => void,
	onDeleteAll: () => void
): void {
	// Electron web-shell: open in a dedicated child BrowserWindow
	if ((window as any).electronAPI?.openWindow) {
		(window as any).electronAPI.openWindow(VOICE_HISTORY_VIEW_TYPE, {
			title: "Voice Conversation History",
			width: 900,
			height: 650,
		}).catch((err: any) => {
			console.error('[ConversationHistoryModal] Failed to open child window:', err);
			const modal = new ConversationHistoryModal(app, conversations, onDelete, onDeleteAll);
			modal.open();
		});
		return;
	}

	// On desktop, create a pop-out window using workspace API
	// On mobile, fall back to modal
	if (Platform.isDesktopApp) {
		try {
			const leaf = app.workspace.getLeaf("window");
			leaf.setViewState({ type: VOICE_HISTORY_VIEW_TYPE, active: true });
		} catch (error) {
			console.error('[ConversationHistoryModal] Failed to open pop-out window:', error);
			const modal = new ConversationHistoryModal(app, conversations, onDelete, onDeleteAll);
			modal.open();
		}
	} else {
		const modal = new ConversationHistoryModal(app, conversations, onDelete, onDeleteAll);
		modal.open();
	}
}

