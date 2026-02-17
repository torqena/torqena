/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

namespace Torqena.Maui;

/// <summary>
/// Application entry point. Configures the MAUI app and creates the main window.
/// </summary>
public partial class App : Application
{
    /// <summary>
    /// Initializes a new instance of <see cref="App"/>.
    /// </summary>
    public App()
    {
        InitializeComponent();

        // Wire up global exception handlers for crash diagnostics
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            if (e.ExceptionObject is Exception ex)
                MauiProgram.LogCrash(ex, "AppDomain.UnhandledException");
        };

        TaskScheduler.UnobservedTaskException += (_, e) =>
        {
            MauiProgram.LogCrash(e.Exception, "TaskScheduler.UnobservedTaskException");
            e.SetObserved();
        };
    }

    /// <summary>
    /// Creates the main window for the application.
    /// </summary>
    /// <param name="activationState">The activation state provided by the platform.</param>
    /// <returns>A new <see cref="Window"/> containing the <see cref="AppShell"/>.</returns>
    protected override Window CreateWindow(IActivationState? activationState)
    {
        return new Window(new AppShell())
        {
            Title = "Torqena",
            MinimumWidth = 400,
            MinimumHeight = 300,
        };
    }
}
