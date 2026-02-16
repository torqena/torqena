/**
 * Minimal stub for Node.js net module used by SDK imports in web-shell.
 */

class MiniEmitter {
	private listeners = new Map<string, Array<(...args: any[]) => void>>();

	on(event: string, listener: (...args: any[]) => void): this {
		const list = this.listeners.get(event) ?? [];
		list.push(listener);
		this.listeners.set(event, list);
		return this;
	}

	emit(event: string, ...args: any[]): void {
		const list = this.listeners.get(event) ?? [];
		for (const listener of list) {
			listener(...args);
		}
	}
}

export class Socket extends MiniEmitter {
	destroy(): void {
		this.emit("close");
	}
}

export default { Socket };
