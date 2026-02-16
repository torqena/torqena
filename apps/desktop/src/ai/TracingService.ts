/**
 * @module TracingService
 * @description Trace capture and persistence for agent execution diagnostics.
 *
 * The TracingService intercepts execution traces from the OpenAI Agents SDK
 * and stores them for debugging and analysis. Traces include spans for each
 * operation (tool calls, LLM requests, etc.) with timing and metadata.
 *
 * ## Storage
 *
 * Traces are persisted to IndexedDB with two object stores:
 * - `traces`: Complete trace records with spans
 * - `sdkLogs`: SDK debug log entries
 *
 * ## Architecture
 *
 * ```
 * OpenAI Agents SDK
 *   └── TraceProcessor (SDK hook)
 *         └── TracingService (this module)
 *               ├── IndexedDB (persistence)
 *               └── TracingModal (UI display)
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * // Get the singleton instance
 * const tracingService = getTracingService();
 *
 * // Enable tracing
 * await tracingService.initialize();
 * tracingService.setEnabled(true);
 *
 * // Listen for trace events
 * tracingService.on((event) => {
 *   if (event.type === 'trace-ended') {
 *     console.log('Trace completed:', event.trace.workflowName);
 *   }
 * });
 *
 * // Get all traces
 * const traces = await tracingService.getTraces();
 * ```
 *
 * @see {@link TracingTrace} for trace data structure
 * @see {@link TracingSpan} for span data structure
 * @see {@link TracingModal} for the diagnostics UI
 * @since 0.0.1
 */

import { addTraceProcessor, getGlobalTraceProvider } from "@openai/agents";

/** IndexedDB database name and version */
const DB_NAME = "VaultCopilotTracing";
const DB_VERSION = 1;
const TRACES_STORE = "traces";
const LOGS_STORE = "sdkLogs";

/** Debug namespace pattern for OpenAI Agents SDK */
const SDK_DEBUG_NAMESPACE = "openai-agents:*";

/** Original console methods for restoration */
let originalConsoleDebug: typeof console.debug | null = null;
let originalConsoleLog: typeof console.log | null = null;

/** Represents a single span within a trace */
export interface TracingSpan {
	spanId: string;
	traceId: string;
	parentId?: string;
	name: string;
	type: string;
	startedAt: number;
	endedAt?: number;
	data?: Record<string, unknown>;
	error?: string;
}

/** Represents a complete trace (workflow execution) */
export interface TracingTrace {
	traceId: string;
	workflowName: string;
	groupId?: string;
	startedAt: number;
	endedAt?: number;
	spans: TracingSpan[];
	metadata?: Record<string, unknown>;
}

/** Event emitted when traces change */
export type TracingEvent = 
	| { type: "trace-started"; trace: TracingTrace }
	| { type: "trace-ended"; trace: TracingTrace }
	| { type: "span-started"; span: TracingSpan }
	| { type: "span-ended"; span: TracingSpan };

type TracingEventListener = (event: TracingEvent) => void;

/**
 * Service for capturing and managing traces from agent executions
 */
export class TracingService {
	private traces: Map<string, TracingTrace> = new Map();
	private spans: Map<string, TracingSpan> = new Map();
	private listeners: TracingEventListener[] = [];
	private enabled: boolean = false;
	private maxTraces: number = 50; // Keep last 50 traces
	private processorAdded: boolean = false;
	private db: IDBDatabase | null = null;
	private dbInitialized: boolean = false;

	constructor() {
		// Initialize IndexedDB
		this.initializeDB();
	}

