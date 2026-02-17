/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module IProcessService
 * @description Abstraction for spawning and managing child processes.
 * Required for MCP stdio servers and GitHub Copilot CLI sidecar.
 * Only available on desktop platforms (Windows, macOS).
 * Mobile platforms throw PlatformNotSupportedException.
 *
 * @since 0.1.0
 */

namespace Torqena.Maui.Services;

/// <summary>
/// Represents a spawned child process.
/// </summary>
/// <param name="Id">Unique process identifier for tracking.</param>
/// <param name="Pid">OS-level process ID.</param>
public record SpawnedProcess(string Id, int Pid);

/// <summary>
/// Service for spawning and managing child processes.
/// Desktop only — mobile platforms cannot spawn processes.
/// </summary>
public interface IProcessService
{
    /// <summary>
    /// Whether process spawning is supported on the current platform.
    /// </summary>
    bool IsSupported { get; }

    /// <summary>
    /// Spawns a child process.
    /// </summary>
    /// <param name="command">The command or executable to run.</param>
    /// <param name="args">Command-line arguments.</param>
    /// <param name="workingDirectory">Working directory for the process.</param>
    /// <param name="environment">Additional environment variables.</param>
    /// <returns>Information about the spawned process.</returns>
    /// <throws><see cref="PlatformNotSupportedException"/> on mobile platforms.</throws>
    Task<SpawnedProcess> SpawnAsync(
        string command,
        string[] args,
        string? workingDirectory = null,
        Dictionary<string, string>? environment = null);

    /// <summary>
    /// Writes data to a process's standard input.
    /// </summary>
    /// <param name="processId">The process ID returned by <see cref="SpawnAsync"/>.</param>
    /// <param name="data">Data to write to stdin.</param>
    Task WriteStdinAsync(string processId, string data);

    /// <summary>
    /// Kills a running process.
    /// </summary>
    /// <param name="processId">The process ID to kill.</param>
    Task KillAsync(string processId);

    /// <summary>
    /// Subscribes to stdout output from a process.
    /// </summary>
    /// <param name="processId">The process ID to monitor.</param>
    /// <param name="handler">Callback invoked with each line of stdout.</param>
    /// <returns>Disposable that unsubscribes when disposed.</returns>
    IDisposable OnStdout(string processId, Action<string> handler);

    /// <summary>
    /// Subscribes to stderr output from a process.
    /// </summary>
    /// <param name="processId">The process ID to monitor.</param>
    /// <param name="handler">Callback invoked with each line of stderr.</param>
    /// <returns>Disposable that unsubscribes when disposed.</returns>
    IDisposable OnStderr(string processId, Action<string> handler);

    /// <summary>
    /// Subscribes to process exit events.
    /// </summary>
    /// <param name="processId">The process ID to monitor.</param>
    /// <param name="handler">Callback invoked with the exit code when the process exits.</param>
    /// <returns>Disposable that unsubscribes when disposed.</returns>
    IDisposable OnClose(string processId, Action<int> handler);
}
