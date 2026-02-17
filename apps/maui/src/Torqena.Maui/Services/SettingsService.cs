/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module SettingsService
 * @description Application settings management using MAUI Preferences API.
 * Provides reactive settings with INotifyPropertyChanged for MVVM binding.
 * Settings are pushed to the EditorWebView when changed.
 *
 * @since 0.1.0
 */

using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Torqena.Maui.Services;

/// <summary>
/// Centralized settings management backed by MAUI <see cref="Preferences"/>.
/// Implements <see cref="INotifyPropertyChanged"/> for reactive UI binding.
/// </summary>
public class SettingsService : INotifyPropertyChanged
{
    /// <summary>
    /// Occurs when a property value changes.
    /// </summary>
    public event PropertyChangedEventHandler? PropertyChanged;

    /// <summary>
    /// Occurs when any setting is changed. Used to sync settings to the EditorWebView.
    /// </summary>
    public event Action<string, object?>? SettingChanged;

    // --- Appearance ---

    /// <summary>
    /// Gets or sets the app theme (system, light, dark).
    /// </summary>
    public string Theme
    {
        get => Get("system");
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets the editor theme for light mode.
    /// </summary>
    public string EditorThemeLight
    {
        get => Get("default");
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets the editor theme for dark mode.
    /// </summary>
    public string EditorThemeDark
    {
        get => Get("default");
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets the editor font size in pixels.
    /// </summary>
    public int FontSize
    {
        get => GetInt(16);
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets whether readable line length is enabled (max-width 700px).
    /// </summary>
    public bool ReadableLineLength
    {
        get => GetBool(true);
        set => Set(value);
    }

    // --- Editor ---

    /// <summary>
    /// Gets or sets whether line numbers are shown.
    /// </summary>
    public bool ShowLineNumbers
    {
        get => GetBool(true);
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets the tab size in spaces.
    /// </summary>
    public int TabSize
    {
        get => GetInt(4);
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets whether tabs or spaces are used for indentation.
    /// </summary>
    public bool IndentUsingTabs
    {
        get => GetBool(true);
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets whether bracket matching is enabled.
    /// </summary>
    public bool AutoPairBrackets
    {
        get => GetBool(true);
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets whether code folding by headings is enabled.
    /// </summary>
    public bool FoldHeadings
    {
        get => GetBool(true);
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets whether code folding by indent level is enabled.
    /// </summary>
    public bool FoldIndent
    {
        get => GetBool(false);
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets whether the spellchecker is enabled.
    /// </summary>
    public bool Spellcheck
    {
        get => GetBool(true);
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets whether Vim key bindings are enabled.
    /// </summary>
    public bool VimKeyBindings
    {
        get => GetBool(false);
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets whether indentation guides are shown.
    /// </summary>
    public bool IndentationGuides
    {
        get => GetBool(false);
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets the default editing view mode (source, live-preview, reading).
    /// </summary>
    public string DefaultViewMode
    {
        get => Get("live-preview");
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets how properties/frontmatter are displayed (source, visible, hidden).
    /// </summary>
    public string PropertiesInDocument
    {
        get => Get("visible");
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets whether right-to-left text direction is enabled.
    /// </summary>
    public bool RightToLeft
    {
        get => GetBool(false);
        set => Set(value);
    }

    // --- AI ---

    /// <summary>
    /// Gets or sets the active AI provider type (copilot, openai, azure-openai).
    /// </summary>
    public string AIProvider
    {
        get => Get("openai");
        set => Set(value);
    }

    /// <summary>
    /// Gets or sets the selected AI model name.
    /// </summary>
    public string AIModel
    {
        get => Get("gpt-4o");
        set => Set(value);
    }

    // --- Helpers ---

    /// <summary>
    /// Serializes all settings to a JSON dictionary for sending to the EditorWebView.
    /// </summary>
    /// <returns>JSON string of all settings.</returns>
    public string ToJson()
    {
        var dict = new Dictionary<string, object?>
        {
            ["theme"] = Theme,
            ["editorThemeLight"] = EditorThemeLight,
            ["editorThemeDark"] = EditorThemeDark,
            ["fontSize"] = FontSize,
            ["readableLineLength"] = ReadableLineLength,
            ["showLineNumbers"] = ShowLineNumbers,
            ["tabSize"] = TabSize,
            ["indentUsingTabs"] = IndentUsingTabs,
            ["autoPairBrackets"] = AutoPairBrackets,
            ["foldHeadings"] = FoldHeadings,
            ["foldIndent"] = FoldIndent,
            ["spellcheck"] = Spellcheck,
            ["vimKeyBindings"] = VimKeyBindings,
            ["indentationGuides"] = IndentationGuides,
            ["defaultViewMode"] = DefaultViewMode,
            ["propertiesInDocument"] = PropertiesInDocument,
            ["rightToLeft"] = RightToLeft,
            ["aiProvider"] = AIProvider,
            ["aiModel"] = AIModel,
        };
        return JsonSerializer.Serialize(dict);
    }

    /// <internal />
    private string Get(string defaultValue, [CallerMemberName] string key = "")
        => Preferences.Get($"torqena_{key}", defaultValue);

    /// <internal />
    private int GetInt(int defaultValue, [CallerMemberName] string key = "")
        => Preferences.Get($"torqena_{key}", defaultValue);

    /// <internal />
    private bool GetBool(bool defaultValue, [CallerMemberName] string key = "")
        => Preferences.Get($"torqena_{key}", defaultValue);

    /// <internal />
    private void Set(object? value, [CallerMemberName] string key = "")
    {
        var prefKey = $"torqena_{key}";
        switch (value)
        {
            case string s: Preferences.Set(prefKey, s); break;
            case int i: Preferences.Set(prefKey, i); break;
            case bool b: Preferences.Set(prefKey, b); break;
            default: Preferences.Set(prefKey, value?.ToString() ?? ""); break;
        }
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(key));
        SettingChanged?.Invoke(key, value);
    }
}
