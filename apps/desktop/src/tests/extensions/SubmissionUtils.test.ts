/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/extensions/SubmissionUtils.test
 * @description Unit tests for extension submission utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { App } from "obsidian";
import { openExtensionPathDialog } from "../../ui/extensions/Submission/utils";

describe("openExtensionPathDialog", () => {
	const createAppWithBasePath = (basePath: string): App => {
		const app = new App();
		(app.vault as any).adapter = {
			getBasePath: () => basePath,
			basePath
		};
		return app;
	};

	const installDialogMock = (result: { canceled?: boolean; filePaths?: string[] }) => {
		const showOpenDialog = vi.fn().mockResolvedValue(result);
		(globalThis as any).window = {
			require: vi.fn().mockReturnValue({
				remote: {
					dialog: {
						showOpenDialog
					}
				}
			})
		};
		return showOpenDialog;
	};

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		delete (globalThis as any).window;
	});

	it("returns an error when the vault base path is unavailable", async () => {
		const app = new App();
		(app.vault as any).adapter = {};

		const result = await openExtensionPathDialog(app, "agent");

		expect(result.path).toBeNull();
		expect(result.error).toBe("File browsing is only available for local desktop vaults.");
	});

	it("returns null when the user cancels the dialog", async () => {
		const app = createAppWithBasePath("C:/Vault");
		installDialogMock({ canceled: true, filePaths: [] });

		const result = await openExtensionPathDialog(app, "agent");

		expect(result.path).toBeNull();
		expect(result.error).toBeUndefined();
	});

	it("returns an error when selection is outside the vault", async () => {
		const app = createAppWithBasePath("C:/Vault");
		installDialogMock({ canceled: false, filePaths: ["C:/Other/agent.agent.md"] });

		const result = await openExtensionPathDialog(app, "agent");

		expect(result.path).toBeNull();
		expect(result.error).toBe("Please choose a file or folder inside the current vault.");
	});

	it("returns a vault-relative path when selection is inside the vault", async () => {
		const app = createAppWithBasePath("C:/Vault");
		installDialogMock({ canceled: false, filePaths: ["C:/Vault/extensions/agents/my-agent/"] });

		const result = await openExtensionPathDialog(app, "agent");

		expect(result.path).toBe("extensions/agents/my-agent");
		expect(result.error).toBeUndefined();
	});
});



