/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module MainViewModel
 * @description Root view model for the main page. Orchestrates the three-column layout
 * (file explorer, editor, chat) and manages vault state.
 *
 * @since 0.1.0
 */

using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Torqena.Core.Vault;
using Torqena.Maui.Services;

namespace Torqena.Maui.ViewModels;

/// <summary>
/// Main page view model. Coordinates file explorer, editor, and chat panes.
/// </summary>
public partial class MainViewModel : ObservableObject
{
    private readonly VaultService _vaultService;
    private readonly IFileService _fileService;
    private readonly SettingsService _settings;

    /// <summary>
    /// Gets the file explorer sub-view model.
    /// </summary>
    public FileExplorerViewModel FileExplorer { get; }

    /// <summary>
    /// Gets the editor sub-view model.
    /// </summary>
    public EditorViewModel Editor { get; }

    /// <summary>
    /// Gets the chat sub-view model.
    /// </summary>
    public ChatViewModel Chat { get; }

    /// <summary>
    /// Whether the file explorer sidebar is visible.
    /// </summary>
    [ObservableProperty]
    public partial bool IsSidebarVisible { get; set; } = true;

    /// <summary>
    /// Whether the chat panel is visible.
    /// </summary>
    [ObservableProperty]
    public partial bool IsChatVisible { get; set; } = true;

    /// <summary>
    /// Whether a vault is currently open.
    /// </summary>
    [ObservableProperty]
    public partial bool IsVaultOpen { get; set; }

    /// <summary>
    /// The name of the currently open vault folder.
    /// </summary>
    [ObservableProperty]
    public partial string VaultName { get; set; } = "";

    /// <summary>
    /// Status bar text shown at the bottom of the window.
    /// </summary>
    [ObservableProperty]
    public partial string StatusText { get; set; } = "Ready";

    /// <summary>
    /// Initializes the main view model with injected dependencies.
    /// </summary>
    /// <param name="vaultService">Vault operations service.</param>
    /// <param name="fileService">Platform file service.</param>
    /// <param name="settings">Application settings.</param>
    /// <param name="fileExplorer">File explorer view model.</param>
    /// <param name="editor">Editor view model.</param>
    /// <param name="chat">Chat view model.</param>
    public MainViewModel(
        VaultService vaultService,
        IFileService fileService,
        SettingsService settings,
        FileExplorerViewModel fileExplorer,
        EditorViewModel editor,
        ChatViewModel chat)
    {
        _vaultService = vaultService;
        _fileService = fileService;
        _settings = settings;
        FileExplorer = fileExplorer;
        Editor = editor;
        Chat = chat;

        FileExplorer.FileSelected += OnFileSelected;
    }

    /// <summary>
    /// Initializes the vault on application startup.
    /// Attempts to open the last used vault directory.
    /// </summary>
    [RelayCommand]
    private async Task InitializeAsync()
    {
        var vaultRoot = await _fileService.GetVaultRootAsync();
        if (!string.IsNullOrEmpty(vaultRoot) && await _fileService.ExistsAsync(vaultRoot))
        {
            await OpenVaultAtPathAsync(vaultRoot);
        }
    }

    /// <summary>
    /// Prompts the user to select a vault directory using the platform folder picker.
    /// </summary>
    [RelayCommand]
    private async Task OpenVaultAsync()
    {
        var path = await _fileService.PickDirectoryAsync();
        if (!string.IsNullOrEmpty(path))
        {
            await OpenVaultAtPathAsync(path);
        }
    }

    /// <summary>
    /// Toggles visibility of the file explorer sidebar.
    /// </summary>
    [RelayCommand]
    private void ToggleSidebar() => IsSidebarVisible = !IsSidebarVisible;

    /// <summary>
    /// Toggles visibility of the chat panel.
    /// </summary>
    [RelayCommand]
    private void ToggleChat() => IsChatVisible = !IsChatVisible;

    /// <internal />
    private async Task OpenVaultAtPathAsync(string path)
    {
        await _fileService.SetVaultRootAsync(path);
        await _vaultService.OpenAsync(path);
        await FileExplorer.RefreshAsync();

        VaultName = Path.GetFileName(path);
        IsVaultOpen = true;
        StatusText = $"Vault: {VaultName}";
    }

    /// <internal />
    private async void OnFileSelected(object? sender, string filePath)
    {
        await Editor.OpenFileAsync(filePath);
    }
}
