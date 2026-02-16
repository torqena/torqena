import { exec, spawn } from "child_process";
import { Platform } from "../../platform/utils/platform";

export interface CliStatus {
	installed: boolean;
	version?: string;
	error?: string;
}

/**
 * Manages GitHub Copilot CLI detection, installation, and authentication
 */
export class GitHubCopilotCliManager {
	private cliPath: string;
	private cachedStatus: CliStatus | null = null;
	private statusCheckInProgress = false;

	constructor(cliPath?: string) {
		this.cliPath = cliPath || "copilot";
	}

	/**
	 * Update the CLI path
	 */
	setCliPath(path: string): void {
		this.cliPath = path || "copilot";
		this.cachedStatus = null; // Invalidate cache
	}

	/**
	 * Check if the CLI is installed and get version
	 */
	async checkInstalled(): Promise<{ installed: boolean; version?: string; error?: string }> {
		return new Promise((resolve) => {
			exec(`${this.cliPath} --version`, { timeout: 10000 }, (error, stdout, stderr) => {
				if (error) {
					resolve({ 
						installed: false, 
						error: error.message.includes("not recognized") || error.message.includes("not found")
								? "GitHub Copilot CLI not found"
							: error.message
					});
				} else {
					// Parse version from output (e.g., "copilot version 0.0.397")
					const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
					const version = versionMatch ? versionMatch[1] : stdout.trim();
					resolve({ installed: true, version });
				}
			});
		});
	}

	/**
	 * Get CLI status (installed check only)
	 * Note: Authentication is handled interactively by the CLI via /login command
	 */
	async getStatus(forceRefresh = false): Promise<CliStatus> {
		if (this.cachedStatus && !forceRefresh) {
			return this.cachedStatus;
		}

		if (this.statusCheckInProgress) {
			// Wait a bit and return cached status
			await new Promise(resolve => setTimeout(resolve, 100));
			return this.cachedStatus || { installed: false };
		}

		this.statusCheckInProgress = true;

		try {
			const installCheck = await this.checkInstalled();
			
			this.cachedStatus = {
				installed: installCheck.installed,
				version: installCheck.version,
				error: installCheck.error,
			};

			return this.cachedStatus;
		} finally {
			this.statusCheckInProgress = false;
		}
	}

	/**
	 * Get the installation command for the current platform
	 */
	getInstallCommand(): { command: string; description: string; url: string } {
		if (Platform.isWin) {
			return {
				command: "winget install GitHub.Copilot",
				description: "Install using WinGet (Windows)",
				url: "https://docs.github.com/en/ai/how-tos/set-up/install-copilot-cli",
			};
		} else if (Platform.isMacOS) {
			return {
				command: "brew install copilot-cli",
				description: "Install using Homebrew (macOS)",
				url: "https://docs.github.com/en/ai/how-tos/set-up/install-copilot-cli",
			};
		} else {
			// Linux or other
			return {
				command: "npm install -g @github/copilot",
				description: "Install using npm (requires Node.js 22+)",
				url: "https://docs.github.com/en/ai/how-tos/set-up/install-copilot-cli",
			};
		}
	}

	/**
	 * Install the CLI (opens terminal or runs installer)
	 */
	async installCli(): Promise<boolean> {
		const installInfo = this.getInstallCommand();

		if (Platform.isWin) {
			return this.runInstallCommand("winget", ["install", "GitHub.Copilot"]);
		} else if (Platform.isMacOS) {
			return this.runInstallCommand("brew", ["install", "copilot-cli"]);
		} else {
			// For Linux, try npm
			return this.runInstallCommand("npm", ["install", "-g", "@github/copilot"]);
		}
	}

	private runInstallCommand(command: string, args: string[]): Promise<boolean> {
		return new Promise((resolve) => {
			const child = spawn(command, args, { 
				shell: true,
				stdio: "pipe"
			});

			let output = "";
			let errorOutput = "";

			child.stdout?.on("data", (data) => {
				output += data.toString();
			});

			child.stderr?.on("data", (data) => {
				errorOutput += data.toString();
			});

			child.on("close", (code) => {
				if (code === 0) {
					this.cachedStatus = null; // Invalidate cache
					resolve(true);
				} else {
					console.error(`Failed to install GitHub Copilot CLI. Please install manually.`);
					console.error("Install error:", errorOutput || output);
					resolve(false);
				}
			});

			child.on("error", (err) => {
				console.error(`Installation failed: ${err.message}. Please install manually.`);
				resolve(false);
			});

			// Timeout after 5 minutes
			setTimeout(() => {
				child.kill();
				console.error("Installation timed out. Please install manually.");
				resolve(false);
			}, 5 * 60 * 1000);
		});
	}

