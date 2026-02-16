/**
 * AI Provider Factory
 * Creates AI provider instances based on platform capabilities
 * Ensures providers are only instantiated on compatible platforms
 */

import type { App } from "obsidian";
import { Platform } from "../../platform/utils/platform";
import { AIProvider, AIProviderConfig, OpenAIProviderConfig, AzureOpenAIProviderConfig, CopilotProviderConfig } from "./AIProvider";
import { OpenAIService } from "./OpenAIService";
import { AzureOpenAIService } from "./AzureOpenAIService";
import { isProviderAvailable, SupportedAIProvider } from "../../utils/platform";

/**
 * Create an AI provider instance
 * Throws if provider is not available on current platform
 */
export async function createAIProvider(
	app: App,
	config: AIProviderConfig
): Promise<AIProvider> {
	const providerType = config.provider as SupportedAIProvider;
	
	if (!isProviderAvailable(providerType)) {
		throw new Error(
			`${config.provider} provider is not available on ${Platform.isMobile ? "mobile" : "this platform"}. ` +
			`Available providers: ${getAvailableProviderNames().join(", ")}`
		);
	}

	switch (config.provider) {
		case "openai":
			return new OpenAIService(app, config as OpenAIProviderConfig);

		case "azure-openai":
			return new AzureOpenAIService(app, config as AzureOpenAIProviderConfig);

		case "copilot":
			if (Platform.isMobile) {
				throw new Error(
					"GitHub Copilot CLI is not available on mobile. " +
					"Please use OpenAI or Azure OpenAI provider in settings."
				);
			}
			// Dynamic import to avoid loading Node.js modules on mobile
			const { GitHubCopilotCliService } = await import("./GitHubCopilotCliService");
			return new GitHubCopilotCliService(app, config as CopilotProviderConfig) as unknown as AIProvider;

		default:
			throw new Error(`Unknown provider type: ${config.provider}`);
	}
}

/**
 * Get a list of providers available on the current platform
 */
export function getAvailableProviderInfo(): { 
	type: SupportedAIProvider; 
	name: string; 
	description: string;
	available: boolean;
}[] {
	const providers = [
		{
			type: "copilot" as SupportedAIProvider,
			name: "GitHub Copilot",
			description: "Full-featured with CLI SDK, MCP, and Agent Skills",
			available: isProviderAvailable("copilot"),
		},
		{
			type: "openai" as SupportedAIProvider,
			name: "OpenAI",
			description: "Direct API access to GPT models",
			available: isProviderAvailable("openai"),
		},
		{
			type: "azure-openai" as SupportedAIProvider,
			name: "Azure OpenAI",
			description: "Enterprise Azure-hosted OpenAI models",
			available: isProviderAvailable("azure-openai"),
		},
	];

	return providers;
}

/**
 * Get names of available providers
 */
export function getAvailableProviderNames(): string[] {
	return getAvailableProviderInfo()
		.filter(p => p.available)
		.map(p => p.name);
}

