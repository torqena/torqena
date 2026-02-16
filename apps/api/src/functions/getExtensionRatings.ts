/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module getExtensionRatings
 * @description Azure Function that returns all ratings (with comments) for a
 * specific extension. Used by the GitHub Pages website to render the Feedback
 * section on extension detail pages.
 *
 * @example
 * ```
 * GET /api/ratings/{extensionId}
 * ```
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { handlePreflight, withCors } from "../utils/cors.js";

/**
 * Handler for GET /api/ratings/{extensionId}.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns JSON array of rating objects.
 */
async function handler(
    request: HttpRequest,
    context: InvocationContext,
): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return handlePreflight(request);

    const extensionId = request.params.extensionId;

    if (!extensionId || extensionId.trim().length === 0) {
        return withCors(request, {
            status: 400,
            jsonBody: { error: "extensionId parameter is required" },
        });
    }

    try {
        const svc = TableStorageService.getInstance();
        const ratings = await svc.getExtensionRatings(extensionId);

        return withCors(request, {
            status: 200,
            jsonBody: ratings,
            headers: {
                "Cache-Control": "public, max-age=60",
            },
        });
    } catch (error) {
        context.error(`Failed to fetch ratings for ${extensionId}:`, error);
        return withCors(request, {
            status: 500,
            jsonBody: { error: "Internal server error" },
        });
    }
}

app.http("getExtensionRatings", {
    methods: ["GET", "OPTIONS"],
    authLevel: "anonymous",
    route: "ratings/{extensionId}",
    handler,
});
