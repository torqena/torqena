/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ExtensionSubmissionModal
 * @description Multi-step modal for submitting extensions to the Vault Copilot catalog
 * 
 * Provides a user-friendly interface for:
 * - Selecting and validating extensions
 * - Collecting GitHub repository details
 * - Gathering author information
 * - Previewing and confirming submission details
 * - Automating the GitHub fork, commit, and pull request process
 * 
 * @example
 * ```typescript
 * const modal = new ExtensionSubmissionModal(app, plugin);
 * const result = await modal.show();
 * if (result) {
 *   console.log('Extension submitted:', result);
 * }
 * ```
 * 
 * @since 0.1.0
 */

import { App, Modal, ButtonComponent, TextComponent } from "obsidian";
import type { ExtensionSubmissionData } from "../../types/extension-submission";
import type { AIServiceManager as VaultCopilotPlugin } from "../../app/AIServiceManager";
import { GitHubSubmissionService } from "../../extensions/GitHubSubmissionService";

// Import screen components
import { renderWelcomeScreen } from "./Submission/WelcomeScreen";
import { renderSelectExtensionScreen } from "./Submission/SelectExtensionScreen";
import { renderGeneratingContentScreen } from "./Submission/GeneratingContentScreen";
import { renderAuthorDetailsScreen } from "./Submission/AuthorDetailsScreen";
import { renderDescriptionScreen } from "./Submission/DescriptionScreen";
import { renderReadmeScreen } from "./Submission/ReadmeScreen";
import { renderPreviewScreen } from "./Submission/PreviewScreen";
import { renderChangelogScreen } from "./Submission/ChangelogScreen";
import { renderSubmissionProgressScreen } from "./Submission/SubmissionProgressScreen";
import { renderSuccessScreen } from "./Submission/SuccessScreen";

// Import utilities
import {
	loadAuthorInfo,
	showInlineMessage,
	parseOrDeriveExtensionInfo,
	validateExtensionId,
	validateSemver,
	compareSemver,
	fetchPreviousExtensionData,
	generateChangelogWithAI,
	generateExtensionContent,
	generateExtensionImageAuto,
	generateExtensionImage
} from "./Submission/utils";
import type { CatalogEntryMetadata } from "./Submission/utils";

import type { ScreenContext, ScreenCallbacks, LoadingTask } from "./Submission/types";

/**
 * Multi-step modal for extension submission workflow
 */
export class ExtensionSubmissionModal extends Modal {
	private currentStep = -1; // Start at -1 for Welcome screen
	private submissionData: Partial<ExtensionSubmissionData> = {};
	private resolve: ((value: ExtensionSubmissionData | null) => void) | null = null;
	private plugin: VaultCopilotPlugin | undefined;
	private activeSubmissionService: GitHubSubmissionService | null = null;
	private submissionCancelled = false;
	
	// Form elements
	private extensionPathInput: TextComponent | null = null;
	private versionInput: TextComponent | null = null;
	private authorNameInput: TextComponent | null = null;
	private authorUrlInput: TextComponent | null = null;
	private descriptionInput: HTMLTextAreaElement | null = null;
	private readmeInput: HTMLTextAreaElement | null = null;
	
	// Image file paths
	private iconImagePath: string | null = null;
	private previewImagePath: string | null = null;
	private generatedImagePath: string | null = null;
	
	// Loading state for AI generation
	private tempExtensionPathFs: string | null = null; // Temporary filesystem path where the selected extension is copied for
	// the duration of the wizard and used as the working directory for the
	// GitHub submission workflow.

	private isGeneratingContent = false;
	private isGeneratingImage = false;
	private generatedDescription = "";
	private generatedReadme = "";
	
	// Track whether initial validation has been completed
	private hasCompletedInitialValidation = false;
	
	// Track whether user wants AI generation
	private skipAIGeneration = false;
	
	// Update detection state
	private isUpdate = false;
	private catalogVersion: string | null = null;
	private catalogExtensionId: string | null = null;
	private catalogMetadata: CatalogEntryMetadata | null = null;
	
	/** Original derived ID before it was overridden with the catalog ID (for file rename) */
	private originalDerivedId: string | null = null;
	
	// Changelog state (for updates)
	private isGeneratingChangelog = false;
	private generatedChangelog = "";
	private changelogInput: HTMLTextAreaElement | null = null;
	
	/** The last context object given to a screen, used to sync user-modified values back */
	private lastContext: ScreenContext | null = null;
	
	/**
	 * Creates a new extension submission modal
	 */
	constructor(app: App, plugin?: VaultCopilotPlugin) {
		super(app);
		this.plugin = plugin;
		this.loadAuthorInfoAsync();
	}
	
	/**
	 * Loads author information from git config
	 */
	private async loadAuthorInfoAsync(): Promise<void> {
		const authorInfo = await loadAuthorInfo();
		if (authorInfo.authorName) {
			this.submissionData.authorName = authorInfo.authorName;
		}
		if (authorInfo.authorUrl) {
			this.submissionData.authorUrl = authorInfo.authorUrl;
		}
		if (authorInfo.githubUsername) {
			this.submissionData.githubUsername = authorInfo.githubUsername;
		}
	}
	
