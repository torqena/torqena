/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module WhisperCppSection
 * @description Whisper.cpp local server management section (download, models, server controls).
 *
 * @since 0.0.15
 */

import { Setting, FileSystemAdapter } from "obsidian";
import { WhisperCppManager, WHISPER_MODELS, WhisperServerStatus } from "../../../ai/voice-chat/whisper/WhisperCppManager";
import { createCollapsibleSection, type SettingSectionContext } from "./SectionHelpers";

/**
 * State returned by the Whisper.cpp section.
 */
export interface WhisperCppState {
	refreshStatus: () => Promise<void>;
}

/**
 * Render the Whisper.cpp Local Server management section.
 *
 * @param container - Parent element
 * @param ctx - Shared settings context
 * @returns State with refresh method
 *
 * @internal
 */
export function renderWhisperCppSection(container: HTMLElement, ctx: SettingSectionContext): WhisperCppState {
	const { content: section } = createCollapsibleSection(container, "Whisper.cpp Local Server", "vc-whisper-section");

	section.createEl("p", {
		text: "Download and run whisper.cpp locally for offline speech-to-text. No API keys or cloud services required.",
		cls: "vc-status-desc"
	});

	let whisperCppManager: WhisperCppManager | null = null;
	const whisperCppStatusContainer = section.createDiv({ cls: "vc-whisper-status-container" });

	function getWhisperCppManager(): WhisperCppManager {
		if (!whisperCppManager) {
			const adapter = ctx.app.vault.adapter;
			if (adapter instanceof FileSystemAdapter) {
				const basePath = adapter.getBasePath();
				whisperCppManager = new WhisperCppManager(basePath);
			} else {
				throw new Error("WhisperCppManager requires FileSystemAdapter");
			}
		}
		return whisperCppManager;
	}

	async function refreshWhisperCppStatus(): Promise<void> {
		whisperCppStatusContainer.empty();

		try {
			const manager = getWhisperCppManager();
			const installStatus = await manager.checkInstallation();
			const serverStatus = await manager.getServerStatus();
			const downloadedModels = await manager.listDownloadedModels();

			const statusRow = whisperCppStatusContainer.createDiv({ cls: "vc-whisper-status-row" });
			const statusIcon = statusRow.createSpan({ cls: "vc-whisper-status-icon" });
			const statusText = statusRow.createSpan({ cls: "vc-whisper-status-text" });

			if (installStatus.installed) {
				statusIcon.addClass("vc-whisper-status-ok");
				statusIcon.setText("✓");
				statusText.setText(`Whisper.cpp installed${installStatus.version ? ` (${installStatus.version})` : ''}`);
			} else {
				statusIcon.addClass("vc-whisper-status-missing");
				statusIcon.setText("✗");
				statusText.setText("Whisper.cpp not installed");
			}

			const serverRow = whisperCppStatusContainer.createDiv({ cls: "vc-whisper-status-row" });
			const serverIcon = serverRow.createSpan({ cls: "vc-whisper-status-icon" });
			const serverText = serverRow.createSpan({ cls: "vc-whisper-status-text" });

			if (serverStatus.running) {
				serverIcon.addClass("vc-whisper-status-ok");
				serverIcon.setText("●");
				serverText.setText(`Server running on port ${serverStatus.port || 8080}`);
			} else {
				serverIcon.addClass("vc-whisper-status-stopped");
				serverIcon.setText("○");
				serverText.setText("Server not running");
			}

			if (!installStatus.installed) {
				renderWhisperDownloadSection(whisperCppStatusContainer, manager);
			} else {
				renderWhisperModelsSection(whisperCppStatusContainer, manager, downloadedModels);
				renderWhisperServerControls(whisperCppStatusContainer, manager, serverStatus, downloadedModels);
				renderWhisperUninstallSection(whisperCppStatusContainer, manager);
			}
		} catch (error) {
			whisperCppStatusContainer.createEl("p", {
				text: `Error: ${error instanceof Error ? error.message : String(error)}`,
				cls: "vc-whisper-error"
			});
		}
	}

	function renderWhisperDownloadSection(cont: HTMLElement, manager: WhisperCppManager): void {
		const downloadSection = cont.createDiv({ cls: "vc-whisper-download-section" });

		const platformCheck = manager.isPlatformSupported();
		if (!platformCheck.supported) {
			downloadSection.createEl("p", { text: "⚠️ Platform Not Supported", cls: "vc-whisper-warning-title" });
			downloadSection.createEl("p", { text: platformCheck.reason || "Your platform is not supported for pre-built binaries.", cls: "vc-whisper-warning" });
			downloadSection.createEl("p", { text: "Alternative: Use the OpenAI Whisper API or Azure Speech services instead. Create an AI Provider Profile in the section above.", cls: "vc-whisper-info" });
			return;
		}

		downloadSection.createEl("p", {
			text: "Download whisper.cpp server binaries from GitHub. This will download the latest release for your platform.",
			cls: "vc-whisper-info"
		});

		const progressContainer = downloadSection.createDiv({ cls: "vc-whisper-progress-container" });
		progressContainer.style.display = "none";
		const progressBar = progressContainer.createDiv({ cls: "vc-whisper-progress-bar" });
		const progressFill = progressBar.createDiv({ cls: "vc-whisper-progress-fill" });
		const progressText = progressContainer.createDiv({ cls: "vc-whisper-progress-text" });

		new Setting(downloadSection)
			.setName("Download Whisper.cpp")
			.setDesc("Download whisper.cpp server binaries (~25 MB)")
			.addButton((button) => {
				button
					.setButtonText("Download")
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						button.setButtonText("Downloading...");
						progressContainer.style.display = "block";
						try {
							const result = await manager.downloadWhisperCpp((downloaded, total, percentage) => {
								progressFill.style.width = `${percentage}%`;
								const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
								const totalMB = (total / 1024 / 1024).toFixed(1);
								progressText.setText(`${downloadedMB} MB / ${totalMB} MB (${percentage.toFixed(0)}%)`);
							});
							if (result.success) {
								console.log("Whisper.cpp downloaded successfully!");
								await refreshWhisperCppStatus();
							} else {
								console.error(`Download failed: ${result.error}`);
								button.setDisabled(false);
								button.setButtonText("Download");
								progressContainer.style.display = "none";
							}
						} catch (error) {
							console.error(`Download error: ${error instanceof Error ? error.message : String(error)}`);
							button.setDisabled(false);
							button.setButtonText("Download");
							progressContainer.style.display = "none";
						}
					});
			});
	}

	function renderWhisperModelsSection(cont: HTMLElement, manager: WhisperCppManager, downloadedModels: string[]): void {
		const modelsSection = cont.createDiv({ cls: "vc-whisper-models-section" });
		modelsSection.createEl("h4", { text: "Models" });

		if (downloadedModels.length > 0) {
			const downloadedList = modelsSection.createDiv({ cls: "vc-whisper-downloaded-models" });
			downloadedList.createEl("p", { text: "Downloaded models:", cls: "vc-whisper-models-label" });

			for (const modelFile of downloadedModels) {
				const modelRow = downloadedList.createDiv({ cls: "vc-whisper-model-row" });
				modelRow.createSpan({ text: modelFile, cls: "vc-whisper-model-name" });

				const deleteBtn = modelRow.createEl("button", { cls: "vc-whisper-model-delete" });
				deleteBtn.setText("Delete");
				deleteBtn.addEventListener("click", async () => {
					if (confirm(`Delete model ${modelFile}?`)) {
						try {
							await manager.deleteModel(modelFile);
							console.log(`Deleted ${modelFile}`);
							await refreshWhisperCppStatus();
						} catch (error) {
							console.error(`Failed to delete: ${error instanceof Error ? error.message : String(error)}`);
						}
					}
				});
			}
		}

		const availableSection = modelsSection.createDiv({ cls: "vc-whisper-available-models" });
		availableSection.createEl("p", { text: "Download a model:", cls: "vc-whisper-models-label" });

		const modelSelect = availableSection.createEl("select", { cls: "vc-whisper-model-select" });
		for (const model of WHISPER_MODELS) {
			const isDownloaded = downloadedModels.includes(model.filename);
			const option = modelSelect.createEl("option");
			option.value = model.id;
			option.text = `${model.name}${isDownloaded ? ' (downloaded)' : ''}`;
			if (isDownloaded) option.disabled = true;
		}

		const modelProgressContainer = availableSection.createDiv({ cls: "vc-whisper-progress-container" });
		modelProgressContainer.style.display = "none";
		const modelProgressBar = modelProgressContainer.createDiv({ cls: "vc-whisper-progress-bar" });
		const modelProgressFill = modelProgressBar.createDiv({ cls: "vc-whisper-progress-fill" });
		const modelProgressText = modelProgressContainer.createDiv({ cls: "vc-whisper-progress-text" });

		const downloadModelBtn = availableSection.createEl("button", { cls: "vc-whisper-download-model-btn" });
		downloadModelBtn.setText("Download Model");
		downloadModelBtn.addEventListener("click", async () => {
			const selectedModelId = modelSelect.value;
			const selectedModel = WHISPER_MODELS.find(m => m.id === selectedModelId);
			if (!selectedModel) return;

			downloadModelBtn.disabled = true;
			downloadModelBtn.setText("Downloading...");
			modelProgressContainer.style.display = "block";

			try {
				const result = await manager.downloadModel(selectedModelId, (downloaded, total, percentage) => {
					modelProgressFill.style.width = `${percentage}%`;
					const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
					const totalMB = (total / 1024 / 1024).toFixed(1);
					modelProgressText.setText(`${downloadedMB} MB / ${totalMB} MB (${percentage.toFixed(0)}%)`);
				});
				if (result.success) {
					console.log(`Model ${selectedModel.name} downloaded successfully!`);
					await refreshWhisperCppStatus();
				} else {
					console.error(`Download failed: ${result.error}`);
					downloadModelBtn.disabled = false;
					downloadModelBtn.setText("Download Model");
					modelProgressContainer.style.display = "none";
				}
			} catch (error) {
				console.error(`Download error: ${error instanceof Error ? error.message : String(error)}`);
				downloadModelBtn.disabled = false;
				downloadModelBtn.setText("Download Model");
				modelProgressContainer.style.display = "none";
			}
		});
	}

	function renderWhisperServerControls(cont: HTMLElement, manager: WhisperCppManager, serverStatus: WhisperServerStatus, downloadedModels: string[]): void {
		const serverSection = cont.createDiv({ cls: "vc-whisper-server-section" });
		serverSection.createEl("h4", { text: "Server Controls" });

		if (downloadedModels.length === 0) {
			serverSection.createEl("p", { text: "Download a model first to start the server.", cls: "vc-whisper-info" });
			return;
		}

		let selectedServerModel = downloadedModels[0] || '';
		new Setting(serverSection)
			.setName("Model")
			.setDesc("Select which model to use for the server")
			.addDropdown((dropdown) => {
				for (const modelFile of downloadedModels) {
					const modelInfo = WHISPER_MODELS.find(m => m.filename === modelFile);
					dropdown.addOption(modelFile, modelInfo ? modelInfo.name : modelFile);
				}
				if (selectedServerModel) dropdown.setValue(selectedServerModel);
				dropdown.onChange((value) => { selectedServerModel = value; });
			});

		const buttonContainer = serverSection.createDiv({ cls: "vc-whisper-button-container" });

		if (serverStatus.running) {
			const stopBtn = buttonContainer.createEl("button", { cls: "mod-warning" });
			stopBtn.setText("Stop Server");
			stopBtn.addEventListener("click", async () => {
				try {
					const result = manager.stopServer();
					if (result.success) {
						console.log("Whisper.cpp server stopped");
						await refreshWhisperCppStatus();
					} else {
						console.error(`Failed to stop server: ${result.error}`);
					}
				} catch (error) {
					console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
				}
			});
		} else {
			const startBtn = buttonContainer.createEl("button", { cls: "mod-cta" });
			startBtn.setText("Start Server");
			startBtn.addEventListener("click", async () => {
				try {
					if (!selectedServerModel) {
						console.log("Please select a model first");
						return;
					}
					const modelId = selectedServerModel.replace('ggml-', '').replace('.bin', '');
					startBtn.disabled = true;
					startBtn.setText("Starting...");

					const result = await manager.startServer(modelId);
					if (result.success) {
						console.log("Whisper.cpp server started!");
						if (ctx.plugin.settings.voice) {
							ctx.plugin.settings.voice.backend = 'local-whisper';
							ctx.plugin.settings.voice.whisperServerUrl = 'http://127.0.0.1:8080';
							await ctx.plugin.saveSettings();
						}
						await refreshWhisperCppStatus();
					} else {
						console.error(`Failed to start server: ${result.error}`);
						startBtn.disabled = false;
						startBtn.setText("Start Server");
					}
				} catch (error) {
					console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
					startBtn.disabled = false;
					startBtn.setText("Start Server");
				}
			});
		}

		if (serverStatus.running) {
			const endpointInfo = serverSection.createDiv({ cls: "vc-whisper-endpoint-info" });
			endpointInfo.createEl("code", { text: `Endpoint: http://127.0.0.1:${serverStatus.port || 8080}/inference` });
		}
	}

	function renderWhisperUninstallSection(cont: HTMLElement, manager: WhisperCppManager): void {
		const uninstallSection = cont.createDiv({ cls: "vc-whisper-uninstall-section" });
		uninstallSection.createEl("h4", { text: "Uninstall" });

		new Setting(uninstallSection)
			.setName("Remove Whisper.cpp")
			.setDesc("Remove all whisper.cpp binaries and downloaded models")
			.addButton((button) => {
				button
					.setButtonText("Uninstall")
					.setWarning()
					.onClick(async () => {
						if (confirm("Are you sure you want to uninstall whisper.cpp? This will remove all binaries and downloaded models.")) {
							button.setDisabled(true);
							button.setButtonText("Uninstalling...");
							try {
								const result = await manager.uninstall();
								if (result.success) {
									console.log("Whisper.cpp uninstalled successfully");
									await refreshWhisperCppStatus();
								} else {
									console.error(`Uninstall failed: ${result.error}`);
									button.setDisabled(false);
									button.setButtonText("Uninstall");
								}
							} catch (error) {
								console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
								button.setDisabled(false);
								button.setButtonText("Uninstall");
							}
						}
					});
			});
	}

	// Initial render
	refreshWhisperCppStatus();

	return { refreshStatus: refreshWhisperCppStatus };
}
