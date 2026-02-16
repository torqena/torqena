// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module TracingModal
 * @description Tracing modal and workspace view for visualizing traces and SDK logs with filtering, sorting, and drill-in detail panes.
 *
 * The tracing surface consolidates two tabs: voice traces (span tree + detail) and SDK logs (filterable, sortable list). The SDK log layout
 * uses a persistent filter rail so controls remain visible while scrolling the log list.
 *
 * @example
 * ```typescript
 * import { openTracingPopout } from "./TracingModal";
 * openTracingPopout(app);
 * ```
 *
 * @see {@link ../../../ai/TracingService} for data collection
 * @since 0.0.14
 */

import { App, ItemView, Menu, Modal, WorkspaceLeaf } from "obsidian";
import { setIcon } from "../../platform/utils/icons";
import { Platform } from "../../platform/utils/platform";
import { TracingService, TracingTrace, TracingSpan, TracingEvent, SDKLogEntry, getTracingService } from "../../ai/TracingService";
import type { AIServiceManager as CopilotPlugin } from "../../app/AIServiceManager";

type TabType = 'traces' | 'sdk-logs';
type SortDirection = 'asc' | 'desc';
type SdkLogPreset = 'all' | 'voice' | 'cli' | 'errors' | 'warnings-errors';

interface SdkLogFilters {
	sources: Set<string>; // 'voice', 'cli'
	levels: Set<string>;  // 'info', 'warning', 'error', 'debug'
	agents: Set<string>;  // agent names like 'Main Vault Assistant', 'Note Manager', etc.
	searchText: string;   // text search filter
}

/**
 * Extract agent name from a log message if present (e.g., "[Main Vault Assistant]")
 */
function extractAgentName(message: string): string | null {
	const match = message.match(/^\[([^\]]+)\]/);
	return match?.[1] ?? null;
}

/**
 * Format duration in a human-friendly way
 * - Under 1 second: "XXXms"
 * - 1-60 seconds: "X.Xs"
 * - 1-60 minutes: "Xm Ys"
 * - Over 60 minutes: "Xh Ym"
 */
function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	const seconds = ms / 1000;
	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);
	if (minutes < 60) {
		return `${minutes}m ${remainingSeconds}s`;
	}
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return `${hours}h ${remainingMinutes}m`;
}

/**
 * Determine effective source for a log entry
 * - 'voice' for realtime-agent logs or logs starting with [RealtimeAgent]
 * - 'service' for logs starting with [GitHubCopilotCliService] or [Vault Copilot]
 * - 'cli' for other copilot-cli/copilot-sdk logs
 */
function getEffectiveSource(log: { source: string; message: string }): 'voice' | 'cli' | 'service' {
	if (log.source === 'realtime-agent' || log.message.startsWith('[RealtimeAgent]')) {
		return 'voice';
	}
	if (log.message.startsWith('[GitHubCopilotCliService]') || log.message.startsWith('[Vault Copilot]')) {
		return 'service';
	}
	return 'cli';
}

export class TracingPanel {
	private tracingService: TracingService;
	private tracingContentEl: HTMLElement | null = null;
	private unsubscribe: (() => void) | null = null;
	private selectedTraceId: string | null = null;
	private autoRefresh: boolean = true;
	private currentTab: TabType = 'traces';
	private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';
	private plugin: CopilotPlugin | null = null;
	
	// SDK Logs state
	private sdkLogSortDir: SortDirection = 'desc'; // newest first by default
	private sdkLogFilters: SdkLogFilters = {
		sources: new Set(['voice', 'cli', 'service']),
		levels: new Set(['info', 'warning', 'error', 'debug']),
		agents: new Set(), // Empty means show all agents
		searchText: ''
	};

	constructor(private readonly containerEl: HTMLElement, private readonly app: App, plugin?: CopilotPlugin | null) {
		this.tracingService = getTracingService();
		this.plugin = plugin ?? this.lookupPlugin();
		this.logLevel = this.plugin?.settings.logLevel || 'info';
	}