	/**
	 * Shows the modal and returns a promise that resolves with submission data
	 */
	public show(): Promise<ExtensionSubmissionData | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}
	
	public onOpen(): void {
		this.renderCurrentStep();
	}
	
	public onClose(): void {
		// Don't resolve or show notice - user explicitly closed modal
		// Clear resolve to prevent double resolution
		this.resolve = null;
	}
	
	/**
	 * Gets the screen context
	 */
	private getContext(): ScreenContext {
		const ctx: ScreenContext = {
			app: this.app,
			plugin: this.plugin,
			submissionData: this.submissionData,
			extensionPathInput: this.extensionPathInput,
			versionInput: this.versionInput,
			authorNameInput: this.authorNameInput,
			authorUrlInput: this.authorUrlInput,
			descriptionInput: this.descriptionInput,
			readmeInput: this.readmeInput,
			iconImagePath: this.iconImagePath,
			previewImagePath: this.previewImagePath,
			generatedImagePath: this.generatedImagePath,
			isGeneratingContent: this.isGeneratingContent,
			isGeneratingImage: this.isGeneratingImage,
			generatedDescription: this.generatedDescription,
			generatedReadme: this.generatedReadme,
			hasCompletedInitialValidation: this.hasCompletedInitialValidation,
			skipAIGeneration: this.skipAIGeneration,
			isUpdate: this.isUpdate,
			catalogVersion: this.catalogVersion,
			catalogExtensionId: this.catalogExtensionId,
			catalogMetadata: this.catalogMetadata,
			generatedChangelog: this.generatedChangelog,
			isGeneratingChangelog: this.isGeneratingChangelog,
			changelogInput: this.changelogInput
		};
		this.lastContext = ctx;
		return ctx;
	}
	
	/**
	 * Syncs mutable primitive values that screens may have modified on the
	 * context object back into the modal's own state. Reference-type fields
	 * like `submissionData` are already shared and don't need syncing.
	 * @internal
	 */
	private syncFromContext(): void {
		const ctx = this.lastContext;
		if (!ctx) return;
		this.skipAIGeneration = ctx.skipAIGeneration;
		this.hasCompletedInitialValidation = ctx.hasCompletedInitialValidation;
		this.isUpdate = ctx.isUpdate;
		this.catalogVersion = ctx.catalogVersion;
		this.catalogExtensionId = ctx.catalogExtensionId;
		this.catalogMetadata = ctx.catalogMetadata;
		this.generatedDescription = ctx.generatedDescription;
		this.generatedReadme = ctx.generatedReadme;
		this.generatedImagePath = ctx.generatedImagePath;
		this.generatedChangelog = ctx.generatedChangelog;
		this.isGeneratingChangelog = ctx.isGeneratingChangelog;
		this.extensionPathInput = ctx.extensionPathInput;
		this.versionInput = ctx.versionInput;
		this.authorNameInput = ctx.authorNameInput;
		this.authorUrlInput = ctx.authorUrlInput;
		this.descriptionInput = ctx.descriptionInput;
		this.readmeInput = ctx.readmeInput;
		this.iconImagePath = ctx.iconImagePath;
		this.previewImagePath = ctx.previewImagePath;
		this.changelogInput = ctx.changelogInput;
	}
	
	/**
	 * Gets the screen callbacks
	 */
	private getCallbacks(): ScreenCallbacks {
		return {
			onNext: async () => {
				if (await this.validateCurrentStep()) {
					this.currentStep++;
					// Skip changelog step (4) for new submissions
					if (this.currentStep === 4 && !this.isUpdate) {
						this.currentStep++;
					}
					this.renderCurrentStep();
				}
			},
			onBack: () => {
				this.currentStep--;
				// Skip changelog step (4) for new submissions
				if (this.currentStep === 4 && !this.isUpdate) {
					this.currentStep--;
				}
				this.renderCurrentStep();
			},
			onClose: () => this.close(),
			onSubmit: async () => await this.submitExtension(),
			onRender: () => this.renderCurrentStep(),
			showInlineMessage: (container, message, type) => showInlineMessage(container, message, type)
		};
	}
	
	/**
	 * Renders the current step
	 */
	private renderCurrentStep(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.removeClass("loading-screen");
		contentEl.addClass("extension-submission-modal");
		
		const context = this.getContext();
		const callbacks = this.getCallbacks();
		
		switch (this.currentStep) {
			case -1:
				// Welcome screen
				renderWelcomeScreen(contentEl, callbacks);
				break;
			case 0: {
				// Select Extension — uses its own inline step header instead of the progress bar
				const totalSteps = this.isUpdate ? 6 : 5;
				renderSelectExtensionScreen(contentEl, context, callbacks, this.renderNavigationButtons.bind(this), totalSteps);
				break;
			}
			case 1:
				// Author Details
				this.renderProgressIndicator(contentEl);
				renderAuthorDetailsScreen(contentEl, context, this.renderNavigationButtons.bind(this));
				break;
			case 2:
				// Description
				this.renderProgressIndicator(contentEl);
				renderDescriptionScreen(
					contentEl,
					context,
					callbacks,
					this.renderNavigationButtons.bind(this),
					async (button) => {
						this.isGeneratingImage = true;
						this.renderCurrentStep();
						
						const result = await generateExtensionImage(
							this.plugin,
							this.submissionData.extensionId,
							button,
							contentEl.querySelector('.step-message-container') as HTMLElement,
							showInlineMessage
						);
						
						if (result.imagePath) {
							this.generatedImagePath = result.imagePath;
							this.iconImagePath = null;
							this.previewImagePath = null;
						}
						
						this.isGeneratingImage = result.isGenerating;
						this.renderCurrentStep();
					}
				);
				break;
			case 3:
				// README
				this.renderProgressIndicator(contentEl);
				renderReadmeScreen(contentEl, context, callbacks, this.renderNavigationButtons.bind(this));
				break;
			case 4:
				// Changelog (updates only — skipped automatically for new submissions)
				this.renderProgressIndicator(contentEl);
				renderChangelogScreen(
					contentEl,
					context,
					callbacks,
					this.renderNavigationButtons.bind(this),
					async () => {
						this.isGeneratingChangelog = true;
						this.renderCurrentStep();
						
						// Fetch previous README from the catalog repository
						// Use the actual catalog ID (may differ from derived ID)
						const catalogId = this.catalogExtensionId || this.submissionData.extensionId || "";
						const prevData = await fetchPreviousExtensionData(
							catalogId,
							this.submissionData.extensionType || "agent"
						);
						
						// Use current README from the form or generated content
						const currentReadme = this.readmeInput?.value
							|| this.submissionData.readme
							|| this.generatedReadme
							|| "";
						
						const changelog = await generateChangelogWithAI(
							this.plugin,
							this.submissionData.extensionName || this.submissionData.extensionId || "",
							this.submissionData.extensionId || "",
							prevData.readme,
							currentReadme,
							this.catalogVersion || "0.0.0",
							this.submissionData.version || "0.0.1",
							contentEl.querySelector('.step-message-container') as HTMLElement,
							showInlineMessage
						);
						
						this.generatedChangelog = changelog;
						this.submissionData.changelog = changelog;
						
						// Preserve previous versions from the catalog manifest
						if (prevData.manifest?.versions) {
							this.submissionData.versions = [...prevData.manifest.versions];
						}
						
						this.isGeneratingChangelog = false;
						this.renderCurrentStep();
					}
				);
				break;
			case 5:
				// Preview & Submit
				this.renderProgressIndicator(contentEl);
				renderPreviewScreen(contentEl, context, this.renderNavigationButtons.bind(this));
				break;
		}
	}
	
	/**
	 * Renders the progress indicator
	 */
	private renderProgressIndicator(container: HTMLElement): void {
		// Build step list — include Changelog step only for updates
		const allSteps: Array<{ name: string; step: number }> = [
			{ name: "Select Extension", step: 0 },
			{ name: "Author Details", step: 1 },
			{ name: "Description", step: 2 },
			{ name: "README", step: 3 },
		];
		if (this.isUpdate) {
			allSteps.push({ name: "Changelog", step: 4 });
		}
		allSteps.push(
			{ name: "Preview & Submit", step: 5 }
		);
		
		const progressContainer = container.createDiv({ cls: "submission-progress" });
		
		allSteps.forEach(({ name, step }, displayIndex) => {
			const stepEl = progressContainer.createDiv({ cls: "progress-step" });
			
			if (step < this.currentStep) {
				stepEl.addClass("complete");
			} else if (step === this.currentStep) {
				stepEl.addClass("active");
			}
			
			stepEl.createDiv({ cls: "step-number", text: `${displayIndex + 1}` });
			stepEl.createDiv({ cls: "step-label", text: name });
		});
	}
	
	/**
	 * Renders navigation buttons
	 */
	private renderNavigationButtons(
		container: HTMLElement,
		showBack = false,
		showNext = false,
		showSubmit = false
	): void {
		const buttonContainer = container.createDiv({ cls: "navigation-buttons" });
		
		if (showBack) {
			new ButtonComponent(buttonContainer)
				.setButtonText("← Back")
				.onClick(() => {
					this.currentStep--;
					// Skip changelog step (4) for new submissions
					if (this.currentStep === 4 && !this.isUpdate) {
						this.currentStep--;
					}
					this.renderCurrentStep();
				});
		}
		
		if (showNext) {
			new ButtonComponent(buttonContainer)
				.setButtonText("Next →")
				.setCta()
				.onClick(async () => {
					const callbacks = this.getCallbacks();
					await callbacks.onNext();
				});
		}
		
		if (showSubmit) {
			new ButtonComponent(buttonContainer)
				.setButtonText("Submit Extension")
				.setCta()
				.onClick(async () => {
					await this.submitExtension();
				});
		}
		
		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => this.close());
	}
	
	/**
	 * Validates the current step before proceeding
	 */
	private async validateCurrentStep(): Promise<boolean> {
		// Sync any values that screens modified on the context object back
		// into the modal so validation logic sees the latest state.
		this.syncFromContext();
		
		const messageContainer = this.contentEl.querySelector('.step-message-container') as HTMLElement;
		
		switch (this.currentStep) {
			case 0: // Extension selection
				if (!this.submissionData.extensionPath) {
					if (messageContainer) {
						showInlineMessage(messageContainer, "Please provide an extension folder path", 'error');
					}
					return false;
				}
				
				// Skip initial validation if already completed
				if (this.hasCompletedInitialValidation) {
					return true;
				}
				
				// If user opted to skip AI generation
				if (this.skipAIGeneration) {
					try {
						const manifest = await parseOrDeriveExtensionInfo(
							this.app,
							this.submissionData.extensionPath,
							this.submissionData.extensionType
						);
						
						if (!manifest) {
							if (messageContainer) {
								showInlineMessage(messageContainer, "Could not read extension info. Please check your path points to a valid extension file or folder.", 'error');
							}
							return false;
						}
						
						this.submissionData.extensionId = manifest.id;
						this.submissionData.extensionName = manifest.name;
						// Use user-specified version if provided, otherwise use manifest version
						if (!this.submissionData.version) {
							this.submissionData.version = manifest.version;
							// Update the version input field to reflect the derived value
							if (this.versionInput) {
								this.versionInput.setValue(manifest.version);
							}
						}
						
						// Check catalog for existing extension (update detection)
						try {
							const idResult = await validateExtensionId(this.submissionData.extensionId);
							this.isUpdate = idResult.exists;
							this.catalogVersion = idResult.catalogVersion;
							this.catalogExtensionId = idResult.catalogExtensionId;
							this.catalogMetadata = idResult.catalogMetadata;
							
							// When updating and the catalog ID differs from the derived ID,
							// override the submission ID/name to match the catalog entry so
							// the PR targets the correct existing folder.
							if (this.isUpdate && this.catalogExtensionId && this.catalogExtensionId !== this.submissionData.extensionId) {
								console.log(`[Extension Submission] Overriding derived ID "${this.submissionData.extensionId}" with catalog ID "${this.catalogExtensionId}"`);
								this.originalDerivedId = this.submissionData.extensionId ?? null;
								this.submissionData.extensionId = this.catalogExtensionId;
								if (this.catalogMetadata?.name) {
									this.submissionData.extensionName = this.catalogMetadata.name;
								}
							}
						} catch {
							// Catalog check is best-effort
						}
						
						const branchPrefix = this.isUpdate ? "update" : "add";
						if (this.submissionData.githubUsername) {
							this.submissionData.forkRepoName = "obsidian-vault-copilot";
							this.submissionData.branchName = `${branchPrefix}-${this.submissionData.extensionId}`;
						} else {
							this.submissionData.githubUsername = "user";
							this.submissionData.forkRepoName = "obsidian-vault-copilot";
							this.submissionData.branchName = `${branchPrefix}-${this.submissionData.extensionId}`;
						}
						
						this.hasCompletedInitialValidation = true; 
						const prepared = await this.prepareTempExtensionFolder();
						if (!prepared) {
							if (messageContainer) {
								showInlineMessage(
									messageContainer,
									"Failed to prepare temporary folder for submission. Please ensure you are using a local desktop vault.",
									"error"
								);
							}
							return false;
						}
						return true;
						
					} catch (error) {
						console.error("Basic validation failed:", error);
						if (messageContainer) {
							showInlineMessage(messageContainer, "Validation failed. Please check your extension path and manifest.json.", 'error');
						}
						return false;
					}
				}
				
				// Run all validation and generation tasks
				const tasks: LoadingTask[] = [
					{ name: "Generating Description", status: 'pending' },
					{ name: "Generating Image", status: 'pending' },
					{ name: "Checking catalog", status: 'pending' }
				];
				
				try {
					const manifest = await parseOrDeriveExtensionInfo(
						this.app,
						this.submissionData.extensionPath,
						this.submissionData.extensionType
					);
					
					if (!manifest) {
						if (messageContainer) {
							showInlineMessage(messageContainer, "Could not read extension info. Please check your path points to a valid extension file or folder.", 'error');
						}
						return false;
					}
					
					this.submissionData.extensionId = manifest.id;
					this.submissionData.extensionName = manifest.name;
					// Use user-specified version if provided, otherwise use manifest version
					if (!this.submissionData.version) {
						this.submissionData.version = manifest.version;
						// Update the version input field to reflect the derived value
						if (this.versionInput) {
							this.versionInput.setValue(manifest.version);
						}
					}
					
					// Task 1: Generate description and README
					tasks[0]!.status = 'in-progress';
					renderGeneratingContentScreen(this.contentEl, "Generating description and README...", tasks);
					const content = await generateExtensionContent(
						this.app,
						this.plugin,
						this.submissionData.extensionPath,
						this.submissionData.extensionId,
						this.submissionData.extensionName
					);
					this.generatedDescription = content.description;
					this.generatedReadme = content.readme;
					tasks[0]!.status = 'complete';
					
					// Task 2: Generate image
					tasks[1]!.status = 'in-progress';
					renderGeneratingContentScreen(this.contentEl, "Generating extension image...", tasks);
					const imagePath = await generateExtensionImageAuto(
						this.app,
						this.plugin,
						this.submissionData.extensionPath!,
						this.submissionData.extensionId,
						this.submissionData.extensionName,
						this.generatedReadme
					);
					if (imagePath) {
						this.generatedImagePath = imagePath;
					}
					tasks[1]!.status = 'complete';
					
					// Task 3: Check catalog for existing extension
					tasks[2]!.status = 'in-progress';
					renderGeneratingContentScreen(this.contentEl, "Checking catalog...", tasks);
					const idResult = await validateExtensionId(this.submissionData.extensionId);
					this.isUpdate = idResult.exists;
					this.catalogVersion = idResult.catalogVersion;
					this.catalogExtensionId = idResult.catalogExtensionId;
					this.catalogMetadata = idResult.catalogMetadata;
					
					// When updating and the catalog ID differs from the derived ID,
					// override the submission ID/name to match the catalog entry so
					// the PR targets the correct existing folder.
					if (this.isUpdate && this.catalogExtensionId && this.catalogExtensionId !== this.submissionData.extensionId) {
						console.log(`[Extension Submission] Overriding derived ID "${this.submissionData.extensionId}" with catalog ID "${this.catalogExtensionId}"`);
						this.originalDerivedId = this.submissionData.extensionId ?? null;
						this.submissionData.extensionId = this.catalogExtensionId;
						if (this.catalogMetadata?.name) {
							this.submissionData.extensionName = this.catalogMetadata.name;
						}
					}
					tasks[2]!.status = 'complete';
					
					const branchPrefix = this.isUpdate ? "update" : "add";
					if (this.submissionData.githubUsername) {
						this.submissionData.forkRepoName = "obsidian-vault-copilot";
						this.submissionData.branchName = `${branchPrefix}-${this.submissionData.extensionId}`;
					} else {
						this.submissionData.githubUsername = "user";
						this.submissionData.forkRepoName = "obsidian-vault-copilot";
						this.submissionData.branchName = `${branchPrefix}-${this.submissionData.extensionId}`;
					}
					
					this.hasCompletedInitialValidation = true; 
					const prepared = await this.prepareTempExtensionFolder();
					if (!prepared) {
						if (messageContainer) {
							showInlineMessage(
								messageContainer,
								"Failed to prepare temporary folder for submission. Please ensure you are using a local desktop vault.",
								"error"
							);
						}
						return false;
					}
					return true;
					
				} catch (error) {
					console.error("Validation/generation failed:", error);
					if (messageContainer) {
						const message =
							error instanceof Error && error.message
								? error.message
								: "Some automated tasks failed. You can still proceed and enter details manually.";
						showInlineMessage(messageContainer, message, 'warning');
					}
					this.hasCompletedInitialValidation = true; 
					const prepared = await this.prepareTempExtensionFolder();
					if (!prepared) {
						if (messageContainer) {
							showInlineMessage(
								messageContainer,
								"Failed to prepare temporary folder for submission. Please ensure you are using a local desktop vault.",
								"error"
							);
						}
						return false;
					}
					return true;
				}
				
			case 1: // Author Details
				if (!this.submissionData.authorName) {
					if (messageContainer) {
						showInlineMessage(messageContainer, "Please provide your author name", 'error');
					}
					return false;
				}
				if (!this.submissionData.authorUrl) {
					if (messageContainer) {
						showInlineMessage(messageContainer, "Please provide your author URL", 'error');
					}
					return false;
				}
				return true;
			
			case 2: {
				// Description step: validate version and description constraints.
				// Validate user-specified version
				if (this.submissionData.version && !validateSemver(this.submissionData.version)) {
					if (messageContainer) {
						showInlineMessage(messageContainer, "Version must be in semantic version format: MAJOR.MINOR.PATCH (e.g. 1.0.0)", 'error');
					}
					return false;
				}
				
				// Warn if submitted version is not higher than the catalog version
				if (this.isUpdate && this.catalogVersion && this.submissionData.version) {
					if (compareSemver(this.submissionData.version, this.catalogVersion) <= 0) {
						if (messageContainer) {
							showInlineMessage(
								messageContainer,
								`Catalog has v${this.catalogVersion}. Your version (${this.submissionData.version}) should be higher. Please increment the version.`,
								'warning'
							);
						}
						// Warn only — don't block
					}
				}
				
				// Enforce the 200-character catalog description limit
				if (this.submissionData.description && this.submissionData.description.length > 200) {
					if (messageContainer) {
						showInlineMessage(
							messageContainer,
							"Description must be 200 characters or fewer. Please shorten it before continuing.",
							"error"
						);
					}
					return false;
				}
				return true;
			}
			case 3: // README
				return true;
			case 4: // Changelog (updates only)
				return true;
		}
		
		return true;
	}

	/**
	 * Prepares a temporary filesystem folder that mirrors the selected extension
	 * contents. This folder is used as the working directory for the GitHub
	 * submission workflow so that we never mutate the user's vault or the
	 * plugin repository directly.
	 *
	 * @returns Promise resolving to true if the temp folder is ready
	 * @internal
	 */
	private async prepareTempExtensionFolder(): Promise<boolean> {
		try {
			if (this.tempExtensionPathFs) {
				return true;
			}

			if (!this.submissionData.extensionPath) {
				console.warn("No extension path set; cannot prepare temp folder.");
				return false;
			}

			const adapter: any = this.app.vault.adapter;
			const vaultBasePath: string | undefined =
				typeof adapter.getBasePath === "function"
					? adapter.getBasePath()
					: typeof adapter.basePath === "string"
						? adapter.basePath
						: undefined;

			if (!vaultBasePath) {
				console.warn("Vault base path not available; temp folder requires a local desktop vault.");
				return false;
			}

			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const fs = require("fs") as typeof import("fs");
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const path = require("path") as typeof import("path");
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const os = require("os") as typeof import("os");

			const normalizedVaultBase = vaultBasePath.replace(/\\/g, "/");
			const relativePath = this.submissionData.extensionPath.replace(/^\/+/, "");
			const sourcePathFs = `${normalizedVaultBase}/${relativePath}`.replace(/\\/g, "/");

			let stat: import("fs").Stats;
			try {
				stat = fs.statSync(sourcePathFs);
			} catch (error) {
				console.error("Failed to stat source extension path for temp copy:", error);
				return false;
			}

			const baseTempDir = path.join(os.tmpdir(), "obsidian-vault-copilot-extensions");
			if (!fs.existsSync(baseTempDir)) {
				fs.mkdirSync(baseTempDir, { recursive: true });
			}

			const safeId = (this.submissionData.extensionId || "extension")
				.replace(/[^a-zA-Z0-9_-]/g, "-");
			const destDir = path.join(baseTempDir, `${safeId}-${Date.now()}`);
			fs.mkdirSync(destDir, { recursive: true });

			const copyRecursive = (source: string, target: string): void => {
				const sourceStat = fs.statSync(source);
				if (sourceStat.isDirectory()) {
					if (!fs.existsSync(target)) {
						fs.mkdirSync(target, { recursive: true });
					}
					for (const entry of fs.readdirSync(source)) {
						const srcEntry = path.join(source, entry);
						const dstEntry = path.join(target, entry);
						copyRecursive(srcEntry, dstEntry);
					}
				} else {
					const parentDir = path.dirname(target);
					if (!fs.existsSync(parentDir)) {
						fs.mkdirSync(parentDir, { recursive: true });
					}
					fs.copyFileSync(source, target);
				}
			};

			if (stat.isDirectory()) {
				copyRecursive(sourcePathFs, destDir);
			} else {
				const fileName = path.basename(sourcePathFs);
				copyRecursive(sourcePathFs, path.join(destDir, fileName));
			}

			this.tempExtensionPathFs = destDir;
			console.log("Prepared temporary extension folder for submission:", destDir);
			return true;
		} catch (error) {
			console.error("Failed to prepare temporary extension folder:", error);
			return false;
		}
	}

	/**
	 * Ensures that required files (manifest.json, README.md, and preview image)
	 * exist in the temporary extension folder before invoking the GitHub
	 * submission service. This uses the data collected in the wizard so that
	 * users are not required to hand-author these files.
	 *
	 * @param extensionRootFs - Absolute path to the temporary extension folder
	 * @param vaultBasePath - Base filesystem path of the current vault
	 * @param data - Normalized submission data for the extension
	 * @internal
	 */
	private async ensureRequiredFilesInTempExtensionFolder(
		extensionRootFs: string,
		vaultBasePath: string,
		data: ExtensionSubmissionData
	): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const fs = require("fs") as typeof import("fs");
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const path = require("path") as typeof import("path");

		if (!fs.existsSync(extensionRootFs)) {
			fs.mkdirSync(extensionRootFs, { recursive: true });
		}

		// 0) Rename the main extension file if the ID was overridden (e.g.
		//    derived "daily-journal" → catalog "daily-journal-agent")
		if (this.originalDerivedId && this.originalDerivedId !== data.extensionId) {
			const suffixes: Record<string, string> = {
				"agent": ".agent.md",
				"voice-agent": ".voice-agent.md",
				"prompt": ".prompt.md",
				"skill": ".skill.md",
				"mcp-server": ".mcp-server.md"
			};
			const suffix = suffixes[data.extensionType] || ".md";
			const oldFileName = `${this.originalDerivedId}${suffix}`;
			const newFileName = `${data.extensionId}${suffix}`;
			const oldFilePath = path.join(extensionRootFs, oldFileName);
			const newFilePath = path.join(extensionRootFs, newFileName);

			if (fs.existsSync(oldFilePath) && !fs.existsSync(newFilePath)) {
				fs.renameSync(oldFilePath, newFilePath);
				console.log(`[Extension Submission] Renamed ${oldFileName} → ${newFileName} to match catalog ID`);
			}
		}

		// 1) manifest.json
		const manifestPath = path.join(extensionRootFs, "manifest.json");
		if (!fs.existsSync(manifestPath)) {
			const extensionFileName = (() => {
				switch (data.extensionType) {
					case "agent":
						return `${data.extensionId}.agent.md`;
					case "voice-agent":
						return `${data.extensionId}.voice-agent.md`;
					case "prompt":
						return `${data.extensionId}.prompt.md`;
					case "skill":
						return "skill.md";
					case "mcp-server":
						return "mcp-config.json";
					default:
						return `${data.extensionId}.md`;
				}
			})();

			let description =
				data.description ||
				this.generatedDescription ||
				`${data.extensionName} - An extension for Obsidian Vault Copilot.`;

			// Enforce the 200-character manifest description limit at write time so
			// newly created manifests always pass validation.
			if (description.length > 200) {
				description = `${description.slice(0, 197)}...`;
			}

			const manifest: Record<string, unknown> = {
				id: data.extensionId,
				name: data.extensionName,
				version: data.version,
				type: data.extensionType,
				description,
				author: {
					name: data.authorName,
					url: data.authorUrl,
				},
				minVaultCopilotVersion: "0.0.1",
				// For updates, carry over categories/tags/tools from the catalog entry;
				// for new submissions, start with empty arrays.
				categories: (this.isUpdate && this.catalogMetadata?.categories?.length)
					? this.catalogMetadata.categories
					: [] as string[],
				tags: (this.isUpdate && this.catalogMetadata?.tags?.length)
					? this.catalogMetadata.tags
					: [] as string[],
				files: [
					{
						source: extensionFileName,
						installPath: `extensions/${data.extensionType}s/${data.extensionId}/${extensionFileName}`,
					},
				],
			};

			// For updates, also carry over tools, repository, and featured status
			if (this.isUpdate && this.catalogMetadata) {
				if (this.catalogMetadata.tools?.length) {
					manifest.tools = this.catalogMetadata.tools;
				}
				if (this.catalogMetadata.repository) {
					manifest.repository = this.catalogMetadata.repository;
				}
				if (this.catalogMetadata.featured) {
					manifest.featured = true;
				}
			}

			// Include changelog reference and version history when available (updates)
			if (data.changelog) {
				manifest.changelog = "CHANGELOG.md";

				// Build the versions array: append current version entry to any previous entries
				const todayIso = new Date().toISOString().slice(0, 10);

				// Parse change lines from the generated changelog text
				const changeLines = data.changelog
					.split("\n")
					.filter((l: string) => l.startsWith("- "))
					.map((l: string) => l.replace(/^-\s*/, ""));

				const currentVersionEntry = {
					version: data.version,
					date: todayIso,
					changes: changeLines.length > 0 ? changeLines : ["Updated extension"],
				};

				const previousVersions = data.versions || [];
				manifest.versions = [...previousVersions, currentVersionEntry];
			}

			fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
		}

		// 2) README.md
		const readmePath = path.join(extensionRootFs, "README.md");
		if (!fs.existsSync(readmePath)) {
			const readmeContent =
				data.readme ||
				this.generatedReadme ||
				`# ${data.extensionName}\n\nA helpful extension for Obsidian Vault Copilot.`;
			fs.writeFileSync(readmePath, readmeContent, "utf-8");
		}

		// 3) CHANGELOG.md (for updates with generated changelogs)
		if (data.changelog) {
			const changelogPath = path.join(extensionRootFs, "CHANGELOG.md");
			const header = `# Changelog\n\nAll notable changes to the **${data.extensionName}** extension.\n\n`;
			fs.writeFileSync(changelogPath, header + data.changelog, "utf-8");
		}

		// 4) Preview image (optional but nice-to-have)
		const imageSource =
			this.previewImagePath || this.iconImagePath || this.generatedImagePath;
		if (!imageSource) {
			// For updates with no new image, download the existing preview from the catalog
			if (this.isUpdate && this.catalogMetadata) {
				const existingImageUrl = this.catalogMetadata.previewUrl || this.catalogMetadata.iconUrl;
				if (existingImageUrl) {
					const previewSvgPath = path.join(extensionRootFs, "preview.svg");
					if (!fs.existsSync(previewSvgPath)) {
						try {
							console.log(`[Extension Submission] Downloading existing preview from catalog: ${existingImageUrl}`);
							const response = await fetch(existingImageUrl);
							if (response.ok) {
								const content = await response.text();
								fs.writeFileSync(previewSvgPath, content, "utf-8");
								console.log(`[Extension Submission] Preserved existing preview image`);
							}
						} catch (downloadError) {
							console.warn("Failed to download existing preview image from catalog:", downloadError);
						}
					}
				}
			}
			return;
		}

		const previewSvgPath = path.join(extensionRootFs, "preview.svg");
		if (fs.existsSync(previewSvgPath)) {
			return;
		}

		try {
			if (imageSource.startsWith("data:")) {
				const commaIndex = imageSource.indexOf(",");
				const payload = commaIndex >= 0 ? imageSource.substring(commaIndex + 1) : imageSource;
				let svgContent = "";
				try {
					svgContent = decodeURIComponent(payload);
				} catch {
					svgContent = payload;
				}
				fs.writeFileSync(previewSvgPath, svgContent, "utf-8");
				return;
			}

			// Otherwise attempt to copy a file from disk. Try the path as-is first,
			// then fall back to treating it as vault-relative.
			const normalizedVaultBase = vaultBasePath.replace(/\\/g, "/");
			const candidates: string[] = [imageSource];
			const relative = imageSource.replace(/^\/+/, "");
			candidates.push(`${normalizedVaultBase}/${relative}`.replace(/\\/g, "/"));

			for (const candidate of candidates) {
				if (fs.existsSync(candidate)) {
					fs.copyFileSync(candidate, previewSvgPath);
					return;
				}
			}
		} catch (error) {
			console.warn("Failed to materialize preview image in temp folder:", error);
		}
	}
	
	/**
	 * Submits the extension via the GitHubSubmissionService.
	 *
	 * This method currently:
	 * - Derives the absolute extension folder path from the vault path
	 * - Initializes GitHubSubmissionService
	 * - Executes the submission workflow (validation + PR creation via tools)
	 * - Renders the success screen with the resulting PR URL
	 */
	private async submitExtension(): Promise<void> {
		this.submissionCancelled = false;
		const container = this.contentEl;
		container.empty();
		container.addClass("submission-progress-screen");

		const progressContainer = container.createDiv({ cls: "loading-container" });
		progressContainer.createEl("h2", {
			text: "Submitting Extension...",
			cls: "submission-progress-title",
		});
		// Remove the large top-level spinner in favor of per-step status
		// indicators in the runtime step list.
		const messageContainer = progressContainer.createDiv({ cls: "step-message-container" });

		// Define the high-level runtime steps so users can see
		// everything that will happen before submission starts.
		const stepDefinitions: { id: string; label: string }[] = [
			{ id: "prepare-temp", label: "Prepare temporary workspace" },
			{ id: "create-files", label: "Create manifest, README, and assets" },
			{ id: "init-service", label: "Initialize GitHub services" },
			{ id: "run-workflow", label: "Run GitHub workflow (fork, branch, PR)" },
			{ id: "finalize", label: "Finalize and clean up" },
		];

		const stepsContainer = progressContainer.createDiv({ cls: "submission-runtime-steps" });
		const stepMap = new Map<
			string,
			{ 
				row: HTMLDivElement; 
				icon: HTMLSpanElement; 
				label: HTMLSpanElement;
				subList: HTMLUListElement | null;
			}
		>();

		for (const def of stepDefinitions) {
			const row = stepsContainer.createDiv({ cls: "submission-runtime-step step-pending" });
			const header = row.createDiv({ cls: "step-header" });
			const icon = header.createSpan({ cls: "step-icon" });
			icon.setText("●");
			const label = header.createSpan({ cls: "step-label" });
			label.setText(def.label);
			stepMap.set(def.id, { row, icon, label, subList: null });
		}

		const setStepStatus = (
			id: string,
			status: "pending" | "in-progress" | "complete" | "error"
		): void => {
			const step = stepMap.get(id);
			if (!step) return;
			step.row.removeClass("step-pending");
			step.row.removeClass("step-in-progress");
			step.row.removeClass("step-complete");
			step.row.removeClass("step-error");
			step.row.addClass(`step-${status}`);
			if (status === "in-progress") {
				step.icon.setText("⏳");
			} else if (status === "complete") {
				step.icon.setText("✔");
			} else if (status === "error") {
				step.icon.setText("✖");
			} else {
				step.icon.setText("●");
			}
		};

		// Helper to log progress sub-items nested inside their parent step pill.
		// Each sub-item gets its own status icon that updates independently.
		const logProgress = (message: string, stepId?: string, status: "pending" | "in-progress" | "complete" | "error" = "complete"): void => {
			console.log("[Extension Submission]", message);
			if (!stepId) return;
			
			const step = stepMap.get(stepId);
			if (!step) return;
			
			if (!step.subList) {
				step.subList = step.row.createEl("ul", { cls: "step-sub-list" });
			}
			
			const item = step.subList.createEl("li", { cls: `step-sub-item step-sub-${status}` });
			const icon = item.createSpan({ cls: "step-sub-icon" });
			if (status === "pending") icon.setText("●");
			else if (status === "in-progress") icon.setText("⏳");
			else if (status === "complete") icon.setText("✔");
			else if (status === "error") icon.setText("✖");
			item.createSpan({ cls: "step-sub-text", text: message });
		};

		// Helper to log GitHub CLI commands as nested sub-items under the
		// "Run GitHub workflow" step. Each command is marked in-progress initially
		// and can be updated to complete/error later if needed.
		const logGhCommand = (command: string, _cwd?: string): void => {
			console.log("[Extension Submission][gh]", command);
			logProgress(command, "run-workflow", "in-progress");
		};

		// Action buttons (Cancel)
		const actionsContainer = progressContainer.createDiv({ cls: "submission-actions" });
		const cancelButton = new ButtonComponent(actionsContainer)
			.setButtonText("Cancel")
			.onClick(() => {
				if (this.submissionCancelled) {
					return;
				}
				this.submissionCancelled = true;
				cancelButton.setDisabled(true).setButtonText("Cancelled");
				showInlineMessage(
					messageContainer,
					"Submission cancelled. Any in-progress GitHub operations will finish in the background.",
					"warning"
				);
				if (this.activeSubmissionService) {
					void this.activeSubmissionService.abort().catch(() => {
						// best-effort only
					});
				}
				setStepStatus("run-workflow", "error");
				setStepStatus("finalize", "error");
			});

		// Ensure we have a plugin instance and desktop vault path
		if (!this.plugin) {
			showInlineMessage(
				messageContainer,
				"Extension submission requires the Vault Copilot plugin instance.",
				"error"
			);
			return;
		}

		const adapter: any = this.app.vault.adapter;
		const vaultBasePath: string | undefined =
			typeof adapter.getBasePath === "function"
				? adapter.getBasePath()
				: typeof adapter.basePath === "string"
					? adapter.basePath
					: undefined;

		if (!vaultBasePath) {
			showInlineMessage(
				messageContainer,
				"Extension submission is only supported for local vaults on desktop.",
				"error"
			);
			return;
		}

		const data = this.submissionData as ExtensionSubmissionData;
		const missingFields: string[] = [];
		if (!data.extensionPath) missingFields.push("Extension path");
		if (!data.extensionId) missingFields.push("Extension ID");
		if (!data.version) missingFields.push("Version");
		if (!data.extensionType) missingFields.push("Extension type");

		if (missingFields.length > 0) {
			const details = missingFields.join(", ");
			showInlineMessage(
				messageContainer,
				`Missing required extension details: ${details}. Please go back and complete all steps before submitting.`,
				"error"
			);
			console.warn("Extension submission blocked due to missing fields:", {
				missingFields,
				dataSnapshot: {
					extensionPath: data.extensionPath,
					extensionId: data.extensionId,
					version: data.version,
					extensionType: data.extensionType,
				},
			});
			return;
		}

		// Build absolute path to the extension directory on disk. Prefer the
		// temporary working folder created after the first screen, falling back
		// to the vault path only if for some reason the temp folder is missing.
		const normalizedVaultBase = vaultBasePath.replace(/\\/g, "/");
		const relativePath = data.extensionPath.replace(/^\/+/, "");
		const extensionPathFsFromVault = `${normalizedVaultBase}/${relativePath}`.replace(/\\/g, "/");
		const extensionRootFs = this.tempExtensionPathFs || extensionPathFsFromVault;
		setStepStatus("prepare-temp", "in-progress");
		logProgress(`Using working folder: ${extensionRootFs}`, "prepare-temp", "complete");

		// Ensure manifest/README/preview exist in the temp folder so the backend
		// validation logic has everything it needs to proceed.
		if (this.submissionCancelled) {
			return;
		}

		try {
			if (this.tempExtensionPathFs) {
				setStepStatus("prepare-temp", "complete");
				setStepStatus("create-files", "in-progress");
				logProgress(
					"Ensuring manifest.json exists",
					"create-files",
					"in-progress"
				);
				await this.ensureRequiredFilesInTempExtensionFolder(
					extensionRootFs,
					vaultBasePath,
					data
				);
				logProgress("manifest.json ready", "create-files", "complete");
				logProgress("README.md ready", "create-files", "complete");
				logProgress("Preview assets ready", "create-files", "complete");
				setStepStatus("create-files", "complete");
			}
		} catch (materializeError) {
			console.error("Failed to materialize extension files in temp folder:", materializeError);
			showInlineMessage(
				messageContainer,
				"Failed to prepare extension files in the temporary folder. See console for details.",
				"error"
			);
			setStepStatus("create-files", "error");
			setStepStatus("finalize", "error");
			return;
		}

		// Before invoking the GitHub workflow, validate that any existing
		// manifest.json in the working folder also respects the 200-character
		// description limit. This catches long descriptions authored directly
		// in manifest.json so users see the problem in the UI instead of only
		// via GitHub validation.
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const fs = require("fs") as typeof import("fs");
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const path = require("path") as typeof import("path");
			const manifestPathFs = path.join(extensionRootFs, "manifest.json");
			if (fs.existsSync(manifestPathFs)) {
				const raw = fs.readFileSync(manifestPathFs, "utf-8");
				const manifest = JSON.parse(raw) as { description?: unknown };
				if (typeof manifest.description === "string" && manifest.description.length > 200) {
					showInlineMessage(
						messageContainer,
						"Manifest description must be 200 characters or fewer. Please edit manifest.json before submitting.",
						"error"
					);
					setStepStatus("prepare-temp", "error");
					setStepStatus("finalize", "error");
					return;
				}
			}
		} catch (manifestCheckError) {
			console.warn("Failed to inspect manifest description before submission:", manifestCheckError);
		}

		const service = new GitHubSubmissionService({
			upstreamOwner: "danielshue",
			upstreamRepo: "vault-copilot-extensions",
			targetBranch: "main",
			forkOwner: data.githubUsername || undefined,
		});
		this.activeSubmissionService = service;
		service.setCommandLogger(logGhCommand);

		if (this.submissionCancelled) {
			return;
		}

		try {
			setStepStatus("init-service", "in-progress");
			logProgress(
				"Initializing Copilot client and tools",
				"init-service",
				"in-progress"
			);
			await service.initialize();
			logProgress("GitHub submission service initialized", "init-service", "complete");
			setStepStatus("init-service", "complete");

			setStepStatus("run-workflow", "in-progress");
			logProgress("Starting GitHub workflow", "run-workflow", "in-progress");
			const result = await service.submitExtension({
				extensionPath: extensionRootFs,
				extensionId: data.extensionId,
				extensionType: data.extensionType,
				version: data.version,
				branchName: data.branchName,
				commitMessage: undefined,
				prTitle: data.prTitle,
			});
			logProgress("GitHub workflow completed", "run-workflow", "complete");
			setStepStatus("run-workflow", "complete");

			await service.cleanup();

			if (result.success && result.pullRequestUrl) {
				setStepStatus("finalize", "in-progress");
				logProgress("Pull request created successfully", "finalize", "complete");
				// Best-effort cleanup: remove generated preview assets from the vault so
				// preview.svg/png only persist in the temporary PR repository.
				try {
					const abstractFile = this.app.vault.getAbstractFileByPath(data.extensionPath);
					let folderPath: string | null = null;

					if (abstractFile && (abstractFile as any).parent) {
						folderPath = (abstractFile as any).parent.path ?? null;
					} else {
						folderPath = data.extensionPath;
					}

					if (folderPath) {
						const adapter = this.app.vault.adapter;
						const svgPath = `${folderPath}/preview.svg`;
						const pngPath = `${folderPath}/preview.png`;

						if (await adapter.exists(svgPath)) {
							await adapter.remove(svgPath);
						}
						if (await adapter.exists(pngPath)) {
							await adapter.remove(pngPath);
						}
					}
				} catch (cleanupError) {
					console.warn("Failed to clean up preview assets from vault:", cleanupError);
				}

				// Show success screen with actual PR URL from the service
				renderSuccessScreen(this.contentEl, result.pullRequestUrl, () => {
					if (this.resolve) {
						this.resolve(data);
						this.resolve = null;
					}
					this.close();
				});
				setStepStatus("finalize", "complete");
			} else {
				console.error("Extension submission failed:", result);
				const parts: string[] = [];
				if (result.error) {
					parts.push(result.error);
				}
				if (result.validationErrors && result.validationErrors.length) {
					parts.push(result.validationErrors.join("; "));
				}
				// For details, avoid dumping the full AI plan text into the UI.
				// Instead, detect common environment/CLI issues and provide a concise,
				// actionable summary while keeping the full object in the console.
				if (result.details) {
					try {
						const rawDetails =
							typeof result.details === "string"
								? result.details
								: JSON.stringify(result.details);

						let summarizedDetails: string | undefined;
						if (/environment restrictions|cannot run github operations|can't run github operations/i.test(rawDetails)) {
							summarizedDetails =
								"The automated GitHub workflow could not run in this environment (likely due to GitHub CLI or network restrictions). You can still submit the extension by using your normal git/GitHub workflow.";
						} else if (rawDetails.length <= 300) {
							summarizedDetails = rawDetails;
						} else {
							summarizedDetails = `${rawDetails.slice(0, 300)}…`;
						}

						if (summarizedDetails) {
							parts.push(summarizedDetails);
						}
					} catch {
						// ignore JSON stringify errors
					}
				}

				const errorMessage =
					parts.length > 0
						? `Extension submission failed: ${parts.join(" | ")}`
						: "Extension submission failed. Check the console for details.";
				showInlineMessage(messageContainer, errorMessage, "error");
				setStepStatus("run-workflow", "error");
				setStepStatus("finalize", "error");
			}
		} catch (error) {
			console.error("Extension submission threw:", error);
			let details: string;
			if (error instanceof Error) {
				details = error.message;
			} else if (typeof error === "string") {
				details = error;
			} else {
				try {
					details = JSON.stringify(error);
				} catch {
					details = String(error);
				}
			}
			showInlineMessage(
				messageContainer,
				`Extension submission failed: ${details}`,
				"error"
			);
			setStepStatus("run-workflow", "error");
			setStepStatus("finalize", "error");
		} finally {
			// Best-effort cleanup if initialization partially succeeded
			try {
				await service.cleanup();
			} catch {
				// ignore
			}
		}
	}
}
