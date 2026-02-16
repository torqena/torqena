/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module deleteUserData
 * @description Azure Function that deletes all stored data for a user (GDPR erasure).
 *
 * **DELETE /api/user/{userHash}**
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { validateUserHash } from "../utils/validation.js";
import { handlePreflight, withCors } from "../utils/cors.js";

/**
 * Handle DELETE /api/user/{userHash}.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with status 204 on success.
 */
async function deleteUserData(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return handlePreflight(request);
    context.log("Processing deleteUserData request");

    const userHash = request.params.userHash;
    const authenticatedUserHash = request.headers.get("x-user-hash");

    const userHashResult = validateUserHash(userHash);
    if (!userHashResult.valid) {
        return withCors(request, { status: 400, jsonBody: { error: userHashResult.error } });
    }

    // Authorization: Only the user themselves OR an admin can delete user data
    const adminHashes = (process.env.ADMIN_USER_HASHES || "").split(",").map(h => h.trim()).filter(Boolean);
    const isAdmin = authenticatedUserHash && adminHashes.includes(authenticatedUserHash);
    const isOwner = authenticatedUserHash === userHash;

    if (!authenticatedUserHash || (!isOwner && !isAdmin)) {
        context.warn(`Unauthorized deleteUserData attempt: authenticated=${authenticatedUserHash}, target=${userHash}, isAdmin=${isAdmin}`);
        return withCors(request, {
            status: 403,
            jsonBody: { error: "Forbidden: You can only delete your own data" },
        });
    }

    try {
        const svc = TableStorageService.getInstance();
        await svc.deleteUserData(userHash as string);

        return withCors(request, { status: 204 });
    } catch (err) {
        context.error("Error deleting user data:", err);
        return withCors(request, { status: 500, jsonBody: { error: "Internal server error" } });
    }
}

app.http("deleteUserData", {
    methods: ["DELETE", "OPTIONS"],
    authLevel: "anonymous",
    route: "user/{userHash}",
    handler: deleteUserData,
});
