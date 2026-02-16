import { describe, it, expect } from "vitest";
import { parseBaseFile, validateBaseSchema, summarizeBaseSchema } from "../../../src/ai/bases/BasesParser";

describe("BasesParser", () => {
	describe("parseBaseFile", () => {
		it("should parse a valid .base file with all sections", () => {
			const content = `---
filters:
  and:
    - 'status != "archived"'

properties:
  status:
    width: 120
    position: 0
  priority:
    width: 100
    position: 1

summaries:
  priority:
    - type: count

views:
  - name: All Projects
    type: table
---`;

			const result = parseBaseFile(content);

			expect(result).not.toBeNull();
			expect(result?.filters?.and).toHaveLength(1);
			expect(result?.filters?.and?.[0]).toBe('status != "archived"');

			expect(result?.properties).toBeDefined();
			expect(result?.properties?.status?.width).toBe(120);
			expect(result?.properties?.priority?.position).toBe(1);

			expect(result?.summaries).toBeDefined();
			expect(result?.summaries?.priority).toHaveLength(1);

			expect(result?.views).toHaveLength(1);
			expect(result?.views?.[0].name).toBe("All Projects");
			expect(result?.views?.[0].type).toBe("table");
		});

		it("should parse a minimal .base file with only properties", () => {
			const content = `---
properties:
  name:
    width: 200
---`;

			const result = parseBaseFile(content);

			expect(result).not.toBeNull();
			expect(result?.properties).toBeDefined();
			expect(result?.properties?.name?.width).toBe(200);
		});

		it("should return empty schema for non-YAML content", () => {
			const content = "This is just regular markdown content";

			const result = parseBaseFile(content);

			// .base files are raw YAML; non-object YAML returns empty schema
			expect(result).toEqual({});
		});

		it("should return empty schema for empty content", () => {
			const result = parseBaseFile("");

			// Empty .base files are valid — they mean "show all notes"
			expect(result).toEqual({});
		});

		it("should parse filters with different operators", () => {
			const content = `---
filters:
  and:
    - "priority > 3"
---`;

			const result = parseBaseFile(content);

			expect(result).not.toBeNull();
			expect(result?.filters).toBeDefined();
			expect(result?.filters?.and).toBeDefined();
			if (result?.filters?.and) {
				expect(result.filters.and.length).toBeGreaterThan(0);
				expect(result.filters.and[0]).toBe("priority > 3");
			}
		});

		it("should parse formulas", () => {
			const content = `---
formulas:
  days_until_due: "dateDiff(due_date, now(), days)"
---`;

			const result = parseBaseFile(content);

			expect(result).not.toBeNull();
			expect(result?.formulas).toBeDefined();
			expect(typeof result?.formulas).toBe("object");
			if (result?.formulas) {
				expect(Object.keys(result.formulas).length).toBeGreaterThan(0);
			}
		});

		it("should parse views with sorting", () => {
			const content = `---
views:
  - name: By Priority
    type: table
---`;

			const result = parseBaseFile(content);

			expect(result).not.toBeNull();
			expect(result?.views).toBeDefined();
			expect(Array.isArray(result?.views)).toBe(true);
			if (result?.views && result.views.length > 0) {
				expect(result.views[0].name).toBe("By Priority");
				expect(result.views[0].type).toBe("table");
			}
		});
	});

	describe("validateBaseSchema", () => {
		it("should validate a schema with properties", () => {
			const schema = {
				properties: {
					status: { width: 120 }
				}
			};

			expect(validateBaseSchema(schema)).toBe(true);
		});

		it("should validate a schema with filters", () => {
			const schema = {
				filters: {
					and: [
						'status == "active"'
					]
				}
			};

			expect(validateBaseSchema(schema)).toBe(true);
		});

		it("should validate a schema with views", () => {
			const schema = {
				views: [
					{ name: "All", type: "table" as const }
				]
			};

			expect(validateBaseSchema(schema)).toBe(true);
		});

		it("should reject null schema", () => {
			expect(validateBaseSchema(null as any)).toBe(false);
		});

		it("should reject empty schema", () => {
			const schema = {};

			expect(validateBaseSchema(schema)).toBe(false);
		});
	});

	describe("summarizeBaseSchema", () => {
		it("should summarize a complete schema", () => {
			const schema = {
				filters: {
					and: [
						'status == "active"'
					]
				},
				properties: {
					status: { width: 120 },
					priority: { width: 100 }
				},
				formulas: {
					days_until: "dateDiff(due, now())"
				},
				summaries: {
					priority: [{ type: "count" as const }]
				},
				views: [
					{ name: "All", type: "table" as const }
				]
			};

			const summary = summarizeBaseSchema(schema);

			expect(summary).toContain("1 filter(s)");
			expect(summary).toContain("2 property column(s)");
			expect(summary).toContain("1 formula(s)");
			expect(summary).toContain("1 summary aggregation(s)");
			expect(summary).toContain("1 view(s)");
		});

		it("should handle empty schema", () => {
			const schema = {};

			const summary = summarizeBaseSchema(schema);

			expect(summary).toBe("Empty Base schema");
		});

		it("should handle schema with only properties", () => {
			const schema = {
				properties: {
					name: { width: 200 },
					email: { width: 250 },
					phone: { width: 150 }
				}
			};

			const summary = summarizeBaseSchema(schema);

			expect(summary).toBe("3 property column(s)");
		});
	});
});



