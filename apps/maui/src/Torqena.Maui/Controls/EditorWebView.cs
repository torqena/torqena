/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module EditorWebView
 * @description Custom WebView control that hosts CodeMirror 6 for markdown editing.
 * Provides a typed C#↔JavaScript message bridge via postMessage/WebMessageReceived.
 *
 * Message protocol (JSON):
 * - C# → JS: { type: "setContent", filePath, content }
 * - C# → JS: { type: "updateSettings", settings: {...} }
 * - C# → JS: { type: "getContent" }
 * - JS → C#: { type: "contentChanged", filePath, content }
 * - JS → C#: { type: "ready" }
 * - JS → C#: { type: "cursorChanged", line, column }
 *
 * @since 0.1.0
 */

using System.Text.Json;
using Torqena.Maui.ViewModels;

namespace Torqena.Maui.Controls;

/// <summary>
/// WebView wrapper that hosts the CodeMirror 6 editor.
/// Communicates with the JavaScript editor bridge via JSON messages.
/// </summary>
public class EditorWebView : WebView
{
    private EditorViewModel? _viewModel;

    /// <summary>
    /// Bindable property for the editor view model.
    /// </summary>
    public static readonly BindableProperty ViewModelProperty =
        BindableProperty.Create(
            nameof(ViewModel),
            typeof(EditorViewModel),
            typeof(EditorWebView),
            null,
            propertyChanged: OnViewModelChanged);

    /// <summary>
    /// Gets or sets the editor view model.
    /// </summary>
    public EditorViewModel? ViewModel
    {
        get => (EditorViewModel?)GetValue(ViewModelProperty);
        set => SetValue(ViewModelProperty, value);
    }

    /// <summary>
    /// Initializes the editor WebView and loads the editor HTML from raw resources.
    /// </summary>
    public EditorWebView()
    {
        // Load the editor from bundled raw resources
        Source = new HtmlWebViewSource
        {
            Html = GetPlaceholderHtml()
        };
    }

    /// <summary>
    /// Loads the CodeMirror 6 editor bundle from raw resources.
    /// Call this after the WebView is attached to the visual tree.
    /// </summary>
    public async Task LoadEditorAsync()
    {
        try
        {
            using var stream = await FileSystem.OpenAppPackageFileAsync("editor/index.html");
            using var reader = new StreamReader(stream);
            var html = await reader.ReadToEndAsync();
            Source = new HtmlWebViewSource { Html = html };
        }
        catch
        {
            // Editor bundle not yet built — keep placeholder
        }
    }

    /// <summary>
    /// Sends a message to set the editor content for a file.
    /// </summary>
    /// <param name="filePath">File path for context.</param>
    /// <param name="content">Markdown content to display.</param>
    public async Task SetContentAsync(string filePath, string content)
    {
        var message = JsonSerializer.Serialize(new
        {
            type = "setContent",
            filePath,
            content
        });
        await SendMessageAsync(message);
    }

    /// <summary>
    /// Sends updated settings to the editor.
    /// </summary>
    /// <param name="settingsJson">Serialized settings JSON.</param>
    public async Task UpdateSettingsAsync(string settingsJson)
    {
        var message = JsonSerializer.Serialize(new
        {
            type = "updateSettings",
            settings = JsonSerializer.Deserialize<JsonElement>(settingsJson)
        });
        await SendMessageAsync(message);
    }

    /// <internal />
    private static void OnViewModelChanged(BindableObject bindable, object oldValue, object newValue)
    {
        if (bindable is EditorWebView editor)
        {
            editor.DetachViewModel();
            editor.AttachViewModel(newValue as EditorViewModel);
        }
    }

    /// <internal />
    private void AttachViewModel(EditorViewModel? vm)
    {
        _viewModel = vm;
        if (vm is null) return;

        vm.ContentReady += OnContentReady;
        vm.SettingsChanged += OnSettingsChanged;
    }

    /// <internal />
    private void DetachViewModel()
    {
        if (_viewModel is null) return;
        _viewModel.ContentReady -= OnContentReady;
        _viewModel.SettingsChanged -= OnSettingsChanged;
        _viewModel = null;
    }

    /// <internal />
    private async void OnContentReady(object? sender, (string filePath, string content) args)
    {
        await SetContentAsync(args.filePath, args.content);
    }

    /// <internal />
    private async void OnSettingsChanged(object? sender, string settingsJson)
    {
        await UpdateSettingsAsync(settingsJson);
    }

    /// <internal />
    private async Task SendMessageAsync(string json)
    {
        var escaped = json.Replace("\\", "\\\\").Replace("'", "\\'");
        await EvaluateJavaScriptAsync(
            $"window.postMessage(JSON.parse('{escaped}'), '*');"
        );
    }

    /// <internal />
    private static string GetPlaceholderHtml()
    {
        return """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        display: flex; align-items: center; justify-content: center;
                        height: 100vh; margin: 0; color: #888;
                        background: #1e1e1e;
                    }
                    @media (prefers-color-scheme: light) {
                        body { background: #fff; color: #666; }
                    }
                </style>
            </head>
            <body>
                <p>Editor loading...</p>
            </body>
            </html>
            """;
    }
}
