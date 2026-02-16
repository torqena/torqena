---
applyTo: "**.ts, **.js, package.json"
description: "This file provides guidance on building Node.js/TypeScript applications using GitHub Copilot SDK."
name: "GitHub Copilot SDK Node.js Instructions"
---

## Core Principles

- The SDK is in technical preview and may have breaking changes
- Requires Node.js 18.0 or later
- Requires GitHub Copilot CLI installed and in PATH
- Built with TypeScript for type safety
- Uses async/await patterns throughout
- Provides full TypeScript type definitions

## Installation

Always install via npm/pnpm/yarn:

```bash
npm install @github/copilot-sdk
# or
pnpm add @github/copilot-sdk
# or
yarn add @github/copilot-sdk
```

## Client Initialization

### Basic Client Setup

```typescript
import { CopilotClient } from "@github/copilot-sdk";

const client = new CopilotClient();
await client.start();
// Use client...
await client.stop();
```

### Client Configuration Options

When creating a CopilotClient, use `CopilotClientOptions`:

- `cliPath` - Path to CLI executable (default: "copilot" from PATH)
- `cliArgs` - Extra arguments prepended before SDK-managed flags (string[])
- `cliUrl` - URL of existing CLI server (e.g., "localhost:8080"). When provided, client won't spawn a process
- `port` - Server port (default: 0 for random)
- `useStdio` - Use stdio transport instead of TCP (default: true)
- `logLevel` - Log level (default: "debug")
- `autoStart` - Auto-start server (default: true)
- `autoRestart` - Auto-restart on crash (default: true)
- `cwd` - Working directory for the CLI process (default: process.cwd())
- `env` - Environment variables for the CLI process (default: process.env)

### Manual Server Control

For explicit control:

```typescript
const client = new CopilotClient({ autoStart: false });
await client.start();
// Use client...
await client.stop();
```

Use `forceStop()` when `stop()` takes too long.

## Session Management

### Creating Sessions

Use `SessionConfig` for configuration:

```typescript
const session = await client.createSession({
    model: "gpt-5",
    streaming: true,
    tools: [...],
    systemMessage: { ... },
    availableTools: ["tool1", "tool2"],
    excludedTools: ["tool3"],
    provider: { ... }
});
```

### Session Config Options

- `sessionId` - Custom session ID (string)
- `model` - Model name ("gpt-5", "claude-sonnet-4.5", etc.)
- `tools` - Custom tools exposed to the CLI (Tool[])
- `systemMessage` - System message customization (SystemMessageConfig)
- `availableTools` - Allowlist of tool names (string[])
- `excludedTools` - Blocklist of tool names (string[])
- `provider` - Custom API provider configuration (BYOK) (ProviderConfig)
- `streaming` - Enable streaming response chunks (boolean)
- `mcpServers` - MCP server configurations (MCPServerConfig[])
- `customAgents` - Custom agent configurations (CustomAgentConfig[])
- `configDir` - Config directory override (string)
- `skillDirectories` - Skill directories (string[])
- `disabledSkills` - Disabled skills (string[])
- `onPermissionRequest` - Permission request handler (PermissionHandler)

### Resuming Sessions

```typescript
const session = await client.resumeSession("session-id", {
  tools: [myNewTool],
});
```

### Session Operations

- `session.sessionId` - Get session identifier (string)
- `await session.send({ prompt: "...", attachments: [...] })` - Send message, returns Promise<string>
- `await session.sendAndWait({ prompt: "..." }, timeout)` - Send and wait for idle, returns Promise<AssistantMessageEvent | null>
- `await session.abort()` - Abort current processing
- `await session.getMessages()` - Get all events/messages, returns Promise<SessionEvent[]>
- `await session.destroy()` - Clean up session

## Event Handling

### Event Subscription Pattern

ALWAYS use async/await or Promises for waiting on session events:

```typescript
await new Promise<void>((resolve) => {
  session.on((event) => {
    if (event.type === "assistant.message") {
      console.log(event.data.content);
    } else if (event.type === "session.idle") {
      resolve();
    }
  });

  session.send({ prompt: "..." });
});
```

### Unsubscribing from Events

