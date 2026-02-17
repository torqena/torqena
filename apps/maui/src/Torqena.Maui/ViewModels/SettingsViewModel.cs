/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module SettingsViewModel
 * @description View model for the settings page.
 * Exposes application settings for binding and handles API key management.
 *
 * @since 0.1.0
 */

using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Torqena.Core.AI.Providers;
using Torqena.Maui.Services;

namespace Torqena.Maui.ViewModels;

/// <summary>
/// View model for the settings page. Wraps <see cref="SettingsService"/>
/// properties and manages secure API key storage.
/// </summary>
public partial class SettingsViewModel : ObservableObject
{
    private readonly SettingsService _settings;
    private readonly ISecretService _secrets;

    /// <summary>
    /// Gets the underlying settings service for direct binding.
    /// </summary>
    public SettingsService Settings { get; }

    /// <summary>
    /// List of available AI providers.
    /// </summary>
    public IReadOnlyList<string> AvailableProviders { get; }
        = AIProviderFactory.GetSupportedProviders();

    /// <summary>
    /// List of available models for the selected provider.
    /// </summary>
    [ObservableProperty]
    public partial IReadOnlyList<string> AvailableModels { get; set; } = [];

    /// <summary>
    /// Masked API key display (e.g. "sk-...abc").
    /// </summary>
    [ObservableProperty]
    public partial string ApiKeyDisplay { get; set; } = "Not set";

    /// <summary>
    /// API key input field text (not persisted until saved).
    /// </summary>
    [ObservableProperty]
    public partial string ApiKeyInput { get; set; } = "";

    /// <summary>
    /// Azure OpenAI endpoint input.
    /// </summary>
    [ObservableProperty]
    public partial string AzureEndpoint { get; set; } = "";

    /// <summary>
    /// Status message shown after saving.
    /// </summary>
    [ObservableProperty]
    public partial string SaveStatus { get; set; } = "";

    /// <summary>
    /// Initializes the settings view model.
    /// </summary>
    /// <param name="settings">Application settings service.</param>
    /// <param name="secrets">Secure secret storage.</param>
    public SettingsViewModel(SettingsService settings, ISecretService secrets)
    {
        _settings = settings;
        _secrets = secrets;
        Settings = settings;

        RefreshModels();
        _settings.SettingChanged += OnSettingChanged;
    }

    /// <summary>
    /// Loads the current API key display and Azure endpoint on page navigation.
    /// </summary>
    [RelayCommand]
    public async Task LoadSecretsAsync()
    {
        var provider = _settings.AIProvider;
        var key = await _secrets.LoadSecretAsync($"{provider}-api-key");
        ApiKeyDisplay = MaskKey(key);

        if (provider == "azure-openai")
        {
            var endpoint = await _secrets.LoadSecretAsync("azure-openai-endpoint");
            AzureEndpoint = endpoint ?? "";
        }
    }

    /// <summary>
    /// Saves the API key to secure storage.
    /// </summary>
    [RelayCommand]
    private async Task SaveApiKeyAsync()
    {
        if (string.IsNullOrWhiteSpace(ApiKeyInput)) return;

        var provider = _settings.AIProvider;
        await _secrets.SaveSecretAsync($"{provider}-api-key", ApiKeyInput.Trim());
        ApiKeyDisplay = MaskKey(ApiKeyInput.Trim());
        ApiKeyInput = "";
        SaveStatus = "API key saved securely.";

        // Save Azure endpoint if applicable
        if (provider == "azure-openai" && !string.IsNullOrWhiteSpace(AzureEndpoint))
        {
            await _secrets.SaveSecretAsync("azure-openai-endpoint", AzureEndpoint.Trim());
        }
    }

    /// <summary>
    /// Deletes the API key from secure storage.
    /// </summary>
    [RelayCommand]
    private async Task DeleteApiKeyAsync()
    {
        var provider = _settings.AIProvider;
        await _secrets.DeleteSecretAsync($"{provider}-api-key");
        ApiKeyDisplay = "Not set";
        SaveStatus = "API key removed.";
    }

    /// <internal />
    private void RefreshModels()
    {
        AvailableModels = AIProviderFactory.GetModelsForProvider(_settings.AIProvider);
    }

    /// <internal />
    private void OnSettingChanged(string key, object? value)
    {
        if (key == nameof(SettingsService.AIProvider))
        {
            RefreshModels();
            _ = LoadSecretsAsync();
        }
    }

    /// <internal />
    private static string MaskKey(string? key)
    {
        if (string.IsNullOrEmpty(key)) return "Not set";
        if (key.Length <= 8) return "****";
        return $"{key[..4]}...{key[^4..]}";
    }
}
