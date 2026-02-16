/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module getBatchMetrics
 * @description Azure Function that returns cached metrics for multiple extensions.
 *
 * **GET /api/metrics?ids=ext1,ext2,ext3**
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { validateExtensionId } from "../utils/validation.js";
import { handlePreflight, withCors } from "../utils/cors.js";

/** Maximum number of extensions that can be queried in one batch. */
const MAX_BATCH_SIZE = 50;

/**
 * Handle GET /api/metrics?ids=ext1,ext2.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} containing a map of metrics keyed by extension ID.
 */
async function getBatchMetrics(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return handlePreflight(request);
    context.log("Processing getBatchMetrics request");

    const idsParam = request.query.get("ids");
    if (!idsParam) {
        return withCors(request, { status: 400, jsonBody: { error: 'Query parameter "ids" is required (comma-separated extension IDs)' } });
    }

    const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);

    if (ids.length === 0) {
        return withCors(request, { status: 400, jsonBody: { error: "At least one extension ID is required" } });
    }

    if (ids.length > MAX_BATCH_SIZE) {
        return withCors(request, { status: 400, jsonBody: { error: `Maximum of ${MAX_BATCH_SIZE} extension IDs per request` } });
    }

    // Validate each ID
    for (const id of ids) {
        const result = validateExtensionId(id);
        if (!result.valid) {
            return withCors(request, { status: 400, jsonBody: { error: `Invalid extension ID "${id}": ${result.error}` } });
        }
    }

    try {
        const svc = TableStorageService.getInstance();
        const metrics = await svc.getBatchMetrics(ids);

        return withCors(request, {
            status: 200,
            jsonBody: metrics,
        });
    } catch (err) {
        context.error("Error getting batch metrics:", err);
        return withCors(request, { status: 500, jsonBody: { error: "Internal server error" } });
    }
}

app.http("getBatchMetrics", {
    methods: ["GET", "OPTIONS"],
    authLevel: "anonymous",
    route: "metrics",
    handler: getBatchMetrics,
});
