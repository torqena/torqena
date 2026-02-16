# MCP Weather App Example

This is an example MCP server that demonstrates the MCP Apps specification (SEP-1865) for rendering interactive HTML UIs inline in the Obsidian Vault Copilot chat.

## Overview

This example shows how to:
1. Declare a UI resource with the `ui://` scheme
2. Link tools to UI resources via `_meta.ui.resourceUri`
3. Serve HTML content that communicates with the host via JSON-RPC over postMessage

## Files

- `server.js` - Simple MCP server implementation
- `weather-ui.html` - The interactive HTML UI rendered in the chat

## How It Works

### UI Resource Declaration

The server declares a UI resource in its `resources/list` response:

```json
{
  "resources": [
    {
      "uri": "ui://weather-app/dashboard",
      "name": "Weather Dashboard",
      "description": "Interactive weather display",
      "mimeType": "text/html;profile=mcp-app"
    }
  ]
}
```

### Tool-UI Linkage

Tools declare their UI via the `_meta.ui.resourceUri` field:

```json
{
  "name": "get_weather",
  "description": "Get current weather for a location",
  "inputSchema": { ... },
  "_meta": {
    "ui": {
      "resourceUri": "ui://weather-app/dashboard",
      "visibility": ["model", "app"]
    }
  }
}
```

### Communication Protocol

The HTML UI communicates with the host (Obsidian) via JSON-RPC 2.0 over `postMessage`:

1. **Initialization**: App sends `ui/initialize` request, host responds with capabilities and context
2. **Tool Calls**: App can call `tools/call` to execute tools on the server
3. **Notifications**: Host sends `ui/notifications/tool-input` and `ui/notifications/tool-result` when tools are called

## Running the Example

```bash
# Navigate to this directory
cd examples/mcp-weather-app

# Install dependencies (requires Node.js)
npm init -y
npm install

# Run the server
node server.js
```

## Integration with Vault Copilot

When connected as an MCP server in Obsidian settings, tools with UI resources will:
1. Show a tool execution indicator when called
2. Render the HTML UI inline in the chat when the tool completes
3. Allow the UI to interact with the user and call additional tools

## Learn More

- [MCP Apps Specification (SEP-1865)](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
- [MCP SDK for TypeScript](https://github.com/modelcontextprotocol/typescript-sdk)
