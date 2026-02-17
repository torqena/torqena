/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module OpenAIProvider
 * @description AI provider implementation for direct OpenAI API access.
 * Uses Microsoft Agent Framework for orchestration.
 * Supports streaming, tool calling, and conversation history.
 *
 * @since 0.1.0
 */

using System.Text.Json;

namespace Torqena.Core.AI.Providers;

/// <summary>
/// OpenAI API provider using direct HTTP access.
/// Placeholder implementation — will be replaced with Microsoft Agent Framework
/// SDK integration once packages are available.
/// </summary>
public class OpenAIProvider : IAIProvider
{
    private AIProviderConfig? _config;
    private HttpClient? _httpClient;
    private readonly List<ChatMessage> _history = [];
    private readonly List<ToolDefinition> _tools = [];
    private CancellationTokenSource? _cts;

    /// <inheritdoc />
    public string ProviderType => "openai";

    /// <inheritdoc />
    public bool IsReady => _config is not null && !string.IsNullOrEmpty(_config.ApiKey);

    /// <inheritdoc />
    public Task InitializeAsync(AIProviderConfig config)
    {
        _config = config;
        _httpClient = new HttpClient
        {
            BaseAddress = new Uri("https://api.openai.com/v1/"),
            DefaultRequestHeaders =
            {
                { "Authorization", $"Bearer {config.ApiKey}" }
            }
        };
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public async Task<string> SendMessageAsync(string message, string? systemPrompt = null)
    {
        if (!IsReady || _httpClient is null || _config is null)
            throw new InvalidOperationException("Provider not initialized.");

        _cts = new CancellationTokenSource();

        _history.Add(new ChatMessage("user", message));

        var requestBody = BuildRequestBody(systemPrompt, stream: false);
        var response = await _httpClient.PostAsync(
            "chat/completions",
            new StringContent(JsonSerializer.Serialize(requestBody), System.Text.Encoding.UTF8, "application/json"),
            _cts.Token
        );

        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(_cts.Token);
        var result = JsonDocument.Parse(json);
        var content = result.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString() ?? "";

        _history.Add(new ChatMessage("assistant", content));
        return content;
    }

    /// <inheritdoc />
    public async IAsyncEnumerable<StreamChunk> SendMessageStreamingAsync(
        string message,
        string? systemPrompt = null)
    {
        if (!IsReady || _httpClient is null || _config is null)
            throw new InvalidOperationException("Provider not initialized.");

        _cts = new CancellationTokenSource();

        _history.Add(new ChatMessage("user", message));

        var requestBody = BuildRequestBody(systemPrompt, stream: true);
        var request = new HttpRequestMessage(HttpMethod.Post, "chat/completions")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(requestBody),
                System.Text.Encoding.UTF8,
                "application/json"
            )
        };

        var response = await _httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            _cts.Token
        );
        response.EnsureSuccessStatusCode();

        var fullContent = "";
        using var stream = await response.Content.ReadAsStreamAsync(_cts.Token);
        using var reader = new StreamReader(stream);

        while (!reader.EndOfStream && !_cts.Token.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(_cts.Token);
            if (string.IsNullOrEmpty(line)) continue;
            if (!line.StartsWith("data: ")) continue;

            var data = line["data: ".Length..];
            if (data == "[DONE]")
            {
                _history.Add(new ChatMessage("assistant", fullContent));
                yield return new StreamChunk(fullContent, IsComplete: true);
                yield break;
            }

            string? deltaContent = null;
            try
            {
                var chunk = JsonDocument.Parse(data);
                var delta = chunk.RootElement
                    .GetProperty("choices")[0]
                    .GetProperty("delta");

                if (delta.TryGetProperty("content", out var contentProp))
                {
                    deltaContent = contentProp.GetString() ?? "";
                }
            }
            catch (JsonException)
            {
                // Skip malformed chunks
            }

            if (deltaContent is not null)
            {
                fullContent += deltaContent;
                yield return new StreamChunk(deltaContent);
            }
        }

        if (!string.IsNullOrEmpty(fullContent))
        {
            _history.Add(new ChatMessage("assistant", fullContent));
            yield return new StreamChunk(fullContent, IsComplete: true);
        }
    }

    /// <inheritdoc />
    public Task AbortAsync()
    {
        _cts?.Cancel();
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public void SetTools(IReadOnlyList<ToolDefinition> tools)
    {
        _tools.Clear();
        _tools.AddRange(tools);
    }

    /// <inheritdoc />
    public IReadOnlyList<ChatMessage> GetMessageHistory() => _history.AsReadOnly();

    /// <inheritdoc />
    public void ClearHistory() => _history.Clear();

    /// <inheritdoc />
    public void Dispose()
    {
        _cts?.Dispose();
        _httpClient?.Dispose();
        GC.SuppressFinalize(this);
    }

    /// <summary>
    /// Builds the JSON request body for the OpenAI API.
    /// </summary>
    /// <internal />
    private Dictionary<string, object> BuildRequestBody(string? systemPrompt, bool stream)
    {
        var messages = new List<Dictionary<string, string>>();

        // System message
        var sysPrompt = systemPrompt ?? "You are a helpful assistant for a note-taking and knowledge management application called Torqena.";
        messages.Add(new Dictionary<string, string>
        {
            ["role"] = "system",
            ["content"] = sysPrompt
        });

        // Conversation history
        foreach (var msg in _history)
        {
            messages.Add(new Dictionary<string, string>
            {
                ["role"] = msg.Role,
                ["content"] = msg.Content
            });
        }

        var body = new Dictionary<string, object>
        {
            ["model"] = _config!.Model,
            ["messages"] = messages,
            ["max_tokens"] = _config.MaxTokens,
            ["temperature"] = _config.Temperature,
            ["stream"] = stream
        };

        return body;
    }
}