	/**
	 * Resolve the plugin instance so we can read and persist log level without a hard dependency on constructor wiring.
	 */
	private lookupPlugin(): CopilotPlugin | null {
		const pluginsApi = (this.app as unknown as { plugins?: { getPlugin?: (id: string) => CopilotPlugin | null } }).plugins;
		if (pluginsApi?.getPlugin) {
			return pluginsApi.getPlugin('obsidian-vault-copilot') ?? null;
		}
		return null;
	}

	private async updateLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): Promise<void> {
		this.logLevel = level;
		if (this.plugin) {
			this.plugin.settings.logLevel = level;
			await this.plugin.saveSettings();
		}
	}

	mount(): void {
		const contentEl = this.containerEl;
		contentEl.empty();

		// Header
		const header = contentEl.createDiv({ cls: "vc-tracing-header" });
		header.createEl("h2", { text: "Tracing & Diagnostics" });
		
		const controls = header.createDiv({ cls: "vc-tracing-controls" });

		const logLevelGroup = controls.createDiv({ cls: "vc-tracing-select-group" });
		logLevelGroup.createSpan({ cls: "vc-tracing-select-label", text: "Log level" });
		const logLevelSelect = logLevelGroup.createEl("select", { cls: "vc-tracing-select" });
		const logLevelOptions: Array<{ value: 'debug' | 'info' | 'warn' | 'error'; label: string }> = [
			{ value: 'debug', label: 'Debug' },
			{ value: 'info', label: 'Info' },
			{ value: 'warn', label: 'Warn' },
			{ value: 'error', label: 'Error' }
		];
		for (const option of logLevelOptions) {
			const opt = logLevelSelect.createEl("option", { value: option.value, text: option.label });
			if (option.value === this.logLevel) {
				opt.selected = true;
			}
		}
		logLevelSelect.addEventListener("change", (event) => {
			const value = (event.target as HTMLSelectElement).value as 'debug' | 'info' | 'warn' | 'error';
			if (value !== this.logLevel) {
				void this.updateLogLevel(value);
			}
		});
		
		// Auto-refresh toggle
		const autoRefreshBtn = controls.createEl("button", { 
			cls: `vc-tracing-btn ${this.autoRefresh ? "vc-active" : ""}`,
			attr: { title: "Auto-refresh" }
		});
		setIcon(autoRefreshBtn, "refresh-cw");
		autoRefreshBtn.addEventListener("click", () => {
			this.autoRefresh = !this.autoRefresh;
			autoRefreshBtn.toggleClass("vc-active", this.autoRefresh);
		});
		
		// Clear button
		const clearBtn = controls.createEl("button", { 
			cls: "vc-tracing-btn",
			attr: { title: "Clear all" }
		});
		setIcon(clearBtn, "trash-2");
		clearBtn.addEventListener("click", () => {
			this.tracingService.clearTraces();
			this.tracingService.clearSdkLogs();
			this.selectedTraceId = null;
			this.render();
		});

		// Tab bar
		const tabBar = contentEl.createDiv({ cls: "vc-tracing-tabs" });
		
		const tracesTab = tabBar.createEl("button", {
			cls: `vc-tracing-tab ${this.currentTab === 'traces' ? 'vc-active' : ''}`,
			text: "Voice Traces"
		});
		tracesTab.addEventListener("click", () => {
			this.currentTab = 'traces';
			this.render();
			this.updateTabStyles(tabBar);
		});
		
		const sdkLogsTab = tabBar.createEl("button", {
			cls: `vc-tracing-tab ${this.currentTab === 'sdk-logs' ? 'vc-active' : ''}`,
			text: "SDK Logs"
		});
		sdkLogsTab.addEventListener("click", () => {
			this.currentTab = 'sdk-logs';
			this.render();
			this.updateTabStyles(tabBar);
		});

		// Main content area
		this.tracingContentEl = contentEl.createDiv({ cls: "vc-tracing-content" });
		
		// Subscribe to events for live updates
		this.unsubscribe = this.tracingService.on((event) => {
			if (this.autoRefresh) {
				this.render();
			}
		});

		this.render();
	}

	private render(): void {
		if (!this.tracingContentEl) return;
		this.tracingContentEl.empty();

		if (this.currentTab === 'sdk-logs') {
			this.renderSdkLogs();
			return;
		}

		// Render traces (default tab)
		this.renderTraces();
	}

	/**
	 * Apply a preset to SDK log filters so users can quickly focus on common scenarios without manual chip selection.
	 *
	 * @param preset - Named preset describing the desired source and level combination
	 * @internal
	 */
	private applySdkLogPreset(preset: SdkLogPreset): void {
		const allSources = new Set(['voice', 'cli', 'service']);
		const allLevels = new Set(['debug', 'info', 'warning', 'error']);
		this.sdkLogFilters.searchText = '';
		this.sdkLogFilters.agents.clear();

		switch (preset) {
			case 'all':
				this.sdkLogFilters.sources = allSources;
				this.sdkLogFilters.levels = allLevels;
				break;
			case 'voice':
				this.sdkLogFilters.sources = new Set(['voice']);
				this.sdkLogFilters.levels = allLevels;
				break;
			case 'cli':
				this.sdkLogFilters.sources = new Set(['cli', 'service']);
				this.sdkLogFilters.levels = allLevels;
				break;
			case 'errors':
				this.sdkLogFilters.sources = allSources;
				this.sdkLogFilters.levels = new Set(['error']);
				break;
			case 'warnings-errors':
				this.sdkLogFilters.sources = allSources;
				this.sdkLogFilters.levels = new Set(['warning', 'error']);
				break;
		}

		this.render();
	}

	private updateTabStyles(tabBar: HTMLElement): void {
		const tabs = tabBar.querySelectorAll('.vc-tracing-tab');
		tabs.forEach(tab => {
			const el = tab as HTMLElement;
			el.removeClass('vc-active');
			if ((el.textContent === 'Voice Traces' && this.currentTab === 'traces') ||
				(el.textContent === 'SDK Logs' && this.currentTab === 'sdk-logs')) {
				el.addClass('vc-active');
			}
		});
	}

	private renderTraces(): void {
		if (!this.tracingContentEl) return;

		const traces = this.tracingService.getTraces();

		// Trace count header - only shown on Voice Traces tab
		const traceCountHeader = this.tracingContentEl.createDiv({ cls: "vc-tracing-tab-header" });
		traceCountHeader.createEl("span", { 
			text: `${traces.length} trace${traces.length !== 1 ? 's' : ''}`,
			cls: "vc-trace-count-badge"
		});

		if (traces.length === 0) {
			const emptyState = this.tracingContentEl.createDiv({ cls: "vc-tracing-empty" });
			emptyState.createEl("p", { text: "No traces captured yet." });
			emptyState.createEl("p", { 
				text: "Traces are captured from:",
				cls: "vc-tracing-hint"
			});
			const list = emptyState.createEl("ul", { cls: "vc-tracing-hint" });
			list.createEl("li", { text: "Voice conversations (realtime agent)" });
			list.createEl("li", { text: "Tool executions during voice sessions" });
			return;
		}

		// Two-column layout: trace list + detail
		const layout = this.tracingContentEl.createDiv({ cls: "vc-tracing-layout" });
		
		// Trace list
		const listEl = layout.createDiv({ cls: "vc-tracing-list" });
		for (const trace of traces) {
			this.renderTraceListItem(listEl, trace);
		}

		// Detail pane
		const detailEl = layout.createDiv({ cls: "vc-tracing-detail" });
		if (this.selectedTraceId) {
			const selectedTrace = this.tracingService.getTrace(this.selectedTraceId);
			if (selectedTrace) {
				this.renderTraceDetail(detailEl, selectedTrace);
			}
		} else if (traces.length > 0) {
			// Auto-select first trace
			const firstTrace = traces[0];
			if (firstTrace) {
				this.selectedTraceId = firstTrace.traceId;
				this.renderTraceDetail(detailEl, firstTrace);
			}
		} else {
			detailEl.createEl("p", { text: "Select a trace to view details", cls: "vc-tracing-hint" });
		}
	}

	/**
	 * Render the SDK Logs tab with persistent filter rail, sticky header, and expandable log rows.
	 *
	 * @internal
	 */
	private renderSdkLogs(): void {
		if (!this.tracingContentEl) return;

		const allLogs = this.tracingService.getSdkLogs();

		// Extract unique agent names from voice logs
		const agentNames = new Set<string>();
		for (const log of allLogs) {
			const agentName = extractAgentName(log.message);
			if (agentName && agentName !== 'GitHubCopilotCliService' && agentName !== 'Vault Copilot') {
				agentNames.add(agentName);
			}
		}
		const sortedAgentNames = Array.from(agentNames).sort();

		const layout = this.tracingContentEl.createDiv({ cls: 'vc-sdk-logs-grid' });
		const rail = layout.createDiv({ cls: 'vc-sdk-logs-rail' });
		const main = layout.createDiv({ cls: 'vc-sdk-logs-main' });

		// Presets + sort
		const presetSection = rail.createDiv({ cls: 'vc-sdk-logs-rail-section' });
		presetSection.createEl('div', { cls: 'vc-rail-title', text: 'View presets' });
		const presetRow = presetSection.createDiv({ cls: 'vc-filter-chips' });
		const presetConfigs: Array<{ label: string; preset: SdkLogPreset }> = [
			{ label: 'All', preset: 'all' },
			{ label: 'Voice', preset: 'voice' },
			{ label: 'CLI', preset: 'cli' },
			{ label: 'Errors', preset: 'errors' },
			{ label: 'Warn+Err', preset: 'warnings-errors' }
		];
		for (const preset of presetConfigs) {
			const btn = presetRow.createEl('button', {
				cls: 'vc-filter-btn vc-filter-pill',
				text: preset.label
			});
			btn.addEventListener('click', () => this.applySdkLogPreset(preset.preset));
		}

		const sortSection = rail.createDiv({ cls: 'vc-sdk-logs-rail-section vc-rail-row' });
		sortSection.createEl('div', { cls: 'vc-rail-title', text: 'Sort' });
		const sortBtn = sortSection.createEl('button', {
			cls: 'vc-tracing-btn vc-sort-btn',
			attr: { title: `Sort by date (${this.sdkLogSortDir === 'desc' ? 'newest first' : 'oldest first'})` }
		});
		setIcon(sortBtn, this.sdkLogSortDir === 'desc' ? 'arrow-down' : 'arrow-up');
		sortBtn.createSpan({ text: this.sdkLogSortDir === 'desc' ? 'Newest' : 'Oldest' });
		sortBtn.addEventListener('click', () => {
			this.sdkLogSortDir = this.sdkLogSortDir === 'desc' ? 'asc' : 'desc';
			this.render();
		});

		// Source filters
		const sourceSection = rail.createDiv({ cls: 'vc-sdk-logs-rail-section' });
		sourceSection.createEl('div', { cls: 'vc-rail-title', text: 'Source' });
		const sources = ['voice', 'cli', 'service'] as const;
		const sourceRow = sourceSection.createDiv({ cls: 'vc-filter-chips' });
		for (const source of sources) {
			const isActive = this.sdkLogFilters.sources.has(source);
			const btn = sourceRow.createEl('button', {
				cls: `vc-filter-btn vc-filter-pill ${isActive ? 'vc-active' : ''}`,
				text: source
			});
			btn.addEventListener('click', () => {
				if (isActive) {
					this.sdkLogFilters.sources.delete(source);
				} else {
					this.sdkLogFilters.sources.add(source);
				}
				this.render();
			});
		}

		// Level filters
		const levelSection = rail.createDiv({ cls: 'vc-sdk-logs-rail-section' });
		levelSection.createEl('div', { cls: 'vc-rail-title', text: 'Level' });
		const levels = ['debug', 'info', 'warning', 'error'] as const;
		const levelRow = levelSection.createDiv({ cls: 'vc-filter-chips' });
		for (const level of levels) {
			const isActive = this.sdkLogFilters.levels.has(level);
			const btn = levelRow.createEl('button', {
				cls: `vc-filter-btn vc-filter-pill vc-level-${level} ${isActive ? 'vc-active' : ''}`,
				text: level
			});
			btn.addEventListener('click', () => {
				if (isActive) {
					this.sdkLogFilters.levels.delete(level);
				} else {
					this.sdkLogFilters.levels.add(level);
				}
				this.render();
			});
		}

		// Agent filters
		if (sortedAgentNames.length > 0) {
			const agentSection = rail.createDiv({ cls: 'vc-sdk-logs-rail-section' });
			agentSection.createEl('div', { cls: 'vc-rail-title', text: 'Agent' });
			const agentRow = agentSection.createDiv({ cls: 'vc-filter-chips' });
			const allAgentsActive = this.sdkLogFilters.agents.size === 0;
			const allBtn = agentRow.createEl('button', {
				cls: `vc-filter-btn vc-filter-pill ${allAgentsActive ? 'vc-active' : ''}`,
				text: 'All'
			});
			allBtn.addEventListener('click', () => {
				this.sdkLogFilters.agents.clear();
				this.render();
			});
			for (const agentName of sortedAgentNames) {
				const isActive = this.sdkLogFilters.agents.has(agentName);
				const shortName = agentName.length > 20 ? `${agentName.substring(0, 17)}...` : agentName;
				const btn = agentRow.createEl('button', {
					cls: `vc-filter-btn vc-filter-pill vc-agent-filter ${isActive ? 'vc-active' : ''}`,
					text: shortName,
					attr: { title: agentName }
				});
				btn.addEventListener('click', () => {
					if (isActive) {
						this.sdkLogFilters.agents.delete(agentName);
					} else {
						this.sdkLogFilters.agents.add(agentName);
					}
					this.render();
				});
			}
		}

		// Search + reset
		const searchSection = rail.createDiv({ cls: 'vc-sdk-logs-rail-section' });
		searchSection.createEl('div', { cls: 'vc-rail-title', text: 'Search' });
		const searchInput = searchSection.createEl('input', {
			cls: 'vc-sdk-log-search',
			attr: {
				type: 'text',
				placeholder: 'Search logs…',
				value: this.sdkLogFilters.searchText
			}
		});
		searchInput.addEventListener('input', (e) => {
			this.sdkLogFilters.searchText = (e.target as HTMLInputElement).value;
			this.render();
		});
		const resetBtn = searchSection.createEl('button', { cls: 'vc-tracing-btn vc-rail-reset', text: 'Reset filters' });
		resetBtn.addEventListener('click', () => {
			this.sdkLogFilters = {
				sources: new Set(['voice', 'cli', 'service']),
				levels: new Set(['info', 'warning', 'error', 'debug']),
				agents: new Set(),
				searchText: ''
			};
			this.sdkLogSortDir = 'desc';
			this.render();
		});
		if (this.sdkLogFilters.searchText) {
			setTimeout(() => {
				searchInput.focus();
				searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
			}, 0);
		}

		// Apply filters
		const filteredLogs = allLogs.filter((log) => {
			const logSource = getEffectiveSource(log);
			if (!this.sdkLogFilters.sources.has(logSource)) return false;
			if (!this.sdkLogFilters.levels.has(log.level)) return false;
			if (this.sdkLogFilters.agents.size > 0) {
				const agentName = extractAgentName(log.message);
				if (!agentName || !this.sdkLogFilters.agents.has(agentName)) return false;
			}
			if (this.sdkLogFilters.searchText) {
				const searchLower = this.sdkLogFilters.searchText.toLowerCase();
				if (!log.message.toLowerCase().includes(searchLower)) return false;
			}
			return true;
		});

		const sortedLogs = [...filteredLogs].sort((a, b) => (this.sdkLogSortDir === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp));

		if (sortedLogs.length === 0) {
			const emptyState = main.createDiv({ cls: 'vc-tracing-empty' });
			if (allLogs.length === 0) {
				emptyState.createEl('p', { text: 'No SDK logs captured yet.' });
				emptyState.createEl('p', { cls: 'vc-tracing-hint', text: 'SDK logs are captured from:' });
				const list = emptyState.createEl('ul', { cls: 'vc-tracing-hint' });
				list.createEl('li', { text: 'Realtime voice agent sessions' });
				list.createEl('li', { text: 'Copilot CLI operations' });
			} else {
				emptyState.createEl('p', { text: 'No logs match the current filters.' });
			}
			return;
		}

		const logsContainer = main.createDiv({ cls: 'vc-sdk-logs-container' });
		const header = logsContainer.createDiv({ cls: 'vc-sdk-logs-header' });
		header.createEl('span', { text: `${sortedLogs.length} log entries${allLogs.length !== sortedLogs.length ? ` (${allLogs.length} total)` : ''}` });
		const clearBtn = header.createEl('button', { cls: 'vc-tracing-btn', text: 'Clear' });
		clearBtn.addEventListener('click', () => {
			this.tracingService.clearSdkLogs();
			this.render();
		});

		const logList = logsContainer.createDiv({ cls: 'vc-sdk-logs-list' });
		const LONG_MESSAGE_THRESHOLD = 150;

		for (const log of sortedLogs) {
			const isLongMessage = log.message.length > LONG_MESSAGE_THRESHOLD;
			const entry = logList.createDiv({
				cls: `vc-sdk-log-entry vc-log-${log.level}${isLongMessage ? ' vc-log-expandable vc-log-collapsed' : ''}`
			});

			entry.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				const menu = new Menu();
				menu.addItem((item) => {
					item.setTitle('Copy message').setIcon('copy').onClick(() => {
						navigator.clipboard.writeText(log.message);
					});
				});
				menu.addItem((item) => {
					const fullEntry = `[${this.formatTime(log.timestamp)}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`;
					item.setTitle('Copy full entry').setIcon('clipboard-copy').onClick(() => {
						navigator.clipboard.writeText(fullEntry);
					});
				});
				menu.showAtMouseEvent(e);
			});

			entry.createSpan({ cls: 'vc-sdk-log-time', text: this.formatTime(log.timestamp) });
			const sourceText = getEffectiveSource(log);
			entry.createSpan({ cls: 'vc-sdk-log-source', text: sourceText });
			entry.createSpan({ cls: `vc-sdk-log-level vc-level-${log.level}`, text: log.level.toUpperCase() });

			const messageContainer = entry.createDiv({ cls: 'vc-sdk-log-message-container' });
			if (isLongMessage) {
				messageContainer.createSpan({ cls: 'vc-sdk-log-message-truncated', text: `${log.message.substring(0, LONG_MESSAGE_THRESHOLD)}...` });
				messageContainer.createSpan({ cls: 'vc-sdk-log-message-full', text: log.message });
				const toggle = entry.createSpan({ cls: 'vc-sdk-log-toggle' });
				setIcon(toggle, 'chevron-down');
				toggle.setAttribute('title', 'Click to expand');
				entry.addEventListener('click', () => {
					const isCollapsed = entry.hasClass('vc-log-collapsed');
					entry.toggleClass('vc-log-collapsed', !isCollapsed);
					setIcon(toggle, isCollapsed ? 'chevron-up' : 'chevron-down');
					toggle.setAttribute('title', isCollapsed ? 'Click to collapse' : 'Click to expand');
				});
			} else {
				messageContainer.createSpan({ cls: 'vc-sdk-log-message', text: log.message });
			}
		}
	}

	private renderTraceListItem(container: HTMLElement, trace: TracingTrace): void {
		const isSelected = trace.traceId === this.selectedTraceId;
		const item = container.createDiv({ 
			cls: `vc-tracing-list-item ${isSelected ? "vc-selected" : ""}`
		});

		// Check if trace is stale (not ended but older than 5 minutes)
		const isStale = !trace.endedAt && (Date.now() - trace.startedAt > 5 * 60 * 1000);

		// Icon based on status
		const iconEl = item.createSpan({ cls: "vc-tracing-item-icon" });
		if (!trace.endedAt && !isStale) {
			setIcon(iconEl, "loader");
			iconEl.addClass("vc-spinning");
		} else if (trace.spans.some(s => s.error)) {
			setIcon(iconEl, "alert-circle");
			iconEl.addClass("vc-error");
		} else if (isStale) {
			setIcon(iconEl, "clock");
			iconEl.addClass("vc-stale");
			iconEl.setAttribute("title", "Trace was not properly ended (stale)");
		} else {
			setIcon(iconEl, "check-circle");
			iconEl.addClass("vc-ok");
		}

		// Trace info
		const infoEl = item.createDiv({ cls: "vc-tracing-item-info" });
		infoEl.createEl("span", { text: trace.workflowName, cls: "vc-tracing-item-name" });
		
		const metaEl = infoEl.createDiv({ cls: "vc-tracing-item-meta" });
		metaEl.createEl("span", { text: this.formatTime(trace.startedAt) });
		metaEl.createEl("span", { text: `${trace.spans.length} spans` });
		if (trace.endedAt) {
			metaEl.createEl("span", { text: formatDuration(trace.endedAt - trace.startedAt) });
		} else if (isStale) {
			metaEl.createEl("span", { text: "stale", cls: "vc-stale-label" });
		}

		item.addEventListener("click", () => {
			this.selectedTraceId = trace.traceId;
			this.render();
		});
	}

	private renderTraceDetail(container: HTMLElement, trace: TracingTrace): void {
		// Header
		const header = container.createDiv({ cls: "vc-tracing-detail-header" });
		header.createEl("h3", { text: trace.workflowName });
		
		const meta = header.createDiv({ cls: "vc-tracing-detail-meta" });
		meta.createEl("span", { text: `ID: ${trace.traceId.slice(0, 12)}...` });
		meta.createEl("span", { text: `Started: ${this.formatTime(trace.startedAt)}` });
		if (trace.endedAt) {
			meta.createEl("span", { text: `Duration: ${formatDuration(trace.endedAt - trace.startedAt)}` });
		}
		if (trace.groupId) {
			meta.createEl("span", { text: `Group: ${trace.groupId.slice(0, 8)}...` });
		}

		// Spans tree
		const spansEl = container.createDiv({ cls: "vc-tracing-spans" });
		spansEl.createEl("h4", { text: "Spans" });

		if (trace.spans.length === 0) {
			spansEl.createEl("p", { text: "No spans recorded", cls: "vc-tracing-hint" });
			return;
		}

		// Build span tree
		const rootSpans = trace.spans.filter(s => !s.parentId);
		const spanTree = spansEl.createDiv({ cls: "vc-tracing-span-tree" });
		
		for (const span of rootSpans) {
			this.renderSpanNode(spanTree, span, trace.spans, 0, trace.startedAt);
		}

		// Also render orphan spans (ones with parent not in this trace)
		const orphanSpans = trace.spans.filter(s => 
			s.parentId && !trace.spans.some(p => p.spanId === s.parentId)
		);
		if (orphanSpans.length > 0) {
			for (const span of orphanSpans) {
				this.renderSpanNode(spanTree, span, trace.spans, 0, trace.startedAt);
			}
		}
	}

	private renderSpanNode(container: HTMLElement, span: TracingSpan, allSpans: TracingSpan[], depth: number, traceStartedAt: number): void {
		const node = container.createDiv({ 
			cls: "vc-tracing-span-node",
			attr: { style: `margin-left: ${depth * 16}px` }
		});

		// Check if span is stale (not ended but older than 5 minutes)
		const isStale = !span.endedAt && (Date.now() - traceStartedAt > 5 * 60 * 1000);

		// Expand/collapse for spans with children
		const children = allSpans.filter(s => s.parentId === span.spanId);
		const hasChildren = children.length > 0;

		// Header
		const header = node.createDiv({ cls: "vc-tracing-span-header" });
		
		if (hasChildren) {
			const toggle = header.createSpan({ cls: "vc-tracing-span-toggle" });
			setIcon(toggle, "chevron-down");
		} else {
			header.createSpan({ cls: "vc-tracing-span-toggle vc-empty" });
		}

		// Type badge
		const typeBadge = header.createSpan({ 
			cls: `vc-tracing-span-type vc-type-${span.type}`,
			text: span.type
		});

		// Name
		header.createSpan({ cls: "vc-tracing-span-name", text: span.name });

		// Duration
		if (span.endedAt) {
			header.createSpan({ 
				cls: "vc-tracing-span-duration",
				text: formatDuration(span.endedAt - span.startedAt)
			});
		} else if (isStale) {
			header.createSpan({ cls: "vc-tracing-span-duration vc-stale", text: "stale" });
		} else {
			header.createSpan({ cls: "vc-tracing-span-duration vc-running", text: "running..." });
		}

		// Error indicator
		if (span.error) {
			const errorIcon = header.createSpan({ cls: "vc-tracing-span-error" });
			setIcon(errorIcon, "alert-circle");
			errorIcon.setAttribute("title", span.error);
		}

		// Expandable detail section
		const detailSection = node.createDiv({ cls: "vc-tracing-span-detail vc-collapsed" });
		
		// Render span data
		if (span.data && Object.keys(span.data).length > 0) {
			const dataEl = detailSection.createDiv({ cls: "vc-tracing-span-data" });
			dataEl.createEl("strong", { text: "Data:" });
			const pre = dataEl.createEl("pre");
			pre.createEl("code", { text: JSON.stringify(span.data, null, 2) });
		}

		if (span.error) {
			const errorEl = detailSection.createDiv({ cls: "vc-tracing-span-error-detail" });
			errorEl.createEl("strong", { text: "Error:" });
			errorEl.createEl("span", { text: span.error });
		}

		// Toggle detail on click
		header.addEventListener("click", (e) => {
			e.stopPropagation();
			detailSection.toggleClass("vc-collapsed", !detailSection.hasClass("vc-collapsed"));
		});

		// Render children
		if (hasChildren) {
			const childContainer = node.createDiv({ cls: "vc-tracing-span-children" });
			for (const child of children) {
				this.renderSpanNode(childContainer, child, allSpans, depth + 1, traceStartedAt);
			}
		}
	}

	private formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString(undefined, { 
			hour: "2-digit", 
			minute: "2-digit", 
			second: "2-digit",
			fractionalSecondDigits: 3
		});
	}

	destroy(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		this.tracingContentEl = null;
		this.containerEl.empty();
	}
}

