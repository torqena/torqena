/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module cors
 * @description CORS utility for Azure Functions.
 *
 * Provides consistent CORS headers across all HTTP function handlers and
 * a helper to respond to OPTIONS preflight requests.
 *
 * @since 1.0.0
 */

import { HttpRequest, HttpResponse, HttpResponseInit } from "@azure/functions";

/**
 * Allowed origins for CORS.
 *
 * - GitHub Pages site (extension detail pages)
 * - Obsidian desktop app origin
 * - localhost for development
 */
const ALLOWED_ORIGINS = new Set([
    "https://danielshue.github.io",
    "app://obsidian.md",
    "http://localhost",
    "http://localhost:3000",
    "http://127.0.0.1",
]);

/**
 * Get CORS headers for a given request origin.
 *
 * Returns `Access-Control-Allow-Origin` only for known origins.
 * If the request origin is not recognized, the header is omitted
 * (the browser will block the response).
 *
 * @param request - The incoming HTTP request
 * @returns A record of CORS response headers
 *
 * @example
 * ```typescript
 * return { status: 200, jsonBody: data, headers: getCorsHeaders(request) };
 * ```
 */
export function getCorsHeaders(request: HttpRequest): Record<string, string> {
    const origin = request.headers.get("origin") ?? "";
    const headers: Record<string, string> = {
        "Vary": "Origin",
    };

    if (ALLOWED_ORIGINS.has(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
        headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
        headers["Access-Control-Allow-Headers"] = "Content-Type, x-user-hash";
        headers["Access-Control-Max-Age"] = "86400";
    }

    return headers;
}

/**
 * Create a preflight (OPTIONS) response with appropriate CORS headers.
 *
 * Uses the concrete `HttpResponse` class to ensure headers are properly
 * included in the wire response by the Azure Functions runtime.
 *
 * @param request - The incoming HTTP request
 * @returns An {@link HttpResponse} with status 204 and CORS headers
 *
 * @example
 * ```typescript
 * if (request.method === "OPTIONS") {
 *     return handlePreflight(request);
 * }
 * ```
 */
export function handlePreflight(request: HttpRequest): HttpResponse {
    return new HttpResponse({
        status: 204,
        headers: getCorsHeaders(request),
    });
}

/**
 * Wrap a response init with CORS headers, returning a concrete HttpResponse.
 *
 * Uses the concrete `HttpResponse` class to ensure headers are properly
 * included in the wire response by the Azure Functions runtime.
 *
 * @param request - The incoming HTTP request (used to read Origin)
 * @param response - The response init to augment with CORS headers
 * @returns A concrete {@link HttpResponse} with CORS headers merged in
 *
 * @example
 * ```typescript
 * return withCors(request, { status: 200, jsonBody: { ok: true } });
 * ```
 */
export function withCors(request: HttpRequest, response: HttpResponseInit): HttpResponse {
    const corsHeaders = getCorsHeaders(request);
    response.headers = { ...corsHeaders, ...response.headers };
    return new HttpResponse(response);
}
