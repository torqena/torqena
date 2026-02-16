/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module tests/smoke/api-smoke
 * @description Smoke tests for the Vault Copilot Analytics API running on Azure Container Apps.
 *
 * These tests hit the **live** API endpoint and verify that all 12 HTTP-triggered
 * functions respond correctly.  They create ephemeral test data, validate responses,
 * and clean up after themselves.
 *
 * Run with:
 * ```bash
 * npx vitest run src/tests/smoke/api-smoke.test.ts
 * ```
 *
 * The base URL defaults to the production Container Apps endpoint but can be
 * overridden via the `SMOKE_API_URL` environment variable.
 *
 * @since 0.1.0
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";

/* ── Configuration ────────────────────────────────────────────────── */

/**
 * Skip smoke tests unless explicitly enabled via RUN_SMOKE_TESTS=true.
 * These tests hit a live API and should only run when the API is available.
 */
const SKIP_SMOKE_TESTS = process.env.RUN_SMOKE_TESTS !== "true";

const BASE_URL =
	process.env.SMOKE_API_URL ??
	"https://vault-copilot-api.purpleocean-69a206db.eastus.azurecontainerapps.io";
const API = `${BASE_URL}/api`;

/** SHA-256 of "danielshue" — used as the authenticated user hash. */
const USER_HASH = crypto.createHash("sha256").update("danielshue").digest("hex");

const TEST_EXT_ID = "smoke-test-ext";

/* ── Helpers ──────────────────────────────────────────────────────── */

interface ApiResponse {
	status: number;
	body: any;
}

/**
 * Thin wrapper around `fetch` that returns a normalised { status, body } tuple.
 *
 * @param url - Absolute URL to call.
 * @param options - Standard fetch RequestInit plus optional `json` shorthand.
 * @returns Normalised response.
 */
