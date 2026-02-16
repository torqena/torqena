/**
 * Stub for Node.js http module.
 */

export function createServer() {
	throw new Error("http.createServer is not available in the browser");
}

export function request() {
	throw new Error("http.request is not available in the browser");
}

export function get() {
	throw new Error("http.get is not available in the browser");
}

export default { createServer, request, get };
