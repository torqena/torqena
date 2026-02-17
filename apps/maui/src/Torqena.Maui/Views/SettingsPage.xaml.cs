/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module SettingsPage
 * @description Code-behind for the settings page.
 * Loads secrets on navigation and exposes the settings view model.
 *
 * @since 0.1.0
 */

using Torqena.Maui.ViewModels;

namespace Torqena.Maui.Views;

/// <summary>
/// Settings page. Allows users to configure appearance, editor, and AI settings.
/// </summary>
public partial class SettingsPage : ContentPage
{
    private readonly SettingsViewModel _viewModel;

    /// <summary>
    /// Initializes the settings page with injected view model.
    /// </summary>
    /// <param name="viewModel">The settings view model instance.</param>
    public SettingsPage(SettingsViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        BindingContext = viewModel;
    }

    /// <inheritdoc />
    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _viewModel.LoadSecretsCommand.ExecuteAsync(null);
    }
}
