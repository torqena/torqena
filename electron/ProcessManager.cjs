/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ProcessManager
 * @description Manages spawned child processes for Vault Copilot's Electron shell.
 *
 * Responsibilities:
 * - Spawning long-running processes (MCP stdio servers)
 * - Writing to process stdin
 * - Killing individual or all processes
 * - Routing stdout/stderr/close/error events to the renderer via BrowserWindow
 *
 * @example
 * ```js
 * const ProcessManager = require("./ProcessManager.cjs");
 * const pm = new ProcessManager();
 * const { id, pid } = pm.spawnProcess("node", ["server.js"], {}, mainWindow);
 * pm.writeStdin(id, '{"jsonrpc":"2.0"}\n');
 * pm.killProcess(id);
 * ```
 *
 * @see {@link WindowManager} for window lifecycle management
 * @since 0.0.28
 */

const { exec, spawn } = require("child_process");

class ProcessManager {
	constructor() {
		/**
		 * Active spawned processes keyed by internal ID.
		 * @type {Map<number, import("child_process").ChildProcess>}
		 * @internal
		 */
		this._activeProcesses = new Map();

		/**
		 * Next available process ID.
		 * @type {number}
		 * @internal
		 */
		this._nextId = 1;
	}

	/**
	 * Execute a command and return the result.
	 *
	 * Used by GitHubCopilotCliManager for CLI status checks.
	 *
	 * @param {string} command - The shell command to execute
	 * @param {object} [options] - Options (timeout, maxBuffer, cwd, env)
	 * @returns {Promise<{stdout: string, stderr: string, exitCode: number, error: string|null}>}
	 */
	exec(command, options = {}) {
		return new Promise((resolve) => {
			const safeOptions = {
				timeout: options.timeout || 30000,
				maxBuffer: options.maxBuffer || 1024 * 1024,
				cwd: options.cwd || undefined,
				env: { ...process.env, ...(options.env || {}) },
			};
			exec(command, safeOptions, (error, stdout, stderr) => {
				resolve({
					stdout: stdout || "",
					stderr: stderr || "",
					exitCode: error ? error.code || 1 : 0,
					error: error ? error.message : null,
				});
			});
		});
	}

	/**
	 * Spawn a long-running process (for MCP stdio servers).
	 *
	 * Returns a process ID that can be used to send stdin data or kill the process.
	 * stdout/stderr/close/error events are forwarded to the given BrowserWindow.
	 *
	 * @param {string} command - The command to spawn
	 * @param {string[]} [args] - Command arguments
	 * @param {object} [options] - Options (cwd, env)
	 * @param {import("electron").BrowserWindow | null} targetWindow - Window to forward events to
	 * @returns {{ id: number, pid: number | undefined }}
	 */
	spawnProcess(command, args = [], options = {}, targetWindow = null) {
		const id = this._nextId++;
		const safeOptions = {
			cwd: options.cwd || undefined,
			env: { ...process.env, ...(options.env || {}) },
			stdio: ["pipe", "pipe", "pipe"],
		};

		const child = spawn(command, args, safeOptions);
		this._activeProcesses.set(id, child);

		child.stdout.on("data", (data) => {
			if (targetWindow && !targetWindow.isDestroyed()) {
				targetWindow.webContents.send(`process:stdout:${id}`, data.toString());
			}
		});

		child.stderr.on("data", (data) => {
			if (targetWindow && !targetWindow.isDestroyed()) {
				targetWindow.webContents.send(`process:stderr:${id}`, data.toString());
			}
		});

		child.on("close", (code) => {
			this._activeProcesses.delete(id);
			if (targetWindow && !targetWindow.isDestroyed()) {
				targetWindow.webContents.send(`process:close:${id}`, code);
			}
		});

		child.on("error", (err) => {
			this._activeProcesses.delete(id);
			if (targetWindow && !targetWindow.isDestroyed()) {
				targetWindow.webContents.send(`process:error:${id}`, err.message);
			}
		});

		return { id, pid: child.pid };
	}

	/**
	 * Send data to a spawned process's stdin.
	 *
	 * @param {number} id - Process ID from spawnProcess()
	 * @param {string} data - Data to write
	 * @returns {boolean} true if data was written
	 */
	writeStdin(id, data) {
		const child = this._activeProcesses.get(id);
		if (child && child.stdin && !child.stdin.destroyed) {
			child.stdin.write(data);
			return true;
		}
		return false;
	}

	/**
	 * Kill a spawned process.
	 *
	 * @param {number} id - Process ID from spawnProcess()
	 * @returns {boolean} true if the process was found and killed
	 */
	killProcess(id) {
		const child = this._activeProcesses.get(id);
		if (child) {
			child.kill();
			this._activeProcesses.delete(id);
			return true;
		}
		return false;
	}

	/**
	 * Kill all active processes. Called during app quit.
	 */
	killAll() {
		for (const [, child] of this._activeProcesses) {
			child.kill();
		}
		this._activeProcesses.clear();
	}
}

module.exports = ProcessManager;
