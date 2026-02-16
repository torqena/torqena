/**
 * Tests for JSONC (JSON with Comments) parsing utilities
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Strip JSONC (JSON with Comments) features to make it valid JSON
 * Removes single-line comments, multi-line comments, and trailing commas
 */
function stripJsonc(content: string): string {
// Remove multi-line comments
let result = content.replace(/\/\*[\s\S]*?\*\//g, "");

// Remove single-line comments (but preserve URLs like https://)
result = result.replace(/(?<!:)\/\/.*$/gm, "");

// Remove trailing commas before closing brackets/braces
result = result.replace(/,(\s*[}\]])/g, "$1");

return result;
}

describe("JSONC Parsing", () => {
describe("stripJsonc", () => {
it("should remove single-line comments", () => {
const input = `{
  "key": "value", // This is a comment
  "another": "value"
}`;
const result = stripJsonc(input);
const parsed = JSON.parse(result);
expect(parsed.key).toBe("value");
expect(parsed.another).toBe("value");
});

it("should remove multi-line comments", () => {
const input = `{
  /* This is a
     multi-line comment */
  "key": "value"
}`;
const result = stripJsonc(input);
const parsed = JSON.parse(result);
expect(parsed.key).toBe("value");
});

it("should remove trailing commas in objects", () => {
const input = `{
  "key": "value",
  "another": "value",
}`;
const result = stripJsonc(input);
const parsed = JSON.parse(result);
expect(parsed.key).toBe("value");
expect(parsed.another).toBe("value");
});

it("should remove trailing commas in arrays", () => {
const input = `{
  "array": [
    "item1",
    "item2",
  ]
}`;
const result = stripJsonc(input);
const parsed = JSON.parse(result);
expect(parsed.array).toHaveLength(2);
expect(parsed.array[1]).toBe("item2");
});

it("should preserve URLs with //", () => {
const input = `{
  "url": "https://example.com",
  "anotherUrl": "http://test.com"
}`;
const result = stripJsonc(input);
const parsed = JSON.parse(result);
expect(parsed.url).toBe("https://example.com");
expect(parsed.anotherUrl).toBe("http://test.com");
});

it("should handle complex JSONC with all features", () => {
const input = `{
  // Single-line comment
  "name": "test",
  /* Multi-line
     comment */
  "url": "https://example.com", // Comment after value
  "items": [
    "one",
    "two", // Trailing comma follows
  ],
  "nested": {
    "key": "value",
  },
}`;
const result = stripJsonc(input);
const parsed = JSON.parse(result);
expect(parsed.name).toBe("test");
expect(parsed.url).toBe("https://example.com");
expect(parsed.items).toHaveLength(2);
expect(parsed.nested.key).toBe("value");
});

it("should handle VS Code-style settings", () => {
const input = `{
  "editor.fontSize": 14,
  "editor.tabSize": 2,
  "files.exclude": {
    "**/.git": true,
    "**/.DS_Store": true,
  },
  // User preferences
  "workbench.colorTheme": "Dark+",
}`;
const result = stripJsonc(input);
const parsed = JSON.parse(result);
expect(parsed["editor.fontSize"]).toBe(14);
expect(parsed["files.exclude"]["**/.git"]).toBe(true);
expect(parsed["workbench.colorTheme"]).toBe("Dark+");
});

it("should handle empty objects and arrays", () => {
const input = `{
  "empty": {},
  "emptyArray": [],
}`;
const result = stripJsonc(input);
const parsed = JSON.parse(result);
expect(parsed.empty).toEqual({});
expect(parsed.emptyArray).toEqual([]);
});

it("should handle nested trailing commas", () => {
const input = `{
  "level1": {
    "level2": {
      "level3": {
        "key": "value",
      },
    },
  },
}`;
const result = stripJsonc(input);
const parsed = JSON.parse(result);
expect(parsed.level1.level2.level3.key).toBe("value");
});
});

describe("Integration with file reading", () => {
it("should parse a JSONC file correctly", () => {
const tempDir = os.tmpdir();
const testFile = path.join(tempDir, "test-settings.json");

const content = `{
  // VS Code settings
  "editor.fontSize": 14,
  "files.exclude": {
    "**/.git": true,
  },
}`;

fs.writeFileSync(testFile, content, "utf-8");

try {
const fileContent = fs.readFileSync(testFile, "utf-8");
const cleaned = stripJsonc(fileContent);
const parsed = JSON.parse(cleaned);

expect(parsed["editor.fontSize"]).toBe(14);
expect(parsed["files.exclude"]["**/.git"]).toBe(true);
} finally {
fs.unlinkSync(testFile);
}
});

it("should handle real VS Code Insiders scenario", () => {
// Simulate the actual error case from the logs
const vscodeSettings = `{
  "github.copilot.chat.scopeSelection": true,
  "github.copilot.chat.reviewSelection.instructions": [
    {
      "file": ".copilot-test-instructions.md",
    },
  ],
  "github.copilot.nextEditSuggestions.fixes": true,
}`;

const cleaned = stripJsonc(vscodeSettings);
const parsed = JSON.parse(cleaned);

expect(parsed["github.copilot.chat.scopeSelection"]).toBe(true);
expect(parsed["github.copilot.chat.reviewSelection.instructions"]).toHaveLength(1);
expect(parsed["github.copilot.chat.reviewSelection.instructions"][0].file).toBe(".copilot-test-instructions.md");
});
});
});