The `on()` method returns a function that unsubscribes:

```typescript
const unsubscribe = session.on((event) => {
  // handler
});
// Later...
unsubscribe();
```

### Event Types

Use discriminated unions with type guards for event handling:

```typescript
session.on((event) => {
  switch (event.type) {
    case "user.message":
      // Handle user message
      break;
    case "assistant.message":
      console.log(event.data.content);
      break;
    case "tool.executionStart":
      // Tool execution started
      break;
    case "tool.executionComplete":
      // Tool execution completed
      break;
    case "session.start":
      // Session started
      break;
    case "session.idle":
      // Session is idle (processing complete)
      break;
    case "session.error":
      console.error(`Error: ${event.data.message}`);
      break;
  }
});
```

## Streaming Responses

### Enabling Streaming

Set `streaming: true` in SessionConfig:

```typescript
const session = await client.createSession({
  model: "gpt-5",
  streaming: true,
});
```

### Handling Streaming Events

Handle both delta events (incremental) and final events:

```typescript
await new Promise<void>((resolve) => {
  session.on((event) => {
    switch (event.type) {
      case "assistant.message.delta":
        // Incremental text chunk
        process.stdout.write(event.data.deltaContent);
        break;
      case "assistant.reasoning.delta":
        // Incremental reasoning chunk (model-dependent)
        process.stdout.write(event.data.deltaContent);
        break;
      case "assistant.message":
        // Final complete message
        console.log("\n--- Final ---");
        console.log(event.data.content);
        break;
      case "assistant.reasoning":
        // Final reasoning content
        console.log("--- Reasoning ---");
        console.log(event.data.content);
        break;
      case "session.idle":
        resolve();
        break;
    }
  });

  session.send({ prompt: "Tell me a story" });
});
```

Note: Final events (`assistant.message`, `assistant.reasoning`) are ALWAYS sent regardless of streaming setting.

## Custom Tools

### Defining Tools with defineTool

Use `defineTool` for type-safe tool definitions:

```typescript
import { defineTool } from "@github/copilot-sdk";

const session = await client.createSession({
  model: "gpt-5",
  tools: [
    defineTool({
      name: "lookup_issue",
      description: "Fetch issue details from tracker",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Issue ID" },
        },
        required: ["id"],
      },
      handler: async (args) => {
        const issue = await fetchIssue(args.id);
        return issue;
      },
    }),
  ],
});
```

### Using Zod for Parameters

The SDK supports Zod schemas for parameters:

```typescript
import { z } from "zod";

const session = await client.createSession({
  tools: [
    defineTool({
      name: "get_weather",
      description: "Get weather for a location",
      parameters: z.object({
        location: z.string().describe("City name"),
        units: z.enum(["celsius", "fahrenheit"]).optional(),
      }),
      handler: async (args) => {
        return { temperature: 72, units: args.units || "fahrenheit" };
      },
    }),
  ],
});
```

### Tool Return Types

- Return any JSON-serializable value (automatically wrapped)
- Or return `ToolResultObject` for full control over metadata:

```typescript
{
    textResultForLlm: string;  // Result shown to LLM
    resultType: "success" | "failure";
    error?: string;  // Internal error (not shown to LLM)
    toolTelemetry?: Record<string, unknown>;
}
```

### Tool Execution Flow

When Copilot invokes a tool, the client automatically:

1. Runs your handler function
2. Serializes the return value
3. Responds to the CLI

## System Message Customization

### Append Mode (Default - Preserves Guardrails)

```typescript
const session = await client.createSession({
  model: "gpt-5",
  systemMessage: {
    mode: "append",
    content: `
<workflow_rules>
- Always check for security vulnerabilities
- Suggest performance improvements when applicable
</workflow_rules>
`,
  },
});
```

### Replace Mode (Full Control - Removes Guardrails)

```typescript
const session = await client.createSession({
  model: "gpt-5",
  systemMessage: {
    mode: "replace",
    content: "You are a helpful assistant.",
  },
});
```

## File Attachments

Attach files to messages:

```typescript
await session.send({
  prompt: "Analyze this file",
  attachments: [
    {
      type: "file",
      path: "/path/to/file.ts",
      displayName: "My File",
    },
  ],
});
```