	/**
	 * Open the CLI for authentication
	 * @param vaultPath - The path to the Obsidian vault for authentication context
	 */
	async openForAuthentication(vaultPath?: string): Promise<void> {
		return new Promise((resolve) => {
			// Build CLI command with vault path if provided
			// Use --add-dir to grant access to the vault directory
			const normalizedPath = vaultPath?.replace(/\\/g, "/");
			const cliCmd = normalizedPath 
				? `${this.cliPath} --add-dir "${normalizedPath}"`
				: this.cliPath;

			// Spawn the CLI in a way that allows user interaction
			// On desktop, this should open a new terminal window
			if (Platform.isWin) {
				// On Windows, use start to open a new cmd window with the vault as cwd
				const cwdArg = vaultPath ? `/d "${vaultPath}"` : "";
				spawn("cmd", ["/c", "start", "cmd", cwdArg, "/k", cliCmd], { 
					shell: true,
					detached: true,
					stdio: "ignore",
					cwd: vaultPath || undefined
				});
			} else if (Platform.isMacOS) {
				// On macOS, cd to vault path first then run CLI
				const script = vaultPath
					? `tell application "Terminal" to do script "cd '${vaultPath}' && ${cliCmd}"`
					: `tell application "Terminal" to do script "${cliCmd}"`;
				spawn("osascript", ["-e", script], {
					detached: true,
					stdio: "ignore"
				});
			} else {
				// Linux - try common terminals
				const terminals = ["gnome-terminal", "konsole", "xterm"];
				for (const term of terminals) {
					try {
						spawn(term, ["--", "bash", "-c", `cd "${vaultPath || '.'}" && ${cliCmd}`], {
							detached: true,
							stdio: "ignore"
						});
						break;
					} catch {
						continue;
					}
				}
			}

			setTimeout(resolve, 1000);
		});
	}

	/**
	 * Invalidate the cached status
	 */
	invalidateCache(): void {
		this.cachedStatus = null;
	}

	/**
	 * Fetch available models from CLI help output
	 * Parses the --model choices from `copilot help` output
	 */
	async fetchAvailableModels(): Promise<{ models: string[]; error?: string }> {
		return new Promise((resolve) => {
			exec(`${this.cliPath} help`, { timeout: 15000 }, (error, stdout, stderr) => {
				if (error) {
					console.error("[GitHubCopilotCliManager] Error fetching models:", error.message);
					resolve({ models: [], error: error.message });
					return;
				}

				// Parse models from the --model line
				// Example: --model <model>  Set the AI model (choices: "claude-sonnet-4.5", "gpt-4.1", ...)
				const output = stdout + stderr;
				const modelMatch = output.match(/--model\s+<model>\s+.*?\(choices:\s*([^)]+)\)/i);
				
				if (modelMatch && modelMatch[1]) {
					// Extract quoted model names
					const modelString = modelMatch[1];
					const models = modelString
						.match(/"([^"]+)"/g)
						?.map(m => m.replace(/"/g, ''))
						.filter(m => m.length > 0)
						.sort() || [];
					
					if (models.length > 0) {
						console.log(`[GitHubCopilotCliManager] Discovered ${models.length} models from CLI`);
						resolve({ models });
						return;
					}
				}

				console.warn("[GitHubCopilotCliManager] Could not parse models from CLI help output");
				resolve({ models: [], error: "Could not parse models from CLI output" });
			});
		});
	}

	/**
	 * Initialize Copilot for a specific vault directory
	 * Runs: copilot --add-dir <vault_path>
	 */
	async initializeVault(vaultPath: string): Promise<{ success: boolean; error?: string }> {
		return new Promise((resolve) => {
			// Normalize path for cross-platform compatibility
			const normalizedPath = vaultPath.replace(/\\/g, "/");

			exec(
				`${this.cliPath} --add-dir "${normalizedPath}"`,
				{ timeout: 30000 },
				(error, stdout, stderr) => {
					if (error) {
						const errorMsg = stderr || error.message;
						console.error(`Failed to initialize vault: ${errorMsg}`);
						resolve({ success: false, error: errorMsg });
					} else {
						this.cachedStatus = null; // Invalidate cache
						resolve({ success: true });
					}
				}
			);
		});
	}
}

