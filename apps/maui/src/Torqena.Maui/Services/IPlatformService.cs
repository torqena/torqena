/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module IPlatformService
 * @description Abstraction for platform information and native capabilities.
 *
 * @since 0.1.0
 */

namespace Torqena.Maui.Services;

/// <summary>
/// Platform information and capabilities.
/// </summary>
public record PlatformInfo(
    string OperatingSystem,
    string Architecture,
    string AppVersion,
    bool IsDesktop,
    bool IsMobile,
    string DeviceName
);

/// <summary>
/// Service providing platform information and native capabilities.
/// </summary>
public interface IPlatformService
{
    /// <summary>
    /// Gets information about the current platform.
    /// </summary>
    /// <returns>Platform details.</returns>
    PlatformInfo GetPlatformInfo();

    /// <summary>
    /// Opens a URL in the default browser.
    /// </summary>
    /// <param name="url">The URL to open.</param>
    Task OpenUrlAsync(string url);

    /// <summary>
    /// Copies text to the system clipboard.
    /// </summary>
    /// <param name="text">Text to copy.</param>
    Task CopyToClipboardAsync(string text);

    /// <summary>
    /// Gets text from the system clipboard.
    /// </summary>
    /// <returns>Clipboard text, or null if empty.</returns>
    Task<string?> GetClipboardTextAsync();
}