/**
 * Modal for viewing traces
 */
export class TracingModal extends Modal {
	private panel: TracingPanel | null = null;

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("vc-tracing-modal");
		this.panel = new TracingPanel(contentEl, this.app);
		this.panel.mount();
	}

	onClose(): void {
		this.panel?.destroy();
		this.panel = null;
	}
}

export const TRACING_VIEW_TYPE = "vc-tracing-view";

export class TracingView extends ItemView {
	private panel: TracingPanel | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return TRACING_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Tracing & Diagnostics";
	}

	getIcon(): string {
		return "list-tree";
	}

	async onOpen(): Promise<void> {
		this.containerEl.addClass("vc-tracing-modal");
		this.panel = new TracingPanel(this.contentEl, this.app);
		this.panel.mount();
	}

	async onClose(): Promise<void> {
		this.panel?.destroy();
		this.panel = null;
	}
}

/**
 * Open tracing in a popout window (desktop) or modal (mobile)
 */
export function openTracingPopout(app: App): void {
	// Electron web-shell: open in a dedicated child BrowserWindow
	if ((window as any).electronAPI?.openWindow) {
		(window as any).electronAPI.openWindow(TRACING_VIEW_TYPE, {
			title: "Tracing & Diagnostics",
			width: 1000,
			height: 700,
		}).catch((err: any) => {
			console.error('[TracingModal] Failed to open child window:', err);
			const modal = new TracingModal(app);
			modal.open();
		});
		return;
	}

	// On desktop, create a pop-out window using workspace API
	// On mobile, fall back to modal
	if (Platform.isDesktopApp) {
		try {
			const leaf = app.workspace.getLeaf("window");
			leaf.setViewState({ type: TRACING_VIEW_TYPE, active: true });
		} catch (error) {
			console.error('[TracingModal] Failed to open pop-out window:', error);
			const modal = new TracingModal(app);
			modal.open();
		}
	} else {
		const modal = new TracingModal(app);
		modal.open();
	}
}

