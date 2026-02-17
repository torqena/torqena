/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AIProviderFactory
 * @description Factory for creating AI provider instances based on configuration.
 * Supports OpenAI, Azure OpenAI, and GitHub Copilot provider types.
 *
 * @example
 * ```csharp
 * var factory = new AIProviderFactory();
 * var provider = factory.Create(new AIProviderConfig { ProviderType = "openai", ApiKey = "..." });
 * await provider.InitializeAsync(config);
 * ```
 *
 * @since 0.1.0
 */

namespace Torqena.Core.AI.Providers;

/// <summary>
/// Factory for creating AI provider instances based on configuration.
/// </summary>
public class AIProviderFactory
{
    /// <summary>
    /// Creates an AI provider instance based on the provider type in the configuration.
    /// </summary>
    /// <param name="config">Provider configuration specifying the type and credentials.</param>
    /// <returns>An initialized <see cref="IAIProvider"/> instance.</returns>
    /// <throws><see cref="ArgumentException"/> if the provider type is not recognized.</throws>
    /// <example>
    /// ```csharp
    /// var provider = factory.Create(new AIProviderConfig
    /// {
    ///     ProviderType = "openai",
    ///     ApiKey = "sk-...",
    ///     Model = "gpt-4o"
    /// });
    /// ```
    /// </example>
    public IAIProvider Create(AIProviderConfig config)
    {
        return config.ProviderType.ToLowerInvariant() switch
        {
            "openai" => new OpenAIProvider(),
            "azure-openai" => new AzureOpenAIProvider(),
            // "copilot" => new CopilotProvider(), // TODO: Implement Copilot sidecar
            _ => throw new ArgumentException($"Unknown AI provider type: {config.ProviderType}", nameof(config))
        };
    }

    /// <summary>
    /// Gets the list of supported provider types.
    /// </summary>
    /// <returns>Array of supported provider type identifiers.</returns>
    public static string[] GetSupportedProviders()
    {
        return ["openai", "azure-openai"];
    }

    /// <summary>
    /// Gets the available models for a given provider type.
    /// </summary>
    /// <param name="providerType">The provider type.</param>
    /// <returns>Array of model name strings.</returns>
    public static string[] GetModelsForProvider(string providerType)
    {
        return providerType.ToLowerInvariant() switch
        {
            "openai" => ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "o1", "o1-mini", "o3-mini"],
            "azure-openai" => ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4"],
            "copilot" => ["gpt-5", "gpt-5-mini", "claude-sonnet-4.5", "gemini-2.0-flash"],
            _ => []
        };
    }
}
