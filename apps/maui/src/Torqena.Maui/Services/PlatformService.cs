/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module PlatformService
 * @description Platform service implementation using MAUI DeviceInfo, Browser, and Clipboard APIs.
 *
 * @since 0.1.0
 */

using System.Runtime.InteropServices;

namespace Torqena.Maui.Services;

/// <summary>
/// Platform information and capabilities backed by MAUI APIs.
/// </summary>
public class PlatformService : IPlatformService
{
    /// <inheritdoc />
    public PlatformInfo GetPlatformInfo()
    {
        var isDesktop = DeviceInfo.Idiom == DeviceIdiom.Desktop;
        var isMobile = DeviceInfo.Idiom == DeviceIdiom.Phone || DeviceInfo.Idiom == DeviceIdiom.Tablet;

        return new PlatformInfo(
            OperatingSystem: DeviceInfo.Platform.ToString(),
            Architecture: RuntimeInformation.ProcessArchitecture.ToString(),
            AppVersion: AppInfo.VersionString,
            IsDesktop: isDesktop,
            IsMobile: isMobile,
            DeviceName: DeviceInfo.Name
        );
    }

    /// <inheritdoc />
    public async Task OpenUrlAsync(string url)
    {
        await Browser.Default.OpenAsync(url, BrowserLaunchMode.SystemPreferred);
    }

    /// <inheritdoc />
    public async Task CopyToClipboardAsync(string text)
    {
        await Clipboard.Default.SetTextAsync(text);
    }

    /// <inheritdoc />
    public async Task<string?> GetClipboardTextAsync()
    {
        return await Clipboard.Default.GetTextAsync();
    }
}
