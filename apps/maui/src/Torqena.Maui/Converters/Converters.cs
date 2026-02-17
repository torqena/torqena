/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module Converters
 * @description XAML value converters for the MAUI application.
 * Provides boolean-to-icon, boolean inversion, and tab color converters.
 *
 * @since 0.1.0
 */

using System.Globalization;

namespace Torqena.Maui.Converters;

/// <summary>
/// Converts a boolean (IsFolder) to a file/folder icon string.
/// </summary>
public class BoolToIconConverter : IValueConverter
{
    /// <inheritdoc />
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is true ? "📁" : "📄";

    /// <inheritdoc />
    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>
/// Inverts a boolean value.
/// </summary>
public class InvertBoolConverter : IValueConverter
{
    /// <inheritdoc />
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is bool b ? !b : value;

    /// <inheritdoc />
    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is bool b ? !b : value;
}

/// <summary>
/// Converts a boolean (IsActive) to a tab background color.
/// </summary>
public class BoolToTabColorConverter : IValueConverter
{
    /// <inheritdoc />
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var isActive = value is true;
        if (Application.Current?.RequestedTheme == AppTheme.Dark)
            return isActive ? Color.FromArgb("#2d2d2d") : Color.FromArgb("#1e1e1e");
        return isActive ? Colors.White : Color.FromArgb("#f0f0f0");
    }

    /// <inheritdoc />
    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
