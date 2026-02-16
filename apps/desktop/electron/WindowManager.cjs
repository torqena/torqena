/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module WindowManager
 * @description Manages BrowserWindow lifecycle for Vault Copilot's Electron shell.
 *
 * Responsibilities:
 * - Main window creation with persisted frame-style config
 * - Child (pop-out) windows for detached views
 * - Window configuration persistence (frame style, titlebar overlay)
 * - Tab docking from child windows back to main
 * - Dev-mode shortcuts (F5 reload, Ctrl+Shift+I DevTools)
 *
 * @example
 * ```js
 * const WindowManager = require("./WindowManager.cjs");
 * const wm = new WindowManager();
 * await wm.createMainWindow();
 * ```
 *
 * @see {@link ProcessManager} for child process management
 * @since 0.0.28
 */

const { BrowserWindow, Menu, dialog, screen } = require("electron");
const path = require("path");
const fs = require("fs");

class WindowManager {
	/**
	 * Create a new WindowManager.
	 *
	 * @param {import("electron").App} app - The Electron app instance
	 * @param {boolean} isDev - Whether the app is running in development mode
	 */
	constructor(app, isDev) {
		/** @type {import("electron").App} */
		this._app = app;

		/** @type {boolean} */
		this._isDev = isDev;

		/** @type {BrowserWindow | null} */
		this._mainWindow = null;

		/** @type {Map<number, BrowserWindow>} */
		this._childWindows = new Map();

		/** @type {number} */
		this._nextChildId = 1;

		/**
		 * Arbitrary key/value metadata per window, keyed by native BrowserWindow.id.
		 * @type {Map<number, Record<string, string>>}
		 */
		this._windowMeta = new Map();

		/** @internal Path to the window config file (persists frame style across restarts). */
		this._configPath = path.join(app.getPath("userData"), "window-config.json");
	}

	// ---- Config Persistence ----

	/**
	 * Read the persisted window config from disk.
	 *
	 * @returns {object} The config object (may be empty)
	 * @internal
	 */
	_readConfig() {
		try {
			if (fs.existsSync(this._configPath)) {
				return JSON.parse(fs.readFileSync(this._configPath, "utf-8"));
			}
		} catch { /* ignore */ }
		return {};
	}

	/**
	 * Write window config to disk.
	 *
	 * @param {object} config - The config object to persist
	 * @internal
	 */
	_writeConfig(config) {
		try {
			fs.writeFileSync(this._configPath, JSON.stringify(config, null, 2), "utf-8");
		} catch { /* ignore */ }
	}

	// ---- Main Window ----

	/**
	 * The main BrowserWindow, or null if not yet created.
	 *
	 * @returns {BrowserWindow | null}
	 */
	get mainWindow() {
		return this._mainWindow;
	}