## Message Delivery Modes

Use the `mode` property in message options:

- `"enqueue"` - Queue message for processing
- `"immediate"` - Process message immediately

```typescript
await session.send({
  prompt: "...",
  mode: "enqueue",
});
```

## Multiple Sessions

Sessions are independent and can run concurrently:

```typescript
const session1 = await client.createSession({ model: "gpt-5" });
const session2 = await client.createSession({ model: "claude-sonnet-4.5" });

await Promise.all([
  session1.send({ prompt: "Hello from session 1" }),
  session2.send({ prompt: "Hello from session 2" }),
]);
```

## Bring Your Own Key (BYOK)

Use custom API providers via `provider`:

```typescript
const session = await client.createSession({
  provider: {
    type: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "your-api-key",
  },
});
```

## Session Lifecycle Management

### Listing Sessions

```typescript
const sessions = await client.listSessions();
for (const metadata of sessions) {
  console.log(`${metadata.sessionId}: ${metadata.summary}`);
}
```

### Deleting Sessions

```typescript
await client.deleteSession(sessionId);
```

### Getting Last Session ID

```typescript
const lastId = await client.getLastSessionId();
if (lastId) {
  const session = await client.resumeSession(lastId);
}
```

### Checking Connection State

```typescript
const state = client.getState();
// Returns: "disconnected" | "connecting" | "connected" | "error"
```

## Error Handling

### Standard Exception Handling

```typescript
try {
  const session = await client.createSession();
  await session.send({ prompt: "Hello" });
} catch (error) {
  console.error(`Error: ${error.message}`);
}
```

### Session Error Events

Monitor `session.error` event type for runtime errors:

```typescript
session.on((event) => {
  if (event.type === "session.error") {
    console.error(`Session Error: ${event.data.message}`);
  }
});
```

## Connectivity Testing

Use ping to verify server connectivity:

```typescript
const response = await client.ping("health check");
console.log(`Server responded at ${new Date(response.timestamp)}`);
```

## Resource Cleanup

### Automatic Cleanup with Try-Finally

ALWAYS use try-finally or cleanup in a finally block:

```typescript
const client = new CopilotClient();
try {
  await client.start();
  const session = await client.createSession();
  try {
    // Use session...
  } finally {
    await session.destroy();
  }
} finally {
  await client.stop();
}
```

### Cleanup Function Pattern

```typescript
async function withClient<T>(
  fn: (client: CopilotClient) => Promise<T>,
): Promise<T> {
  const client = new CopilotClient();
  try {
    await client.start();
    return await fn(client);
  } finally {
    await client.stop();
  }
}

async function withSession<T>(
  client: CopilotClient,
  fn: (session: CopilotSession) => Promise<T>,
): Promise<T> {
  const session = await client.createSession();
  try {
    return await fn(session);
  } finally {
    await session.destroy();
  }
}

// Usage
await withClient(async (client) => {
  await withSession(client, async (session) => {
    await session.send({ prompt: "Hello!" });
  });
});
```

## Best Practices

1. **Always use try-finally** for resource cleanup
2. **Use Promises** to wait for session.idle event
3. **Handle session.error** events for robust error handling
4. **Use type guards or switch statements** for event handling
5. **Enable streaming** for better UX in interactive scenarios
6. **Use defineTool** for type-safe tool definitions
7. **Use Zod schemas** for runtime parameter validation
8. **Dispose event subscriptions** when no longer needed
9. **Use systemMessage with mode: "append"** to preserve safety guardrails
10. **Handle both delta and final events** when streaming is enabled
11. **Leverage TypeScript types** for compile-time safety
12. **Write unit tests for new code** - Every new module, function, or feature should have corresponding tests in `tests/`

## Common Patterns

### Simple Query-Response

```typescript
import { CopilotClient } from "@github/copilot-sdk";

const client = new CopilotClient();
try {
  await client.start();

  const session = await client.createSession({ model: "gpt-5" });
  try {
    await new Promise<void>((resolve) => {
      session.on((event) => {
        if (event.type === "assistant.message") {
          console.log(event.data.content);
        } else if (event.type === "session.idle") {
          resolve();
        }
      });

      session.send({ prompt: "What is 2+2?" });
    });
  } finally {
    await session.destroy();
  }
} finally {
  await client.stop();
}
```

