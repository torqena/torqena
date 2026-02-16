/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ElectronMain
 * @description Electron main process entry point for Vault Copilot standalone app.
 *
 * Thin orchestrator that wires IPC handlers and delegates to:
 * - {@link WindowManager} — BrowserWindow lifecycle, child windows, frame config
 * - {@link ProcessManager} — spawned child processes (MCP stdio servers)
 *
 * Filesystem, secrets, and platform IPC handlers remain inline as they are
 * stateless utility operations.
 *
 * @since 0.0.27
 */

const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const WindowManager = require("./WindowManager.cjs");
const ProcessManager = require("./ProcessManager.cjs");

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

if (isDev) {
	app.commandLine.appendSwitch("disable-http-cache");
}

// ---- Managers ----
const windowManager = new WindowManager(app, isDev);
const processManager = new ProcessManager();

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(() => windowManager.createMainWindow());

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		windowManager.createMainWindow();
	}
});

// ============================================================================
// IPC Handlers — Shell / Process
// ============================================================================

ipcMain.handle("shell:exec", async (_event, command, options) => {
	return processManager.exec(command, options);
});

ipcMain.handle("shell:spawn", async (_event, command, args, options) => {
	return processManager.spawnProcess(command, args, options, windowManager.mainWindow);
});

ipcMain.handle("shell:stdin", async (_event, id, data) => {
	return processManager.writeStdin(id, data);
});

ipcMain.handle("shell:kill", async (_event, id) => {
	return processManager.killProcess(id);
});

// ============================================================================
// IPC Handlers — Filesystem (stateless utilities)
// ============================================================================

ipcMain.handle("fs:readFile", async (_event, filePath, encoding = "utf-8") => {
	return fs.promises.readFile(filePath, encoding);
});

ipcMain.handle("fs:writeFile", async (_event, filePath, content) => {
	return fs.promises.writeFile(filePath, content, "utf-8");
});

ipcMain.handle("fs:exists", async (_event, filePath) => {
	try {
		await fs.promises.access(filePath);
		return true;
	} catch {
		return false;
	}
});

ipcMain.handle("fs:listFilesRecursive", async (_event, dirPath) => {
	const results = [];
	async function walk(dir, prefix) {
		const entries = await fs.promises.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const rel = prefix ? prefix + "/" + entry.name : entry.name;
			if (entry.isDirectory()) {
				await walk(path.join(dir, entry.name), rel);
			} else {
				results.push(rel);
			}
		}
	}
	await walk(dirPath, "");
	return results;
});

ipcMain.handle("fs:readdir", async (_event, dirPath) => {
	const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
	return entries.map((e) => ({
		name: e.name,
		kind: e.isDirectory() ? "directory" : "file",
	}));
});

ipcMain.handle("fs:remove", async (_event, filePath, options = {}) => {
	await fs.promises.rm(filePath, { recursive: !!options.recursive, force: true });
});

ipcMain.handle("fs:mkdir", async (_event, dirPath) => {
	await fs.promises.mkdir(dirPath, { recursive: true });
});

// ============================================================================
// IPC Handlers — Dialog / Settings / Window
// ============================================================================

ipcMain.handle("dialog:openDirectory", async () => {
	return windowManager.openDirectory();
});

ipcMain.handle("settings:setWindowFrame", async (_event, style) => {
	windowManager.setFrameStyle(style);
});

ipcMain.handle("settings:getWindowFrame", async () => {
	return windowManager.getFrameStyle();
});

ipcMain.handle("settings:setTitleBarOverlay", async (event, colors) => {
	windowManager.setTitleBarOverlay(event.sender, colors);
});

ipcMain.handle("window:open", async (_event, viewType, options) => {
	return windowManager.openChildWindow(viewType, options);
});

ipcMain.handle("window:dockTab", async (event, filePath) => {
	return windowManager.dockTab(event.sender, filePath);
});

ipcMain.handle("window:setBounds", async (event, bounds) => {
	return windowManager.setBoundsSafe(event.sender, bounds);
});

ipcMain.handle("window:getBounds", async (event) => {
	return windowManager.getBounds(event.sender);
});

ipcMain.handle("window:setState", async (event, state) => {
	return windowManager.setWindowState(event.sender, state);
});

ipcMain.handle("window:getState", async (event) => {
	return windowManager.getWindowState(event.sender);
});

ipcMain.handle("window:setMeta", async (event, meta) => {
	windowManager.setWindowMeta(event.sender, meta);
});

ipcMain.handle("window:getMeta", async (event) => {
	return windowManager.getWindowMeta(event.sender);
});

ipcMain.handle("window:list", async () => {
	return windowManager.listWindows();
});

ipcMain.handle("window:findByMeta", async (_event, key, value) => {
	return windowManager.findWindowByMeta(key, value);
});

ipcMain.handle("window:focus", async (_event, windowId) => {
	return windowManager.focusWindow(windowId);
});

ipcMain.handle("platform:info", async () => {
	return {
		platform: process.platform,
		arch: process.arch,
		nodeVersion: process.version,
		electronVersion: process.versions.electron,
		isPackaged: app.isPackaged,
		appPath: app.getAppPath(),
		userData: app.getPath("userData"),
	};
});

// ============================================================================
// IPC Handlers — Secrets (Keychain) — encrypted storage via Electron safeStorage
// ============================================================================

/** @internal Path to the encrypted secrets file. */
const secretsPath = path.join(app.getPath("userData"), "vault-copilot-secrets.json");

/** @internal Read the secrets file from disk. */
function readSecretsFile() {
	try {
		if (fs.existsSync(secretsPath)) {
			return JSON.parse(fs.readFileSync(secretsPath, "utf-8"));
		}
	} catch { /* ignore */ }
	return { secrets: {} };
}

/** @internal Write the secrets file to disk. */
function writeSecretsFile(data) {
	try {
		fs.writeFileSync(secretsPath, JSON.stringify(data, null, 2), "utf-8");
	} catch { /* ignore */ }
}

ipcMain.handle("secrets:isAvailable", async () => {
	return safeStorage.isEncryptionAvailable();
});

ipcMain.handle("secrets:save", async (_event, id, plainText) => {
	if (!safeStorage.isEncryptionAvailable()) {
		throw new Error("Encryption not available");
	}
	const data = readSecretsFile();
	const encrypted = safeStorage.encryptString(plainText);
	data.secrets[id] = {
		encrypted: encrypted.toString("base64"),
		lastAccessed: null,
		createdAt: data.secrets[id]?.createdAt || Date.now(),
		updatedAt: Date.now(),
	};
	writeSecretsFile(data);
});

ipcMain.handle("secrets:load", async (_event, id) => {
	if (!safeStorage.isEncryptionAvailable()) {
		throw new Error("Encryption not available");
	}
	const data = readSecretsFile();
	const entry = data.secrets[id];
	if (!entry) return null;
	entry.lastAccessed = Date.now();
	writeSecretsFile(data);
	const buffer = Buffer.from(entry.encrypted, "base64");
	return safeStorage.decryptString(buffer);
});

ipcMain.handle("secrets:delete", async (_event, id) => {
	const data = readSecretsFile();
	delete data.secrets[id];
	writeSecretsFile(data);
});

ipcMain.handle("secrets:list", async () => {
	const data = readSecretsFile();
	return Object.entries(data.secrets).map(([id, entry]) => ({
		id,
		lastAccessed: entry.lastAccessed,
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
	}));
});

// ============================================================================
// Cleanup
// ============================================================================

app.on("before-quit", () => {
	processManager.killAll();
	windowManager.destroyAllChildren();
});
