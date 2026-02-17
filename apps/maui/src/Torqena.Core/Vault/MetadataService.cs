/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module MetadataService
 * @description Parses YAML frontmatter from markdown files and provides
 * metadata access. Uses YamlDotNet for YAML parsing.
 *
 * @example
 * ```csharp
 * var metadata = MetadataService.ParseFrontmatter(markdownContent);
 * var title = metadata?["title"]?.ToString();
 * ```
 *
 * @since 0.1.0
 */

using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace Torqena.Core.Vault;

/// <summary>
/// Service for parsing and manipulating YAML frontmatter in markdown files.
/// </summary>
public static class MetadataService
{
    private static readonly IDeserializer Deserializer = new DeserializerBuilder()
        .WithNamingConvention(CamelCaseNamingConvention.Instance)
        .Build();

    private static readonly ISerializer Serializer = new SerializerBuilder()
        .WithNamingConvention(CamelCaseNamingConvention.Instance)
        .Build();

    /// <summary>
    /// Parses YAML frontmatter from markdown content.
    /// </summary>
    /// <param name="content">Full markdown file content.</param>
    /// <returns>Dictionary of frontmatter key-value pairs, or null if no frontmatter.</returns>
    /// <example>
    /// ```csharp
    /// var fm = MetadataService.ParseFrontmatter("---\ntitle: Hello\ntags: [a, b]\n---\n# Content");
    /// // fm["title"] == "Hello"
    /// // fm["tags"] == ["a", "b"]
    /// ```
    /// </example>
    public static Dictionary<string, object>? ParseFrontmatter(string content)
    {
        var (yaml, _, _) = ExtractFrontmatter(content);
        if (yaml is null) return null;

        try
        {
            return Deserializer.Deserialize<Dictionary<string, object>>(yaml);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Strips frontmatter from markdown content, returning only the body.
    /// </summary>
    /// <param name="content">Full markdown file content.</param>
    /// <returns>Markdown content without the frontmatter block.</returns>
    public static string StripFrontmatter(string content)
    {
        var (_, _, endIndex) = ExtractFrontmatter(content);
        return endIndex >= 0 ? content[(endIndex + 1)..].TrimStart('\n', '\r') : content;
    }

    /// <summary>
    /// Replaces or adds frontmatter to markdown content.
    /// </summary>
    /// <param name="content">Full markdown file content.</param>
    /// <param name="properties">Properties to serialize as frontmatter.</param>
    /// <returns>Markdown content with updated frontmatter.</returns>
    public static string ReplaceFrontmatter(string content, Dictionary<string, object> properties)
    {
        var yaml = Serializer.Serialize(properties).TrimEnd('\n', '\r');
        var body = StripFrontmatter(content);
        return $"---\n{yaml}\n---\n{body}";
    }

    /// <summary>
    /// Checks whether the content has a YAML frontmatter block.
    /// </summary>
    /// <param name="content">Markdown content to check.</param>
    /// <returns>True if frontmatter delimiters are present.</returns>
    public static bool HasFrontmatter(string content)
    {
        var (yaml, _, _) = ExtractFrontmatter(content);
        return yaml is not null;
    }

    /// <summary>
    /// Extracts the raw YAML string and its position from markdown content.
    /// </summary>
    /// <param name="content">Full markdown file content.</param>
    /// <returns>Tuple of (yaml string or null, start index of closing ---, end index of closing ---).</returns>
    /// <internal />
    private static (string? yaml, int startIndex, int endIndex) ExtractFrontmatter(string content)
    {
        if (!content.StartsWith("---"))
        {
            return (null, -1, -1);
        }

        var closingIndex = content.IndexOf("\n---", 3, StringComparison.Ordinal);
        if (closingIndex < 0)
        {
            return (null, -1, -1);
        }

        // Move past the newline
        var yamlStart = content.IndexOf('\n', 0) + 1;
        var yaml = content[yamlStart..closingIndex];
        var endIndex = closingIndex + 4; // past \n---

        return (yaml, closingIndex + 1, endIndex);
    }
}