	/**
	 * Create and show the main application window.
	 *
	 * Reads the persisted frame-style config, constructs BrowserWindow options,
	 * loads the Vite dev server (dev) or built index.html (production), and
	 * wires dev-mode keyboard shortcuts.
	 *
	 * @returns {Promise<BrowserWindow>}
	 */
	async createMainWindow() {
		Menu.setApplicationMenu(null);

		const config = this._readConfig();
		const isFrameHidden = config.windowFrameStyle !== "native";

		const windowOptions = {
			width: 1400,
			height: 900,
			minWidth: 800,
			minHeight: 600,
			title: "Vault Copilot",
			webPreferences: {
				preload: path.join(__dirname, "preload.cjs"),
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: false,
			},
		};

		if (isFrameHidden) {
			windowOptions.frame = false;
			windowOptions.titleBarStyle = "hidden";
			if (process.platform === "win32") {
				windowOptions.titleBarOverlay = {
					color: "#f6f6f6",
					symbolColor: "#2e3338",
					height: 36,
				};
			}
		}

		// Restore persisted bounds if available and valid
		if (config.windowBounds) {
			const saved = config.windowBounds;
			const displays = screen.getAllDisplays();
			const fits = displays.some((d) => {
				const wa = d.workArea;
				return (
					saved.x < wa.x + wa.width &&
					saved.x + saved.width > wa.x &&
					saved.y < wa.y + wa.height &&
					saved.y + saved.height > wa.y
				);
			});
			if (fits) {
				windowOptions.x = saved.x;
				windowOptions.y = saved.y;
				windowOptions.width = saved.width;
				windowOptions.height = saved.height;
			}
		}

		this._mainWindow = new BrowserWindow(windowOptions);

		// Restore maximized state after window creation
		if (config.wasMaximized) {
			this._mainWindow.maximize();
		}

		// Store main window metadata
		this._windowMeta.set(this._mainWindow.id, { viewType: "main" });

		if (this._isDev) {
			const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
			try {
				await this._mainWindow.webContents.session.clearCache();
				await this._mainWindow.webContents.session.clearStorageData({
					storages: ["serviceworkers", "cachestorage"],
				});
			} catch {
				// Best-effort cache reset in dev mode
			}
			this._mainWindow.loadURL(devUrl);
			this._mainWindow.webContents.openDevTools();

			// Dev shortcuts: F5 = reload, Ctrl+Shift+I = toggle DevTools
			this._mainWindow.webContents.on("before-input-event", (_e, input) => {
				if (input.key === "F5" && input.type === "keyDown") {
					this._mainWindow.webContents.reload();
				}
				if (input.key === "I" && input.control && input.shift && input.type === "keyDown") {
					this._mainWindow.webContents.toggleDevTools();
				}
			});
		} else {
			this._mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
		}

		// Persist bounds before closing
		this._mainWindow.on("close", () => {
			if (this._mainWindow && !this._mainWindow.isDestroyed()) {
				const config = this._readConfig();
				config.wasMaximized = this._mainWindow.isMaximized();
				// Save normal (non-maximized) bounds so restore works correctly
				if (!this._mainWindow.isMaximized()) {
					config.windowBounds = this._mainWindow.getBounds();
				}
				this._writeConfig(config);
			}
		});

		this._mainWindow.on("closed", () => {
			if (this._mainWindow) {
				this._windowMeta.delete(this._mainWindow.id);
			}
			this._mainWindow = null;
		});

		return this._mainWindow;
	}

	// ---- Child (Pop-out) Windows ----

	/**
	 * Open a view in a new child BrowserWindow.
	 *
	 * The child loads the same app URL with a `?view=<viewType>` query parameter
	 * so the renderer can detect it and render only that view's panel.
	 *
	 * @param {string} viewType - The view type identifier (e.g., 'vc-tracing-view')
	 * @param {object} [options] - Optional window size/title/query overrides
	 * @returns {{ windowId: number }}
	 */
	openChildWindow(viewType, options = {}) {
		const config = this._readConfig();
		const isFrameHidden = config.windowFrameStyle !== "native";

		const childOptions = {
			width: options.width || 900,
			height: options.height || 650,
			minWidth: 500,
			minHeight: 400,
			title: options.title || "Vault Copilot",
			parent: this._mainWindow,
			webPreferences: {
				preload: path.join(__dirname, "preload.cjs"),
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: false,
			},
		};

		if (isFrameHidden) {
			childOptions.frame = false;
			childOptions.titleBarStyle = "hidden";
			if (process.platform === "win32") {
				childOptions.titleBarOverlay = {
					color: "#f6f6f6",
					symbolColor: "#2e3338",
					height: 36,
				};
			}
		}

		const childWindow = new BrowserWindow(childOptions);
		const childId = this._nextChildId++;
		this._childWindows.set(childId, childWindow);

		// Store metadata for child window
		const meta = { viewType: viewType || "child", ...(options.meta || {}) };
		this._windowMeta.set(childWindow.id, meta);

		childWindow.setMenu(null);

		const query = { ...(options.query || {}) };
		if (viewType && viewType !== "main") {
			query.view = viewType;
		}

		if (this._isDev) {
			const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
			const search = new URLSearchParams(query).toString();
			childWindow.loadURL(search ? `${devUrl}?${search}` : devUrl);
		} else {
			const indexPath = path.join(__dirname, "../dist/index.html");
			childWindow.loadFile(indexPath, { query });
		}

		childWindow.on("closed", () => {
			this._windowMeta.delete(childWindow.id);
			this._childWindows.delete(childId);
		});

		return { windowId: childId };
	}

