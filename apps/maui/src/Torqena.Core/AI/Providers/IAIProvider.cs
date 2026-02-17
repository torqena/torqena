/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module IAIProvider
 * @description Abstract interface for AI providers. Mirrors the TypeScript AIProvider
 * base class architecture. Implementations use Microsoft Agent Framework.
 *
 * @see {@link AIProviderFactory} for creating provider instances.
 * @since 0.1.0
 */

namespace Torqena.Core.AI.Providers;

/// <summary>
/// Represents a message in the conversation history.
/// </summary>
/// <param name="Role">Message role (system, user, assistant, tool).</param>
/// <param name="Content">Message text content.</param>
/// <param name="Name">Optional name (for tool results).</param>
/// <param name="ToolCallId">Optional tool call ID (for tool results).</param>
public record ChatMessage(
    string Role,
    string Content,
    string? Name = null,
    string? ToolCallId = null
);

/// <summary>
/// Represents a streaming chunk from the AI provider.
/// </summary>
/// <param name="Content">The text content of this chunk (may be partial).</param>
/// <param name="IsComplete">Whether this is the final chunk.</param>
/// <param name="ToolCalls">Any tool calls requested in this chunk.</param>
public record StreamChunk(
    string Content,
    bool IsComplete = false,
    IReadOnlyList<ToolCall>? ToolCalls = null
);

/// <summary>
/// Represents a tool call requested by the AI provider.
/// </summary>
/// <param name="Id">Unique tool call ID.</param>
/// <param name="Name">Tool function name.</param>
/// <param name="Arguments">JSON-serialized arguments.</param>
public record ToolCall(
    string Id,
    string Name,
    string Arguments
);

/// <summary>
/// Definition of a tool that can be invoked by the AI provider.
/// </summary>
/// <param name="Name">Tool name (used in function calling).</param>
/// <param name="Description">Human-readable description of what the tool does.</param>
/// <param name="ParametersSchema">JSON Schema for the tool parameters.</param>
public record ToolDefinition(
    string Name,
    string Description,
    string ParametersSchema
);

/// <summary>
/// Configuration for an AI provider.
/// </summary>
public record AIProviderConfig
{
    /// <summary>Provider type: "openai", "azure-openai", "copilot".</summary>
    public required string ProviderType { get; init; }

    /// <summary>API key for authentication.</summary>
    public string? ApiKey { get; init; }

    /// <summary>API endpoint URL (for Azure OpenAI).</summary>
    public string? Endpoint { get; init; }

    /// <summary>Model name or deployment name.</summary>
    public string Model { get; init; } = "gpt-4o";

    /// <summary>Maximum tokens for completion.</summary>
    public int MaxTokens { get; init; } = 4096;

    /// <summary>Temperature for response sampling (0.0 - 2.0).</summary>
    public double Temperature { get; init; } = 0.7;
}

/// <summary>
/// Abstract interface for AI chat providers. All providers must implement
/// message sending (with optional streaming), tool management, and lifecycle.
/// </summary>
public interface IAIProvider : IDisposable
{
    /// <summary>
    /// Gets the provider type identifier.
    /// </summary>
    string ProviderType { get; }

    /// <summary>
    /// Whether the provider is initialized and ready to send messages.
    /// </summary>
    bool IsReady { get; }

    /// <summary>
    /// Initializes the provider with the given configuration.
    /// </summary>
    /// <param name="config">Provider configuration.</param>
    Task InitializeAsync(AIProviderConfig config);

    /// <summary>
    /// Sends a message and returns the complete response.
    /// </summary>
    /// <param name="message">User message text.</param>
    /// <param name="systemPrompt">Optional system prompt override.</param>
    /// <returns>The assistant's response text.</returns>
    Task<string> SendMessageAsync(string message, string? systemPrompt = null);

    /// <summary>
    /// Sends a message and streams the response as chunks.
    /// </summary>
    /// <param name="message">User message text.</param>
    /// <param name="systemPrompt">Optional system prompt override.</param>
    /// <returns>Async enumerable of stream chunks.</returns>
    IAsyncEnumerable<StreamChunk> SendMessageStreamingAsync(string message, string? systemPrompt = null);

    /// <summary>
    /// Aborts the current message processing.
    /// </summary>
    Task AbortAsync();

    /// <summary>
    /// Sets the tool definitions available to this provider.
    /// </summary>
    /// <param name="tools">Tool definitions to make available.</param>
    void SetTools(IReadOnlyList<ToolDefinition> tools);

    /// <summary>
    /// Gets the conversation message history.
    /// </summary>
    /// <returns>List of messages in the conversation.</returns>
    IReadOnlyList<ChatMessage> GetMessageHistory();

    /// <summary>
    /// Clears the conversation history.
    /// </summary>
    void ClearHistory();
}
