/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module submitRating
 * @description Azure Function that creates or updates a user's rating for an extension.
 *
 * **POST /api/ratings**
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { validateExtensionId, validateUserHash, validateRating, validateVersion } from "../utils/validation.js";
import { checkRateLimit } from "../utils/rateLimiter.js";
import { handlePreflight, withCors } from "../utils/cors.js";

/**
 * Handle POST /api/ratings.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with the updated aggregate rating.
 */
async function submitRating(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return handlePreflight(request);
    context.log("Processing submitRating request");

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

    const ratingResult = validateRating(body.rating);
    if (!ratingResult.valid) {
        return withCors(request, { status: 400, jsonBody: { error: ratingResult.error } });
    }

    const versionResult = validateVersion(body.version);
    if (!versionResult.valid) {
        return withCors(request, { status: 400, jsonBody: { error: versionResult.error } });
    }

    if (!checkRateLimit(body.userHash as string)) {
        return withCors(request, { status: 429, jsonBody: { error: "Rate limit exceeded. Please try again later." } });
    }

    try {
        const svc = TableStorageService.getInstance();
        const result = await svc.submitRating({
            extensionId: body.extensionId as string,
            userHash: body.userHash as string,
            rating: body.rating as number,
            comment: (body.comment as string) ?? undefined,
            version: body.version as string,
        });

        return withCors(request, {
            status: 200,
            jsonBody: {
                message: "Rating submitted successfully",
                averageRating: result.averageRating,
                ratingCount: result.ratingCount,
            },
        });
    } catch (err) {
        context.error("Error submitting rating:", err);
        return withCors(request, { status: 500, jsonBody: { error: "Internal server error" } });
    }
}

app.http("submitRating", {
    methods: ["POST", "OPTIONS"],
    authLevel: "anonymous",
    route: "ratings",
    handler: submitRating,
});
