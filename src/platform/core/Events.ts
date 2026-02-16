/**
 * Event system replicating Obsidian's Events base class.
 *
 * Provides on/off/offref/trigger pattern used by Vault, Workspace, and
 * other eventing subsystems.
 */

/** Opaque handle returned by {@link Events.on}, used to unsubscribe. */
export interface EventRef {
	/** @internal */ _name: string;
	/** @internal */ _callback: (...args: any[]) => any;
}

/**
 * Simple event emitter matching the Obsidian Events API.
 */
export class Events {
	private _listeners: Map<string, Array<(...args: any[]) => any>> = new Map();

	/**
	 * Subscribe to an event.
	 * @returns An opaque ref that can be passed to {@link offref}.
	 */
	on(name: string, callback: (...args: any[]) => any): EventRef {
		let list = this._listeners.get(name);
		if (!list) {
			list = [];
			this._listeners.set(name, list);
		}
		list.push(callback);
		return { _name: name, _callback: callback };
	}

	/** Unsubscribe a callback by function reference. */
	off(name: string, callback: (...args: any[]) => any): void {
		const list = this._listeners.get(name);
		if (!list) return;
		const idx = list.indexOf(callback);
		if (idx !== -1) list.splice(idx, 1);
	}

	/** Unsubscribe using the ref returned by {@link on}. */
	offref(ref: EventRef): void {
		this.off(ref._name, ref._callback);
	}

	/** Emit an event, calling all subscribers synchronously. */
	trigger(name: string, ...args: any[]): void {
		const list = this._listeners.get(name);
		if (!list) return;
		for (const cb of [...list]) {
			cb(...args);
		}
	}
}
