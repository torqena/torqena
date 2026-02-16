/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module RatingModal
 * @description Obsidian Modal for submitting or editing 1–5 star ratings with optional
 * comments for Torqena extensions.
 *
 * Features:
 * - Interactive star-rating widget (1–5) with hover preview
 * - Fully keyboard-accessible (arrow keys, Enter, Tab)
 * - ARIA attributes for screen readers (`radiogroup` / `radio`)
 * - Optional free-text comment with 500-character limit and live counter
 * - Edit mode when an existing rating is provided
 * - Async submission via {@link ExtensionAnalyticsService.submitRating}
 *
 * @example
 * ```typescript
 * import { RatingModal } from './ui/extensions/RatingModal';
 *
 * RatingModal.show({
 *   app,
 *   extensionId: 'my-extension',
 *   extensionName: 'My Extension',
 *   extensionVersion: '1.2.0',
 *   userHash: 'abc123',
 *   analyticsService,
 *   onRatingSubmitted: (rating, comment) => {
 *     console.log('Submitted', rating, comment);
 *   },
 * });
 * ```
 *
 * @see {@link ExtensionAnalyticsService} for the backend submission API
 * @since 0.1.0
 */

import { App, Modal, Setting } from "obsidian";
import type { ExtensionAnalyticsService, RatingResponse } from "../../extensions/ExtensionAnalyticsService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of a rating submission payload accepted by the analytics service.
 *
 * @see {@link ExtensionAnalyticsService.submitRating}
 */
export interface RatingSubmission {
    /** Unique extension identifier */
    extensionId: string;
    /** Star rating between 1 and 5 */
    rating: 1 | 2 | 3 | 4 | 5;
    /** Anonymised user identifier */
    userHash: string;
    /** Optional free-text comment */
    comment?: string;
    /** Extension version being rated */
    version?: string;
}

/**
 * Configuration object for creating a {@link RatingModal}.
 */
export interface RatingModalConfig {
    /** Obsidian application instance */
    app: App;
    /** Unique identifier of the extension being rated */
    extensionId: string;
    /** Human-readable extension name */
    extensionName: string;
    /** SemVer version string of the extension */
    extensionVersion: string;
    /** Anonymised hash identifying the current user */
    userHash: string;
    /** Analytics service used to persist the rating */
    analyticsService: ExtensionAnalyticsService;
    /** Pre-fill for editing an existing rating (1–5) */
    existingRating?: number;
    /** Pre-fill for editing an existing comment */
    existingComment?: string;
    /** Callback invoked after a successful submission */
    onRatingSubmitted?: (rating: number, comment: string | undefined, response: RatingResponse) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Human-readable labels for each star value */
const RATING_LABELS: Record<number, string> = {
    1: "Poor",
    2: "Fair",
    3: "Good",
    4: "Very Good",
    5: "Excellent",
};

/** Maximum character count for the comment field */
const MAX_COMMENT_LENGTH = 500;

/** Unicode characters for star glyphs */
const STAR_EMPTY = "☆";
const STAR_FILLED = "★";

// ---------------------------------------------------------------------------
// RatingModal
// ---------------------------------------------------------------------------

/**
 * Interactive Obsidian Modal that lets users submit or update a 1–5 star
 * rating with an optional comment for a Torqena extension.
 *
 * @example
 * ```typescript
 * const modal = RatingModal.show({
 *   app,
 *   extensionId: 'my-ext',
 *   extensionName: 'My Extension',
 *   extensionVersion: '1.0.0',
 *   userHash: 'hash',
 *   analyticsService,
 * });
 * ```
 *
 * @since 0.1.0
 */
export class RatingModal extends Modal {
    // -- configuration ------------------------------------------------------
    private readonly config: RatingModalConfig;

    // -- state --------------------------------------------------------------
    /** Currently selected rating (0 = none selected) */
    private selectedRating = 0;
    /** Rating highlighted during hover / keyboard navigation (0 = none) */
    private hoveredRating = 0;
    /** `true` while the submission request is in-flight */
    private submitting = false;

    // -- DOM refs -----------------------------------------------------------
    private starElements: HTMLSpanElement[] = [];
    private ratingLabelEl!: HTMLSpanElement;
    private commentEl!: HTMLTextAreaElement;
    private charCounterEl!: HTMLSpanElement;
    private submitBtnEl!: HTMLButtonElement;

    // -----------------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------------

