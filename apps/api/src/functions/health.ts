/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module health
 * @description Azure Function that returns the service health status.
 *
 * **GET /api/health**
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { handlePreflight, withCors } from "../utils/cors.js";

/**
 * Handle GET /api/health.
 *
 * Returns a simple JSON payload indicating the service is operational.
 *
 * @param _request - The incoming HTTP request (unused).
 * @param context  - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with status 200.
 */
async function health(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return handlePreflight(request);
    context.log("Processing health check request");

    return withCors(request, {
        status: 200,
        jsonBody: {
            status: "healthy",
            service: "vault-copilot-analytics",
            timestamp: new Date().toISOString(),
            version: "1.0.0",
        },
    });
}

app.http("health", {
    methods: ["GET", "OPTIONS"],
    authLevel: "anonymous",
    route: "health",
    handler: health,
});
