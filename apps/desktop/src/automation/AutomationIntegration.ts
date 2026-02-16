/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AutomationIntegration
 * @description Integration layer between ExtensionManager and AutomationEngine.
 * 
 * This module provides hooks to register/unregister automations when
 * automation extensions are installed/uninstalled through the extension marketplace.
 * 
 * @example
 * ```typescript
 * import { handleAutomationInstall, handleAutomationUninstall } from './AutomationIntegration';
 * 
 * // After installing an automation extension
 * if (manifest.kind === 'automation') {
 *   await handleAutomationInstall(app, plugin, manifest);
 * }
 * 
 * // Before uninstalling an automation extension
 * if (record.kind === 'automation') {
 *   await handleAutomationUninstall(app, plugin, extensionId);
 * }
 * ```
 * 
 * @since 0.1.0
 */

import { App } from 'obsidian';
import type { AIServiceManager as VaultCopilotPlugin } from '../app/AIServiceManager';
import { getAutomationEngine } from './AutomationEngine';
import { AutomationInstance, AutomationConfig } from './types';
import { MarketplaceExtension } from '../extensions/types';

/**
 * Handle automation extension installation
 * Reads the automation manifest and registers it with the AutomationEngine
 * 
 * @param app - Obsidian app instance
 * @param plugin - Plugin instance
 * @param manifest - Extension manifest
 * @throws {Error} If automation configuration is invalid or registration fails
 */
export async function handleAutomationInstall(
	app: App,
	plugin: VaultCopilotPlugin,
	manifest: MarketplaceExtension
): Promise<void> {
	console.log(`AutomationIntegration: Handling installation of automation '${manifest.uniqueId}'`);

	try {
		// Get the automation engine
		const engine = getAutomationEngine(app, plugin);

		// Find the automation configuration file from packageContents
		const configFile = manifest.packageContents.find(
			(file) => file.targetLocation.endsWith('.json') && file.targetLocation.includes('.obsidian/automations/')
		);

		if (!configFile) {
			throw new Error('No automation configuration file found in package contents');
		}

		// Read the automation configuration
		const configContent = await app.vault.adapter.read(configFile.targetLocation);
		const config: AutomationConfig = JSON.parse(configContent);

		// Validate the configuration
		validateAutomationConfig(config);

		// Create automation instance
		const automation: AutomationInstance = {
			id: manifest.uniqueId,
			name: manifest.displayTitle,
			config,
			enabled: config.enabled ?? false,
			executionCount: 0,
		};

		// Register with automation engine
		await engine.registerAutomation(automation);

		// Run on install if configured
		if (config.runOnInstall) {
			console.log(`AutomationIntegration: Running automation '${manifest.uniqueId}' on install`);
			await engine.runAutomation(manifest.uniqueId);
		}

		console.log(`AutomationIntegration: Successfully registered automation '${manifest.uniqueId}'`);
	} catch (error) {
		console.error(`AutomationIntegration: Failed to register automation '${manifest.uniqueId}':`, error);
		throw error;
	}
}

/**
 * Handle automation extension uninstallation
 * Unregisters the automation from the AutomationEngine
 * 
 * @param app - Obsidian app instance
 * @param plugin - Plugin instance
 * @param extensionId - ID of extension being uninstalled
 */
export async function handleAutomationUninstall(
	app: App,
	plugin: VaultCopilotPlugin,
	extensionId: string
): Promise<void> {
	console.log(`AutomationIntegration: Handling uninstallation of automation '${extensionId}'`);

	try {
		// Get the automation engine
		const engine = getAutomationEngine(app, plugin);

		// Unregister the automation
		await engine.unregisterAutomation(extensionId);

		console.log(`AutomationIntegration: Successfully unregistered automation '${extensionId}'`);
	} catch (error) {
		console.error(`AutomationIntegration: Failed to unregister automation '${extensionId}':`, error);
		// Don't throw - allow uninstall to proceed even if unregistration fails
	}
}

/**
 * Validate automation configuration
 * 
 * @param config - Automation configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validateAutomationConfig(config: AutomationConfig): void {
	if (!config.triggers || config.triggers.length === 0) {
		throw new Error('Automation must have at least one trigger');
	}

	if (!config.actions || config.actions.length === 0) {
		throw new Error('Automation must have at least one action');
	}

	// Validate each trigger
	for (const trigger of config.triggers) {
		if (!trigger.type) {
			throw new Error('Trigger must have a type');
		}

		if (trigger.type === 'schedule' && !(trigger as any).schedule) {
			throw new Error('Schedule trigger must have a schedule property');
		}

		if (
			(trigger.type === 'file-created' || trigger.type === 'file-modified' || trigger.type === 'file-deleted') &&
			!(trigger as any).pattern
		) {
			throw new Error(`${trigger.type} trigger must have a pattern property`);
		}

		if (trigger.type === 'tag-added' && !(trigger as any).tag) {
			throw new Error('Tag-added trigger must have a tag property');
		}
	}

	// Validate each action
	for (const action of config.actions) {
		if (!action.type) {
			throw new Error('Action must have a type');
		}

		switch (action.type) {
			case 'run-agent':
				if (!(action as any).agentId) {
					throw new Error('run-agent action must have an agentId');
				}
				break;
			case 'run-prompt':
				if (!(action as any).promptId) {
					throw new Error('run-prompt action must have a promptId');
				}
				break;
			case 'run-skill':
				if (!(action as any).skillId) {
					throw new Error('run-skill action must have a skillId');
				}
				break;
			case 'create-note':
			case 'update-note':
				if (!(action as any).path) {
					throw new Error(`${action.type} action must have a path`);
				}
				break;
			case 'run-shell':
				if (!(action as any).command) {
					throw new Error('run-shell action must have a command');
				}
				break;
		}
	}
}
