/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module VaultService
 * @description High-level vault service that manages the file tree, metadata cache,
 * and file watching. Built on top of IVaultFileSystem for platform independence.
 *
 * @example
 * ```csharp
 * var vault = new VaultService(fileSystem);
 * await vault.OpenAsync("/path/to/vault");
 * var files = await vault.GetMarkdownFilesAsync();
 * var content = await vault.ReadAsync(files[0]);
 * ```
 *
 * @since 0.1.0
 */

namespace Torqena.Core.Vault;

/// <summary>
/// High-level vault management service. Manages the file tree, provides
/// file CRUD operations, and raises events on filesystem changes.
/// </summary>
public class VaultService : IDisposable
{
    private readonly IVaultFileSystem _fs;
    private string? _root;
    private IDisposable? _watcher;
    private readonly List<VaultFile> _files = [];
    private readonly List<VaultFolder> _folders = [];
    private bool _disposed;

    /// <summary>
    /// Fired when a file is created in the vault.
    /// </summary>
    public event Action<VaultFile>? FileCreated;

    /// <summary>
    /// Fired when a file is modified in the vault.
    /// </summary>
    public event Action<VaultFile>? FileModified;

    /// <summary>
    /// Fired when a file is deleted from the vault.
    /// </summary>
    public event Action<string>? FileDeleted;

    /// <summary>
    /// Fired when the vault is opened or the file tree is refreshed.
    /// </summary>
    public event Action? VaultChanged;

    /// <summary>
    /// Initializes a new instance of <see cref="VaultService"/>.
    /// </summary>
    /// <param name="fileSystem">Platform filesystem implementation.</param>
    public VaultService(IVaultFileSystem fileSystem)
    {
        _fs = fileSystem;
    }

    /// <summary>
    /// Gets the vault root directory path, or null if no vault is open.
    /// </summary>
    public string? Root => _root;

    /// <summary>
    /// Whether a vault is currently open.
    /// </summary>
    public bool IsOpen => _root is not null;

    /// <summary>
    /// Opens a vault at the given root directory.
    /// Scans the file tree and begins watching for changes.
    /// </summary>
    /// <param name="rootPath">Absolute path to the vault root directory.</param>
    /// <example>
    /// ```csharp
    /// await vault.OpenAsync("C:/Users/me/notes");
    /// ```
    /// </example>
    public async Task OpenAsync(string rootPath)
    {
        Close();
        _root = rootPath;
        await RefreshFileTreeAsync();
        _watcher = _fs.WatchDirectory(rootPath, OnFileSystemChange);
    }

    /// <summary>
    /// Closes the current vault, stopping file watching.
    /// </summary>
    public void Close()
    {
        _watcher?.Dispose();
        _watcher = null;
        _root = null;
        _files.Clear();
        _folders.Clear();
    }

    /// <summary>
    /// Gets all files in the vault.
    /// </summary>
    /// <returns>Read-only list of vault files.</returns>
    public IReadOnlyList<VaultFile> GetFiles() => _files.AsReadOnly();

    /// <summary>
    /// Gets only markdown files in the vault.
    /// </summary>
    /// <returns>List of markdown vault files.</returns>
    public IReadOnlyList<VaultFile> GetMarkdownFiles() =>
        _files.Where(f => f.IsMarkdown).ToList().AsReadOnly();

    /// <summary>
    /// Gets all folders in the vault.
    /// </summary>
    /// <returns>Read-only list of vault folders.</returns>
    public IReadOnlyList<VaultFolder> GetFolders() => _folders.AsReadOnly();

    /// <summary>
    /// Reads the text content of a vault file.
    /// </summary>
    /// <param name="file">The vault file to read.</param>
    /// <returns>File content as a string.</returns>
    public async Task<string> ReadAsync(VaultFile file)
    {
        return await _fs.ReadFileAsync(file.FullPath);
    }

    /// <summary>
    /// Reads a file by its vault-relative path.
    /// </summary>
    /// <param name="relativePath">Path relative to the vault root.</param>
    /// <returns>File content as a string.</returns>
    public async Task<string> ReadAsync(string relativePath)
    {
        var fullPath = GetFullPath(relativePath);
        return await _fs.ReadFileAsync(fullPath);
    }

    /// <summary>
    /// Writes content to a vault file. Creates the file if it doesn't exist.
    /// </summary>
    /// <param name="relativePath">Path relative to the vault root.</param>
    /// <param name="content">Content to write.</param>
    public async Task WriteAsync(string relativePath, string content)
    {
        var fullPath = GetFullPath(relativePath);
        await _fs.WriteFileAsync(fullPath, content);
    }

    /// <summary>
    /// Creates a new file in the vault.
    /// </summary>
    /// <param name="relativePath">Path relative to the vault root.</param>
    /// <param name="content">Initial content (empty string for blank file).</param>
    /// <returns>The created <see cref="VaultFile"/>.</returns>
    public async Task<VaultFile> CreateFileAsync(string relativePath, string content = "")
    {
        var fullPath = GetFullPath(relativePath);
        await _fs.WriteFileAsync(fullPath, content);

        var file = new VaultFile(
            Name: Path.GetFileName(relativePath),
            Path: NormalizePath(relativePath),
            FullPath: fullPath,
            Extension: Path.GetExtension(relativePath),
            Size: System.Text.Encoding.UTF8.GetByteCount(content),
            LastModified: DateTimeOffset.UtcNow
        );

        _files.Add(file);
        FileCreated?.Invoke(file);
        return file;
    }

