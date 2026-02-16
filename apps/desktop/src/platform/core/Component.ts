/**
 * Component lifecycle base class replicating Obsidian's Component.
 *
 * Tracks registered events, DOM events, and intervals so they can all
 * be cleaned up when the component is unloaded.
 */

import { EventRef, Events } from "./Events.js";

export class Component {
	private _eventRefs: EventRef[] = [];
	private _domCleanups: Array<() => void> = [];
	private _intervals: number[] = [];
	private _children: Component[] = [];
	private _loaded = false;

	/** Register an EventRef for automatic cleanup on unload. */
	registerEvent(eventRef: EventRef): void {
		this._eventRefs.push(eventRef);
	}

	/** Register a DOM event listener for automatic cleanup on unload. */
	registerDomEvent<K extends keyof HTMLElementEventMap>(
		el: HTMLElement | Window | Document,
		event: K | string,
		callback: EventListener,
		options?: boolean | AddEventListenerOptions,
	): void {
		el.addEventListener(event as string, callback, options);
		this._domCleanups.push(() =>
			el.removeEventListener(event as string, callback, options),
		);
	}

	/** Register a setInterval handle for automatic cleanup on unload. */
	registerInterval(id: number): number {
		this._intervals.push(id);
		return id;
	}

	/** Add a child component whose lifecycle is tied to this one. */
	addChild<T extends Component>(child: T): T {
		this._children.push(child);
		if (this._loaded) child.load();
		return child;
	}

	/** Remove a child component. */
	removeChild(child: Component): void {
		const idx = this._children.indexOf(child);
		if (idx !== -1) {
			this._children.splice(idx, 1);
			child.unload();
		}
	}

	/** Called by the framework to initialize this component. */
	load(): void {
		this._loaded = true;
		this.onload();
	}

	/** Called by the framework to tear down this component. */
	unload(): void {
		this._loaded = false;
		this.onunload();

		// Clean up registered events (offref needs the source Events instance,
		// but we don't have it here; the refs are typically cleaned up by the
		// Vault/Workspace that owns the Events instance when the plugin unloads).
		this._eventRefs = [];

		// Clean up DOM events
		for (const cleanup of this._domCleanups) cleanup();
		this._domCleanups = [];

		// Clean up intervals
		for (const id of this._intervals) window.clearInterval(id);
		this._intervals = [];

		// Unload children
		for (const child of this._children) child.unload();
		this._children = [];
	}

	/** Override in subclass for initialization logic. */
	onload(): void {}

	/** Override in subclass for teardown logic. */
	onunload(): void {}
}