    /**
     * Create a new RatingModal.
     *
     * @param config - Full configuration including app instance, extension
     *   metadata, analytics service, and optional pre-filled values.
     *
     * @internal Prefer {@link RatingModal.show} for typical usage.
     */
    constructor(config: RatingModalConfig) {
        super(config.app);
        this.config = config;

        // Pre-fill when editing an existing rating
        if (config.existingRating && config.existingRating >= 1 && config.existingRating <= 5) {
            this.selectedRating = Math.round(config.existingRating);
        }
    }

    // -----------------------------------------------------------------------
    // Static factory
    // -----------------------------------------------------------------------

    /**
     * Create, open, and return a {@link RatingModal} in a single call.
     *
     * @param config - Modal configuration.
     * @returns The opened modal instance.
     *
     * @example
     * ```typescript
     * RatingModal.show({
     *   app,
     *   extensionId: 'hello-world',
     *   extensionName: 'Hello World',
     *   extensionVersion: '0.1.0',
     *   userHash: 'u123',
     *   analyticsService,
     * });
     * ```
     */
    static show(config: RatingModalConfig): RatingModal {
        const modal = new RatingModal(config);
        modal.open();
        return modal;
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    /**
     * Build the modal UI when Obsidian opens the modal.
     *
     * @internal Called automatically by Obsidian.
     */
    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("vc-rating-modal");

        this.buildHeader(contentEl);
        this.buildExtensionInfo(contentEl);
        this.buildPrompt(contentEl);
        this.buildStarRating(contentEl);
        this.buildCommentArea(contentEl);
        this.buildActions(contentEl);

        // Reflect pre-filled state
        this.renderStars();
        this.updateSubmitButton();
    }

    /**
     * Clean up when the modal is closed.
     *
     * @internal Called automatically by Obsidian.
     */
    onClose(): void {
        this.contentEl.empty();
        this.starElements = [];
    }

    // -----------------------------------------------------------------------
    // UI builders
    // -----------------------------------------------------------------------

    /**
     * Render the modal header (title + description).
     *
     * @param containerEl - Parent element.
     * @internal
     */
    private buildHeader(containerEl: HTMLElement): void {
        const headerEl = containerEl.createDiv({ cls: "vc-rating-header" });
        headerEl.createEl("h2", {
            text: this.isEditing() ? "Update Rating" : "Rate Extension",
            cls: "vc-rating-title",
        });
    }

    /**
     * Render the extension name and version badge.
     *
     * @param containerEl - Parent element.
     * @internal
     */
    private buildExtensionInfo(containerEl: HTMLElement): void {
        const infoEl = containerEl.createDiv({ cls: "vc-rating-extension-info" });
        infoEl.createSpan({
            text: this.config.extensionName,
            cls: "vc-rating-extension-name",
        });
        infoEl.createSpan({ text: " " });
        infoEl.createSpan({
            text: `v${this.config.extensionVersion}`,
            cls: "vc-rating-extension-version",
        });
    }

    /**
     * Render the prompt text.
     *
     * @param containerEl - Parent element.
     * @internal
     */
    private buildPrompt(containerEl: HTMLElement): void {
        containerEl.createEl("p", {
            text: "How would you rate this extension?",
            cls: "vc-rating-prompt",
        });
    }

    /**
     * Build the interactive star-rating widget.
     *
     * The container uses `role="radiogroup"` and each star acts as a
     * `role="radio"` element, making the widget keyboard- and
     * screen-reader-accessible.
     *
     * @param containerEl - Parent element.
     * @internal
     */
    private buildStarRating(containerEl: HTMLElement): void {
        const wrapper = containerEl.createDiv({ cls: "vc-rating-stars-wrapper" });

        const starsContainer = wrapper.createDiv({ cls: "vc-rating-stars" });
        starsContainer.setAttribute("role", "radiogroup");
        starsContainer.setAttribute("aria-label", "Extension rating from 1 to 5 stars");
        starsContainer.tabIndex = 0;

        // Build five star elements
        for (let i = 1; i <= 5; i++) {
            const star = starsContainer.createSpan({
                text: STAR_EMPTY,
                cls: "vc-rating-star",
            });
            star.setAttribute("role", "radio");
            star.setAttribute("aria-checked", String(this.selectedRating === i));
            star.setAttribute("aria-label", `${i} star${i > 1 ? "s" : ""} – ${RATING_LABELS[i]}`);
            star.tabIndex = -1;
            star.dataset.value = String(i);

            // Mouse events
            star.addEventListener("mouseenter", () => this.handleStarHover(i));
            star.addEventListener("mouseleave", () => this.handleStarHoverEnd());
            star.addEventListener("click", () => this.handleStarSelect(i));

            this.starElements.push(star);
        }

        // Keyboard navigation on the container
        starsContainer.addEventListener("keydown", (e: KeyboardEvent) => this.handleStarKeyboard(e));

        // Rating label (e.g. "Good")
        this.ratingLabelEl = wrapper.createSpan({ cls: "vc-rating-label" });
    }

