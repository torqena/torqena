/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module ui/extensions/ExtensionWebView
 * @description Web view for displaying extension detail pages in an iframe
 */

import { ItemView, WorkspaceLeaf } from "obsidian";

export const EXTENSION_WEB_VIEW_TYPE = "extension-web-view";

/**
 * Web view for displaying extension detail pages within Obsidian.
 * Uses an iframe to render the GitHub Pages content.
 */
export class ExtensionWebView extends ItemView {
	private url: string = "";
	private extensionName: string = "Extension Details";
	private iframe: HTMLIFrameElement | null = null;
	
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}
	
	getViewType(): string {
		return EXTENSION_WEB_VIEW_TYPE;
	}
	
	getDisplayText(): string {
		return this.extensionName;
	}
	
	getIcon(): string {
		return "globe";
	}
	
	async setState(state: Record<string, unknown>, result: unknown): Promise<void> {
		this.url = (state.url as string) || "";
		this.extensionName = (state.extensionName as string) || "Extension Details";
		await this.render();
	}
	
	getState(): Record<string, unknown> {
		return {
			url: this.url,
			extensionName: this.extensionName
		};
	}
	
	async onOpen(): Promise<void> {
		await this.render();
	}
	
	private async render(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("extension-web-view");
		
		if (!this.url) {
			container.createDiv({ text: "No URL provided", cls: "extension-web-view-error" });
			return;
		}
		
		// Create wrapper for proper positioning
		const wrapper = container.createDiv({ cls: "extension-web-view-wrapper" });
		
		// Create iframe
		this.iframe = wrapper.createEl("iframe", {
			cls: "extension-web-view-iframe",
			attr: {
				src: this.url,
				sandbox: "allow-scripts allow-same-origin allow-popups allow-forms"
			}
		});
	}
	
	async onClose(): Promise<void> {
		if (this.iframe) {
			this.iframe.remove();
			this.iframe = null;
		}
	}
}
