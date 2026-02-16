/**
 * Browser/Electron bridge for Node.js child_process API.
 *
 * In Electron web-shell mode, this shim proxies process operations through
 * `window.electronAPI` (IPC to main process). In plain browser mode, it fails
 * with an explicit error.
 */

type Listener<T = any> = (arg: T) => void;

interface ElectronApiExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	error: string | null;
}

interface ElectronApiSpawnResult {
	id: number;
	pid: number;
}

interface ElectronApiBridge {
	isElectron: true;
	exec(command: string, options?: { timeout?: number; maxBuffer?: number; cwd?: string; env?: Record<string, string> }): Promise<ElectronApiExecResult>;
	spawn(command: string, args?: string[], options?: { cwd?: string; env?: Record<string, string> }): Promise<ElectronApiSpawnResult>;
	stdin(id: number, data: string): Promise<boolean>;
	kill(id: number): Promise<boolean>;
	onStdout(id: number, callback: (data: string) => void): () => void;
	onStderr(id: number, callback: (data: string) => void): () => void;
	onClose(id: number, callback: (code: number) => void): () => void;
	onError(id: number, callback: (message: string) => void): () => void;
}

class MiniEmitter {
	private listeners = new Map<string, Listener[]>();

	on(event: string, listener: Listener): this {
		const arr = this.listeners.get(event) ?? [];
		arr.push(listener);
		this.listeners.set(event, arr);
		return this;
	}

	off(event: string, listener: Listener): this {
		const arr = this.listeners.get(event) ?? [];
		this.listeners.set(
			event,
			arr.filter((item) => item !== listener),
		);
		return this;
	}

	emit(event: string, arg?: any): void {
		const arr = this.listeners.get(event) ?? [];
		for (const listener of arr) {
			listener(arg);
		}
	}
}

class StreamEmitter extends MiniEmitter {
	/** Queued writes while the real write handler is not yet installed */
	private pendingWrites: Array<{ data: string | Buffer; encoding?: string; cb?: () => void }> = [];
	private realWrite: ((data: string, cb?: () => void) => void) | null = null;

	/**
	 * Install the real write handler and flush any buffered writes.
	 * Called once the IPC spawn promise resolves.
	 */
	setRealWrite(fn: (data: string, cb?: () => void) => void): void {
		this.realWrite = fn;
		for (const item of this.pendingWrites) {
			const str = typeof item.data === "string" ? item.data : String(item.data);
			fn(str, item.cb);
		}
		this.pendingWrites = [];
	}

	write(data: string | Buffer, _encodingOrCb?: string | (() => void), _cb?: () => void): boolean {
		const encoding = typeof _encodingOrCb === "string" ? _encodingOrCb : undefined;
		const cb = typeof _encodingOrCb === "function" ? _encodingOrCb : _cb;

		if (this.realWrite) {
			const str = typeof data === "string" ? data : String(data);
			this.realWrite(str, cb);
		} else {
			// Buffer until real writer is installed
			this.pendingWrites.push({ data, encoding, cb });
		}
		return true;
	}

	end(): void {
		this.emit("end");
	}
}

export class ChildProcess extends MiniEmitter {
	pid = 0;
	stdin: StreamEmitter;
	stdout: StreamEmitter;
	stderr: StreamEmitter;
	private processId: number | null = null;
	private unsubscribers: Array<() => void> = [];

	constructor() {
		super();
		this.stdin = new StreamEmitter();
		this.stdout = new StreamEmitter();
		this.stderr = new StreamEmitter();
	}

	setProcessMeta(processId: number, pid: number): void {
		this.processId = processId;
		this.pid = pid;
	}

	addUnsubscriber(unsubscribe: () => void): void {
		this.unsubscribers.push(unsubscribe);
	}

	kill(): void {
		if (this.processId != null) {
			void window.electronAPI?.kill(this.processId);
		}
		this.dispose();
	}

	dispose(): void {
		for (const unsubscribe of this.unsubscribers) {
			unsubscribe();
		}
		this.unsubscribers = [];
	}
}

function ensureElectronApi(): ElectronApiBridge {
	const electronApi = (window as any).electronAPI as ElectronApiBridge | undefined;
	if (!electronApi?.isElectron) {
		throw new Error("child_process is only available in Electron shell mode");
	}
	return electronApi;
}

export function spawn(command: string, args: string[] = [], options: { cwd?: string; env?: Record<string, string> } = {}): ChildProcess {
	const child = new ChildProcess();

	try {
		const electronApi = ensureElectronApi();
		void electronApi.spawn(command, args, options)
			.then(({ id, pid }: ElectronApiSpawnResult) => {
				child.setProcessMeta(id, pid);

				// Install the real stdin writer and flush any buffered writes
				child.stdin.setRealWrite((data: string, cb?: () => void) => {
					void electronApi.stdin(id, data);
					if (cb) queueMicrotask(cb);
				});

				// Emit Buffer objects so vscode-jsonrpc's instanceof Buffer checks pass
				const toBuffer = (data: string) => {
					const B = (globalThis as any).Buffer;
					return B ? B.from(data) : data;
				};

				child.addUnsubscriber(electronApi.onStdout(id, (data: string) => {
					child.stdout.emit("data", toBuffer(data));
				}));

				child.addUnsubscriber(electronApi.onStderr(id, (data: string) => {
					child.stderr.emit("data", toBuffer(data));
				}));

				child.addUnsubscriber(electronApi.onClose(id, (code: number) => {
					child.emit("close", code);
					child.dispose();
				}));

				child.addUnsubscriber(electronApi.onError(id, (message: string) => {
					child.emit("error", new Error(message));
					child.dispose();
				}));
			})
			.catch((error: unknown) => {
				child.emit("error", error);
			});
	} catch (error) {
		queueMicrotask(() => child.emit("error", error));
	}

	return child;
}

export function exec(
	command: string,
	optionsOrCallback?: { timeout?: number; maxBuffer?: number; cwd?: string; env?: Record<string, string> } | ((error: Error | null, stdout: string, stderr: string) => void),
	callback?: (error: Error | null, stdout: string, stderr: string) => void,
): ChildProcess {
	const child = new ChildProcess();
	const options = typeof optionsOrCallback === "function" ? {} : (optionsOrCallback ?? {});
	const cb = (typeof optionsOrCallback === "function" ? optionsOrCallback : callback) ?? (() => {});

	try {
		const electronApi = ensureElectronApi();
		void electronApi.exec(command, options)
			.then((result: ElectronApiExecResult) => {
				if (result.stdout) {
					child.stdout.emit("data", result.stdout);
				}
				if (result.stderr) {
					child.stderr.emit("data", result.stderr);
				}

				if (result.exitCode !== 0) {
					const error = new Error(result.error || result.stderr || `Command failed: ${command}`) as Error & { code?: number };
					error.code = result.exitCode;
					cb(error, result.stdout, result.stderr);
					child.emit("error", error);
				} else {
					cb(null, result.stdout, result.stderr);
				}

				child.emit("close", result.exitCode);
			})
			.catch((error: Error) => {
				cb(error, "", "");
				child.emit("error", error);
			});
	} catch (error) {
		queueMicrotask(() => {
			cb(error as Error, "", "");
			child.emit("error", error);
		});
	}

	return child;
}

export function execFile(command: string, args: string[] = [], options?: { timeout?: number; cwd?: string; env?: Record<string, string> }, callback?: (error: Error | null, stdout: string, stderr: string) => void): ChildProcess {
	const fullCommand = args.length > 0
		? `${command} ${args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ")}`
		: command;
	return exec(fullCommand, options, callback);
}
