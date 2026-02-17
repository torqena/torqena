/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module FileExplorerViewModel
 * @description View model for the file explorer sidebar.
 * Displays the vault's file/folder tree and handles file selection,
 * creation, renaming, and deletion.
 *
 * @since 0.1.0
 */

using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Torqena.Core.Vault;

namespace Torqena.Maui.ViewModels;

/// <summary>
/// Represents a single node in the file explorer tree.
/// </summary>
public partial class FileTreeNode : ObservableObject
{
    /// <summary>
    /// Display name of the file or folder.
    /// </summary>
    [ObservableProperty]
    public partial string Name { get; set; } = "";

    /// <summary>
    /// Full path relative to the vault root.
    /// </summary>
    public string Path { get; init; } = "";

    /// <summary>
    /// Whether this node represents a folder.
    /// </summary>
    public bool IsFolder { get; init; }

    /// <summary>
    /// Whether this node is currently expanded (folders only).
    /// </summary>
    [ObservableProperty]
    public partial bool IsExpanded { get; set; }

    /// <summary>
    /// Whether this node is currently selected.
    /// </summary>
    [ObservableProperty]
    public partial bool IsSelected { get; set; }

    /// <summary>
    /// Child nodes (populated for folders).
    /// </summary>
    public ObservableCollection<FileTreeNode> Children { get; } = [];
}

/// <summary>
/// View model for the file explorer sidebar.
/// Provides a hierarchical view of vault files and folders.
/// </summary>
public partial class FileExplorerViewModel : ObservableObject
{
    private readonly VaultService _vaultService;

    /// <summary>
    /// Raised when a file is selected in the explorer.
    /// </summary>
    public event EventHandler<string>? FileSelected;

    /// <summary>
    /// Root-level tree nodes displayed in the explorer.
    /// </summary>
    public ObservableCollection<FileTreeNode> RootNodes { get; } = [];

    /// <summary>
    /// Search/filter text for file name filtering.
    /// </summary>
    [ObservableProperty]
    public partial string SearchText { get; set; } = "";

    /// <summary>
    /// Whether the explorer is currently loading.
    /// </summary>
    [ObservableProperty]
    public partial bool IsLoading { get; set; }

    /// <summary>
    /// Initializes the view model with the vault service.
    /// </summary>
    /// <param name="vaultService">Vault operations service.</param>
    public FileExplorerViewModel(VaultService vaultService)
    {
        _vaultService = vaultService;
        _vaultService.FileCreated += file => { _ = RefreshAsync(); };
        _vaultService.FileDeleted += path => { _ = RefreshAsync(); };
    }

    /// <summary>
    /// Refreshes the file tree from the vault service.
    /// </summary>
    [RelayCommand]
    public async Task RefreshAsync()
    {
        IsLoading = true;
        try
        {
            var files = _vaultService.GetFiles();
            var folders = _vaultService.GetFolders();
            BuildTree(files, folders);
        }
        finally
        {
            IsLoading = false;
        }
        await Task.CompletedTask;
    }

    /// <summary>
    /// Handles selection of a tree node. Opens the file in the editor.
    /// </summary>
    /// <param name="node">The selected node.</param>
    [RelayCommand]
    private void SelectNode(FileTreeNode node)
    {
        if (!node.IsFolder)
        {
            FileSelected?.Invoke(this, node.Path);
        }
        else
        {
            node.IsExpanded = !node.IsExpanded;
        }
    }

    /// <summary>
    /// Creates a new note file in the vault root.
    /// </summary>
    [RelayCommand]
    private async Task CreateNoteAsync()
    {
        var name = $"Untitled {DateTime.Now:yyyy-MM-dd HH-mm-ss}.md";
        await _vaultService.CreateFileAsync(name, "");
    }

    /// <summary>
    /// Creates a new folder in the vault root.
    /// </summary>
    [RelayCommand]
    private async Task CreateFolderAsync()
    {
        var name = $"New Folder {DateTime.Now:yyyy-MM-dd HH-mm-ss}";
        await _vaultService.CreateFolderAsync(name);
    }

    /// <summary>
    /// Deletes the specified node's file or folder.
    /// </summary>
    /// <param name="node">The node to delete.</param>
    [RelayCommand]
    private async Task DeleteNodeAsync(FileTreeNode node)
    {
        await _vaultService.DeleteAsync(node.Path);
    }

    /// <internal />
    private void BuildTree(IReadOnlyList<VaultFile> files, IReadOnlyList<VaultFolder> folders)
    {
        RootNodes.Clear();

        // Build folder lookup
        var folderNodes = new Dictionary<string, FileTreeNode>();
        foreach (var folder in folders.OrderBy(f => f.Path))
        {
            var node = new FileTreeNode
            {
                Name = folder.Name,
                Path = folder.Path,
                IsFolder = true
            };

            var parentPath = folder.ParentPath;
            if (!string.IsNullOrEmpty(parentPath) && folderNodes.TryGetValue(parentPath, out var parent))
            {
                parent.Children.Add(node);
            }
            else
            {
                RootNodes.Add(node);
            }
            folderNodes[folder.Path] = node;
        }

        // Place files into folders
        foreach (var file in files.OrderBy(f => f.Name))
        {
            var node = new FileTreeNode
            {
                Name = file.Name,
                Path = file.Path,
                IsFolder = false
            };

            var parentPath = file.ParentPath;
            if (!string.IsNullOrEmpty(parentPath) && folderNodes.TryGetValue(parentPath, out var parent))
            {
                parent.Children.Add(node);
            }
            else
            {
                RootNodes.Add(node);
            }
        }
    }
}