	/**
	 * Dock a detached file tab back into the main window.
	 *
	 * Sends the file path to the main renderer via IPC and closes the
	 * child window that initiated the request.
	 *
	 * @param {import("electron").WebContents} senderContents - The WebContents that sent the request
	 * @param {string} filePath - Vault-relative file path to dock
	 * @returns {{ ok: boolean }}
	 */
	dockTab(senderContents, filePath) {
		if (this._mainWindow && !this._mainWindow.isDestroyed()) {
			const dispatchDock = () => {
				if (!this._mainWindow || this._mainWindow.isDestroyed()) return;
				this._mainWindow.webContents.send("window:dockTab", filePath);
			};

			if (this._mainWindow.webContents.isLoadingMainFrame()) {
				this._mainWindow.webContents.once("did-finish-load", dispatchDock);
			} else {
				dispatchDock();
			}

			if (this._mainWindow.isMinimized()) {
				this._mainWindow.restore();
			}
			this._mainWindow.show();
			this._mainWindow.focus();
		}

		const senderWindow = BrowserWindow.fromWebContents(senderContents);
		if (senderWindow && senderWindow !== this._mainWindow && !senderWindow.isDestroyed()) {
			senderWindow.close();
		}

		return { ok: true };
	}

	// ---- Frame / Titlebar ----

	/**
	 * Get the current window frame style.
	 *
	 * @returns {string} "hidden" or "native"
	 */
	getFrameStyle() {
		const config = this._readConfig();
		return config.windowFrameStyle || "hidden";
	}

	/**
	 * Set the window frame style. Takes effect on next restart.
	 *
	 * @param {string} style - "hidden" or "native"
	 */
	setFrameStyle(style) {
		const config = this._readConfig();
		config.windowFrameStyle = style;
		this._writeConfig(config);
	}

	/**
	 * Update the titlebar overlay colors dynamically to match the app theme.
	 * Only works on Windows with a frameless window.
	 *
	 * @param {import("electron").WebContents} senderContents - The WebContents requesting the update
	 * @param {{ color: string, symbolColor: string }} colors - The overlay colors
	 */
	setTitleBarOverlay(senderContents, colors) {
		const targetWindow = BrowserWindow.fromWebContents(senderContents) || this._mainWindow;
		if (targetWindow && !targetWindow.isDestroyed() && process.platform === "win32") {
			try {
				targetWindow.setTitleBarOverlay({
					color: colors.color,
					symbolColor: colors.symbolColor,
					height: 36,
				});
			} catch { /* ignore if not supported */ }
		}
	}

	// ---- Window Bounds ----

	/**
	 * Clamp a value between min and max.
	 *
	 * @param {number} v - The value to clamp
	 * @param {number} min - Minimum bound
	 * @param {number} max - Maximum bound
	 * @returns {number} The clamped value
	 * @internal
	 */
	_clamp(v, min, max) {
		return Math.min(Math.max(v, min), max);
	}

	/**
	 * Compute the area of intersection between two rectangles.
	 *
	 * @param {{ x: number, y: number, width: number, height: number }} a - First rectangle
	 * @param {{ x: number, y: number, width: number, height: number }} b - Second rectangle
	 * @returns {number} The intersection area (0 if no overlap)
	 * @internal
	 */
	_intersectionArea(a, b) {
		const x1 = Math.max(a.x, b.x);
		const y1 = Math.max(a.y, b.y);
		const x2 = Math.min(a.x + a.width, b.x + b.width);
		const y2 = Math.min(a.y + a.height, b.y + b.height);
		return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
	}