### Multi-Turn Conversation

```typescript
const session = await client.createSession();

async function sendAndWait(prompt: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const unsubscribe = session.on((event) => {
      if (event.type === "assistant.message") {
        console.log(event.data.content);
      } else if (event.type === "session.idle") {
        unsubscribe();
        resolve();
      } else if (event.type === "session.error") {
        unsubscribe();
        reject(new Error(event.data.message));
      }
    });

    session.send({ prompt });
  });
}

await sendAndWait("What is the capital of France?");
await sendAndWait("What is its population?");
```

### SendAndWait Helper

```typescript
// Use built-in sendAndWait for simpler synchronous interaction
const response = await session.sendAndWait({ prompt: "What is 2+2?" }, 60000);

if (response) {
  console.log(response.data.content);
}
```

### Tool with Type-Safe Parameters

```typescript
import { z } from "zod";
import { defineTool } from "@github/copilot-sdk";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
}

const session = await client.createSession({
  tools: [
    defineTool({
      name: "get_user",
      description: "Retrieve user information",
      parameters: z.object({
        userId: z.string().describe("User ID"),
      }),
      handler: async (args): Promise<UserInfo> => {
        return {
          id: args.userId,
          name: "John Doe",
          email: "john@example.com",
          role: "Developer",
        };
      },
    }),
  ],
});
```

### Streaming with Progress

```typescript
let currentMessage = "";

const unsubscribe = session.on((event) => {
  if (event.type === "assistant.message.delta") {
    currentMessage += event.data.deltaContent;
    process.stdout.write(event.data.deltaContent);
  } else if (event.type === "assistant.message") {
    console.log("\n\n=== Complete ===");
    console.log(`Total length: ${event.data.content.length} chars`);
  } else if (event.type === "session.idle") {
    unsubscribe();
  }
});

await session.send({ prompt: "Write a long story" });
```

### Error Recovery

```typescript
session.on((event) => {
  if (event.type === "session.error") {
    console.error("Session error:", event.data.message);
    // Optionally retry or handle error
  }
});

try {
  await session.send({ prompt: "risky operation" });
} catch (error) {
  // Handle send errors
  console.error("Failed to send:", error);
}
```

## TypeScript-Specific Features

### Type Inference

```typescript
import type { SessionEvent, AssistantMessageEvent } from "@github/copilot-sdk";

session.on((event: SessionEvent) => {
  if (event.type === "assistant.message") {
    // TypeScript knows event is AssistantMessageEvent here
    const content: string = event.data.content;
  }
});
```

### Generic Helper

```typescript
async function waitForEvent<T extends SessionEvent["type"]>(
  session: CopilotSession,
  eventType: T,
): Promise<Extract<SessionEvent, { type: T }>> {
  return new Promise((resolve) => {
    const unsubscribe = session.on((event) => {
      if (event.type === eventType) {
        unsubscribe();
        resolve(event as Extract<SessionEvent, { type: T }>);
      }
    });
  });
}

// Usage
const message = await waitForEvent(session, "assistant.message");
console.log(message.data.content);
```

## Testing

### Test-Driven Development

**Always write unit tests when adding new code.** After implementing a new module, function, or feature, create corresponding tests in `tests/` before considering the work complete. This ensures:

- Code behaves as expected
- Regressions are caught early
- Documentation of intended behavior
- Confidence when refactoring

### Test Framework

This project uses **Vitest** for unit testing. All unit tests are stored in the `tests/` folder.

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test File Structure

Organize tests to mirror the source code structure:

```
tests/
  realtime-agent/
    types.test.ts
    workarounds.test.ts
    tool-manager.test.ts
  copilot/
    CopilotService.test.ts
    McpManager.test.ts
  ui/
    ChatView.test.ts
```

### Test File Naming

- Use `.test.ts` suffix for test files
- Name test files after the module they test: `MyModule.ts` → `MyModule.test.ts`

### Writing Tests

