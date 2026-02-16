import { describe, it, expect } from "vitest";
import { generateBaseYaml, validateBaseSpec, createDefaultBaseSpec } from "../../../ai/bases/BasesYamlGenerator";
import { parseBaseFile } from "../../../ai/bases/BasesParser";

describe("BasesYamlGenerator", () => {
	describe("generateBaseYaml", () => {
		it("should generate valid YAML for a simple Base", () => {
			const spec = createDefaultBaseSpec("Projects", [
				{ name: "status", type: "text", width: 120 },
				{ name: "priority", type: "text", width: 100 },
			]);

			const yaml = generateBaseYaml(spec);

			// .base files are raw YAML without frontmatter delimiters
			expect(yaml).not.toContain("---");
			expect(yaml).toContain("properties:");
			expect(yaml).toContain("status:");
			expect(yaml).toContain("width: 120");
			expect(yaml).toContain("priority:");
			expect(yaml).toContain("views:");
			expect(yaml).toContain("type: table");
		});

		it("should generate YAML with filters", () => {
			const spec = createDefaultBaseSpec("Tasks", [
				{ name: "title", type: "text" },
			]);
			spec.filters = {
				and: ['status != "completed"'],
			};

			const yaml = generateBaseYaml(spec);

			expect(yaml).toContain("filters:");
			expect(yaml).toContain("and:");
			expect(yaml).toContain('status != "completed"');
		});

		it("should generate YAML with custom views", () => {
			const spec = createDefaultBaseSpec("Contacts", [
				{ name: "name", type: "text" },
			]);
			spec.views = [
				{
					name: "By Name",
					type: "table",
					sort: [{ property: "name", order: "asc" }],
				},
			];

			const yaml = generateBaseYaml(spec);

			expect(yaml).toContain("views:");
			expect(yaml).toContain("name: By Name");
			expect(yaml).toContain("sort:");
			expect(yaml).toContain("property: name");
			expect(yaml).toContain("order: asc");
		});

		it("should generate parseable YAML (round-trip test)", () => {
			const spec = createDefaultBaseSpec("Test", [
				{ name: "field1", type: "text", width: 150 },
				{ name: "field2", type: "number", width: 100 },
			]);

			const yaml = generateBaseYaml(spec);
			const parsed = parseBaseFile(yaml);

			expect(parsed).not.toBeNull();
			expect(parsed?.properties).toBeDefined();
			expect(Object.keys(parsed?.properties || {}).length).toBe(2);
			expect(parsed?.properties?.field1).toBeDefined();
			expect(parsed?.properties?.field2).toBeDefined();
		});
	});

	describe("validateBaseSpec", () => {
		it("should accept valid spec", () => {
			const spec = createDefaultBaseSpec("Valid", [
				{ name: "prop1", type: "text" },
			]);

			const error = validateBaseSpec(spec);

			expect(error).toBeNull();
		});

		it("should reject spec without name", () => {
			const spec = createDefaultBaseSpec("", [{ name: "prop1", type: "text" }]);

			const error = validateBaseSpec(spec);

			expect(error).toBe("Base name is required");
		});

		it("should reject spec without properties", () => {
			const spec = createDefaultBaseSpec("Test", []);

			const error = validateBaseSpec(spec);

			expect(error).toBe("At least one property is required");
		});

		it("should reject spec with duplicate property names", () => {
			const spec = createDefaultBaseSpec("Test", [
				{ name: "dup", type: "text" },
				{ name: "dup", type: "number" },
			]);

			const error = validateBaseSpec(spec);

			expect(error).toContain("Duplicate property name");
		});

		it("should reject spec with invalid view type", () => {
			const spec = createDefaultBaseSpec("Test", [{ name: "prop", type: "text" }]);
			spec.views = [{ name: "Invalid", type: "invalid" as any }];

			const error = validateBaseSpec(spec);

			expect(error).toContain("Invalid view type");
		});
	});

	describe("createDefaultBaseSpec", () => {
		it("should create spec with defaults", () => {
			const spec = createDefaultBaseSpec("Test", [
				{ name: "name", type: "text" },
				{ name: "count", type: "number" },
			]);

			expect(spec.name).toBe("Test");
			expect(spec.properties).toHaveLength(2);
			expect(spec.properties[0].name).toBe("name");
			expect(spec.properties[0].type).toBe("text");
			expect(spec.properties[0].width).toBe(150);
			expect(spec.views).toHaveLength(1);
			expect(spec.views?.[0].type).toBe("table");
		});

		it("should use custom widths if provided", () => {
			const spec = createDefaultBaseSpec("Test", [
				{ name: "wide", type: "text", width: 300 },
			]);

			expect(spec.properties[0].width).toBe(300);
		});
	});
});



