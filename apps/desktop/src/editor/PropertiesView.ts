/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module PropertiesView
 * @description Right-sidebar panel for viewing and editing YAML frontmatter properties.
 *
 * Renders an Obsidian-style property table that reflects the active file's
 * frontmatter. Edits update the YAML in-place via vault.modify().
 *
 * @since 0.0.28
 */

import { ItemView } from "../platform/ui/ItemView.js";
import type { WorkspaceLeaf } from "../platform/workspace/WorkspaceLeaf.js";
import type { TFile } from "../platform/vault/TFile.js";
import type { EventRef } from "../platform/core/Events.js";
import {
	parseFrontmatter,
	replaceFrontmatter,
	renderPropertiesTable,
	isTypeChangeCompatible,
	coerceValue,
	showTypeChangeConfirmation,
} from "./FrontmatterService.js";
import type { PropertyTypeRegistry } from "./PropertyTypeRegistry.js";

/** View type constant for registration. */
export const PROPERTIES_VIEW_TYPE = "properties-view";

/**
 * Properties panel view for the right sidebar.
 *
 * Listens for active file changes and renders an editable properties table.
 */
export class PropertiesView extends ItemView {
	private vault: any;
	private registry: PropertyTypeRegistry | undefined;
	private activeFile: TFile | null = null;
	private activeContentOverride: string | null = null;
	private properties: Record<string, unknown> = {};
	private panelEl: HTMLElement | null = null;
	private workspaceFileOpenRef: EventRef | null = null;
	private workspaceContentChangeRef: EventRef | null = null;
	private vaultModifyRef: EventRef | null = null;

	constructor(leaf: WorkspaceLeaf, vault: any, registry?: PropertyTypeRegistry) {
		super(leaf);
		this.vault = vault;
		this.registry = registry;
	}

	getViewType(): string {
		return PROPERTIES_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Properties";
	}

	getIcon(): string {
		return "file-text";
	}

	async onOpen(): Promise<void> {
		this.panelEl = document.createElement("div");
		this.panelEl.className = "ws-properties-panel";
		this.contentEl.appendChild(this.panelEl);

		// Listen for active file changes
		this.workspaceFileOpenRef = this.app.workspace.on("file-open", (file: TFile | null) => {
			this.activeFile = file;
			this.activeContentOverride = null;
			this.refresh();
		});

		// Listen for live editor content changes so source YAML edits refresh immediately
		this.workspaceContentChangeRef = this.app.workspace.on("file-content-change", (file: TFile | null, content?: string) => {
			if (!this.activeFile || !file) return;
			if (file.path !== this.activeFile.path) return;
			this.activeContentOverride = typeof content === "string" ? content : null;
			this.refresh();
		});

		// Listen for file modifications to keep in sync
		this.vaultModifyRef = this.vault.on("modify", (file: TFile) => {
			if (this.activeFile && file.path === this.activeFile.path) {
				this.activeContentOverride = null;
				this.refresh();
			}
		});

		// Show current active file if any
		this.activeFile = this.app.workspace.getActiveFile();
		this.refresh();
	}

	async onClose(): Promise<void> {
		if (this.workspaceFileOpenRef) {
			this.app.workspace.offref(this.workspaceFileOpenRef);
			this.workspaceFileOpenRef = null;
		}
		if (this.workspaceContentChangeRef) {
			this.app.workspace.offref(this.workspaceContentChangeRef);
			this.workspaceContentChangeRef = null;
		}
		if (this.vaultModifyRef) {
			this.vault.offref(this.vaultModifyRef);
			this.vaultModifyRef = null;
		}
	}

	/**
	 * Refresh the properties display for the current active file.
	 */
	private async refresh(): Promise<void> {
		if (!this.panelEl) return;

		if (!this.activeFile) {
			this.properties = {};
			this.panelEl.innerHTML = "";
			renderPropertiesTable(this.panelEl, {}, {
				onPropertyAdd: (key, value) => this.addProperty(key, value),
				onTypeChange: (key, newType) => this.handleTypeChange(key, newType),
			}, this.registry);
			return;
		}

		let content: string;
		if (this.activeContentOverride !== null) {
			content = this.activeContentOverride;
		} else {
			try {
				content = await this.vault.read(this.activeFile);
			} catch {
				this.panelEl.innerHTML = '<div class="ws-properties-panel-empty">Unable to read file</div>';
				return;
			}
		}

		const fm = parseFrontmatter(content);
		if (!fm || Object.keys(fm.properties).length === 0) {
			this.properties = {};
			// Show empty state with option to add properties
			this.panelEl.innerHTML = "";
			renderPropertiesTable(this.panelEl, {}, {
				onPropertyAdd: (key, value) => this.addProperty(key, value),
				onTypeChange: (key, newType) => this.handleTypeChange(key, newType),
			}, this.registry);
			return;
		}

		this.properties = { ...fm.properties };
		this.panelEl.innerHTML = "";

		renderPropertiesTable(this.panelEl, this.properties, {
			onPropertyChange: (key, newValue) => this.updateProperty(key, newValue),
			onPropertyDelete: (key) => this.deleteProperty(key),
			onPropertyAdd: (key, value) => this.addProperty(key, value),
			onTypeChange: (key, newType) => this.handleTypeChange(key, newType),
		}, this.registry);
	}

	/**
	 * Update a single property and write back to the file.
	 */
	private async updateProperty(key: string, newValue: unknown): Promise<void> {
		if (!this.activeFile) return;

		this.properties[key] = newValue;
		await this.writeProperties();
	}

	/**
	 * Delete a property and write back to the file.
	 */
	private async deleteProperty(key: string): Promise<void> {
		if (!this.activeFile) return;

		delete this.properties[key];
		await this.writeProperties();
	}

	/**
	 * Add a new property and write back to the file.
	 */
	private async addProperty(key: string, value: unknown): Promise<void> {
		if (!this.activeFile) return;

		this.properties[key] = value;
		await this.writeProperties();
	}

	/**
	 * Handle a property type change from the type picker.
	 *
	 * If the type change is compatible (e.g. text↔multiline), it applies
	 * silently. Otherwise, shows a confirmation modal before coercing the
	 * value and updating the registry.
	 */
	private async handleTypeChange(key: string, newType: import("./FrontmatterService.js").PropertyType): Promise<void> {
		if (!this.activeFile) return;

		const currentValue = this.properties[key];
		const { detectPropertyType } = await import("./FrontmatterService.js");
		const currentType = detectPropertyType(key, currentValue, this.registry);

		if (currentType === newType) return;

		const apply = async () => {
			const coerced = coerceValue(currentValue, currentType, newType);
			this.properties[key] = coerced;
			if (this.registry) {
				this.registry.setType(key, newType);
			}
			await this.writeProperties();
			this.refresh();
		};

		if (isTypeChangeCompatible(currentType, newType)) {
			await apply();
		} else {
			showTypeChangeConfirmation(currentType, newType, () => {
				apply();
			});
		}
	}

	/**
	 * Serialize current properties and write to the file via vault.modify().
	 */
	private async writeProperties(): Promise<void> {
		if (!this.activeFile) return;

		try {
			const content = this.activeContentOverride ?? await this.vault.read(this.activeFile);
			const newContent = replaceFrontmatter(content, this.properties);
			this.activeContentOverride = newContent;
			await this.vault.modify(this.activeFile, newContent);
			// refresh() will be triggered by the vault "modify" event
		} catch (err) {
			console.error("[PropertiesView] Failed to write properties:", err);
		}
	}
}