Use `describe`, `it`, and `expect` from Vitest:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { myFunction, MyClass } from "../myModule";

describe("MyClass", () => {
  let instance: MyClass;

  beforeEach(() => {
    instance = new MyClass();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("myMethod", () => {
    it("should return expected value", () => {
      const result = instance.myMethod("input");
      expect(result).toBe("expected output");
    });

    it("should handle edge cases", () => {
      expect(instance.myMethod("")).toBe("");
      expect(instance.myMethod(null as any)).toBeUndefined();
    });
  });
});
```

### Mocking Dependencies

Use `vi.mock()` and `vi.fn()` for mocking:

```typescript
import { vi } from "vitest";

// Mock an entire module
vi.mock("../externalDependency", () => ({
  fetchData: vi.fn().mockResolvedValue({ data: "mocked" }),
}));

// Mock a specific function
const mockCallback = vi.fn();
mockCallback.mockReturnValue("mocked value");

// Spy on object methods
const spy = vi.spyOn(console, "log");
expect(spy).toHaveBeenCalledWith("expected message");
```

### Mocking Obsidian API

The project includes a mock for the Obsidian API at `src/__mocks__/platform.ts`. This is automatically resolved via the Vitest config alias:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    alias: {
      obsidian: path.resolve(__dirname, "src/__mocks__/platform.ts"),
    },
  },
});
```

The mock provides common Obsidian classes and utilities:

```typescript
import { TFile, App, Notice } from "obsidian";

// In tests, these use mocked implementations
const file = new TFile();
file.path = "test/path.md";
file.basename = "path";

const notice = new Notice("Test message");
```

### Testing Async Code

Handle async operations with `async/await`:

```typescript
describe("async operations", () => {
  it("should handle promises", async () => {
    const result = await asyncFunction();
    expect(result).toBe("expected");
  });

  it("should handle rejected promises", async () => {
    await expect(failingAsyncFunction()).rejects.toThrow("error message");
  });

  it("should handle timeouts", async () => {
    vi.useFakeTimers();

    const promise = functionWithTimeout();
    vi.advanceTimersByTime(5000);

    await expect(promise).resolves.toBe("done");

    vi.useRealTimers();
  });
});
```

### Testing Event Handlers

Test event-driven code by simulating events:

```typescript
describe("event handlers", () => {
  it("should respond to events", async () => {
    const handler = vi.fn();
    session.on(handler);

    // Simulate event
    await session.send({ prompt: "test" });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "assistant.message",
      }),
    );
  });
});
```

### Testing Tools

Test custom tool definitions:

```typescript
import { describe, it, expect } from "vitest";

describe("custom tool", () => {
  const tool = {
    name: "my_tool",
    description: "Does something",
    parameters: {
      type: "object",
      properties: {
        input: { type: "string" },
      },
      required: ["input"],
    },
    handler: async (args: { input: string }) => {
      return { result: args.input.toUpperCase() };
    },
  };

  it("should have correct metadata", () => {
    expect(tool.name).toBe("my_tool");
    expect(tool.parameters.required).toContain("input");
  });

  it("should execute handler correctly", async () => {
    const result = await tool.handler({ input: "hello" });
    expect(result).toEqual({ result: "HELLO" });
  });
});
```

### Coverage Configuration

The coverage is configured in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "src/__mocks__/", "**/*.test.ts"],
    },
  },
});
```

### Test Best Practices

1. **Keep tests focused** - Each test should verify one specific behavior
2. **Use descriptive names** - Test names should describe what is being tested and expected outcome
3. **Arrange-Act-Assert** - Structure tests with clear setup, execution, and verification phases
4. **Test edge cases** - Include tests for null, undefined, empty strings, boundary values
5. **Avoid test interdependence** - Tests should not depend on other tests or execution order
6. **Mock external dependencies** - Isolate the unit under test by mocking I/O and external services
7. **Use `beforeEach`/`afterEach`** - Set up and clean up test state consistently
8. **Restore mocks after tests** - Call `vi.restoreAllMocks()` to prevent test pollution
9. **Test both success and failure paths** - Verify error handling and edge cases
10. **Keep tests fast** - Avoid real network calls, file I/O, or long timeouts in unit tests