    /**
     * Build the optional comment textarea with character counter.
     *
     * @param containerEl - Parent element.
     * @internal
     */
    private buildCommentArea(containerEl: HTMLElement): void {
        const commentWrapper = containerEl.createDiv({ cls: "vc-rating-comment-wrapper" });

        this.commentEl = commentWrapper.createEl("textarea", {
            cls: "vc-rating-comment",
            attr: {
                placeholder: "Share your experience (optional)",
                maxlength: String(MAX_COMMENT_LENGTH),
                rows: "6",
                "aria-label": "Rating comment",
            },
        });

        // Pre-fill existing comment
        if (this.config.existingComment) {
            this.commentEl.value = this.config.existingComment;
        }

        this.charCounterEl = commentWrapper.createSpan({ cls: "vc-rating-char-counter" });
        this.updateCharCounter();

        this.commentEl.addEventListener("input", () => this.updateCharCounter());
    }

    /**
     * Build the action buttons (Submit / Cancel / Remove).
     *
     * @param containerEl - Parent element.
     * @internal
     */
    private buildActions(containerEl: HTMLElement): void {
        const actionsEl = containerEl.createDiv({ cls: "vc-rating-actions" });

        // Submit button
        this.submitBtnEl = actionsEl.createEl("button", {
            text: this.isEditing() ? "Update Rating" : "Submit Rating",
            cls: "vc-rating-submit mod-cta",
        });
        this.submitBtnEl.addEventListener("click", () => this.handleSubmit());

        // Cancel button
        const cancelBtn = actionsEl.createEl("button", {
            text: "Cancel",
            cls: "vc-rating-cancel",
        });
        cancelBtn.addEventListener("click", () => this.close());

        // Remove button (only shown when editing)
        if (this.isEditing()) {
            const removeBtn = actionsEl.createEl("button", {
                text: "Remove Rating",
                cls: "vc-rating-remove mod-warning",
            });
            removeBtn.addEventListener("click", () => this.handleRemove());
        }
    }

    // -----------------------------------------------------------------------
    // Star interaction handlers
    // -----------------------------------------------------------------------

    /**
     * Highlight stars up to the hovered position.
     *
     * @param value - Star position being hovered (1–5).
     * @internal
     */
    private handleStarHover(value: number): void {
        this.hoveredRating = value;
        this.renderStars();
    }

    /**
     * Reset hover state when the cursor leaves a star.
     *
     * @internal
     */
    private handleStarHoverEnd(): void {
        this.hoveredRating = 0;
        this.renderStars();
    }

    /**
     * Commit a star selection on click.
     *
     * @param value - Star position clicked (1–5).
     * @internal
     */
    private handleStarSelect(value: number): void {
        this.selectedRating = value;
        this.hoveredRating = 0;
        this.renderStars();
        this.updateSubmitButton();
    }

    /**
     * Handle keyboard navigation inside the star container.
     *
     * - **ArrowRight / ArrowUp**: Increase rating.
     * - **ArrowLeft / ArrowDown**: Decrease rating.
     * - **Enter / Space**: Confirm current selection.
     *
     * @param e - Keyboard event.
     * @internal
     */
    private handleStarKeyboard(e: KeyboardEvent): void {
        let newRating = this.selectedRating;

        switch (e.key) {
            case "ArrowRight":
            case "ArrowUp":
                e.preventDefault();
                newRating = Math.min(5, (this.selectedRating || 0) + 1);
                break;
            case "ArrowLeft":
            case "ArrowDown":
                e.preventDefault();
                newRating = Math.max(1, (this.selectedRating || 2) - 1);
                break;
            case "Enter":
            case " ":
                e.preventDefault();
                if (this.selectedRating > 0) {
                    this.handleSubmit();
                }
                return;
            default:
                return;
        }

        this.handleStarSelect(newRating);
        // Move focus to the newly selected star
        this.starElements[newRating - 1]?.focus();
    }

    // -----------------------------------------------------------------------
    // Rendering helpers
    // -----------------------------------------------------------------------

