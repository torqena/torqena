/**
 * @module mcp
 * @description Model Context Protocol (MCP) implementation for Vault Copilot.
 * 
 * This module provides MCP client implementations, configuration discovery,
 * and tool operations for integrating with MCP servers.
 * 
 * @see {@link McpManager} for the main MCP orchestration class
 * @see {@link McpTypes} for type definitions
 * 
 * @since 0.0.14
 */

export * from "./HttpMcpClient";
export * from "./McpClientFactory";
export * from "./McpConfigDiscovery";
export * from "./McpManager";
export * from "./McpOperations";
export * from "./McpTypes";
export * from "./StdioMcpClient";
