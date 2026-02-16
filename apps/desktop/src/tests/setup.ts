/**
 * Global test setup
 */

import { vi } from "vitest";

// Mock window.moment for VaultOperations
const momentMock = vi.fn((date?: string | Date) => {
	const d = date ? new Date(date) : new Date();
	return {
		format: (format: string) => {
			// Simple mock format implementation
			if (format === "YYYY-MM-DD") {
				return d.toISOString().split("T")[0];
			}
			if (format === "YYYY-[W]WW") {
				// ISO 8601 week number calculation
				// Week 1 is the week with January 4th
				const year = d.getFullYear();
				const jan4 = new Date(year, 0, 4);
				const daysSinceJan4 = Math.floor((d.getTime() - jan4.getTime()) / (24 * 60 * 60 * 1000));
				const week = Math.floor(daysSinceJan4 / 7) + 1;
				return `${year}-W${String(week).padStart(2, "0")}`;
			}
			if (format === "YYYY-MM") {
				return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
			}
			if (format === "YYYY-[Q]Q") {
				const quarter = Math.ceil((d.getMonth() + 1) / 3);
				return `${d.getFullYear()}-Q${quarter}`;
			}
			if (format === "YYYY") {
				return String(d.getFullYear());
			}
			return d.toISOString();
		},
		toDate: () => d,
		valueOf: () => d.getTime(),
	};
});

// Set window.moment for tests
// Note: We only set the moment property to avoid conflicts with DOM types
if (typeof global !== "undefined" && typeof global.window === "undefined") {
	// @ts-expect-error - Creating minimal window mock for Node test environment
	global.window = {};
}

// @ts-expect-error - Adding moment to window for test environment
global.window.moment = momentMock;



