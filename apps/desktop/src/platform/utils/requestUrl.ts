/**
 * requestUrl — fetch wrapper replicating Obsidian's requestUrl API.
 */

export interface RequestUrlParam {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string | ArrayBuffer;
	contentType?: string;
	throw?: boolean;
}

export interface RequestUrlResponse {
	status: number;
	headers: Record<string, string>;
	text: string;
	json: any;
	arrayBuffer: ArrayBuffer;
}

/**
 * Make an HTTP request using the browser's fetch API.
 *
 * Note: Unlike Obsidian's requestUrl, this is subject to CORS restrictions.
 * OpenAI and Azure OpenAI APIs support CORS natively.
 */
export async function requestUrl(
	params: RequestUrlParam | string,
): Promise<RequestUrlResponse> {
	const opts: RequestUrlParam =
		typeof params === "string" ? { url: params } : params;

	const headers: Record<string, string> = { ...opts.headers };
	if (opts.contentType && !headers["Content-Type"]) {
		headers["Content-Type"] = opts.contentType;
	}

	const response = await fetch(opts.url, {
		method: opts.method || "GET",
		headers,
		body: opts.body,
	});

	if (opts.throw !== false && !response.ok) {
		throw new Error(
			`Request failed: ${response.status} ${response.statusText}`,
		);
	}

	const text = await response.text();
	const responseHeaders: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		responseHeaders[key] = value;
	});

	let json: any;
	try {
		json = JSON.parse(text);
	} catch {
		json = null;
	}

	return {
		status: response.status,
		headers: responseHeaders,
		text,
		json,
		arrayBuffer: new TextEncoder().encode(text).buffer as ArrayBuffer,
	};
}
