/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module VaultFileSystemAdapter
 * @description Adapts the MAUI {@link IFileService} to the Core {@link IVaultFileSystem} interface.
 * This bridge allows the Core VaultService to use MAUI's filesystem implementation
 * without depending on MAUI APIs directly.
 *
 * @since 0.1.0
 */

using Torqena.Core.Vault;

namespace Torqena.Maui.Services;

/// <summary>
/// Adapts <see cref="IFileService"/> to the Core <see cref="IVaultFileSystem"/> interface.
/// Registered as a singleton in the DI container so <see cref="VaultService"/> can
/// access filesystem operations without a MAUI dependency.
/// </summary>
public class VaultFileSystemAdapter : IVaultFileSystem
{
    private readonly IFileService _fileService;

    /// <summary>
    /// Initializes a new instance of <see cref="VaultFileSystemAdapter"/>.
    /// </summary>
    /// <param name="fileService">The platform file service implementation.</param>
    public VaultFileSystemAdapter(IFileService fileService)
    {
        _fileService = fileService;
    }

    /// <inheritdoc />
    public async Task<string> ReadFileAsync(string path)
    {
        return await _fileService.ReadFileAsync(path);
    }

    /// <inheritdoc />
    public async Task WriteFileAsync(string path, string content)
    {
        await _fileService.WriteFileAsync(path, content);
    }

    /// <inheritdoc />
    public async Task<bool> ExistsAsync(string path)
    {
        return await _fileService.ExistsAsync(path);
    }

    /// <inheritdoc />
    public async Task<VaultFileEntry[]> ListDirectoryAsync(string path)
    {
        var entries = await _fileService.ListDirectoryAsync(path);
        return entries.Select(e => new VaultFileEntry(
            Name: e.Name,
            FullPath: e.FullPath,
            IsDirectory: e.IsDirectory,
            Size: e.Size,
            LastModified: e.LastModified
        )).ToArray();
    }

    /// <inheritdoc />
    public async Task<string[]> ListFilesRecursiveAsync(string path, string? pattern = null)
    {
        return await _fileService.ListFilesRecursiveAsync(path, pattern);
    }

    /// <inheritdoc />
    public async Task RemoveAsync(string path)
    {
        await _fileService.RemoveAsync(path);
    }

    /// <inheritdoc />
    public async Task MkdirAsync(string path)
    {
        await _fileService.MkdirAsync(path);
    }

    /// <inheritdoc />
    public async Task RenameAsync(string oldPath, string newPath)
    {
        await _fileService.RenameAsync(oldPath, newPath);
    }

    /// <inheritdoc />
    public IDisposable WatchDirectory(string path, Action<VaultChangeType, string> onChange)
    {
        return _fileService.WatchDirectory(path, (changeType, changedPath) =>
        {
            var vaultChangeType = changeType switch
            {
                FileChangeType.Created => VaultChangeType.Created,
                FileChangeType.Modified => VaultChangeType.Modified,
                FileChangeType.Deleted => VaultChangeType.Deleted,
                FileChangeType.Renamed => VaultChangeType.Renamed,
                _ => VaultChangeType.Modified
            };
            onChange(vaultChangeType, changedPath);
        });
    }
}
