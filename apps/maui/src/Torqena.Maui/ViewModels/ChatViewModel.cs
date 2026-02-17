/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ChatViewModel
 * @description View model for the AI chat panel.
 * Manages conversation sessions, message history, streaming responses,
 * and tool execution.
 *
 * @since 0.1.0
 */

using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Torqena.Core.AI.Providers;
using Torqena.Maui.Services;

namespace Torqena.Maui.ViewModels;

/// <summary>
/// Represents a single message in the chat conversation.
/// </summary>
public partial class ChatMessageItem : ObservableObject
{
    /// <summary>
    /// Message role: user, assistant, system, or tool.
    /// </summary>
    public string Role { get; init; } = "user";

    /// <summary>
    /// Display name for the message sender.
    /// </summary>
    public string SenderName => Role switch
    {
        "user" => "You",
        "assistant" => "Torqena",
        "system" => "System",
        _ => Role
    };

    /// <summary>
    /// Message content (plain text or markdown).
    /// </summary>
    [ObservableProperty]
    public partial string Content { get; set; } = "";

    /// <summary>
    /// Timestamp when the message was sent.
    /// </summary>
    public DateTime Timestamp { get; init; } = DateTime.Now;

    /// <summary>
    /// Whether this message is currently being streamed.
    /// </summary>
    [ObservableProperty]
    public partial bool IsStreaming { get; set; }

    /// <summary>
    /// Whether this message encountered an error.
    /// </summary>
    [ObservableProperty]
    public partial bool IsError { get; set; }
}

/// <summary>
/// View model for the AI chat panel. Handles message sending, streaming,
/// and provider management.
/// </summary>
public partial class ChatViewModel : ObservableObject
{
    private readonly AIProviderFactory _providerFactory;
    private readonly SettingsService _settings;
    private readonly ISecretService _secrets;
    private IAIProvider? _provider;

    /// <summary>
    /// Chat message history displayed in the UI.
    /// </summary>
    public ObservableCollection<ChatMessageItem> Messages { get; } = [];

    /// <summary>
    /// Current text in the input field.
    /// </summary>
    [ObservableProperty]
    public partial string InputText { get; set; } = "";

    /// <summary>
    /// Whether a message is currently being sent/streamed.
    /// </summary>
    [ObservableProperty]
    public partial bool IsSending { get; set; }

    /// <summary>
    /// Whether the AI provider is initialized and ready.
    /// </summary>
    [ObservableProperty]
    public partial bool IsProviderReady { get; set; }

    /// <summary>
    /// Status text shown below the input area.
    /// </summary>
    [ObservableProperty]
    public partial string StatusText { get; set; } = "";

    /// <summary>
    /// Name of the currently active AI model.
    /// </summary>
    [ObservableProperty]
    public partial string ActiveModel { get; set; } = "";

    /// <summary>
    /// Initializes the chat view model with injected dependencies.
    /// </summary>
    /// <param name="providerFactory">Factory for creating AI providers.</param>
    /// <param name="settings">Application settings.</param>
    /// <param name="secrets">Secure secret storage.</param>
    public ChatViewModel(
        AIProviderFactory providerFactory,
        SettingsService settings,
        ISecretService secrets)
    {
        _providerFactory = providerFactory;
        _settings = settings;
        _secrets = secrets;

        _settings.SettingChanged += OnSettingChanged;
    }

    /// <summary>
    /// Initializes the AI provider based on current settings.
    /// </summary>
    [RelayCommand]
    public async Task InitializeProviderAsync()
    {
        try
        {
            _provider?.Dispose();

            var providerType = _settings.AIProvider;
            var model = _settings.AIModel;

            // Load API key from secure storage
            var apiKey = await _secrets.LoadSecretAsync($"{providerType}-api-key");
            if (string.IsNullOrEmpty(apiKey) && providerType != "copilot")
            {
                StatusText = "API key not configured. Go to Settings → AI.";
                IsProviderReady = false;
                return;
            }

            // Load endpoint for Azure
            string? endpoint = null;
            if (providerType == "azure-openai")
            {
                endpoint = await _secrets.LoadSecretAsync("azure-openai-endpoint");
            }

            var config = new AIProviderConfig
            {
                ProviderType = providerType,
                ApiKey = apiKey,
                Endpoint = endpoint,
                Model = model
            };

            _provider = _providerFactory.Create(config);
            await _provider.InitializeAsync(config);

            ActiveModel = model;
            IsProviderReady = _provider.IsReady;
            StatusText = IsProviderReady ? $"Using {model}" : "Provider not ready";
        }
        catch (Exception ex)
        {
            StatusText = $"Failed to initialize: {ex.Message}";
            IsProviderReady = false;
        }
    }

    /// <summary>
    /// Sends the current input text as a message and streams the response.
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanSend))]
    private async Task SendMessageAsync()
    {
        if (string.IsNullOrWhiteSpace(InputText) || _provider is null) return;

        var userMessage = InputText.Trim();
        InputText = "";
        IsSending = true;

        Messages.Add(new ChatMessageItem
        {
            Role = "user",
            Content = userMessage
        });

        var assistantMessage = new ChatMessageItem
        {
            Role = "assistant",
            Content = "",
            IsStreaming = true
        };
        Messages.Add(assistantMessage);

        try
        {
            await foreach (var chunk in _provider.SendMessageStreamingAsync(userMessage))
            {
                if (chunk.IsComplete)
                {
                    assistantMessage.Content = chunk.Content;
                    assistantMessage.IsStreaming = false;
                }
                else
                {
                    assistantMessage.Content += chunk.Content;
                }
            }
        }
        catch (OperationCanceledException)
        {
            assistantMessage.IsStreaming = false;
            assistantMessage.Content += "\n\n*(Response cancelled)*";
        }
        catch (Exception ex)
        {
            assistantMessage.IsStreaming = false;
            assistantMessage.IsError = true;
            assistantMessage.Content = $"Error: {ex.Message}";
        }
        finally
        {
            IsSending = false;
        }
    }

    /// <summary>
    /// Aborts the current streaming response.
    /// </summary>
    [RelayCommand]
    private async Task AbortAsync()
    {
        if (_provider is not null)
        {
            await _provider.AbortAsync();
        }
    }

    /// <summary>
    /// Clears the conversation history.
    /// </summary>
    [RelayCommand]
    private void ClearHistory()
    {
        Messages.Clear();
        _provider?.ClearHistory();
    }

    /// <internal />
    private bool CanSend() => !IsSending && IsProviderReady && !string.IsNullOrWhiteSpace(InputText);

    /// <internal />
    private async void OnSettingChanged(string key, object? value)
    {
        if (key is nameof(SettingsService.AIProvider) or nameof(SettingsService.AIModel))
        {
            await InitializeProviderAsync();
        }
    }
}