async function api(
	url: string,
	options: RequestInit & { json?: unknown } = {},
): Promise<ApiResponse> {
	const headers: Record<string, string> = {
		...(options.headers as Record<string, string>),
	};

	let body = options.body;
	if (options.json !== undefined) {
		headers["Content-Type"] = "application/json";
		body = JSON.stringify(options.json);
	}

	const res = await fetch(url, {
		...options,
		headers,
		body,
	});

	let parsed: any;
	const text = await res.text();
	try {
		parsed = JSON.parse(text);
	} catch {
		parsed = text;
	}

	return { status: res.status, body: parsed };
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Smoke Tests                                                       */
/* ═══════════════════════════════════════════════════════════════════ */

describe.skipIf(SKIP_SMOKE_TESTS)("Smoke: Vault Copilot Analytics API", () => {
	/* ── 1. Health ─────────────────────────────────────────────── */

	describe("Health", () => {
		it("GET /health returns 200 with status=healthy", async () => {
			const { status, body } = await api(`${API}/health`);

			expect(status).toBe(200);
			expect(body.status).toBe("healthy");
			expect(body.service).toBe("vault-copilot-analytics");
		});
	});

	/* ── 2. Setup ──────────────────────────────────────────────── */

	describe("Setup", () => {
		it("POST /setup creates tables", async () => {
			const { status, body } = await api(`${API}/setup`, { method: "POST" });

			expect(status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.tables).toHaveLength(3);
		});
	});

	/* ── 3. Track Install ──────────────────────────────────────── */

	describe("Track Install", () => {
		it("POST /installs with valid data → 201", async () => {
			const { status } = await api(`${API}/installs`, {
				method: "POST",
				json: {
					extensionId: TEST_EXT_ID,
					userHash: USER_HASH,
					version: "1.0.0",
					platform: "desktop",
					vaultCopilotVersion: "0.1.0",
				},
			});

			expect(status).toBe(201);
		});

		it("POST /installs with no body → 400", async () => {
			const { status } = await api(`${API}/installs`, { method: "POST" });

			expect(status).toBe(400);
		});

		it("POST /installs with invalid data → 400", async () => {
			const { status } = await api(`${API}/installs`, {
				method: "POST",
				json: {
					extensionId: "",
					userHash: "bad",
					version: "x",
					platform: "unknown",
				},
			});

			expect(status).toBe(400);
		});
	});

	/* ── 4. Track Uninstall ────────────────────────────────────── */

	describe("Track Uninstall", () => {
		it("POST /uninstalls with valid data → 200", async () => {
			const { status } = await api(`${API}/uninstalls`, {
				method: "POST",
				json: {
					extensionId: TEST_EXT_ID,
					userHash: USER_HASH,
				},
			});

			expect(status).toBe(200);
		});

		it("POST /uninstalls with no body → 400", async () => {
			const { status } = await api(`${API}/uninstalls`, { method: "POST" });

			expect(status).toBe(400);
		});
	});

	/* ── 5. Ratings ────────────────────────────────────────────── */

	describe("Ratings", () => {
		it("POST /ratings (submit) → 200", async () => {
			const { status, body } = await api(`${API}/ratings`, {
				method: "POST",
				json: {
					extensionId: TEST_EXT_ID,
					userHash: USER_HASH,
					rating: 4,
					comment: "Smoke test rating",
					version: "1.0.0",
				},
			});

			expect(status).toBe(200);
			expect(body.message).toBe("Rating submitted successfully");
			expect(body.averageRating).toBeDefined();
			expect(body.ratingCount).toBeDefined();
		});

		it("GET /ratings/{extensionId} → 200", async () => {
			const { status, body } = await api(`${API}/ratings/${TEST_EXT_ID}`);

			expect(status).toBe(200);
			expect(Array.isArray(body)).toBe(true);
		});

		it("GET /user/{userHash}/ratings → 200", async () => {
			const { status, body } = await api(`${API}/user/${USER_HASH}/ratings`);

			expect(status).toBe(200);
			expect(Array.isArray(body)).toBe(true);
		});

		it("POST /ratings with no body → 400", async () => {
			const { status } = await api(`${API}/ratings`, { method: "POST" });

			expect(status).toBe(400);
		});
	});

	/* ── 6. Metrics ────────────────────────────────────────────── */

	describe("Metrics", () => {
		it("GET /metrics/{extensionId} → 200 with install counts", async () => {
			const { status, body } = await api(`${API}/metrics/${TEST_EXT_ID}`);

			expect(status).toBe(200);
			expect(body.totalInstalls).toBeDefined();
			expect(body.activeInstalls).toBeDefined();
		});

		it("GET /metrics?ids=... (batch) → 200", async () => {
			const ids = [TEST_EXT_ID, "nonexistent-ext"].join(",");
			const { status, body } = await api(`${API}/metrics?ids=${ids}`);

			expect(status).toBe(200);
			expect(body).toBeDefined();
		});

		it("GET /metrics with no ids → 400", async () => {
			const { status } = await api(`${API}/metrics`);

			expect(status).toBe(400);
		});
	});

	/* ── 7. User Data (GDPR) ──────────────────────────────────── */

	describe("User Data (GDPR)", () => {
		it("GET /user/{userHash}/data → 200 with installs and ratings", async () => {
			const { status, body } = await api(`${API}/user/${USER_HASH}/data`);

			expect(status).toBe(200);
			expect(body.installs).toBeDefined();
			expect(body.ratings).toBeDefined();
		});
	});

	/* ── 8. Cleanup ────────────────────────────────────────────── */

	describe("Cleanup", () => {
		it("DELETE /ratings/{extensionId}/{userHash} → 200", async () => {
			const { status, body } = await api(
				`${API}/ratings/${TEST_EXT_ID}/${USER_HASH}`,
				{
					method: "DELETE",
					headers: { "x-user-hash": USER_HASH },
				},
			);

			expect(status).toBe(200);
			expect(body.success).toBe(true);
		});

		it("DELETE /user/{userHash} (GDPR delete) → 204", async () => {
			const { status } = await api(`${API}/user/${USER_HASH}`, {
				method: "DELETE",
				headers: { "x-user-hash": USER_HASH },
			});

			expect(status).toBe(204);
		});
	});

	/* ── 9. Validation edge cases ──────────────────────────────── */

	describe("Validation", () => {
		it("POST /installs rejects XSS in extensionId → 400", async () => {
			const { status } = await api(`${API}/installs`, {
				method: "POST",
				json: {
					extensionId: "<script>alert(1)</script>",
					userHash: USER_HASH,
					version: "1.0.0",
					platform: "desktop",
				},
			});

			expect(status).toBe(400);
		});

		it("POST /installs rejects >100 char extensionId → 400", async () => {
			const { status } = await api(`${API}/installs`, {
				method: "POST",
				json: {
					extensionId: "a".repeat(101),
					userHash: USER_HASH,
					version: "1.0.0",
					platform: "desktop",
				},
			});

			expect(status).toBe(400);
		});

		it("POST /installs rejects invalid userHash → 400", async () => {
			const { status } = await api(`${API}/installs`, {
				method: "POST",
				json: {
					extensionId: TEST_EXT_ID,
					userHash: "not-a-valid-hash",
					version: "1.0.0",
					platform: "desktop",
				},
			});

			expect(status).toBe(400);
		});
	});
});



