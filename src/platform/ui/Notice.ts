/**
 * Notice — toast notification replicating Obsidian's Notice class.
 *
 * Displays a temporary notification in the top-right corner.
 */

export class Notice {
	private _noticeEl: HTMLElement;

	constructor(message: string | DocumentFragment, timeout = 5000) {
		// Ensure the notice container exists
		let container = document.querySelector(
			".notice-container",
		) as HTMLElement | null;
		if (!container) {
			container = document.createElement("div");
			container.addClass("notice-container");
			container.style.position = "fixed";
			container.style.top = "0";
			container.style.right = "0";
			container.style.zIndex = "9999";
			container.style.padding = "8px";
			container.style.display = "flex";
			container.style.flexDirection = "column";
			container.style.gap = "4px";
			container.style.pointerEvents = "none";
			document.body.appendChild(container);
		}

		this._noticeEl = document.createElement("div");
		this._noticeEl.addClass("notice");
		this._noticeEl.style.pointerEvents = "auto";

		if (typeof message === "string") {
			this._noticeEl.textContent = message;
		} else {
			this._noticeEl.appendChild(message);
		}

		container.appendChild(this._noticeEl);

		if (timeout > 0) {
			setTimeout(() => this.hide(), timeout);
		}
	}

	/** Set the notice message. */
	setMessage(message: string | DocumentFragment): this {
		if (typeof message === "string") {
			this._noticeEl.textContent = message;
		} else {
			this._noticeEl.textContent = "";
			this._noticeEl.appendChild(message);
		}
		return this;
	}

	/** Remove the notice. */
	hide(): void {
		this._noticeEl.remove();
	}
}
