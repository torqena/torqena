/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ISecretService
 * @description Abstraction for secure credential storage across platforms.
 * Uses MAUI SecureStorage (Keychain on Apple, Keystore on Android, DPAPI on Windows).
 *
 * @since 0.1.0
 */

namespace Torqena.Maui.Services;

/// <summary>
/// Secure storage service for API keys and sensitive credentials.
/// Backed by platform-specific secure storage (Keychain, Keystore, DPAPI).
/// </summary>
public interface ISecretService
{
    /// <summary>
    /// Saves a secret value under the given key, encrypted at rest.
    /// </summary>
    /// <param name="key">Secret identifier.</param>
    /// <param name="value">Secret value to store.</param>
    Task SaveSecretAsync(string key, string value);

    /// <summary>
    /// Loads a secret value by key.
    /// </summary>
    /// <param name="key">Secret identifier.</param>
    /// <returns>The secret value, or null if not found.</returns>
    Task<string?> LoadSecretAsync(string key);

    /// <summary>
    /// Deletes a secret by key.
    /// </summary>
    /// <param name="key">Secret identifier.</param>
    /// <returns>True if the secret was deleted, false if it didn't exist.</returns>
    Task<bool> DeleteSecretAsync(string key);

    /// <summary>
    /// Lists all stored secret keys (no values exposed).
    /// </summary>
    /// <returns>Array of secret key names.</returns>
    Task<string[]> ListSecretsAsync();

    /// <summary>
    /// Checks whether secure storage is available on this platform.
    /// </summary>
    /// <returns>True if secure storage can be used.</returns>
    Task<bool> IsAvailableAsync();
}
