/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module getMetrics
 * @description Azure Function that returns cached metrics for a single extension.
 *
 * **GET /api/metrics/{extensionId}**
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { validateExtensionId } from "../utils/validation.js";
import { handlePreflight, withCors } from "../utils/cors.js";

/**
 * Handle GET /api/metrics/{extensionId}.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} containing the extension metrics.
 */
async function getMetrics(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return handlePreflight(request);
    context.log("Processing getMetrics request");

    const extensionId = request.params.extensionId;

    const extensionIdResult = validateExtensionId(extensionId);
    if (!extensionIdResult.valid) {
        return withCors(request, { status: 400, jsonBody: { error: extensionIdResult.error } });
    }

    try {
        const svc = TableStorageService.getInstance();
        const metrics = await svc.getMetrics(extensionId as string);

        return withCors(request, {
            status: 200,
            jsonBody: metrics,
        });
    } catch (err) {
        context.error("Error getting metrics:", err);
        return withCors(request, { status: 500, jsonBody: { error: "Internal server error" } });
    }
}

app.http("getMetrics", {
    methods: ["GET", "OPTIONS"],
    authLevel: "anonymous",
    route: "metrics/{extensionId}",
    handler: getMetrics,
});
