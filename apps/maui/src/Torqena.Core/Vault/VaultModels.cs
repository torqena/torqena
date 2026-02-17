/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module VaultFile
 * @description Represents a file in the vault filesystem.
 *
 * @since 0.1.0
 */

namespace Torqena.Core.Vault;

/// <summary>
/// Represents a file in the vault.
/// </summary>
/// <param name="Name">File name including extension.</param>
/// <param name="Path">Path relative to the vault root.</param>
/// <param name="FullPath">Absolute path on the filesystem.</param>
/// <param name="Extension">File extension (e.g., ".md").</param>
/// <param name="Size">File size in bytes.</param>
/// <param name="LastModified">Last modification time.</param>
public record VaultFile(
    string Name,
    string Path,
    string FullPath,
    string Extension,
    long Size = 0,
    DateTimeOffset? LastModified = null
)
{
    /// <summary>
    /// Gets the file name without extension (basename).
    /// </summary>
    public string Basename => System.IO.Path.GetFileNameWithoutExtension(Name);

    /// <summary>
    /// Gets the parent folder path relative to the vault root.
    /// </summary>
    public string? ParentPath => System.IO.Path.GetDirectoryName(Path)?.Replace('\\', '/');

    /// <summary>
    /// Whether this is a markdown file.
    /// </summary>
    public bool IsMarkdown => Extension is ".md" or ".markdown";
}

/// <summary>
/// Represents a folder in the vault.
/// </summary>
/// <param name="Name">Folder name.</param>
/// <param name="Path">Path relative to the vault root.</param>
/// <param name="FullPath">Absolute path on the filesystem.</param>
public record VaultFolder(
    string Name,
    string Path,
    string FullPath
)
{
    /// <summary>
    /// Gets the parent folder path relative to the vault root.
    /// </summary>
    public string? ParentPath => System.IO.Path.GetDirectoryName(Path)?.Replace('\\', '/');

    /// <summary>
    /// Whether this is a root folder (no parent).
    /// </summary>
    public bool IsRoot => string.IsNullOrEmpty(Path);
}
