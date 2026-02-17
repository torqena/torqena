/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module IFileService
 * @description Abstraction for filesystem operations across all platforms.
 * Desktop uses direct System.IO, mobile uses platform-specific APIs
 * (iOS security-scoped bookmarks, Android SAF).
 *
 * @since 0.1.0
 */

namespace Torqena.Maui.Services;

/// <summary>
/// Represents a file or directory entry returned from directory listing.
/// </summary>
/// <param name="Name">The file or directory name.</param>
/// <param name="FullPath">The full path to the entry.</param>
/// <param name="IsDirectory">Whether this entry is a directory.</param>
/// <param name="Size">File size in bytes (0 for directories).</param>
/// <param name="LastModified">Last modification time.</param>
public record FileEntry(
    string Name,
    string FullPath,
    bool IsDirectory,
    long Size = 0,
    DateTimeOffset? LastModified = null
);

/// <summary>
/// Platform-agnostic filesystem service for vault file operations.
/// All vault markdown files are stored on the local filesystem.
/// </summary>
public interface IFileService
{
    /// <summary>
    /// Reads a text file from the filesystem.
    /// </summary>
    /// <param name="path">Absolute path to the file.</param>
    /// <param name="encoding">Text encoding (default: utf-8).</param>
    /// <returns>The file contents as a string.</returns>
    /// <throws><see cref="FileNotFoundException"/> if the file does not exist.</throws>
    Task<string> ReadFileAsync(string path, string encoding = "utf-8");

    /// <summary>
    /// Reads a file as raw bytes.
    /// </summary>
    /// <param name="path">Absolute path to the file.</param>
    /// <returns>The file contents as a byte array.</returns>
    Task<byte[]> ReadFileBytesAsync(string path);

    /// <summary>
    /// Writes text content to a file, creating parent directories as needed.
    /// </summary>
    /// <param name="path">Absolute path to the file.</param>
    /// <param name="content">Text content to write.</param>
    Task WriteFileAsync(string path, string content);

    /// <summary>
    /// Writes raw bytes to a file.
    /// </summary>
    /// <param name="path">Absolute path to the file.</param>
    /// <param name="bytes">Byte content to write.</param>
    Task WriteBytesAsync(string path, byte[] bytes);

    /// <summary>
    /// Checks whether a file or directory exists at the given path.
    /// </summary>
    /// <param name="path">Absolute path to check.</param>
    /// <returns>True if the path exists.</returns>
    Task<bool> ExistsAsync(string path);

    /// <summary>
    /// Lists the immediate contents of a directory.
    /// </summary>
    /// <param name="path">Absolute path to the directory.</param>
    /// <returns>Array of file/directory entries.</returns>
    Task<FileEntry[]> ListDirectoryAsync(string path);

    /// <summary>
    /// Recursively lists all files in a directory tree.
    /// </summary>
    /// <param name="path">Root directory path.</param>
    /// <param name="pattern">Optional glob pattern filter (e.g., "*.md").</param>
    /// <returns>Array of absolute file paths.</returns>
    Task<string[]> ListFilesRecursiveAsync(string path, string? pattern = null);

    /// <summary>
    /// Deletes a file or directory.
    /// </summary>
    /// <param name="path">Absolute path to remove.</param>
    Task RemoveAsync(string path);

    /// <summary>
    /// Creates a directory (and any necessary parent directories).
    /// </summary>
    /// <param name="path">Absolute path to the directory.</param>
    Task MkdirAsync(string path);

    /// <summary>
    /// Renames or moves a file/directory.
    /// </summary>
    /// <param name="oldPath">Current path.</param>
    /// <param name="newPath">New path.</param>
    Task RenameAsync(string oldPath, string newPath);

    /// <summary>
    /// Watches a directory for filesystem changes.
    /// </summary>
    /// <param name="path">Directory to watch.</param>
    /// <param name="onChange">Callback invoked with the change type and affected path.</param>
    /// <returns>Disposable that stops watching when disposed.</returns>
    IDisposable WatchDirectory(string path, Action<FileChangeType, string> onChange);

    /// <summary>
    /// Opens a platform folder picker for the user to select a vault directory.
    /// </summary>
    /// <returns>The selected directory path, or null if cancelled.</returns>
    Task<string?> PickDirectoryAsync();

    /// <summary>
    /// Gets the persisted vault root path (restored from previous session).
    /// </summary>
    /// <returns>The vault root path, or null if none set.</returns>
    Task<string?> GetVaultRootAsync();

    /// <summary>
    /// Persists the vault root path for future sessions.
    /// On mobile, this also persists security-scoped bookmarks / SAF URIs.
    /// </summary>
    /// <param name="path">The vault root directory path.</param>
    Task SetVaultRootAsync(string path);
}

/// <summary>
/// Types of filesystem changes detected by <see cref="IFileService.WatchDirectory"/>.
/// </summary>
public enum FileChangeType
{
    /// <summary>A new file or directory was created.</summary>
    Created,

    /// <summary>A file was modified.</summary>
    Modified,

    /// <summary>A file or directory was deleted.</summary>
    Deleted,

    /// <summary>A file or directory was renamed.</summary>
    Renamed
}
