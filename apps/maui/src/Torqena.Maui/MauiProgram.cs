/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module MauiProgram
 * @description MAUI application bootstrap. Registers services, configures DI container,
 * and builds the MAUI app host.
 *
 * @since 0.1.0
 */

using Torqena.Core.Vault;
using Torqena.Core.AI.Providers;
using Torqena.Maui.Services;
using Torqena.Maui.ViewModels;
using Torqena.Maui.Views;
using Microsoft.Extensions.Logging;

namespace Torqena.Maui;

/// <summary>
/// MAUI application builder. Configures services, logging, and the DI container.
/// </summary>
public static class MauiProgram
{
    /// <summary>
    /// Creates and configures the MAUI application.
    /// </summary>
    /// <returns>The configured <see cref="MauiApp"/> instance.</returns>
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder
            .UseMauiApp<App>()
            .ConfigureFonts(fonts =>
            {
                fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
                fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
            });

        // --- Platform Services ---
        builder.Services.AddSingleton<IFileService, FileService>();
        builder.Services.AddSingleton<ISecretService, SecretService>();
        builder.Services.AddSingleton<IPlatformService, PlatformService>();
        builder.Services.AddSingleton<IProcessService, ProcessService>();

        // --- Core Services ---
        builder.Services.AddSingleton<SettingsService>();
        builder.Services.AddSingleton<IVaultFileSystem, VaultFileSystemAdapter>();
        builder.Services.AddSingleton<VaultService>();
        builder.Services.AddSingleton<AIProviderFactory>();

        // --- ViewModels ---
        builder.Services.AddTransient<MainViewModel>();
        builder.Services.AddTransient<EditorViewModel>();
        builder.Services.AddTransient<ChatViewModel>();
        builder.Services.AddTransient<FileExplorerViewModel>();
        builder.Services.AddTransient<SettingsViewModel>();

        // --- Views ---
        builder.Services.AddTransient<MainPage>();
        builder.Services.AddTransient<SettingsPage>();

#if DEBUG
        builder.Logging.SetMinimumLevel(LogLevel.Debug);
#endif

        return builder.Build();
    }

    /// <summary>
    /// Writes unhandled exception info to a crash log file for debugging.
    /// </summary>
    /// <param name="ex">The unhandled exception.</param>
    /// <param name="source">Where the exception was caught.</param>
    internal static void LogCrash(Exception ex, string source)
    {
        try
        {
            var logPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Torqena", "crash.log");
            Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
            var entry = $"[{DateTime.UtcNow:O}] {source}\n{ex}\n\n";
            File.AppendAllText(logPath, entry);
        }
        catch { /* best-effort */ }
    }
}
