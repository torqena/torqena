/**
 * WhisperCppManager - Manages whisper.cpp installation, model downloads, and server lifecycle
 * 
 * Handles:
 * - Downloading whisper.cpp pre-built binaries from GitHub releases
 * - Downloading GGML models from Hugging Face
 * - Starting/stopping the whisper.cpp server process
 */

import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const execAsync = promisify(exec);
const fsPromises = fs.promises;

/** Available whisper.cpp models */
export interface WhisperModel {
	id: string;
	name: string;
	size: string;
	url: string;
	filename: string;
}

/** Server status */
export interface WhisperServerStatus {
	running: boolean;
	pid?: number;
	port?: number;
	endpoint?: string;
}

/** Installation status */
export interface WhisperInstallStatus {
	installed: boolean;
	version?: string;
	binaryPath?: string;
	serverPath?: string;
	modelsDir?: string;
}

/** Download progress callback */
export type DownloadProgressCallback = (downloaded: number, total: number, percentage: number) => void;

/** Available models from Hugging Face */
export const WHISPER_MODELS: WhisperModel[] = [
	{
		id: 'tiny',
		name: 'Tiny (75 MB)',
		size: '75 MB',
		url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
		filename: 'ggml-tiny.bin',
	},
	{
		id: 'tiny.en',
		name: 'Tiny English (75 MB)',
		size: '75 MB',
		url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
		filename: 'ggml-tiny.en.bin',
	},
	{
		id: 'base',
		name: 'Base (142 MB)',
		size: '142 MB',
		url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
		filename: 'ggml-base.bin',
	},
	{
		id: 'base.en',
		name: 'Base English (142 MB)',
		size: '142 MB',
		url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
		filename: 'ggml-base.en.bin',
	},
	{
		id: 'small',
		name: 'Small (466 MB)',
		size: '466 MB',
		url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
		filename: 'ggml-small.bin',
	},
	{
		id: 'small.en',
		name: 'Small English (466 MB)',
		size: '466 MB',
		url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
		filename: 'ggml-small.en.bin',
	},
];

/** GitHub release info */
interface GitHubRelease {
	tag_name: string;
	assets: Array<{
		name: string;
		browser_download_url: string;
		size: number;
	}>;
}

/**
 * WhisperCppManager handles whisper.cpp binary and model management
 */
export class WhisperCppManager {
	private baseDir: string;
	private serverProcess: ChildProcess | null = null;
	private serverPort: number = 8080;
	private cachedStatus: WhisperInstallStatus | null = null;

	constructor(baseDir: string) {
		// Default to a whisper-cpp folder in the provided base directory
		this.baseDir = path.join(baseDir, 'whisper-cpp');
	}

	/**
	 * Get the base directory for whisper.cpp installation
	 */
	getBaseDir(): string {
		return this.baseDir;
	}

	/**
	 * Get the models directory
	 */
	getModelsDir(): string {
		return path.join(this.baseDir, 'models');
	}

	/**
	 * Get the bin directory (where executables are stored)
	 */
	getBinDir(): string {
		return path.join(this.baseDir, 'bin');
	}

	/**
	 * Get the server executable path - tries multiple possible names
	 */
	getServerPath(): string {
		const isWindows = process.platform === 'win32';
		const binDir = this.getBinDir();
		
		// Try multiple possible names (whisper.cpp has used different naming conventions)
		const possibleNames = isWindows 
			? ['whisper-server.exe', 'server.exe', 'main.exe']
			: ['whisper-server', 'server', 'main'];
		
		for (const name of possibleNames) {
			const fullPath = path.join(binDir, name);
			if (fs.existsSync(fullPath)) {
				return fullPath;
			}
		}
		
		// Default to preferred name even if not found
		return path.join(binDir, isWindows ? 'whisper-server.exe' : 'whisper-server');
	}

