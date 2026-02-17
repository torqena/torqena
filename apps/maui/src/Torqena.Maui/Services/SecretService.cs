/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module SecretService
 * @description Secure storage implementation using MAUI SecureStorage API.
 * Maintains an index of known secret keys in Preferences since SecureStorage
 * does not natively support listing keys.
 *
 * @since 0.1.0
 */

using System.Text.Json;

namespace Torqena.Maui.Services;

/// <summary>
/// Secure storage service backed by MAUI <see cref="SecureStorage"/>.
/// </summary>
public class SecretService : ISecretService
{
    private const string SecretKeysIndex = "torqena_secret_keys";

    /// <inheritdoc />
    public async Task SaveSecretAsync(string key, string value)
    {
        await SecureStorage.SetAsync(key, value);
        await AddKeyToIndex(key);
    }

    /// <inheritdoc />
    public async Task<string?> LoadSecretAsync(string key)
    {
        return await SecureStorage.GetAsync(key);
    }

    /// <inheritdoc />
    public async Task<bool> DeleteSecretAsync(string key)
    {
        var existed = await SecureStorage.GetAsync(key) is not null;
        var removed = SecureStorage.Remove(key);
        await RemoveKeyFromIndex(key);
        return existed || removed;
    }

    /// <inheritdoc />
    public Task<string[]> ListSecretsAsync()
    {
        var keys = GetKeyIndex();
        return Task.FromResult(keys);
    }

    /// <inheritdoc />
    public Task<bool> IsAvailableAsync()
    {
        try
        {
            // Test by reading a known-absent key
            _ = Preferences.ContainsKey(SecretKeysIndex);
            return Task.FromResult(true);
        }
        catch
        {
            return Task.FromResult(false);
        }
    }

    /// <summary>
    /// Adds a key to the secret keys index.
    /// </summary>
    /// <param name="key">The secret key to track.</param>
    /// <internal />
    private Task AddKeyToIndex(string key)
    {
        var keys = new HashSet<string>(GetKeyIndex()) { key };
        Preferences.Set(SecretKeysIndex, JsonSerializer.Serialize(keys));
        return Task.CompletedTask;
    }

    /// <summary>
    /// Removes a key from the secret keys index.
    /// </summary>
    /// <param name="key">The secret key to remove from tracking.</param>
    /// <internal />
    private Task RemoveKeyFromIndex(string key)
    {
        var keys = new HashSet<string>(GetKeyIndex());
        keys.Remove(key);
        Preferences.Set(SecretKeysIndex, JsonSerializer.Serialize(keys));
        return Task.CompletedTask;
    }

    /// <summary>
    /// Gets the current set of tracked secret keys.
    /// </summary>
    /// <returns>Array of secret key names.</returns>
    /// <internal />
    private string[] GetKeyIndex()
    {
        var json = Preferences.Get(SecretKeysIndex, "[]");
        try
        {
            return JsonSerializer.Deserialize<string[]>(json) ?? [];
        }
        catch
        {
            return [];
        }
    }
}
