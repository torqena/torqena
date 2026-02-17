/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module IVaultFileSystem
 * @description Abstraction for vault filesystem operations.
 * This interface is implemented by the MAUI FileService and injected into Core services.
 * Core does not depend on MAUI APIs — only on this interface.
 *
 * @since 0.1.0
 */

namespace Torqena.Core.Vault;

/// <summary>
/// Represents a filesystem entry (file or directory).
/// </summary>
/// <param name="Name">Entry name.</param>
/// <param name="FullPath">Absolute path.</param>
/// <param name="IsDirectory">Whether this is a directory.</param>
/// <param name="Size">File size (0 for directories).</param>
/// <param name="LastModified">Last modification time.</param>
public record VaultFileEntry(
    string Name,
    string FullPath,
    bool IsDirectory,
    long Size = 0,
    DateTimeOffset? LastModified = null
);

/// <summary>
/// Filesystem change event types.
/// </summary>
public enum VaultChangeType
{
    /// <summary>File or directory created.</summary>
    Created,
    /// <summary>File modified.</summary>
    Modified,
    /// <summary>File or directory deleted.</summary>
    Deleted,
    /// <summary>File or directory renamed.</summary>
    Renamed
}

/// <summary>
/// Abstraction for filesystem operations that the vault layer requires.
/// Implemented by platform-specific file services in the MAUI project.
/// This keeps Torqena.Core independent of MAUI APIs.
/// </summary>
public interface IVaultFileSystem
{
    /// <summary>
    /// Reads a text file.
    /// </summary>
    Task<string> ReadFileAsync(string path);

    /// <summary>
    /// Writes text to a file, creating parent directories as needed.
    /// </summary>
    Task WriteFileAsync(string path, string content);

    /// <summary>
    /// Checks if a path exists.
    /// </summary>
    Task<bool> ExistsAsync(string path);

    /// <summary>
    /// Lists directory contents.
    /// </summary>
    Task<VaultFileEntry[]> ListDirectoryAsync(string path);

    /// <summary>
    /// Recursively lists all files.
    /// </summary>
    Task<string[]> ListFilesRecursiveAsync(string path, string? pattern = null);

    /// <summary>
    /// Deletes a file or directory.
    /// </summary>
    Task RemoveAsync(string path);

    /// <summary>
    /// Creates a directory.
    /// </summary>
    Task MkdirAsync(string path);

    /// <summary>
    /// Renames/moves a file or directory.
    /// </summary>
    Task RenameAsync(string oldPath, string newPath);

    /// <summary>
    /// Watches a directory for changes.
    /// </summary>
    IDisposable WatchDirectory(string path, Action<VaultChangeType, string> onChange);
}