    /**
     * Redraw stars to reflect the current selected / hovered rating.
     *
     * Filled stars are shown up to whichever value is higher between
     * {@link hoveredRating} and {@link selectedRating}. When hovering, the
     * hover value takes precedence so the user sees a preview.
     *
     * @internal
     */
    private renderStars(): void {
        const displayRating = this.hoveredRating || this.selectedRating;

        for (let i = 0; i < this.starElements.length; i++) {
            const star = this.starElements[i];
            if (!star) continue;
            const value = i + 1;
            const filled = value <= displayRating;

            star.textContent = filled ? STAR_FILLED : STAR_EMPTY;
            star.toggleClass("vc-rating-star--filled", filled);
            star.toggleClass("vc-rating-star--hover", this.hoveredRating > 0 && value <= this.hoveredRating);
            star.setAttribute("aria-checked", String(this.selectedRating === value));
            star.tabIndex = this.selectedRating === value ? 0 : -1;
        }

        // Update the label
        if (displayRating > 0 && displayRating <= 5) {
            this.ratingLabelEl.textContent = RATING_LABELS[displayRating] ?? "";
            this.ratingLabelEl.removeClass("vc-rating-label--hidden");
        } else {
            this.ratingLabelEl.textContent = "";
            this.ratingLabelEl.addClass("vc-rating-label--hidden");
        }
    }

    /**
     * Update the character counter beneath the comment textarea.
     *
     * @internal
     */
    private updateCharCounter(): void {
        const length = this.commentEl?.value?.length ?? 0;
        this.charCounterEl.textContent = `${length} / ${MAX_COMMENT_LENGTH}`;
        this.charCounterEl.toggleClass("vc-rating-char-counter--limit", length >= MAX_COMMENT_LENGTH);
    }

    /**
     * Enable or disable the submit button depending on whether a rating
     * has been selected and whether a submission is already in progress.
     *
     * @internal
     */
    private updateSubmitButton(): void {
        if (!this.submitBtnEl) return;
        this.submitBtnEl.disabled = this.selectedRating === 0 || this.submitting;
    }

    // -----------------------------------------------------------------------
    // Submission
    // -----------------------------------------------------------------------

    /**
     * Validate input, send the rating to the analytics service, and handle
     * success / error states.
     *
     * @internal
     */
    private async handleSubmit(): Promise<void> {
        if (this.selectedRating < 1 || this.selectedRating > 5 || this.submitting) {
            return;
        }

        this.submitting = true;
        this.submitBtnEl.textContent = "Submitting...";
        this.updateSubmitButton();

        const comment = this.commentEl.value.trim() || undefined;

        try {
            const response = await this.config.analyticsService.submitRating({
                extensionId: this.config.extensionId,
                rating: this.selectedRating as 1 | 2 | 3 | 4 | 5,
                userHash: this.config.userHash,
                comment,
                version: this.config.extensionVersion,
            });

            this.config.onRatingSubmitted?.(this.selectedRating, comment, response);
            this.close();
        } catch (err) {
            console.error('[RatingModal] Failed to submit rating:', err);
            console.error(`Failed to submit rating: ${err instanceof Error ? err.message : 'Unknown error'}`);
            this.submitting = false;
            this.submitBtnEl.textContent = this.isEditing() ? "Update Rating" : "Submit Rating";
            this.updateSubmitButton();
        }
    }

    /**
     * Handle removing an existing rating.
     *
     * Prompts for confirmation, then calls the analytics service to delete
     * the rating from the backend.
     *
     * @internal
     */
    private async handleRemove(): Promise<void> {
        if (!this.isEditing() || this.submitting) {
            return;
        }

        // Confirm deletion
        const confirmed = confirm(
            `Are you sure you want to remove your rating for "${this.config.extensionName}"? This action cannot be undone.`
        );

        if (!confirmed) {
            return;
        }

        this.submitting = true;
        this.submitBtnEl.textContent = "Removing...";
        this.submitBtnEl.disabled = true;

        try {
            const { averageRating, ratingCount } = await this.config.analyticsService.deleteRating(
                this.config.extensionId,
                this.config.userHash
            );

            this.config.onRatingSubmitted?.(0, undefined, {
                success: true,
                message: "Rating removed",
                aggregateRating: averageRating,
                ratingCount: ratingCount,
            });
            this.close();
        } catch (err) {
            console.error('[RatingModal] Failed to remove rating:', err);
            console.error(`Failed to remove rating: ${err instanceof Error ? err.message : 'Unknown error'}`);
            this.submitting = false;
            this.submitBtnEl.textContent = "Update Rating";
            this.submitBtnEl.disabled = false;
        }
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------

    /**
     * Return `true` when the modal was opened with a pre-existing rating
     * (i.e. editing mode).
     *
     * @returns Whether the user is editing an existing rating.
     * @internal
     */
    private isEditing(): boolean {
        return (
            this.config.existingRating !== undefined &&
            this.config.existingRating >= 1 &&
            this.config.existingRating <= 5
        );
    }
}
