/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module trackInstall
 * @description Azure Function that records a new extension installation.
 *
 * **POST /api/installs**
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { validateExtensionId, validateUserHash, validateVersion, validatePlatform } from "../utils/validation.js";
import { checkRateLimit } from "../utils/rateLimiter.js";
import { handlePreflight, withCors } from "../utils/cors.js";

/**
 * Handle POST /api/installs.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with status 201 on success.
 */
async function trackInstall(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return handlePreflight(request);
    context.log("Processing trackInstall request");

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return withCors(request, { status: 400, jsonBody: { error: "Invalid JSON body" } });
    }

    // Validate fields
    const extensionIdResult = validateExtensionId(body.extensionId);
    if (!extensionIdResult.valid) {
        return withCors(request, { status: 400, jsonBody: { error: extensionIdResult.error } });
    }

    const userHashResult = validateUserHash(body.userHash);
    if (!userHashResult.valid) {
        return withCors(request, { status: 400, jsonBody: { error: userHashResult.error } });
    }

    const versionResult = validateVersion(body.version);
    if (!versionResult.valid) {
        return withCors(request, { status: 400, jsonBody: { error: versionResult.error } });
    }

    const platformResult = validatePlatform(body.platform);
    if (!platformResult.valid) {
        return withCors(request, { status: 400, jsonBody: { error: platformResult.error } });
    }

    // Rate limit
    if (!checkRateLimit(body.userHash as string)) {
        return withCors(request, { status: 429, jsonBody: { error: "Rate limit exceeded. Please try again later." } });
    }

    try {
        const svc = TableStorageService.getInstance();
        
        // Ensure tables exist before attempting to write
        await svc.ensureTablesExist();
        
        await svc.trackInstall({
            extensionId: body.extensionId as string,
            userHash: body.userHash as string,
            version: body.version as string,
            platform: body.platform as string,
            vaultCopilotVersion: (body.vaultCopilotVersion as string) ?? "unknown",
        });

        return withCors(request, {
            status: 201,
            jsonBody: { message: "Install tracked successfully" },
        });
    } catch (err) {
        context.error("Error tracking install:", err);
        return withCors(request, { status: 500, jsonBody: { error: "Internal server error" } });
    }
}

app.http("trackInstall", {
    methods: ["POST", "OPTIONS"],
    authLevel: "anonymous",
    route: "installs",
    handler: trackInstall,
});
