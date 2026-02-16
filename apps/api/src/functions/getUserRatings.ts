/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module getUserRatings
 * @description Azure Function that retrieves all ratings submitted by a user.
 *
 * **GET /api/user/{userHash}/ratings**
 *
 * Returns all ratings across all extensions that the user has submitted.
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { validateUserHash } from "../utils/validation.js";
import { handlePreflight, withCors } from "../utils/cors.js";

/**
 * Handle GET /api/user/{userHash}/ratings.
 *
 * @param request - Incoming HTTP request with route params.
 * @param context - Azure Functions invocation context.
 * @returns Array of user's ratings.
 */
async function getUserRatings(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return handlePreflight(request);
    context.log("Processing getUserRatings request");

    const userHash = request.params.userHash;

    const userHashResult = validateUserHash(userHash);
    if (!userHashResult.valid) {
        return withCors(request, { status: 400, jsonBody: { error: userHashResult.error } });
    }

    try {
        const svc = TableStorageService.getInstance();
        await svc.ensureTablesExist();

        // Get all ratings for this user across all extensions
        const userData = await svc.getUserData(userHash!);

        const ratings = userData.ratings.map(r => ({
            extensionId: r.partitionKey,
            rating: r.Rating as number,
            comment: (r.Comment as string) ?? "",
            version: (r.Version as string) ?? "",
            submittedDate: (r.SubmittedDate as string) ?? "",
            updatedDate: (r.UpdatedDate as string) ?? "",
        }));

        context.log(`Retrieved ${ratings.length} ratings for user ${userHash}`);

        return withCors(request, {
            status: 200,
            jsonBody: ratings,
        });
    } catch (err) {
        context.error("Error retrieving user ratings:", err);
        return withCors(request, {
            status: 500,
            jsonBody: { error: "Failed to retrieve ratings" },
        });
    }
}

app.http("getUserRatings", {
    methods: ["GET", "OPTIONS"],
    authLevel: "anonymous",
    route: "user/{userHash}/ratings",
    handler: getUserRatings,
});
