/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module FileService
 * @description Default filesystem service implementation using System.IO.
 * Works directly on desktop (Windows, macOS). On mobile platforms,
 * platform-specific partial classes extend this with security-scoped
 * bookmarks (iOS) or SAF (Android).
 *
 * @since 0.1.0
 */

using System.Text;

namespace Torqena.Maui.Services;

/// <summary>
/// Default filesystem service using <see cref="System.IO"/> APIs.
/// Provides full read/write access on desktop platforms.
/// Mobile platforms extend via partial classes in Platforms/.
/// </summary>
public partial class FileService : IFileService
{
    private const string VaultRootKey = "torqena_vault_root";

    /// <inheritdoc />
    public async Task<string> ReadFileAsync(string path, string encoding = "utf-8")
    {
        var enc = GetEncoding(encoding);
        return await File.ReadAllTextAsync(path, enc);
    }

    /// <inheritdoc />
    public async Task<byte[]> ReadFileBytesAsync(string path)
    {
        return await File.ReadAllBytesAsync(path);
    }

    /// <inheritdoc />
    public async Task WriteFileAsync(string path, string content)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }
        await File.WriteAllTextAsync(path, content, Encoding.UTF8);
    }

    /// <inheritdoc />
    public async Task WriteBytesAsync(string path, byte[] bytes)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }
        await File.WriteAllBytesAsync(path, bytes);
    }

    /// <inheritdoc />
    public Task<bool> ExistsAsync(string path)
    {
        return Task.FromResult(File.Exists(path) || Directory.Exists(path));
    }

    /// <inheritdoc />
    public Task<FileEntry[]> ListDirectoryAsync(string path)
    {
        if (!Directory.Exists(path))
        {
            return Task.FromResult(Array.Empty<FileEntry>());
        }

        var entries = new List<FileEntry>();

        foreach (var dir in Directory.GetDirectories(path))
        {
            var info = new DirectoryInfo(dir);
            entries.Add(new FileEntry(
                info.Name,
                info.FullName,
                IsDirectory: true,
                LastModified: info.LastWriteTimeUtc
            ));
        }

        foreach (var file in Directory.GetFiles(path))
        {
            var info = new FileInfo(file);
            entries.Add(new FileEntry(
                info.Name,
                info.FullName,
                IsDirectory: false,
                Size: info.Length,
                LastModified: info.LastWriteTimeUtc
            ));
        }

        return Task.FromResult(entries.OrderBy(e => !e.IsDirectory).ThenBy(e => e.Name).ToArray());
    }

    /// <inheritdoc />
    public Task<string[]> ListFilesRecursiveAsync(string path, string? pattern = null)
    {
        if (!Directory.Exists(path))
        {
            return Task.FromResult(Array.Empty<string>());
        }

        var searchPattern = pattern ?? "*";
        var files = Directory.GetFiles(path, searchPattern, SearchOption.AllDirectories);
        return Task.FromResult(files);
    }

    /// <inheritdoc />
    public Task RemoveAsync(string path)
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
        else if (Directory.Exists(path))
        {
            Directory.Delete(path, recursive: true);
        }
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task MkdirAsync(string path)
    {
        Directory.CreateDirectory(path);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task RenameAsync(string oldPath, string newPath)
    {
        if (File.Exists(oldPath))
        {
            var dir = Path.GetDirectoryName(newPath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
            File.Move(oldPath, newPath);
        }
        else if (Directory.Exists(oldPath))
        {
            Directory.Move(oldPath, newPath);
        }
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public IDisposable WatchDirectory(string path, Action<FileChangeType, string> onChange)
    {
        var watcher = new FileSystemWatcher(path)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.FileName
                         | NotifyFilters.DirectoryName
                         | NotifyFilters.LastWrite
                         | NotifyFilters.Size,
            EnableRaisingEvents = true
        };

        watcher.Created += (_, e) => onChange(FileChangeType.Created, e.FullPath);
        watcher.Changed += (_, e) => onChange(FileChangeType.Modified, e.FullPath);
        watcher.Deleted += (_, e) => onChange(FileChangeType.Deleted, e.FullPath);
        watcher.Renamed += (_, e) => onChange(FileChangeType.Renamed, e.FullPath);

        return watcher;
    }

    /// <inheritdoc />
    public virtual async Task<string?> PickDirectoryAsync()
    {
#if WINDOWS
        var folderPicker = new Windows.Storage.Pickers.FolderPicker();
        folderPicker.SuggestedStartLocation = Windows.Storage.Pickers.PickerLocationId.DocumentsLibrary;
        folderPicker.FileTypeFilter.Add("*");

        // Get the window handle for WinUI
        var window = Application.Current?.Windows.FirstOrDefault()?.Handler?.PlatformView;
        if (window is Microsoft.UI.Xaml.Window winuiWindow)
        {
            var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(winuiWindow);
            WinRT.Interop.InitializeWithWindow.Initialize(folderPicker, hwnd);
        }

        var folder = await folderPicker.PickSingleFolderAsync();
        return folder?.Path;
#else
        // Fallback: use a text prompt or platform-specific implementation
        await Task.CompletedTask;
        return null;
#endif
    }

    /// <inheritdoc />
    public Task<string?> GetVaultRootAsync()
    {
        var root = Preferences.Get(VaultRootKey, default(string));
        return Task.FromResult(root);
    }

    /// <inheritdoc />
    public Task SetVaultRootAsync(string path)
    {
        Preferences.Set(VaultRootKey, path);
        return Task.CompletedTask;
    }

    /// <summary>
    /// Resolves a text encoding name to an <see cref="Encoding"/> instance.
    /// </summary>
    /// <param name="encoding">The encoding name (e.g., "utf-8").</param>
    /// <returns>The resolved encoding.</returns>
    /// <internal />
    private static Encoding GetEncoding(string encoding)
    {
        return encoding.ToLowerInvariant() switch
        {
            "utf-8" or "utf8" => Encoding.UTF8,
            "ascii" => Encoding.ASCII,
            "utf-16" or "unicode" => Encoding.Unicode,
            "utf-32" => Encoding.UTF32,
            _ => Encoding.UTF8,
        };
    }
}
