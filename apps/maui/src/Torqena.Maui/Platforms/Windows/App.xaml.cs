/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

namespace Torqena.Maui.WinUI;

/// <summary>
/// Windows platform application entry point.
/// </summary>
public partial class App : MauiWinUIApplication
{
    /// <summary>
    /// Initializes a new instance of the Windows app.
    /// </summary>
    public App()
    {
        this.InitializeComponent();

        this.UnhandledException += (_, e) =>
        {
            MauiProgram.LogCrash(e.Exception, "WinUI.UnhandledException");
        };
    }

    /// <inheritdoc />
    protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();
}