	/**
	 * Get the main whisper executable path - tries multiple possible names
	 */
	getWhisperPath(): string {
		const isWindows = process.platform === 'win32';
		const binDir = this.getBinDir();
		
		// Try multiple possible names
		const possibleNames = isWindows 
			? ['whisper-cli.exe', 'whisper.exe', 'main.exe']
			: ['whisper-cli', 'whisper', 'main'];
		
		for (const name of possibleNames) {
			const fullPath = path.join(binDir, name);
			if (fs.existsSync(fullPath)) {
				return fullPath;
			}
		}
		
		// Default to preferred name even if not found
		return path.join(binDir, isWindows ? 'whisper-cli.exe' : 'whisper-cli');
	}

	/**
	 * Get the server URL
	 */
	getServerUrl(): string {
		return `http://127.0.0.1:${this.serverPort}`;
	}

	/**
	 * Set the server port
	 */
	setServerPort(port: number): void {
		this.serverPort = port;
	}

	/**
	 * Ensure the base directories exist
	 */
	async ensureDirectories(): Promise<void> {
		await fsPromises.mkdir(this.baseDir, { recursive: true });
		await fsPromises.mkdir(this.getModelsDir(), { recursive: true });
		await fsPromises.mkdir(this.getBinDir(), { recursive: true });
	}

	/**
	 * Check if whisper.cpp is installed
	 */
	async checkInstallation(): Promise<WhisperInstallStatus> {
		try {
			const serverPath = this.getServerPath();
			const serverExists = await this.fileExists(serverPath);

			// List what's in the bin directory for debugging
			const binDir = this.getBinDir();
			let binContents: string[] = [];
			try {
				if (await this.fileExists(binDir)) {
					binContents = await fsPromises.readdir(binDir);
					console.log('WhisperCppManager: Bin directory contents:', binContents);
				}
			} catch (e) {
				console.log('WhisperCppManager: Could not read bin directory:', e);
			}

			if (!serverExists) {
				console.log(`WhisperCppManager: Server not found at ${serverPath}. Available files: ${binContents.join(', ')}`);
				return {
					installed: false,
					modelsDir: this.getModelsDir(),
				};
			}

			// Try to get version by running --help or --version
			let version: string | undefined;
			try {
				const { stdout } = await execAsync(`"${serverPath}" --version`, { timeout: 5000 });
				const match = stdout.match(/version[:\s]+([^\s]+)/i);
				if (match) {
					version = match[1];
				}
			} catch {
				// Version check failed, but binary exists
				version = 'unknown';
			}

			this.cachedStatus = {
				installed: true,
				version,
				binaryPath: this.getWhisperPath(),
				serverPath,
				modelsDir: this.getModelsDir(),
			};

			return this.cachedStatus;
		} catch (error) {
			console.error('WhisperCppManager: Error checking installation:', error);
			return {
				installed: false,
				modelsDir: this.getModelsDir(),
			};
		}
	}

	/**
	 * Get the latest release info from GitHub
	 */
	async getLatestRelease(): Promise<GitHubRelease | null> {
		try {
			const response = await this.httpGet('https://api.github.com/repos/ggerganov/whisper.cpp/releases/latest');
			return JSON.parse(response) as GitHubRelease;
		} catch (error) {
			console.error('WhisperCppManager: Failed to get latest release:', error);
			return null;
		}
	}

	/**
	 * Get the appropriate asset name for the current platform
	 */
	private getPlatformAssetPattern(): RegExp | null {
		const platform = process.platform;
		const arch = process.arch;

		if (platform === 'win32') {
			// Windows: ARM64 not supported via pre-built binaries
			if (arch === 'arm64') {
				return null; // No ARM64 Windows builds available
			}
			// Windows x64
			if (arch === 'x64') {
				return /whisper-.*win.*x64.*\.zip|whisper-.*windows.*amd64.*\.zip/i;
			}
			return /whisper-.*win.*\.zip/i;
		} else if (platform === 'darwin') {
			// macOS: look for darwin or macos builds
			if (arch === 'arm64') {
				return /whisper-.*darwin.*arm64.*\.zip|whisper-.*macos.*arm64.*\.zip/i;
			}
			return /whisper-.*darwin.*x64.*\.zip|whisper-.*macos.*amd64.*\.zip/i;
		} else {
			// Linux
			if (arch === 'x64') {
				return /whisper-.*linux.*x64.*\.zip|whisper-.*linux.*amd64.*\.zip/i;
			} else if (arch === 'arm64') {
				return /whisper-.*linux.*arm64.*\.zip/i;
			}
			return /whisper-.*linux.*\.zip/i;
		}
	}

