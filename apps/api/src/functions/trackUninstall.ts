/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module trackUninstall
 * @description Azure Function that marks an extension installation as inactive.
 *
 * **POST /api/uninstalls**
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { validateExtensionId, validateUserHash } from "../utils/validation.js";
import { checkRateLimit } from "../utils/rateLimiter.js";
import { handlePreflight, withCors } from "../utils/cors.js";

/**
 * Handle POST /api/uninstalls.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with status 200 on success.
 */
async function trackUninstall(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return handlePreflight(request);
    context.log("Processing trackUninstall request");

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return withCors(request, { status: 400, jsonBody: { error: "Invalid JSON body" } });
    }

    const extensionIdResult = validateExtensionId(body.extensionId);
    if (!extensionIdResult.valid) {
        return withCors(request, { status: 400, jsonBody: { error: extensionIdResult.error } });
    }

    const userHashResult = validateUserHash(body.userHash);
    if (!userHashResult.valid) {
        return withCors(request, { status: 400, jsonBody: { error: userHashResult.error } });
    }

    if (!checkRateLimit(body.userHash as string)) {
        return withCors(request, { status: 429, jsonBody: { error: "Rate limit exceeded. Please try again later." } });
    }

    try {
        const svc = TableStorageService.getInstance();
        await svc.trackUninstall(
            body.extensionId as string,
            body.userHash as string,
        );

        return withCors(request, {
            status: 200,
            jsonBody: { message: "Uninstall tracked successfully" },
        });
    } catch (err) {
        context.error("Error tracking uninstall:", err);
        return withCors(request, { status: 500, jsonBody: { error: "Internal server error" } });
    }
}

app.http("trackUninstall", {
    methods: ["POST", "OPTIONS"],
    authLevel: "anonymous",
    route: "uninstalls",
    handler: trackUninstall,
});