    /// <summary>
    /// Creates a new folder in the vault.
    /// </summary>
    /// <param name="relativePath">Folder path relative to the vault root.</param>
    public async Task CreateFolderAsync(string relativePath)
    {
        var fullPath = GetFullPath(relativePath);
        await _fs.MkdirAsync(fullPath);

        var folder = new VaultFolder(
            Name: Path.GetFileName(relativePath),
            Path: NormalizePath(relativePath),
            FullPath: fullPath
        );
        _folders.Add(folder);
        VaultChanged?.Invoke();
    }

    /// <summary>
    /// Deletes a file or folder from the vault.
    /// </summary>
    /// <param name="relativePath">Path relative to the vault root.</param>
    public async Task DeleteAsync(string relativePath)
    {
        var fullPath = GetFullPath(relativePath);
        await _fs.RemoveAsync(fullPath);

        var normalized = NormalizePath(relativePath);
        _files.RemoveAll(f => f.Path == normalized);
        _folders.RemoveAll(f => f.Path == normalized);
        FileDeleted?.Invoke(normalized);
    }

    /// <summary>
    /// Renames a file or folder.
    /// </summary>
    /// <param name="oldRelativePath">Current path relative to vault root.</param>
    /// <param name="newRelativePath">New path relative to vault root.</param>
    public async Task RenameAsync(string oldRelativePath, string newRelativePath)
    {
        var oldFull = GetFullPath(oldRelativePath);
        var newFull = GetFullPath(newRelativePath);
        await _fs.RenameAsync(oldFull, newFull);
        await RefreshFileTreeAsync();
    }

    /// <summary>
    /// Finds a vault file by its relative path.
    /// </summary>
    /// <param name="relativePath">Path relative to vault root.</param>
    /// <returns>The matching <see cref="VaultFile"/>, or null.</returns>
    public VaultFile? GetFileByPath(string relativePath)
    {
        var normalized = NormalizePath(relativePath);
        return _files.FirstOrDefault(f => f.Path == normalized);
    }

    /// <summary>
    /// Searches for files matching a query string (basename search).
    /// </summary>
    /// <param name="query">Search query.</param>
    /// <returns>Matching files, ordered by relevance.</returns>
    public IReadOnlyList<VaultFile> SearchFiles(string query)
    {
        if (string.IsNullOrWhiteSpace(query)) return _files.AsReadOnly();

        var lower = query.ToLowerInvariant();
        return _files
            .Where(f => f.Basename.Contains(lower, StringComparison.OrdinalIgnoreCase)
                     || f.Path.Contains(lower, StringComparison.OrdinalIgnoreCase))
            .OrderBy(f => f.Basename.StartsWith(lower, StringComparison.OrdinalIgnoreCase) ? 0 : 1)
            .ThenBy(f => f.Basename.Length)
            .ToList()
            .AsReadOnly();
    }

    /// <summary>
    /// Refreshes the in-memory file tree from disk.
    /// </summary>
    public async Task RefreshFileTreeAsync()
    {
        if (_root is null) return;

        _files.Clear();
        _folders.Clear();

        await ScanDirectoryAsync(_root, "");
        VaultChanged?.Invoke();
    }

    /// <internal />
    private async Task ScanDirectoryAsync(string absolutePath, string relativePath)
    {
        var entries = await _fs.ListDirectoryAsync(absolutePath);

        foreach (var entry in entries)
        {
            // Skip hidden files/folders (starting with .)
            if (entry.Name.StartsWith('.')) continue;
            // Skip node_modules and other known non-vault directories
            if (entry.Name is "node_modules" or ".git" or ".obsidian" or ".torqena") continue;

            var entryRelativePath = string.IsNullOrEmpty(relativePath)
                ? entry.Name
                : $"{relativePath}/{entry.Name}";

            if (entry.IsDirectory)
            {
                _folders.Add(new VaultFolder(entry.Name, entryRelativePath, entry.FullPath));
                await ScanDirectoryAsync(entry.FullPath, entryRelativePath);
            }
            else
            {
                _files.Add(new VaultFile(
                    Name: entry.Name,
                    Path: entryRelativePath,
                    FullPath: entry.FullPath,
                    Extension: Path.GetExtension(entry.Name),
                    Size: entry.Size,
                    LastModified: entry.LastModified
                ));
            }
        }
    }

    /// <internal />
    private void OnFileSystemChange(VaultChangeType changeType, string fullPath)
    {
        if (_root is null) return;

        // Debounce / defer to avoid thrashing during bulk operations
        // Fire-and-forget refresh; caller (MAUI layer) can marshal to main thread if needed
        _ = Task.Run(async () =>
        {
            try { await RefreshFileTreeAsync(); }
            catch { /* Swallow errors during watch-triggered refresh */ }
        });
    }

    /// <internal />
    private string GetFullPath(string relativePath)
    {
        if (_root is null) throw new InvalidOperationException("No vault is open.");
        return Path.Combine(_root, relativePath.Replace('/', Path.DirectorySeparatorChar));
    }

    /// <internal />
    private static string NormalizePath(string path) =>
        path.Replace('\\', '/').TrimStart('/');

    /// <inheritdoc />
    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Close();
        GC.SuppressFinalize(this);
    }
}