	/**
	 * Check if the current platform is supported for pre-built binaries
	 */
	isPlatformSupported(): { supported: boolean; reason?: string } {
		const platform = process.platform;
		const arch = process.arch;

		if (platform === 'win32' && arch === 'arm64') {
			return {
				supported: false,
				reason: 'Windows on ARM (Snapdragon) is not supported by whisper.cpp pre-built binaries. The x64 binaries use AVX instructions that cannot be emulated on ARM. You would need to build from source or use a cloud-based transcription service (OpenAI Whisper API or Azure).',
			};
		}

		return { supported: true };
	}

	/**
	 * Download whisper.cpp binaries from GitHub releases
	 */
	async downloadWhisperCpp(onProgress?: DownloadProgressCallback): Promise<{ success: boolean; error?: string }> {
		// Check platform support first
		const platformCheck = this.isPlatformSupported();
		if (!platformCheck.supported) {
			return { success: false, error: platformCheck.reason };
		}

		try {
			await this.ensureDirectories();

			// Get latest release
			const release = await this.getLatestRelease();
			if (!release) {
				return { success: false, error: 'Failed to get latest release from GitHub' };
			}

			// Find the appropriate asset for this platform
			const pattern = this.getPlatformAssetPattern();
			if (!pattern) {
				return {
					success: false,
					error: `No pre-built binary available for ${process.platform}/${process.arch}. You may need to build from source.`,
				};
			}
			const asset = release.assets.find(a => pattern.test(a.name));

			if (!asset) {
				// If no pre-built binary found, provide build instructions
				return {
					success: false,
					error: `No pre-built binary found for ${process.platform}/${process.arch}. You may need to build from source.`,
				};
			}

			// Download the asset
			const zipPath = path.join(this.baseDir, asset.name);
			await this.downloadFile(asset.browser_download_url, zipPath, onProgress);

			// Extract the zip file
			await this.extractZip(zipPath, this.getBinDir());

			// Clean up the zip file
			await fsPromises.unlink(zipPath);

			// Make binaries executable on Unix
			if (process.platform !== 'win32') {
				const serverPath = this.getServerPath();
				const whisperPath = this.getWhisperPath();
				if (await this.fileExists(serverPath)) {
					await fsPromises.chmod(serverPath, 0o755);
				}
				if (await this.fileExists(whisperPath)) {
					await fsPromises.chmod(whisperPath, 0o755);
				}
			}

			// Invalidate cache
			this.cachedStatus = null;

			return { success: true };
		} catch (error) {
			console.error('WhisperCppManager: Download failed:', error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * List downloaded models
	 */
	async listDownloadedModels(): Promise<string[]> {
		try {
			const modelsDir = this.getModelsDir();
			if (!await this.fileExists(modelsDir)) {
				return [];
			}

			const files = await fsPromises.readdir(modelsDir);
			return files.filter(f => f.startsWith('ggml-') && f.endsWith('.bin'));
		} catch (error) {
			console.error('WhisperCppManager: Error listing models:', error);
			return [];
		}
	}

	/**
	 * Check if a specific model is downloaded
	 */
	async isModelDownloaded(modelId: string): Promise<boolean> {
		const model = WHISPER_MODELS.find(m => m.id === modelId);
		if (!model) return false;

		const modelPath = path.join(this.getModelsDir(), model.filename);
		return await this.fileExists(modelPath);
	}

	/**
	 * Get the path to a downloaded model
	 */
	getModelPath(modelId: string): string | null {
		const model = WHISPER_MODELS.find(m => m.id === modelId);
		if (!model) return null;
		return path.join(this.getModelsDir(), model.filename);
	}

	/**
	 * Download a model from Hugging Face
	 */
	async downloadModel(modelId: string, onProgress?: DownloadProgressCallback): Promise<{ success: boolean; error?: string }> {
		const model = WHISPER_MODELS.find(m => m.id === modelId);
		if (!model) {
			return { success: false, error: `Unknown model: ${modelId}` };
		}

		try {
			await this.ensureDirectories();

			const modelPath = path.join(this.getModelsDir(), model.filename);
			await this.downloadFile(model.url, modelPath, onProgress);

			return { success: true };
		} catch (error) {
			console.error('WhisperCppManager: Model download failed:', error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Delete a downloaded model by filename or model ID
	 */
	async deleteModel(modelIdOrFilename: string): Promise<{ success: boolean; error?: string }> {
		// Try to find model by ID first, then by filename
		let filename: string;
		const modelById = WHISPER_MODELS.find(m => m.id === modelIdOrFilename);
		if (modelById) {
			filename = modelById.filename;
		} else if (modelIdOrFilename.endsWith('.bin')) {
			// Assume it's a filename
			filename = modelIdOrFilename;
		} else {
			return { success: false, error: `Unknown model: ${modelIdOrFilename}` };
		}

		try {
			const modelPath = path.join(this.getModelsDir(), filename);
			console.log(`WhisperCppManager: Deleting model at ${modelPath}`);
			if (await this.fileExists(modelPath)) {
				await fsPromises.unlink(modelPath);
				console.log(`WhisperCppManager: Model deleted successfully`);
			} else {
				console.log(`WhisperCppManager: Model file not found at ${modelPath}`);
			}
			return { success: true };
		} catch (error) {
			console.error('WhisperCppManager: Model deletion failed:', error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Uninstall whisper.cpp completely - remove all binaries and models
	 */
	async uninstall(): Promise<{ success: boolean; error?: string }> {
		try {
			// Stop server if running
			this.stopServer();

			// Remove the entire whisper-cpp directory
			if (await this.fileExists(this.baseDir)) {
				await this.removeDirectory(this.baseDir);
				console.log(`WhisperCppManager: Uninstalled from ${this.baseDir}`);
			}

			// Clear cached status
			this.cachedStatus = null;

			return { success: true };
		} catch (error) {
			console.error('WhisperCppManager: Uninstall failed:', error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Recursively remove a directory
	 */
	private async removeDirectory(dirPath: string): Promise<void> {
		const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dirPath, entry.name);
			if (entry.isDirectory()) {
				await this.removeDirectory(fullPath);
			} else {
				await fsPromises.unlink(fullPath);
			}
		}
		await fsPromises.rmdir(dirPath);
	}

	/**
	 * Start the whisper.cpp server
	 */
	async startServer(modelId: string = 'tiny'): Promise<{ success: boolean; error?: string }> {
		if (this.serverProcess) {
			return { success: false, error: 'Server is already running' };
		}

		const serverPath = this.getServerPath();
		if (!await this.fileExists(serverPath)) {
			return { success: false, error: `Server binary not found at: ${serverPath}. Please download whisper.cpp first.` };
		}

		const modelPath = this.getModelPath(modelId);
		if (!modelPath || !await this.fileExists(modelPath)) {
			return { success: false, error: `Model not found: ${modelId} (path: ${modelPath}). Please download the model first.` };
		}

		try {
			// Spawn the server process
			// Note: whisper.cpp server uses -m for model, -H for host, --port for port
			const args = [
				'-m', modelPath,
				'--host', '127.0.0.1',
				'--port', String(this.serverPort),
			];

			console.log(`WhisperCppManager: Starting server with command: "${serverPath}" ${args.join(' ')}`);

			// Collect stderr output for better error messages
			let stderrOutput = '';
			let stdoutOutput = '';

			this.serverProcess = spawn(serverPath, args, {
				detached: false,
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			// Capture stdout and stderr for debugging
			if (this.serverProcess.stdout) {
				this.serverProcess.stdout.on('data', (data) => {
					stdoutOutput += data.toString();
					console.log('WhisperCppManager stdout:', data.toString());
				});
			}
			if (this.serverProcess.stderr) {
				this.serverProcess.stderr.on('data', (data) => {
					stderrOutput += data.toString();
					console.log('WhisperCppManager stderr:', data.toString());
				});
			}

			// Handle process errors
			this.serverProcess.on('error', (err) => {
				console.error('WhisperCppManager: Process error:', err);
			});

			// Wait a moment for the server to start (model loading can take time)
			await new Promise(resolve => setTimeout(resolve, 3000));

			// Check if the process is still running
			if (this.serverProcess.exitCode !== null) {
				const exitCode = this.serverProcess.exitCode;
				this.serverProcess = null;
				const errorInfo = stderrOutput || stdoutOutput || `Exit code: ${exitCode}`;
				return { success: false, error: `Server process exited (code ${exitCode}): ${errorInfo}` };
			}

			// Try to connect to verify it's running
			const isRunning = await this.checkServerConnection();
			if (!isRunning) {
				// Server didn't respond, but process is still running - give it more time for model loading
				console.log('WhisperCppManager: Server not responding yet, waiting longer for model loading...');
				await new Promise(resolve => setTimeout(resolve, 5000));
				const retryRunning = await this.checkServerConnection();
				if (!retryRunning) {
					const errorInfo = stderrOutput || stdoutOutput || 'No output captured';
					this.stopServer();
					return { success: false, error: `Server started but not responding on port ${this.serverPort}. Output: ${errorInfo}` };
				}
			}

			console.log(`WhisperCppManager: Server started on port ${this.serverPort}`);
			return { success: true };
		} catch (error) {
			console.error('WhisperCppManager: Failed to start server:', error);
			this.serverProcess = null;
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Stop the whisper.cpp server
	 */
	stopServer(): { success: boolean; error?: string } {
		if (!this.serverProcess) {
			return { success: true }; // Already stopped
		}

		try {
			this.serverProcess.kill('SIGTERM');
			this.serverProcess = null;
			console.log('WhisperCppManager: Server stopped');
			return { success: true };
		} catch (error) {
			console.error('WhisperCppManager: Failed to stop server:', error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Get server status
	 */
	async getServerStatus(): Promise<WhisperServerStatus> {
		if (!this.serverProcess) {
			return { running: false };
		}

		// Check if process is still alive
		if (this.serverProcess.exitCode !== null) {
			this.serverProcess = null;
			return { running: false };
		}

		// Verify server is responding
		const isResponding = await this.checkServerConnection();
		if (!isResponding) {
			return {
				running: true, // Process is running but not responding
				pid: this.serverProcess.pid,
				port: this.serverPort,
			};
		}

		return {
			running: true,
			pid: this.serverProcess.pid,
			port: this.serverPort,
			endpoint: this.getServerUrl(),
		};
	}

	/**
	 * Check if the server is responding
	 */
	async checkServerConnection(): Promise<boolean> {
		try {
			const response = await this.httpGet(`${this.getServerUrl()}/`, 3000);
			return true; // Any response means server is running
		} catch {
			return false;
		}
	}

	/**
	 * Get installation instructions for manual setup
	 */
	getInstallInstructions(): { platform: string; instructions: string; buildUrl: string } {
		const platform = process.platform;
		const buildUrl = 'https://github.com/ggerganov/whisper.cpp';

		if (platform === 'win32') {
			return {
				platform: 'Windows',
				instructions: 'Download pre-built binaries from GitHub releases, or build from source using CMake and Visual Studio.',
				buildUrl,
			};
		} else if (platform === 'darwin') {
			return {
				platform: 'macOS',
				instructions: 'Build from source: git clone https://github.com/ggerganov/whisper.cpp && cd whisper.cpp && make server',
				buildUrl,
			};
		} else {
			return {
				platform: 'Linux',
				instructions: 'Build from source: git clone https://github.com/ggerganov/whisper.cpp && cd whisper.cpp && make server',
				buildUrl,
			};
		}
	}

	/**
	 * Cleanup - stop server and release resources
	 */
	cleanup(): void {
		this.stopServer();
	}

	// === Private helper methods ===

	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fsPromises.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	private httpGet(url: string, timeout: number = 10000): Promise<string> {
		return new Promise((resolve, reject) => {
			const protocol = url.startsWith('https') ? https : http;
			const req = protocol.get(url, {
				headers: {
					'User-Agent': 'ObsidianVaultCopilot/1.0',
				},
				timeout,
			}, (res) => {
				// Handle redirects
				if (res.statusCode === 301 || res.statusCode === 302) {
					const redirectUrl = res.headers.location;
					if (redirectUrl) {
						this.httpGet(redirectUrl, timeout).then(resolve).catch(reject);
						return;
					}
				}

				if (res.statusCode !== 200) {
					reject(new Error(`HTTP ${res.statusCode}`));
					return;
				}

				let data = '';
				res.on('data', chunk => data += chunk);
				res.on('end', () => resolve(data));
			});

			req.on('error', reject);
			req.on('timeout', () => {
				req.destroy();
				reject(new Error('Request timeout'));
			});
		});
	}

	private downloadFile(url: string, destPath: string, onProgress?: DownloadProgressCallback): Promise<void> {
		return new Promise((resolve, reject) => {
			const protocol = url.startsWith('https') ? https : http;
			
			const doDownload = (downloadUrl: string) => {
				const downloadProtocol = downloadUrl.startsWith('https') ? https : http;
				
				const req = downloadProtocol.get(downloadUrl, {
					headers: {
						'User-Agent': 'ObsidianVaultCopilot/1.0',
					},
				}, (res) => {
					// Handle redirects
					if (res.statusCode === 301 || res.statusCode === 302) {
						const redirectUrl = res.headers.location;
						if (redirectUrl) {
							doDownload(redirectUrl);
							return;
						}
					}

					if (res.statusCode !== 200) {
						reject(new Error(`HTTP ${res.statusCode}`));
						return;
					}

					const totalSize = parseInt(res.headers['content-length'] || '0', 10);
					let downloadedSize = 0;

					const file = fs.createWriteStream(destPath);
					
					res.on('data', (chunk) => {
						downloadedSize += chunk.length;
						if (onProgress && totalSize > 0) {
							const percentage = Math.round((downloadedSize / totalSize) * 100);
							onProgress(downloadedSize, totalSize, percentage);
						}
					});

					res.pipe(file);

					file.on('finish', () => {
						file.close();
						resolve();
					});

					file.on('error', (err) => {
						fs.unlink(destPath, () => {}); // Clean up
						reject(err);
					});
				});

				req.on('error', reject);
			};

			doDownload(url);
		});
	}

	private async extractZip(zipPath: string, destDir: string): Promise<void> {
		const platform = process.platform;

		if (platform === 'win32') {
			// Use PowerShell to extract on Windows
			await execAsync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`);
		} else {
			// Use unzip on Unix
			await execAsync(`unzip -o "${zipPath}" -d "${destDir}"`);
		}

		// Move files from any subdirectory to the bin directory
		// Many releases have files inside a subdirectory
		const entries = await fsPromises.readdir(destDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const subDir = path.join(destDir, entry.name);
				const subFiles = await fsPromises.readdir(subDir);
				for (const file of subFiles) {
					const srcPath = path.join(subDir, file);
					const destPath = path.join(destDir, file);
					try {
						await fsPromises.rename(srcPath, destPath);
					} catch {
						// File might already exist, skip
					}
				}
				// Try to remove the empty subdirectory
				try {
					await fsPromises.rmdir(subDir);
				} catch {
					// Directory might not be empty, ignore
				}
			}
		}
	}
}