	/**
	 * Initialize IndexedDB for persistence
	 */
	private async initializeDB(): Promise<void> {
		try {
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			
			request.onerror = () => {
				console.error("[TracingService] Failed to open IndexedDB:", request.error);
			};
			
			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				
				// Create traces store
				if (!db.objectStoreNames.contains(TRACES_STORE)) {
					const tracesStore = db.createObjectStore(TRACES_STORE, { keyPath: "traceId" });
					tracesStore.createIndex("startedAt", "startedAt", { unique: false });
				}
				
				// Create SDK logs store
				if (!db.objectStoreNames.contains(LOGS_STORE)) {
					const logsStore = db.createObjectStore(LOGS_STORE, { keyPath: "id", autoIncrement: true });
					logsStore.createIndex("timestamp", "timestamp", { unique: false });
				}
			};
			
			request.onsuccess = () => {
				this.db = request.result;
				this.dbInitialized = true;
				console.log("[TracingService] IndexedDB initialized");
				
				// Load existing traces from DB
				this.loadTracesFromDB();
				this.loadSdkLogsFromDB();
			};
		} catch (error) {
			console.error("[TracingService] IndexedDB initialization error:", error);
		}
	}

	/**
	 * Load traces from IndexedDB
	 */
	private async loadTracesFromDB(): Promise<void> {
		if (!this.db) return;
		
		try {
			const transaction = this.db.transaction(TRACES_STORE, "readonly");
			const store = transaction.objectStore(TRACES_STORE);
			const request = store.getAll();
			
			request.onsuccess = () => {
				const traces = request.result as TracingTrace[];
				for (const trace of traces) {
					this.traces.set(trace.traceId, trace);
					// Rebuild spans map
					for (const span of trace.spans) {
						this.spans.set(span.spanId, span);
					}
				}
				console.log(`[TracingService] Loaded ${traces.length} traces from IndexedDB`);
			};
			
			request.onerror = () => {
				console.error("[TracingService] Failed to load traces:", request.error);
			};
		} catch (error) {
			console.error("[TracingService] Error loading traces:", error);
		}
	}

	/**
	 * Save a trace to IndexedDB
	 */
	private saveTraceToDB(trace: TracingTrace): void {
		if (!this.db) return;
		
		try {
			const transaction = this.db.transaction(TRACES_STORE, "readwrite");
			const store = transaction.objectStore(TRACES_STORE);
			store.put(trace);
		} catch (error) {
			console.error("[TracingService] Error saving trace:", error);
		}
	}

	/**
	 * Delete a trace from IndexedDB
	 */
	private deleteTraceFromDB(traceId: string): void {
		if (!this.db) return;
		
		try {
			const transaction = this.db.transaction(TRACES_STORE, "readwrite");
			const store = transaction.objectStore(TRACES_STORE);
			store.delete(traceId);
		} catch (error) {
			console.error("[TracingService] Error deleting trace:", error);
		}
	}

	/**
	 * Clear all traces from IndexedDB
	 */
	private clearTracesFromDB(): void {
		if (!this.db) return;
		
		try {
			const transaction = this.db.transaction(TRACES_STORE, "readwrite");
			const store = transaction.objectStore(TRACES_STORE);
			store.clear();
		} catch (error) {
			console.error("[TracingService] Error clearing traces:", error);
		}
	}

	/**
	 * Enable tracing and add the trace processor
	 */
	enable(): void {
		if (this.enabled) return;
		
		this.enabled = true;
		
		// Only add processor once (it's global)
		if (!this.processorAdded) {
			this.addCustomProcessor();
			this.processorAdded = true;
		}
		
		// Enable SDK debug logging by setting localStorage
		// The debug library checks this for enabled namespaces
		this.enableSdkDebugLogging();
		
		console.log("[TracingService] Tracing enabled");
	}

	/**
	 * Disable tracing (processor remains but we stop collecting)
	 */
	disable(): void {
		this.enabled = false;
		this.disableSdkDebugLogging();
		console.log("[TracingService] Tracing disabled");
	}

	/**
	 * Enable SDK debug logging by intercepting console output
	 */
	private enableSdkDebugLogging(): void {
		// Enable the debug namespace in localStorage
		// The debug library reads from localStorage.debug in browsers
		try {
			const currentDebug = localStorage.getItem("debug") || "";
			if (!currentDebug.includes("openai-agents")) {
				const newDebug = currentDebug 
					? `${currentDebug},${SDK_DEBUG_NAMESPACE}` 
					: SDK_DEBUG_NAMESPACE;
				localStorage.setItem("debug", newDebug);
			}
		} catch (e) {
			console.warn("[TracingService] Could not set localStorage.debug:", e);
		}

		// Intercept console.debug and console.log to capture SDK debug output
		// The debug library outputs to console.debug in browsers
		if (!originalConsoleDebug) {
			originalConsoleDebug = console.debug.bind(console);
			originalConsoleLog = console.log.bind(console);

			const self = this;
			
			console.debug = function(...args: unknown[]) {
				// Check if this looks like a debug library message (has namespace prefix)
				const message = args.map(a => 
					typeof a === 'object' ? JSON.stringify(a) : String(a)
				).join(' ');
				
				// Capture messages that look like SDK debug output
				if (message.includes("openai-agents") || message.includes("Calling LLM") || 
					message.includes("Response received") || message.includes("[RealtimeSession]") ||
					message.includes("[RealtimeAgent]")) {
					self.addSdkLog('debug', message, 'sdk-debug');
				}
				
				// Call original
				if (originalConsoleDebug) {
					originalConsoleDebug.apply(console, args);
				}
			};

			// Also intercept console.log as debug library may use it depending on config
			console.log = function(...args: unknown[]) {
				const message = args.map(a => 
					typeof a === 'object' ? JSON.stringify(a) : String(a)
				).join(' ');
				
				// Capture SDK-related log messages
				if (message.includes("openai-agents") || message.includes("[RealtimeSession]") ||
					message.includes("[RealtimeAgent]")) {
					self.addSdkLog('info', message, 'sdk-log');
				}
				
				// Call original
				if (originalConsoleLog) {
					originalConsoleLog.apply(console, args);
				}
			};
		}
	}

	/**
	 * Disable SDK debug logging and restore console methods
	 */
	private disableSdkDebugLogging(): void {
		// Restore original console methods
		if (originalConsoleDebug) {
			console.debug = originalConsoleDebug;
			originalConsoleDebug = null;
		}
		if (originalConsoleLog) {
			console.log = originalConsoleLog;
			originalConsoleLog = null;
		}

		// Remove our debug namespace from localStorage (optional - leave enabled)
		// We don't remove it so logs still appear in dev console
	}

	/**
	 * Check if tracing is enabled
	 */
	isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Add the custom trace processor to capture traces
	 */
	private addCustomProcessor(): void {
		try {
			addTraceProcessor({
				onTraceStart: async (trace) => {
					if (!this.enabled) return;
					
					const tracingTrace: TracingTrace = {
						traceId: trace.traceId,
						workflowName: trace.name || "Unknown workflow",
						groupId: trace.groupId ?? undefined,
						startedAt: Date.now(),
						spans: [],
						metadata: trace.metadata as Record<string, unknown>,
					};
					
					this.traces.set(trace.traceId, tracingTrace);
					this.saveTraceToDB(tracingTrace);
					this.emit({ type: "trace-started", trace: tracingTrace });
					this.pruneOldTraces();
				},
				
				onTraceEnd: async (trace) => {
					if (!this.enabled) return;
					
					const tracingTrace = this.traces.get(trace.traceId);
					if (tracingTrace) {
						tracingTrace.endedAt = Date.now();
						this.saveTraceToDB(tracingTrace);
						this.emit({ type: "trace-ended", trace: tracingTrace });
					}
				},
				
				onSpanStart: async (span) => {
					if (!this.enabled) return;
					
					const spanData = span.spanData as Record<string, unknown> | undefined;
					const tracingSpan: TracingSpan = {
						spanId: span.spanId,
						traceId: span.traceId,
						parentId: span.parentId ?? undefined,
						name: (spanData?.name as string) || "Unknown span",
						type: (spanData?.type as string) || "unknown",
						startedAt: Date.now(),
						data: spanData,
					};
					
					this.spans.set(span.spanId, tracingSpan);
					
					// Add to parent trace
					const trace = this.traces.get(span.traceId);
					if (trace) {
						trace.spans.push(tracingSpan);
						this.saveTraceToDB(trace);
					}
					
					this.emit({ type: "span-started", span: tracingSpan });
				},
				
				onSpanEnd: async (span) => {
					if (!this.enabled) return;
					
					const tracingSpan = this.spans.get(span.spanId);
					if (tracingSpan) {
						tracingSpan.endedAt = Date.now();
						if (span.error) {
							tracingSpan.error = span.error instanceof Error 
								? span.error.message 
								: String(span.error);
						}
						// Save updated trace to DB
						const trace = this.traces.get(span.traceId);
						if (trace) {
							this.saveTraceToDB(trace);
						}
						this.emit({ type: "span-ended", span: tracingSpan });
					}
				},
				
				shutdown: async () => {
					// Cleanup resources when tracing is shut down
					console.log("[TracingService] Shutdown called");
				},
				
				forceFlush: async () => {
					// Force flush any pending traces
					console.log("[TracingService] Force flush called");
				},
			});
			
			console.log("[TracingService] Custom trace processor added");
		} catch (error) {
			console.error("[TracingService] Failed to add trace processor:", error);
		}
	}

	/**
	 * Get all traces (most recent first)
	 */
	getTraces(): TracingTrace[] {
		return Array.from(this.traces.values())
			.sort((a, b) => b.startedAt - a.startedAt);
	}

	/**
	 * Get a specific trace by ID
	 */
	getTrace(traceId: string): TracingTrace | undefined {
		return this.traces.get(traceId);
	}

	/**
	 * Clear all traces
	 */
	clearTraces(): void {
		this.traces.clear();
		this.spans.clear();
		this.clearTracesFromDB();
		console.log("[TracingService] Traces cleared");
	}

	/**
	 * Manually start a trace (for non-SDK sources like RealtimeAgent)
	 */
	startTrace(name: string, metadata?: Record<string, unknown>): string {
		if (!this.enabled) return "";
		
		const traceId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const trace: TracingTrace = {
			traceId,
			workflowName: name,
			startedAt: Date.now(),
			spans: [],
			metadata,
		};
		
		this.traces.set(traceId, trace);
		this.saveTraceToDB(trace);
		this.emit({ type: "trace-started", trace });
		this.pruneOldTraces();
		
		return traceId;
	}

	/**
	 * Manually end a trace
	 */
	endTrace(traceId: string): void {
		if (!this.enabled) return;
		
		const trace = this.traces.get(traceId);
		if (trace) {
			trace.endedAt = Date.now();
			this.saveTraceToDB(trace);
			this.emit({ type: "trace-ended", trace });
		}
	}

	/**
	 * Manually add a span to a trace
	 */
	addSpan(traceId: string, name: string, type: string, data?: Record<string, unknown>): string {
		if (!this.enabled) return "";
		
		const spanId = `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const span: TracingSpan = {
			spanId,
			traceId,
			name,
			type,
			startedAt: Date.now(),
			data,
		};
		
		this.spans.set(spanId, span);
		
		const trace = this.traces.get(traceId);
		if (trace) {
			trace.spans.push(span);
			this.saveTraceToDB(trace);
		}
		
		this.emit({ type: "span-started", span });
		return spanId;
	}

	/**
	 * Manually complete a span
	 */
	completeSpan(spanId: string, error?: string): void {
		if (!this.enabled) return;
		
		const span = this.spans.get(spanId);
		if (span) {
			span.endedAt = Date.now();
			if (error) {
				span.error = error;
			}
			// Save updated trace to DB
			const trace = this.traces.get(span.traceId);
			if (trace) {
				this.saveTraceToDB(trace);
			}
			this.emit({ type: "span-ended", span });
		}
	}

	/**
	 * Subscribe to tracing events
	 */
	on(listener: TracingEventListener): () => void {
		this.listeners.push(listener);
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index > -1) {
				this.listeners.splice(index, 1);
			}
		};
	}

	/**
	 * Emit an event to all listeners
	 */
	private emit(event: TracingEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error("[TracingService] Listener error:", error);
			}
		}
	}

	/**
	 * Remove old traces to prevent memory bloat
	 */
	private pruneOldTraces(): void {
		if (this.traces.size <= this.maxTraces) return;
		
		const sorted = Array.from(this.traces.entries())
			.sort((a, b) => a[1].startedAt - b[1].startedAt);
		
		const toDelete = sorted.slice(0, sorted.length - this.maxTraces);
		for (const [traceId, trace] of toDelete) {
			// Remove associated spans
			for (const span of trace.spans) {
				this.spans.delete(span.spanId);
			}
			this.traces.delete(traceId);
			this.deleteTraceFromDB(traceId);
		}
	}

	/**
	 * Force flush any pending traces
	 */
	async forceFlush(): Promise<void> {
		try {
			await getGlobalTraceProvider().forceFlush();
		} catch (error) {
			console.error("[TracingService] Force flush error:", error);
		}
	}

	/**
	 * Get summary statistics
	 */
	getStats(): { traceCount: number; spanCount: number; enabled: boolean } {
		return {
			traceCount: this.traces.size,
			spanCount: this.spans.size,
			enabled: this.enabled,
		};
	}

	/**
	 * Storage for SDK diagnostic logs
	 */
	private sdkLogs: SDKLogEntry[] = [];
	private maxSdkLogs: number = 500;

	/**
	 * Load SDK logs from IndexedDB
	 */
	private async loadSdkLogsFromDB(): Promise<void> {
		if (!this.db) return;
		
		try {
			const transaction = this.db.transaction(LOGS_STORE, "readonly");
			const store = transaction.objectStore(LOGS_STORE);
			const request = store.getAll();
			
			request.onsuccess = () => {
				const logs = request.result as (SDKLogEntry & { id?: number })[];
				// Remove the id property and keep only the last maxSdkLogs
				this.sdkLogs = logs.slice(-this.maxSdkLogs).map(({ id, ...log }) => log);
				console.log(`[TracingService] Loaded ${this.sdkLogs.length} SDK logs from IndexedDB`);
			};
			
			request.onerror = () => {
				console.error("[TracingService] Failed to load SDK logs:", request.error);
			};
		} catch (error) {
			console.error("[TracingService] Error loading SDK logs:", error);
		}
	}

	/**
	 * Save an SDK log entry to IndexedDB
	 */
	private saveSdkLogToDB(entry: SDKLogEntry): void {
		if (!this.db) return;
		
		try {
			const transaction = this.db.transaction(LOGS_STORE, "readwrite");
			const store = transaction.objectStore(LOGS_STORE);
			store.add(entry);
			
			// Prune old logs from DB if needed
			const countRequest = store.count();
			countRequest.onsuccess = () => {
				if (countRequest.result > this.maxSdkLogs) {
					// Delete oldest logs
					const index = store.index("timestamp");
					const deleteCount = countRequest.result - this.maxSdkLogs;
					let deleted = 0;
					
					index.openCursor().onsuccess = (event) => {
						const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
						if (cursor && deleted < deleteCount) {
							cursor.delete();
							deleted++;
							cursor.continue();
						}
					};
				}
			};
		} catch (error) {
			console.error("[TracingService] Error saving SDK log:", error);
		}
	}

	/**
	 * Clear SDK logs from IndexedDB
	 */
	private clearSdkLogsFromDB(): void {
		if (!this.db) return;
		
		try {
			const transaction = this.db.transaction(LOGS_STORE, "readwrite");
			const store = transaction.objectStore(LOGS_STORE);
			store.clear();
		} catch (error) {
			console.error("[TracingService] Error clearing SDK logs:", error);
		}
	}

	/**
	 * Add an SDK diagnostic log entry
	 * Note: SDK logs are always captured regardless of tracing being enabled
	 * since they are useful for debugging even without full trace collection.
	 */
	addSdkLog(level: 'debug' | 'info' | 'warning' | 'error', message: string, source: string = 'sdk'): void {
		const entry: SDKLogEntry = {
			timestamp: Date.now(),
			level,
			message,
			source,
		};
		
		this.sdkLogs.push(entry);
		this.saveSdkLogToDB(entry);
		
		// Prune old logs in memory
		if (this.sdkLogs.length > this.maxSdkLogs) {
			this.sdkLogs = this.sdkLogs.slice(-this.maxSdkLogs);
		}
	}

	/**
	 * Get SDK diagnostic logs
	 */
	getSdkLogs(): SDKLogEntry[] {
		return [...this.sdkLogs];
	}

	/**
	 * Clear SDK logs
	 */
	clearSdkLogs(): void {
		this.sdkLogs = [];
		this.clearSdkLogsFromDB();
	}
}

/** SDK diagnostic log entry */
export interface SDKLogEntry {
	timestamp: number;
	level: 'debug' | 'info' | 'warning' | 'error';
	message: string;
	source: string;
}

// Singleton instance
let tracingServiceInstance: TracingService | null = null;

/**
 * Get the global TracingService instance
 */
export function getTracingService(): TracingService {
	if (!tracingServiceInstance) {
		tracingServiceInstance = new TracingService();
	}
	return tracingServiceInstance;
}
