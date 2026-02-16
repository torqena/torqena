/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module setup
 * @description Azure Function that initializes table storage.
 *
 * **POST /api/setup**
 *
 * Creates required tables (Installs, Ratings, MetricsCache) if they don't exist.
 * Safe to call multiple times.
 *
 * @since 1.0.0
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableStorageService } from "../services/TableStorageService.js";
import { handlePreflight, withCors } from "../utils/cors.js";

/**
 * Handle POST /api/setup.
 *
 * @param request - The incoming HTTP request.
 * @param context - Azure Functions invocation context.
 * @returns An {@link HttpResponseInit} with status 200 on success.
 */
async function setup(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return handlePreflight(request);
    context.log("Processing setup request - initializing tables...");

    try {
        const svc = TableStorageService.getInstance();
        
        context.log("Creating tables: Installs, Ratings, MetricsCache");
        await svc.ensureTablesExist();
        
        context.log("Tables initialized successfully");

        return withCors(request, {
            status: 200,
            jsonBody: {
                success: true,
                message: "Tables initialized successfully",
                tables: ["Installs", "Ratings", "MetricsCache"],
            },
        });
    } catch (err) {
        context.error("Error initializing tables:", err);
        return withCors(request, {
            status: 500,
            jsonBody: {
                success: false,
                error: "Failed to initialize tables",
                details: err instanceof Error ? err.message : String(err),
            },
        });
    }
}

app.http("setup", {
    methods: ["POST", "OPTIONS"],
    authLevel: "anonymous",
    route: "setup",
    handler: setup,
});
