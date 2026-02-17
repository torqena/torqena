/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module MainPage
 * @description Code-behind for the main page. Hosts the three-column layout
 * (file explorer, editor, chat) and wires up the EditorWebView control.
 *
 * @since 0.1.0
 */

using Torqena.Maui.ViewModels;

namespace Torqena.Maui.Views;

/// <summary>
/// Main page of the application. Contains the three-column workspace layout.
/// </summary>
public partial class MainPage : ContentPage
{
    private readonly MainViewModel _viewModel;

    /// <summary>
    /// Initializes the main page with injected view model.
    /// </summary>
    /// <param name="viewModel">The main view model instance.</param>
    public MainPage(MainViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        BindingContext = viewModel;
    }

    /// <inheritdoc />
    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _viewModel.InitializeCommand.ExecuteAsync(null);
        await _viewModel.Chat.InitializeProviderCommand.ExecuteAsync(null);
    }
}
