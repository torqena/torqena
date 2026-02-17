/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ProcessService
 * @description Child process management using System.Diagnostics.Process.
 * Supports spawning, stdin/stdout/stderr streaming, and lifecycle management.
 * Desktop only — mobile platforms report IsSupported = false.
 *
 * @since 0.1.0
 */

using System.Collections.Concurrent;
using System.Diagnostics;

namespace Torqena.Maui.Services;

/// <summary>
/// Process management service using <see cref="System.Diagnostics.Process"/>.
/// Tracks active processes by ID and routes output events to subscribers.
/// </summary>
public class ProcessService : IProcessService
{
    private readonly ConcurrentDictionary<string, ManagedProcess> _processes = new();

    /// <inheritdoc />
    public bool IsSupported =>
#if ANDROID || IOS
        false;
#else
        true;
#endif

    /// <inheritdoc />
    public Task<SpawnedProcess> SpawnAsync(
        string command,
        string[] args,
        string? workingDirectory = null,
        Dictionary<string, string>? environment = null)
    {
#if ANDROID || IOS
        throw new PlatformNotSupportedException("Process spawning is not supported on mobile platforms.");
#else
        var id = Guid.NewGuid().ToString("N")[..12];

        var startInfo = new ProcessStartInfo
        {
            FileName = command,
            Arguments = string.Join(' ', args.Select(a => a.Contains(' ') ? $"\"{a}\"" : a)),
            WorkingDirectory = workingDirectory ?? Environment.CurrentDirectory,
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };

        if (environment is not null)
        {
            foreach (var (key, value) in environment)
            {
                startInfo.Environment[key] = value;
            }
        }

        var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
        var managed = new ManagedProcess(id, process);
        _processes[id] = managed;

        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is not null)
            {
                managed.InvokeStdout(e.Data);
            }
        };

        process.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is not null)
            {
                managed.InvokeStderr(e.Data);
            }
        };

        process.Exited += (_, _) =>
        {
            var exitCode = process.ExitCode;
            managed.InvokeClose(exitCode);
            _processes.TryRemove(id, out _);
        };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        return Task.FromResult(new SpawnedProcess(id, process.Id));
#endif
    }

    /// <inheritdoc />
    public async Task WriteStdinAsync(string processId, string data)
    {
        if (_processes.TryGetValue(processId, out var managed))
        {
            await managed.Process.StandardInput.WriteAsync(data);
            return;
        }
        throw new InvalidOperationException($"Process '{processId}' not found.");
    }

    /// <inheritdoc />
    public Task KillAsync(string processId)
    {
        if (_processes.TryRemove(processId, out var managed))
        {
            try
            {
                managed.Process.Kill(entireProcessTree: true);
            }
            catch (InvalidOperationException)
            {
                // Process already exited
            }
            finally
            {
                managed.Process.Dispose();
            }
        }
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public IDisposable OnStdout(string processId, Action<string> handler)
    {
        if (_processes.TryGetValue(processId, out var managed))
        {
            return managed.SubscribeStdout(handler);
        }
        return new NoOpDisposable();
    }

    /// <inheritdoc />
    public IDisposable OnStderr(string processId, Action<string> handler)
    {
        if (_processes.TryGetValue(processId, out var managed))
        {
            return managed.SubscribeStderr(handler);
        }
        return new NoOpDisposable();
    }

    /// <inheritdoc />
    public IDisposable OnClose(string processId, Action<int> handler)
    {
        if (_processes.TryGetValue(processId, out var managed))
        {
            return managed.SubscribeClose(handler);
        }
        return new NoOpDisposable();
    }

    /// <summary>
    /// Tracks a managed process with event subscriptions.
    /// </summary>
    /// <internal />
    private sealed class ManagedProcess(string id, Process process)
    {
        public string Id { get; } = id;
        public Process Process { get; } = process;

        private readonly List<Action<string>> _stdoutHandlers = [];
        private readonly List<Action<string>> _stderrHandlers = [];
        private readonly List<Action<int>> _closeHandlers = [];

        public IDisposable SubscribeStdout(Action<string> handler)
        {
            _stdoutHandlers.Add(handler);
            return new ActionDisposable(() => _stdoutHandlers.Remove(handler));
        }

        public IDisposable SubscribeStderr(Action<string> handler)
        {
            _stderrHandlers.Add(handler);
            return new ActionDisposable(() => _stderrHandlers.Remove(handler));
        }

        public IDisposable SubscribeClose(Action<int> handler)
        {
            _closeHandlers.Add(handler);
            return new ActionDisposable(() => _closeHandlers.Remove(handler));
        }

        public void InvokeStdout(string data)
        {
            foreach (var h in _stdoutHandlers) h(data);
        }

        public void InvokeStderr(string data)
        {
            foreach (var h in _stderrHandlers) h(data);
        }

        public void InvokeClose(int exitCode)
        {
            foreach (var h in _closeHandlers) h(exitCode);
        }
    }

    /// <internal />
    private sealed class ActionDisposable(Action action) : IDisposable
    {
        public void Dispose() => action();
    }

    /// <internal />
    private sealed class NoOpDisposable : IDisposable
    {
        public void Dispose() { }
    }
}