	/**
	 * Set window bounds with display-clamping to ensure the window stays visible.
	 *
	 * Finds the display with the most overlap with the target bounds, then clamps
	 * position and size to the display's work area. Enforces a minimum size of
	 * 480×320 or the window's own minimum constraints, whichever is larger.
	 *
	 * @param {import("electron").WebContents} senderContents - The WebContents requesting the change
	 * @param {{ x: number, y: number, width: number, height: number }} bounds - Target bounds
	 * @returns {{ ok: boolean, error?: string }}
	 *
	 * @example
	 * ```js
	 * windowManager.setBoundsSafe(event.sender, { x: 100, y: 100, width: 1200, height: 800 });
	 * ```
	 */
	setBoundsSafe(senderContents, bounds) {
		const win = BrowserWindow.fromWebContents(senderContents);
		if (!win || win.isDestroyed()) {
			return { ok: false, error: "No window found for sender" };
		}

		const displays = screen.getAllDisplays();

		// Find the display with the most overlap; fallback to nearest point
		const best = displays
			.map((d) => ({ d, area: this._intersectionArea(d.workArea, bounds) }))
			.sort((a, b) => b.area - a.area)[0]?.d
			?? screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });

		const wa = best.workArea;
		const [minW, minH] = win.getMinimumSize();

		const width = Math.max(minW || 480, Math.min(bounds.width, wa.width));
		const height = Math.max(minH || 320, Math.min(bounds.height, wa.height));

		const x = this._clamp(bounds.x, wa.x, wa.x + wa.width - width);
		const y = this._clamp(bounds.y, wa.y, wa.y + wa.height - height);

		win.setBounds({ x, y, width, height }, true);
		return { ok: true };
	}

	/**
	 * Get the current bounds of the calling window.
	 *
	 * @param {import("electron").WebContents} senderContents - The WebContents requesting bounds
	 * @returns {{ x: number, y: number, width: number, height: number } | null}
	 *
	 * @example
	 * ```js
	 * const bounds = windowManager.getBounds(event.sender);
	 * ```
	 */
	getBounds(senderContents) {
		const win = BrowserWindow.fromWebContents(senderContents);
		if (!win || win.isDestroyed()) return null;
		return win.getBounds();
	}

	// ---- Window State ----

	/**
	 * Set the window state (maximize, minimize, or restore).
	 *
	 * @param {import("electron").WebContents} senderContents - The WebContents requesting the change
	 * @param {"maximize" | "minimize" | "restore"} state - The desired window state
	 * @returns {{ ok: boolean, error?: string }}
	 *
	 * @example
	 * ```js
	 * windowManager.setWindowState(event.sender, "maximize");
	 * ```
	 */
	setWindowState(senderContents, state) {
		const win = BrowserWindow.fromWebContents(senderContents);
		if (!win || win.isDestroyed()) {
			return { ok: false, error: "No window found for sender" };
		}

		switch (state) {
		case "maximize":
			win.maximize();
			break;
		case "minimize":
			win.minimize();
			break;
		case "restore":
			win.restore();
			break;
		default:
			return { ok: false, error: `Unknown state: ${state}` };
		}

		return { ok: true };
	}

	/**
	 * Get the current state of the calling window.
	 *
	 * @param {import("electron").WebContents} senderContents - The WebContents to query
	 * @returns {{ isMaximized: boolean, isMinimized: boolean, isFullScreen: boolean } | null}
	 *
	 * @example
	 * ```js
	 * const state = windowManager.getWindowState(event.sender);
	 * ```
	 */
	getWindowState(senderContents) {
		const win = BrowserWindow.fromWebContents(senderContents);
		if (!win || win.isDestroyed()) return null;
		return {
			isMaximized: win.isMaximized(),
			isMinimized: win.isMinimized(),
			isFullScreen: win.isFullScreen(),
		};
	}

	// ---- Window Metadata ----

	/**
	 * Merge key/value pairs into a window's metadata.
	 *
	 * @param {import("electron").WebContents} senderContents - The WebContents requesting the update
	 * @param {Record<string, string>} meta - Key/value pairs to merge
	 *
	 * @example
	 * ```js
	 * windowManager.setWindowMeta(event.sender, { role: "debug", project: "test" });
	 * ```
	 */
	setWindowMeta(senderContents, meta) {
		const win = BrowserWindow.fromWebContents(senderContents);
		if (!win || win.isDestroyed()) return;

		const existing = this._windowMeta.get(win.id) || {};
		this._windowMeta.set(win.id, { ...existing, ...meta });
	}

	/**
	 * Get the metadata for the calling window.
	 *
	 * @param {import("electron").WebContents} senderContents - The WebContents to query
	 * @returns {Record<string, string>} The window's metadata (empty object if none)
	 *
	 * @example
	 * ```js
	 * const meta = windowManager.getWindowMeta(event.sender);
	 * ```
	 */
	getWindowMeta(senderContents) {
		const win = BrowserWindow.fromWebContents(senderContents);
		if (!win || win.isDestroyed()) return {};
		return this._windowMeta.get(win.id) || {};
	}

	/**
	 * List all open windows with their metadata.
	 *
	 * @returns {Array<{ windowId: number, viewType: string, title: string, meta: Record<string, string> }>}
	 *
	 * @example
	 * ```js
	 * const windows = windowManager.listWindows();
	 * ```
	 */
	listWindows() {
		const result = [];

		if (this._mainWindow && !this._mainWindow.isDestroyed()) {
			const meta = this._windowMeta.get(this._mainWindow.id) || {};
			result.push({
				windowId: this._mainWindow.id,
				viewType: meta.viewType || "main",
				title: this._mainWindow.getTitle(),
				meta,
			});
		}

		for (const [, childWin] of this._childWindows) {
			if (!childWin.isDestroyed()) {
				const meta = this._windowMeta.get(childWin.id) || {};
				result.push({
					windowId: childWin.id,
					viewType: meta.viewType || "child",
					title: childWin.getTitle(),
					meta,
				});
			}
		}

		return result;
	}

	/**
	 * Find the first window matching a metadata key/value pair.
	 *
	 * @param {string} key - The metadata key to match
	 * @param {string} value - The metadata value to match
	 * @returns {{ windowId: number, viewType: string, title: string, meta: Record<string, string> } | null}
	 *
	 * @example
	 * ```js
	 * const win = windowManager.findWindowByMeta("viewType", "vc-tracing-view");
	 * ```
	 */
	findWindowByMeta(key, value) {
		const allWindows = this.listWindows();
		return allWindows.find((w) => w.meta[key] === value) || null;
	}

	/**
	 * Bring a window to the front by its native BrowserWindow.id.
	 *
	 * @param {number} windowId - The BrowserWindow.id
	 * @returns {{ ok: boolean, error?: string }}
	 *
	 * @example
	 * ```js
	 * windowManager.focusWindow(5);
	 * ```
	 */
	focusWindow(windowId) {
		const allWindows = BrowserWindow.getAllWindows();
		const win = allWindows.find((w) => w.id === windowId);
		if (!win || win.isDestroyed()) {
			return { ok: false, error: "Window not found" };
		}

		if (win.isMinimized()) {
			win.restore();
		}
		win.show();
		win.focus();
		return { ok: true };
	}

	// ---- Dialog ----

	/**
	 * Open a native folder picker dialog.
	 *
	 * @returns {Promise<string | null>} The selected directory path, or null if cancelled
	 */
	async openDirectory() {
		const result = await dialog.showOpenDialog(this._mainWindow, {
			properties: ["openDirectory"],
			title: "Select Vault Folder",
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		return result.filePaths[0];
	}

	// ---- Cleanup ----

	/**
	 * Close all child windows. Called during app quit.
	 */
	destroyAllChildren() {
		for (const [, win] of this._childWindows) {
			if (!win.isDestroyed()) win.close();
		}
		this._childWindows.clear();
	}
}

module.exports = WindowManager;
