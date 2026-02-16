/**
 * Stub for Node.js https module.
 */

export function createServer() {
	throw new Error("https.createServer is not available in the browser");
}

export function request() {
	throw new Error("https.request is not available in the browser");
}

export function get() {
	throw new Error("https.get is not available in the browser");
}

export default { createServer, request, get };
