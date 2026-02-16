/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module deleteRating
 * @description Azure Function that deletes a user's rating for an extension.
 *
 * **DELETE /api/ratings/{extensionId}/{userHash}**
 *
 * Removes the rating row from Table Storage and refreshes the aggregate metrics cache.
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { validateExtensionId, validateUserHash } from "../utils/validation.js";
import { handlePreflight, withCors } from "../utils/cors.js";

/**
 * Handle DELETE /api/ratings/{extensionId}/{userHash}.
 *
 * @param request - Incoming HTTP request with route params.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} confirming deletion.
 */
async function deleteRating(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return handlePreflight(request);
    context.log("Processing deleteRating request");

    const extensionId = request.params.extensionId;
    const userHash = request.params.userHash;
    const authenticatedUserHash = request.headers.get("x-user-hash");

    // Validate required parameters
    const extensionIdResult = validateExtensionId(extensionId);
    if (!extensionIdResult.valid) {
        return withCors(request, {
            status: 400,
            jsonBody: { error: extensionIdResult.error },
        });
    }

    const userHashResult = validateUserHash(userHash);
    if (!userHashResult.valid) {
        return withCors(request, {
            status: 400,
            jsonBody: { error: userHashResult.error },
        });
    }

    // Authorization: Only the user themselves can delete their rating
    if (!authenticatedUserHash || authenticatedUserHash !== userHash) {
        context.warn(`Unauthorized delete attempt: authenticated=${authenticatedUserHash}, target=${userHash}`);
        return withCors(request, {
            status: 403,
            jsonBody: { error: "Forbidden: You can only delete your own ratings" },
        });
    }

    try {
        const svc = TableStorageService.getInstance();
        await svc.ensureTablesExist();
        await svc.deleteRating(extensionId!, userHash!);

        // Get updated metrics after deletion
        const metrics = await svc.getMetrics(extensionId!);

        context.log(`Successfully deleted rating for extension ${extensionId} by user ${userHash}`);

        return withCors(request, {
            status: 200,
            jsonBody: {
                success: true,
                message: "Rating deleted successfully",
                aggregateRating: metrics.averageRating,
                ratingCount: metrics.ratingCount,
            },
        });
    } catch (err) {
        context.error("Error deleting rating:", err);
        return withCors(request, {
            status: 500,
            jsonBody: { error: "Failed to delete rating" },
        });
    }
}

app.http("deleteRating", {
    methods: ["DELETE", "OPTIONS"],
    authLevel: "anonymous",
    route: "ratings/{extensionId}/{userHash}",
    handler: deleteRating,
});
