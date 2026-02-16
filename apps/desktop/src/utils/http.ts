/**
 * @module Http
 * @description Cross-platform HTTP client.
 * 
 * This module provides HTTP utilities using the native `fetch` API,
 * which works consistently across Electron and browser environments.
 * 
 * ## Why Use This Module
 * 
 * - **Cross-Platform**: Works in Electron desktop and browsers
 * - **Consistent API**: Simple, typed wrapper around fetch
 * - **Type-Safe**: Full TypeScript support with generics
 * - **Streaming Support**: SSE/streaming for real-time responses
 * 
 * ## When to Use
 * 
 * Use `httpRequest` for standard HTTP calls:
 * - API requests to AI providers
 * - REST API calls
 * - Fetching remote resources
 * 
 * Use `streamingRequest` for SSE (Server-Sent Events):
 * - Streaming chat completions
 * - Real-time event feeds
 * 
 * @example
 * ```typescript
 * import { httpRequest, streamingRequest } from "./utils/http";
 * 
 * // Simple GET request
 * const response = await httpRequest<{ data: string[] }>({
 *   url: "https://api.example.com/data",
 *   method: "GET",
 * });
 * console.log(response.data);
 * 
 * // Streaming POST request
 * await streamingRequest("https://api.example.com/stream", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ prompt: "Hello" }),
 *   onData: (chunk) => console.log("Received:", chunk),
 *   onComplete: () => console.log("Stream complete"),
 *   onError: (err) => console.error("Stream error:", err),
 * });
 * ```
 * 
 * @see {@link HttpMcpClient} for MCP-specific HTTP handling
 * @since 0.0.14
 */

/**
 * HTTP request configuration options.
 * 
 * @property url - The URL to request
 * @property method - HTTP method (default: "GET")
 * @property headers - Optional request headers
 * @property body - Optional request body (string or object to be JSON-serialized)
 * @property timeout - Optional timeout in milliseconds
 */
export interface HttpRequestOptions {
	url: string;
	method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	headers?: Record<string, string>;
	body?: string | object;
	timeout?: number;
}

/**
 * HTTP response structure with typed data.
 * 
 * @typeParam T - The expected type of the response data
 * @property status - HTTP status code
 * @property data - Parsed response data
 * @property headers - Response headers
 */
export interface HttpResponse<T = unknown> {
	status: number;
	data: T;
	headers: Record<string, string>;
}

/**
 * Make a cross-platform HTTP request using Obsidian's requestUrl API.
 * 
 * This function works on both desktop and mobile platforms, automatically
 * handling JSON serialization/deserialization and content type detection.
 * 
 * @typeParam T - Expected response data type (defaults to `unknown`)
 * @param options - HTTP request configuration
 * @returns Promise resolving to the HTTP response with typed data
 * 
 * @example
 * ```typescript
 * // GET request with typed response
 * interface User { id: string; name: string; }
 * const response = await httpRequest<User>({
 *   url: "https://api.example.com/user/123",
 * });
 * console.log(response.data.name);
 * 
 * // POST request with body
 * const createResponse = await httpRequest<User>({
 *   url: "https://api.example.com/users",
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: { name: "New User" },
 * });
 * ```
 * 
 * @throws {Error} If the request fails (network error, timeout, etc.)
 */
export async function httpRequest<T = unknown>(
	options: HttpRequestOptions
): Promise<HttpResponse<T>> {
	const body = typeof options.body === "object" 
		? JSON.stringify(options.body) 
		: options.body;

	const fetchOptions: RequestInit = {
		method: options.method || "GET",
		headers: options.headers,
		body: body,
	};

	// Add AbortController for timeout if specified
	let controller: AbortController | undefined;
	if (options.timeout) {
		controller = new AbortController();
		fetchOptions.signal = controller.signal;
		setTimeout(() => controller?.abort(), options.timeout);
	}

	const response = await fetch(options.url, fetchOptions);

	// Check for error status codes
	if (response.status >= 400) {
		const errorText = await response.text();
		throw new Error(`HTTP ${response.status}: ${errorText || 'Request failed'}`);
	}

	// Handle non-JSON responses gracefully
	let data: unknown;
	
	// Check Content-Type header first to determine if we should expect JSON
	const contentType = response.headers.get("content-type") || "";
	const isJsonContentType = contentType.includes("application/json");
	
	if (isJsonContentType) {
		// Content-Type indicates JSON - try to parse it
		try {
			data = await response.json();
		} catch (parseError) {
			// Parsing failed - provide helpful error
			const text = await response.text();
			const preview = text.substring(0, 100);
			throw new Error(
				`Expected JSON response but received: "${preview}..." ` +
				`(JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)})`
			);
		}
	} else {
		// Non-JSON content type - return text directly
		data = await response.text();
	}

	// Convert headers to record
	const headersRecord: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		headersRecord[key] = value;
	});

	return {
		status: response.status,
		data: data as T,
		headers: headersRecord,
	};
}

/**
 * Make a streaming HTTP request for SSE (Server-Sent Events).
 * 
 * This function uses the native `fetch` API with streaming support,
 * which works in Obsidian on both desktop and mobile platforms.
 * 
 * Use this for:
 * - Streaming chat completions from AI APIs
 * - Real-time event feeds
 * - Long-running requests where incremental data is available
 * 
 * @param url - The URL to request
 * @param options - Streaming options including callbacks
 * @param options.method - HTTP method (default: "POST")
 * @param options.headers - Optional request headers
 * @param options.body - Optional request body (string)
 * @param options.onData - Callback invoked for each chunk of data received
 * @param options.onComplete - Callback invoked when the stream ends successfully
 * @param options.onError - Callback invoked if an error occurs
 * 
 * @example
 * ```typescript
 * let fullResponse = "";
 * 
 * await streamingRequest("https://api.openai.com/v1/chat/completions", {
 *   method: "POST",
 *   headers: {
 *     "Authorization": `Bearer ${apiKey}`,
 *     "Content-Type": "application/json",
 *   },
 *   body: JSON.stringify({
 *     model: "gpt-4",
 *     messages: [{ role: "user", content: "Hello" }],
 *     stream: true,
 *   }),
 *   onData: (chunk) => {
 *     // Parse SSE chunk and update UI
 *     process.stdout.write(chunk);
 *     fullResponse += chunk;
 *   },
 *   onComplete: () => {
 *     console.log("\n--- Stream complete ---");
 *   },
 *   onError: (error) => {
 *     console.error("Stream failed:", error.message);
 *   },
 * });
 * ```
 * 
 * @throws {Error} Passed to `onError` callback if request fails
 */
export async function streamingRequest(
	url: string,
	options: {
		method?: string;
		headers?: Record<string, string>;
		body?: string;
		onData: (chunk: string) => void;
		onComplete: () => void;
		onError: (error: Error) => void;
	}
): Promise<void> {
	try {
		// Use native fetch for streaming (works in Obsidian desktop and mobile)
		const response = await fetch(url, {
			method: options.method || "POST",
			headers: options.headers,
			body: options.body,
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		if (!response.body) {
			throw new Error("Response body is null");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			
			const chunk = decoder.decode(value, { stream: true });
			options.onData(chunk);
		}
		
		options.onComplete();
	} catch (error) {
		options.onError(error instanceof Error ? error : new Error(String(error)));
	}
}
