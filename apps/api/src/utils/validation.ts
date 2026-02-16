/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Validation
 * @description Input validation utilities for the analytics API.
 *
 * Provides functions to validate extension IDs, user hashes, ratings,
 * semantic versions, and platform identifiers before they reach storage.
 *
 * @since 1.0.0
 */

/** Result of a validation check. */
export interface ValidationResult {
    /** Whether the value passed validation. */
    valid: boolean;
    /** Human-readable error message when `valid` is false. */
    error?: string;
}

/**
 * Validate an extension identifier.
 *
 * Must be 1-100 characters consisting of alphanumeric characters, hyphens,
 * underscores, and dots.
 *
 * @param id - The extension identifier to validate.
 * @returns A {@link ValidationResult} indicating success or the reason for failure.
 *
 * @example
 * ```typescript
 * const result = validateExtensionId("my-cool-extension");
 * // { valid: true }
 * ```
 */
export function validateExtensionId(id: unknown): ValidationResult {
    if (typeof id !== "string" || id.length === 0) {
        return { valid: false, error: "extensionId is required and must be a string" };
    }
    if (id.length > 100) {
        return { valid: false, error: "extensionId must be 100 characters or fewer" };
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
        return { valid: false, error: "extensionId must contain only alphanumeric characters, hyphens, underscores, and dots" };
    }
    return { valid: true };
}

/**
 * Validate a user hash.
 *
 * Must be a 64-character lowercase hexadecimal string (SHA-256 digest).
 *
 * @param hash - The user hash to validate.
 * @returns A {@link ValidationResult}.
 *
 * @example
 * ```typescript
 * const result = validateUserHash("a".repeat(64));
 * // { valid: true }
 * ```
 */
export function validateUserHash(hash: unknown): ValidationResult {
    if (typeof hash !== "string" || hash.length === 0) {
        return { valid: false, error: "userHash is required and must be a string" };
    }
    if (!/^[a-f0-9]{64}$/.test(hash)) {
        return { valid: false, error: "userHash must be a 64-character lowercase hex string (SHA-256)" };
    }
    return { valid: true };
}

/**
 * Validate a rating value.
 *
 * Must be an integer between 1 and 5 inclusive.
 *
 * @param rating - The rating value to validate.
 * @returns A {@link ValidationResult}.
 *
 * @example
 * ```typescript
 * const result = validateRating(4);
 * // { valid: true }
 * ```
 */
export function validateRating(rating: unknown): ValidationResult {
    if (rating === undefined || rating === null) {
        return { valid: false, error: "rating is required" };
    }
    const num = Number(rating);
    if (!Number.isInteger(num) || num < 1 || num > 5) {
        return { valid: false, error: "rating must be an integer between 1 and 5" };
    }
    return { valid: true };
}

/**
 * Validate a semantic version string.
 *
 * Accepts versions like `1.0.0`, `0.1.0-beta.1`, etc.
 *
 * @param version - The version string to validate.
 * @returns A {@link ValidationResult}.
 *
 * @example
 * ```typescript
 * const result = validateVersion("1.2.3");
 * // { valid: true }
 * ```
 */
export function validateVersion(version: unknown): ValidationResult {
    if (typeof version !== "string" || version.length === 0) {
        return { valid: false, error: "version is required and must be a string" };
    }
    if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)) {
        return { valid: false, error: "version must be a valid semver string (e.g., 1.0.0)" };
    }
    return { valid: true };
}

/**
 * Validate a platform identifier.
 *
 * Must be either `"desktop"` or `"mobile"`.
 *
 * @param platform - The platform string to validate.
 * @returns A {@link ValidationResult}.
 *
 * @example
 * ```typescript
 * const result = validatePlatform("desktop");
 * // { valid: true }
 * ```
 */
export function validatePlatform(platform: unknown): ValidationResult {
    if (typeof platform !== "string" || platform.length === 0) {
        return { valid: false, error: "platform is required and must be a string" };
    }
    if (platform !== "desktop" && platform !== "mobile") {
        return { valid: false, error: 'platform must be "desktop" or "mobile"' };
    }
    return { valid: true };
}
