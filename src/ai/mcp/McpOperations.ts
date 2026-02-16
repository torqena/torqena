/**
 * McpOperations - Shared MCP (Model Context Protocol) operation functions
 *
 * These functions provide the core implementation for MCP tool operations
 * and can be used by multiple services (GitHubCopilotCliService, RealtimeAgentService, etc.)
 */

import { z } from "zod";
import type { McpManager } from "./McpManager";

/**
 * MCP tool definition returned by McpManager.getSdkToolDefinitions()
 */
export interface McpToolDefinition {
	name: string;
	description: string;
	serverId: string;
	parameters: Record<string, unknown>;
}

/**
 * Result of an MCP tool call
 */
export interface McpToolCallResult {
	success: boolean;
	data?: unknown;
	error?: string;
}

/**
 * Convert a JSON Schema property type to a Zod type
 */
export function jsonSchemaTypeToZod(
	propSchema: {
		type?: string;
		description?: string;
		items?: { type?: string };
		properties?: Record<string, unknown>;
		enum?: string[];
	},
	isRequired: boolean
): z.ZodTypeAny {
	let zodType: z.ZodTypeAny;

	switch (propSchema.type) {
		case "string":
			if (propSchema.enum && propSchema.enum.length > 0) {
				// Handle enum type
				zodType = z.enum(propSchema.enum as [string, ...string[]]);
			} else {
				zodType = z.string();
			}
			break;
		case "number":
		case "integer":
			zodType = z.number();
			break;
		case "boolean":
			zodType = z.boolean();
			break;
		case "array":
			if (propSchema.items) {
				const itemType = jsonSchemaTypeToZod(
					propSchema.items as { type?: string; description?: string },
					true
				);
				zodType = z.array(itemType);
			} else {
				zodType = z.array(z.unknown());
			}
			break;
		case "object":
			if (propSchema.properties) {
				// Recursively build nested object schema
				const nestedShape: Record<string, z.ZodTypeAny> = {};
				for (const [key, value] of Object.entries(propSchema.properties)) {
					nestedShape[key] = jsonSchemaTypeToZod(
						value as { type?: string; description?: string },
						true
					);
				}
				zodType = z.object(nestedShape);
			} else {
				zodType = z.record(z.string(), z.unknown());
			}
			break;
		default:
			zodType = z.unknown();
	}

	if (propSchema.description) {
		zodType = zodType.describe(propSchema.description);
	}

	if (!isRequired) {
		zodType = zodType.optional();
	}

	return zodType;
}

/**
 * Convert a JSON Schema object to a Zod object schema
 */
export function jsonSchemaToZodObject(
	inputSchema: Record<string, unknown>
): z.ZodObject<Record<string, z.ZodTypeAny>> {
	const properties = (inputSchema.properties || {}) as Record<string, unknown>;
	const required = (inputSchema.required || []) as string[];

	const zodShape: Record<string, z.ZodTypeAny> = {};

	for (const [key, prop] of Object.entries(properties)) {
		const propSchema = prop as {
			type?: string;
			description?: string;
			items?: { type?: string };
			properties?: Record<string, unknown>;
			enum?: string[];
		};
		const isRequired = required.includes(key);
		zodShape[key] = jsonSchemaTypeToZod(propSchema, isRequired);
	}

	return z.object(zodShape);
}

/**
 * Get MCP tool definitions in a standardized format
 */
export function getMcpToolDefinitions(
	mcpManager: McpManager | undefined
): McpToolDefinition[] {
	if (!mcpManager) return [];
	return mcpManager.getSdkToolDefinitions() as McpToolDefinition[];
}

/**
 * Extract the original tool name from an MCP-prefixed tool name
 * Format: mcp_<servername>_<toolname> → <toolname>
 */
export function extractOriginalToolName(mcpToolName: string): string {
	return mcpToolName.replace(/^mcp_[^_]+_/, "");
}

/**
 * Create a sanitized MCP tool name from server name and tool name
 * Format: mcp_<sanitizedServerName>_<toolName>
 */
export function createMcpToolName(serverName: string, toolName: string): string {
	const sanitizedServerName = serverName.replace(/[^a-zA-Z0-9_]/g, "_");
	return `mcp_${sanitizedServerName}_${toolName}`;
}

/**
 * Call an MCP tool and return the result
 */
export async function callMcpTool(
	mcpManager: McpManager,
	serverId: string,
	toolName: string,
	args: Record<string, unknown>
): Promise<McpToolCallResult> {
	try {
		const result = await mcpManager.callTool(serverId, toolName, args);
		return {
			success: true,
			data: result,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Format MCP tool call result for returning from a tool handler
 */
export function formatMcpToolResult(result: McpToolCallResult): string {
	if (result.success) {
		return typeof result.data === "string"
			? result.data
			: JSON.stringify(result.data);
	} else {
		return JSON.stringify({ success: false, error: result.error });
	}
}
