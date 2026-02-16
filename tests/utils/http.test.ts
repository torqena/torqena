/**
 * Tests for HTTP client utilities
 */

import { describe, it, expect } from "vitest";
import {
	HttpRequestOptions,
	HttpResponse,
} from "../../src/utils/http";

describe("http.ts", () => {
	describe("HTTP request interface", () => {
		it("should define HttpRequestOptions interface", () => {
			const options: HttpRequestOptions = {
				url: "https://example.com",
				method: "GET",
			};
			expect(options.url).toBe("https://example.com");
			expect(options.method).toBe("GET");
		});

		it("should support different HTTP methods", () => {
			const methods: Array<HttpRequestOptions["method"]> = [
				"GET",
				"POST",
				"PUT",
				"DELETE",
				"PATCH",
			];
			
			for (const method of methods) {
				const options: HttpRequestOptions = {
					url: "https://example.com",
					method,
				};
				expect(options.method).toBe(method);
			}
		});

		it("should support headers", () => {
			const options: HttpRequestOptions = {
				url: "https://example.com",
				headers: {
					"Content-Type": "application/json",
					"Authorization": "Bearer token",
				},
			};
			expect(options.headers).toBeDefined();
			expect(options.headers!["Content-Type"]).toBe("application/json");
		});

		it("should support body as string or object", () => {
			const options1: HttpRequestOptions = {
				url: "https://example.com",
				body: "string body",
			};
			expect(options1.body).toBe("string body");

			const options2: HttpRequestOptions = {
				url: "https://example.com",
				body: { key: "value" },
			};
			expect(options2.body).toEqual({ key: "value" });
		});
	});

	describe("HTTP response interface", () => {
		it("should define HttpResponse interface", () => {
			const response: HttpResponse<{ message: string }> = {
				status: 200,
				data: { message: "success" },
				headers: { "content-type": "application/json" },
			};
			expect(response.status).toBe(200);
			expect(response.data.message).toBe("success");
		});

		it("should support typed data", () => {
			interface UserData {
				id: number;
				name: string;
			}

			const response: HttpResponse<UserData> = {
				status: 200,
				data: { id: 1, name: "Test User" },
				headers: {},
			};
			expect(response.data.id).toBe(1);
			expect(response.data.name).toBe("Test User");
		});
	});
});



