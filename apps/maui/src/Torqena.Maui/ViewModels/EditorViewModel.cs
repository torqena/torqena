/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module EditorViewModel
 * @description View model for the markdown editor pane.
 * Manages the active file, content synchronization with the CodeMirror 6 WebView,
 * and save/load operations.
 *
 * @since 0.1.0
 */

using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Torqena.Core.Vault;
using Torqena.Maui.Services;

namespace Torqena.Maui.ViewModels;

/// <summary>
/// Represents an open editor tab.
/// </summary>
public partial class EditorTab : ObservableObject
{
    /// <summary>
    /// File path relative to vault root.
    /// </summary>
    public string FilePath { get; init; } = "";

    /// <summary>
    /// Display name (file name without extension).
    /// </summary>
    [ObservableProperty]
    public partial string Title { get; set; } = "";

    /// <summary>
    /// Whether this tab has unsaved changes.
    /// </summary>
    [ObservableProperty]
    public partial bool IsDirty { get; set; }

    /// <summary>
    /// Whether this is the currently active tab.
    /// </summary>
    [ObservableProperty]
    public partial bool IsActive { get; set; }

    /// <summary>
    /// The latest content from the editor.
    /// </summary>
    public string Content { get; set; } = "";
}

/// <summary>
/// View model for the editor pane. Manages open tabs and coordinates
/// content between the vault filesystem and the CodeMirror 6 WebView.
/// </summary>
public partial class EditorViewModel : ObservableObject
{
    private readonly VaultService _vaultService;
    private readonly SettingsService _settings;

    /// <summary>
    /// Collection of open editor tabs.
    /// </summary>
    public System.Collections.ObjectModel.ObservableCollection<EditorTab> Tabs { get; } = [];

    /// <summary>
    /// The currently active editor tab.
    /// </summary>
    [ObservableProperty]
    public partial EditorTab? ActiveTab { get; set; }

    /// <summary>
    /// Whether the editor WebView is ready to receive commands.
    /// </summary>
    [ObservableProperty]
    public partial bool IsWebViewReady { get; set; }

    /// <summary>
    /// Raised when content should be sent to the WebView for rendering.
    /// The handler (EditorWebView control) should push the content via JS interop.
    /// </summary>
    public event EventHandler<(string filePath, string content)>? ContentReady;

    /// <summary>
    /// Raised when editor settings have changed and should be synced to the WebView.
    /// </summary>
    public event EventHandler<string>? SettingsChanged;

    /// <summary>
    /// Initializes the editor view model.
    /// </summary>
    /// <param name="vaultService">Vault operations service.</param>
    /// <param name="settings">Application settings.</param>
    public EditorViewModel(VaultService vaultService, SettingsService settings)
    {
        _vaultService = vaultService;
        _settings = settings;

        _settings.SettingChanged += OnSettingChanged;
    }

    /// <summary>
    /// Opens a file in the editor. Reuses an existing tab or creates a new one.
    /// </summary>
    /// <param name="filePath">Path to the file relative to vault root.</param>
    [RelayCommand]
    public async Task OpenFileAsync(string filePath)
    {
        // Check if file is already open in a tab
        var existing = Tabs.FirstOrDefault(t => t.FilePath == filePath);
        if (existing is not null)
        {
            ActivateTab(existing);
            return;
        }

        // Read file content
        var content = await _vaultService.ReadAsync(filePath);

        var tab = new EditorTab
        {
            FilePath = filePath,
            Title = Path.GetFileNameWithoutExtension(filePath),
            Content = content
        };

        Tabs.Add(tab);
        ActivateTab(tab);
    }

    /// <summary>
    /// Saves the currently active tab's content to the vault.
    /// </summary>
    [RelayCommand]
    private async Task SaveAsync()
    {
        if (ActiveTab is null) return;

        await _vaultService.WriteAsync(ActiveTab.FilePath, ActiveTab.Content);
        ActiveTab.IsDirty = false;
    }

    /// <summary>
    /// Saves all open tabs with unsaved changes.
    /// </summary>
    [RelayCommand]
    private async Task SaveAllAsync()
    {
        foreach (var tab in Tabs.Where(t => t.IsDirty))
        {
            await _vaultService.WriteAsync(tab.FilePath, tab.Content);
            tab.IsDirty = false;
        }
    }

    /// <summary>
    /// Closes an editor tab. Prompts to save if there are unsaved changes.
    /// </summary>
    /// <param name="tab">The tab to close.</param>
    [RelayCommand]
    private void CloseTab(EditorTab tab)
    {
        var index = Tabs.IndexOf(tab);
        Tabs.Remove(tab);

        if (tab.IsActive && Tabs.Count > 0)
        {
            var newIndex = Math.Min(index, Tabs.Count - 1);
            ActivateTab(Tabs[newIndex]);
        }
        else if (Tabs.Count == 0)
        {
            ActiveTab = null;
        }
    }

    /// <summary>
    /// Called by the WebView bridge when the user edits content in CodeMirror.
    /// </summary>
    /// <param name="filePath">The file being edited.</param>
    /// <param name="content">The updated content.</param>
    public void OnContentChanged(string filePath, string content)
    {
        var tab = Tabs.FirstOrDefault(t => t.FilePath == filePath);
        if (tab is not null)
        {
            tab.Content = content;
            tab.IsDirty = true;
        }
    }

    /// <summary>
    /// Notifies the WebView that it is ready and sends initial settings.
    /// </summary>
    public void OnWebViewReady()
    {
        IsWebViewReady = true;
        SettingsChanged?.Invoke(this, _settings.ToJson());

        if (ActiveTab is not null)
        {
            ContentReady?.Invoke(this, (ActiveTab.FilePath, ActiveTab.Content));
        }
    }

    /// <internal />
    private void ActivateTab(EditorTab tab)
    {
        foreach (var t in Tabs) t.IsActive = false;
        tab.IsActive = true;
        ActiveTab = tab;

        if (IsWebViewReady)
        {
            ContentReady?.Invoke(this, (tab.FilePath, tab.Content));
        }
    }

    /// <internal />
    private void OnSettingChanged(string key, object? value)
    {
        if (IsWebViewReady)
        {
            SettingsChanged?.Invoke(this, _settings.ToJson());
        }
    }
}
