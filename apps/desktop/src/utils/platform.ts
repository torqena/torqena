/**
 * @module Platform
 * @description Platform utilities for cross-platform compatibility in Obsidian.
 * 
 * This module provides platform detection and capability checking to enable
 * graceful degradation of features between desktop and mobile platforms.
 * 
 * ## Key Features
 * 
 * - **Platform Detection**: Detect if running on desktop or mobile (iOS/Android)
 * - **Provider Availability**: Check which AI providers are available per platform
 * - **MCP Transport Support**: Determine available MCP transport mechanisms
 * - **Process Support**: Check if local process spawning is supported
 * 
 * ## Platform Differences
 * 
 * | Feature | Desktop | Mobile |
 * |---------|---------|--------|
 * | GitHub Copilot CLI | ✅ | ❌ |
 * | OpenAI/Azure OpenAI | ✅ | ✅ |
 * | MCP Stdio | ✅ | ❌ |
 * | MCP HTTP | ✅ | ✅ |
 * | Local Processes | ✅ | ❌ |
 * 
 * @example
 * ```typescript
 * import { isMobile, getAvailableProviders, supportsLocalProcesses } from "./utils/platform";
 * 
 * if (isMobile) {
 *   // Use mobile-compatible features only
 *   const providers = getAvailableProviders(); // ["openai", "azure-openai"]
 * }
 * 
 * if (supportsLocalProcesses()) {
 *   // Safe to spawn child processes
 * }
 * ```
 * 
 * @see {@link AIProvider} for the provider abstraction layer
 * @see {@link McpManager} for MCP transport handling
 * @since 0.0.14
 */

import { Platform } from "../platform/utils/platform";

/**
 * Whether the current platform is mobile (iOS or Android).
 * 
 * @example
 * ```typescript
 * if (isMobile) {
 *   console.log("Running on iOS or Android");
 * }
 * ```
 */
export const isMobile = Platform.isMobile || Platform.isMobileApp;

/**
 * Whether the current platform is desktop (Windows, macOS, Linux).
 * 
 * @example
 * ```typescript
 * if (isDesktop) {
 *   console.log("Running on desktop");
 * }
 * ```
 */
export const isDesktop = Platform.isDesktop || Platform.isDesktopApp;

/**
 * Supported AI provider types.
 * - `copilot`: GitHub Copilot CLI (desktop only)
 * - `openai`: OpenAI API (all platforms)
 * - `azure-openai`: Azure OpenAI API (all platforms)
 */
export type SupportedAIProvider = "copilot" | "openai" | "azure-openai";

/**
 * Get list of AI providers available on the current platform.
 * 
 * - **Desktop**: All providers (Copilot CLI, OpenAI, Azure OpenAI)
 * - **Mobile**: HTTP-only providers (OpenAI, Azure OpenAI)
 * 
 * @returns Array of available provider type strings
 * 
 * @example
 * ```typescript
 * const providers = getAvailableProviders();
 * // Desktop: ["copilot", "openai", "azure-openai"]
 * // Mobile: ["openai", "azure-openai"]
 * ```
 */
export function getAvailableProviders(): SupportedAIProvider[] {
	if (isMobile) {
		return ["openai", "azure-openai"];
	}
	return ["copilot", "openai", "azure-openai"];
}

/**
 * Check if a specific provider is available on the current platform.
 * 
 * @param provider - The provider type to check
 * @returns `true` if the provider is available, `false` otherwise
 * 
 * @example
 * ```typescript
 * if (isProviderAvailable("copilot")) {
 *   // Initialize GitHub Copilot CLI service
 * } else {
 *   // Fall back to OpenAI
 * }
 * ```
 */
export function isProviderAvailable(provider: SupportedAIProvider): boolean {
	return getAvailableProviders().includes(provider);
}

/**
 * Get list of supported MCP transport types for the current platform.
 * 
 * - **Desktop**: Both `stdio` (local processes) and `http` (remote servers)
 * - **Mobile**: Only `http` (no local process spawning)
 * 
 * @returns Array of available transport type strings
 * 
 * @example
 * ```typescript
 * const transports = getMcpTransports();
 * // Desktop: ["stdio", "http"]
 * // Mobile: ["http"]
 * ```
 */
export function getMcpTransports(): ("stdio" | "http")[] {
	if (isMobile) {
		return ["http"];
	}
	return ["stdio", "http"];
}

/**
 * Check if the platform supports spawning local processes.
 * 
 * - **Desktop**: Yes (can use Node.js `child_process`)
 * - **Mobile**: No (Node.js APIs not available)
 * 
 * Use this before attempting to spawn local MCP servers or CLI processes.
 * 
 * @returns `true` if local processes are supported, `false` otherwise
 * 
 * @example
 * ```typescript
 * if (supportsLocalProcesses()) {
 *   // Safe to use child_process, spawn local MCP servers
 *   const server = spawnMcpServer(config);
 * } else {
 *   // Must use HTTP-based MCP servers only
 *   console.warn("Local processes not supported on this platform");
 * }
 * ```
 */
export function supportsLocalProcesses(): boolean {
	return isDesktop;
}

