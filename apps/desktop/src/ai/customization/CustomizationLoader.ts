/**
 * CustomizationLoader - Loads and parses custom agents, skills, instructions, and prompts
 * from configured directories in the vault.
 * 
 * File formats:
 * - Agents: *.agent.md with frontmatter (name, description, tools)
 * - Skills: <skill-name>/SKILL.md - each skill is a folder containing a SKILL.md file
 *           The SKILL.md can use either:
 *           1. Standard frontmatter at the top
 *           2. A ```skill code block with frontmatter inside
 * - Instructions: *.instructions.md, copilot-instructions.md, or AGENTS.md with optional frontmatter (applyTo)
 * - Prompts: *.prompt.md with frontmatter (name, description, tools, model)
 */

import { App, TFile, TFolder, FileSystemAdapter } from "obsidian";
import { normalizeVaultPath, isVaultRoot, toVaultRelativePath, expandHomePath } from "../../utils/pathUtils";
import { isDesktop } from "../../utils/platform";
import { parseYamlKeyValues, parseFrontmatter } from "./YamlParser";

/**
 * Parsed agent from .agent.md file
 */
export interface CustomAgent {
	/** Unique identifier from frontmatter name field */
	name: string;
	/** Human-readable description */
	description: string;
	/** Tools the agent can use */
	tools?: string[];
	/** Allowlist of agent names this agent can invoke as subagents */
	agents?: string[];
	/** Model override(s) for this agent */
	model?: string | string[];
	/** Whether this agent appears in the user-facing agent selector (default: true) */
	userInvokable?: boolean;
	/** Whether the model can autonomously invoke this agent as a subagent (default: false) */
	disableModelInvocation?: boolean;
	/** Full path to the agent file */
	path: string;
	/** Raw content of the agent file (without frontmatter) */
	instructions: string;
}

/**
 * Parsed skill from SKILL.md file
 */
export interface CustomSkill {
	/** Unique identifier from frontmatter name field */
	name: string;
	/** Description of when to use the skill */
	description: string;
	/** Optional license */
	license?: string;
	/** Full path to the skill directory */
	path: string;
	/** Raw content of the skill file (without frontmatter) */
	instructions: string;
}

/**
 * Parsed instruction from .instructions.md file
 */
export interface CustomInstruction {
	/** File name without extension */
	name: string;
	/** Optional path pattern for when to apply */
	applyTo?: string;
	/** Full path to the instruction file */
	path: string;
	/** Raw content of the instruction file (without frontmatter) */
	content: string;
}

/**
 * Parsed prompt from .prompt.md file (VS Code compatible)
 */
export interface CustomPrompt {
	/** Unique identifier from frontmatter name field or filename */
	name: string;
	/** Human-readable description */
	description: string;
	/** Optional tools the prompt can use */
	tools?: string[];
	/** Optional model override for this prompt */
	model?: string;
	/** Optional agent to use when running the prompt */
	agent?: string;
	/** Optional hint text shown in the chat input field */
	argumentHint?: string;
	/** Optional timeout in seconds for this prompt (overrides default) */
	timeout?: number;
	/** Full path to the prompt file */
	path: string;
	/** The prompt template content (without frontmatter) */
	content: string;
}

/**
 * Voice agent definition from .voice-agent.md file
 * Used for realtime voice agents with handoff support
 */
export interface VoiceAgentDefinition {
	/** Unique identifier from frontmatter name field */
	name: string;
	/** Human-readable description */
	description: string;
	/** Description for when other agents should hand off to this one */
	handoffDescription: string;
	/** Voice to use (alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse) */
	voice?: string;
	/** Tools this agent can use */
	tools: string[];
	/** Names of other voice agents this agent can hand off to */
	handoffs: string[];
	/** Full path to the voice agent file */
	path: string;
	/** Raw instructions content (without frontmatter) */
	instructions: string;
}

// parseYamlKeyValues and parseFrontmatter are imported from YamlParser.ts

/**
 * Parse content from a code block (e.g., ```skill ... ```)
 * The code block may contain frontmatter inside it.
 */
function parseCodeBlockContent(content: string, blockType: string): { frontmatter: Record<string, unknown>; body: string } | null {
	// Match code block with specific type: ```skill\n...\n```
	const codeBlockRegex = new RegExp('^```' + blockType + '\\r?\\n([\\s\\S]*?)\\r?\\n```\\s*$');
	const match = content.trim().match(codeBlockRegex);
	
	if (!match) {
		return null;
	}
	
	const blockContent = match[1] || '';
	
	// Now parse frontmatter from within the code block
	return parseFrontmatter(blockContent);
}

/**
 * Loader class for custom agents, skills, and instructions
 */
export class CustomizationLoader {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Get the vault base path if available (desktop only)
	 */
	private getVaultBasePath(): string | undefined {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath().replace(/\\/g, '/');
		}
		return undefined;
	}

	/**
 * Convert a directory path to a vault-relative path and get the folder
 * Handles absolute paths, vault root (.), and relative paths
 * Cross-platform compatible (Windows, Mac, Linux)
 */
private getFolderFromPath(dir: string): TFolder | null {
	// Expand ~/... to user home directory (cross-platform)
	dir = expandHomePath(dir);

	const vaultBasePath = this.getVaultBasePath();
	
	// Handle vault root cases first
	if (isVaultRoot(dir)) {
		return this.app.vault.getRoot();
	}
	
	// Normalize the path
	let relativePath = normalizeVaultPath(dir);
	
	// Handle absolute paths ending with /. (vault root with trailing .)
	if (vaultBasePath && (relativePath.endsWith('/.') || relativePath === '.')) {
		const withoutDot = relativePath.replace(/\/?\.$/, '');
		const normalizedVaultPath = normalizeVaultPath(vaultBasePath);
		if (withoutDot === normalizedVaultPath || withoutDot === '') {
			return this.app.vault.getRoot();
		}
	}
	
	// Convert absolute path to relative path
	if (vaultBasePath) {
		relativePath = toVaultRelativePath(relativePath, vaultBasePath);
	}
	
	// Handle empty string after processing (vault root)
	if (isVaultRoot(relativePath)) {
		return this.app.vault.getRoot();
	}
	
	// Obsidian's getAbstractFileByPath expects vault-relative paths with forward slashes
	const folder = this.app.vault.getAbstractFileByPath(relativePath);
	if (folder && folder instanceof TFolder) {
		return folder;
	}
	
	console.log(`[VC] Could not find folder: ${dir} (resolved to: ${relativePath})`);
	return null;
}

	/**
	 * Load all agents from the configured agent directories
	 */
	async loadAgents(directories: string[]): Promise<CustomAgent[]> {
		const agents: CustomAgent[] = [];

		for (const dir of directories) {
			const folder = this.getFolderFromPath(dir);
			if (!folder) {
				console.log(`[VC] Agent directory not found: "${dir}"`);
				continue;
			}

			console.log(`[VC] Scanning agent directory: "${dir}" with ${folder.children.length} children`);

			// Find all .agent.md files in this directory
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md' && child.name.endsWith('.agent.md')) {
					try {
						const content = await this.app.vault.read(child);
						const { frontmatter, body } = parseFrontmatter(content);

						if (frontmatter.name && frontmatter.description) {
							agents.push({
								name: String(frontmatter.name),
								description: String(frontmatter.description),
								tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
								agents: Array.isArray(frontmatter.agents) ? frontmatter.agents.map(String) : undefined,
								model: Array.isArray(frontmatter.model)
									? frontmatter.model.map(String)
									: frontmatter.model ? String(frontmatter.model) : undefined,
								userInvokable: frontmatter['user-invokable'] === 'false' || frontmatter['user-invokable'] === false ? false : undefined,
								disableModelInvocation: frontmatter['disable-model-invocation'] === 'true' || frontmatter['disable-model-invocation'] === true ? true : undefined,
								path: child.path,
								instructions: body,
							});
						}
					} catch (error) {
						console.error(`Failed to load agent from ${child.path}:`, error);
					}
				}
			}
		}

		return agents;
	}

	/**
	 * Load all skills from the configured skill directories.
	 * Tries vault API first, falls back to filesystem for out-of-vault directories.
	 */
	async loadSkills(directories: string[]): Promise<CustomSkill[]> {
		const skills: CustomSkill[] = [];

		for (const dir of directories) {
			const folder = this.getFolderFromPath(dir);
			if (!folder) {
				// Vault API failed — try filesystem fallback for out-of-vault dirs (desktop only)
				const fsSkills = await this.loadSkillsFromFs(dir);
				skills.push(...fsSkills);
				continue;
			}

			// Skills are in subdirectories with SKILL.md files
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					// Look for SKILL.md in this subdirectory
					const skillFile = this.app.vault.getAbstractFileByPath(`${child.path}/SKILL.md`);
					if (skillFile && skillFile instanceof TFile) {
						try {
							const content = await this.app.vault.read(skillFile);
							const skill = this.parseSkillContent(content, child.path);
							if (skill) skills.push(skill);
						} catch (error) {
							console.error(`Failed to load skill from ${skillFile.path}:`, error);
						}
					}
				}
			}
		}

		return skills;
	}

	/**
	 * Parse skill content from a SKILL.md file.
	 * @internal
	 */
	private parseSkillContent(content: string, dirPath: string): CustomSkill | null {
		// Try parsing as code block first (```skill ... ```)
		let parsed = parseCodeBlockContent(content, 'skill');

		// Fall back to regular frontmatter if not a code block
		if (!parsed) {
			parsed = parseFrontmatter(content);
		}

		const { frontmatter, body } = parsed;

		if (frontmatter.name && frontmatter.description) {
			return {
				name: String(frontmatter.name),
				description: String(frontmatter.description),
				license: frontmatter.license ? String(frontmatter.license) : undefined,
				path: dirPath,
				instructions: body,
			};
		}
		return null;
	}

	/**
	 * Load skills from an absolute filesystem path (out-of-vault directories).
	 * Desktop only — uses Node.js fs module.
	 * @internal
	 */
	private async loadSkillsFromFs(dir: string): Promise<CustomSkill[]> {
		if (!isDesktop) return [];

		const expandedDir = expandHomePath(dir).replace(/\\/g, '/');

		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const fs = require("fs") as typeof import("fs");
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const path = require("path") as typeof import("path");

			if (!fs.existsSync(expandedDir)) {
				console.log(`[VC] Skill directory not found on filesystem: "${expandedDir}"`);
				return [];
			}

			const stat = fs.statSync(expandedDir);
			if (!stat.isDirectory()) return [];

			const skills: CustomSkill[] = [];
			const entries = fs.readdirSync(expandedDir, { withFileTypes: true });

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;

				const skillFilePath = path.join(expandedDir, entry.name, 'SKILL.md');
				if (!fs.existsSync(skillFilePath)) continue;

				try {
					const content = fs.readFileSync(skillFilePath, 'utf-8');
					const skillDirPath = path.join(expandedDir, entry.name).replace(/\\/g, '/');
					const skill = this.parseSkillContent(content, skillDirPath);
					if (skill) {
						skills.push(skill);
					}
				} catch (error) {
					console.error(`Failed to load skill from ${skillFilePath}:`, error);
				}
			}

			console.log(`[VC] Loaded ${skills.length} skills from filesystem: "${expandedDir}"`);
			return skills;
		} catch (error) {
			console.error(`[VC] Failed to load skills from filesystem "${expandedDir}":`, error);
			return [];
		}
	}

	/**
	 * Load all instructions from the configured instruction directories
	 */
	async loadInstructions(directories: string[]): Promise<CustomInstruction[]> {
		const instructions: CustomInstruction[] = [];

		for (const dir of directories) {
			const folder = this.getFolderFromPath(dir);
			if (!folder) {
				continue;
			}

			// Find all .instructions.md files, copilot-instructions.md, or AGENTS.md
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md') {
					const isInstructionFile = child.name.endsWith('.instructions.md') || 
						child.name === 'copilot-instructions.md' ||
						child.name === 'AGENTS.md';
					
					if (isInstructionFile) {
						try {
							const content = await this.app.vault.read(child);
							const { frontmatter, body } = parseFrontmatter(content);

							// Extract name from filename
							let name = child.basename;
							if (name.endsWith('.instructions')) {
								name = name.replace('.instructions', '');
							}

							instructions.push({
								name,
								applyTo: frontmatter.applyTo ? String(frontmatter.applyTo) : undefined,
								path: child.path,
								content: body,
							});
						} catch (error) {
							console.error(`Failed to load instruction from ${child.path}:`, error);
						}
					}
				}
			}
		}

		return instructions;
	}

	/**
	 * Load all prompts from the configured prompt directories
	 */
	async loadPrompts(directories: string[]): Promise<CustomPrompt[]> {
		const prompts: CustomPrompt[] = [];

		for (const dir of directories) {
			const folder = this.getFolderFromPath(dir);
			if (!folder) {
				console.log(`[VC] Prompt directory not found: "${dir}"`);
				continue;
			}

			console.log(`[VC] Scanning prompt directory: "${dir}" with ${folder.children.length} children`);

			// Find all .prompt.md files in this directory
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md' && child.name.endsWith('.prompt.md')) {
					try {
						const content = await this.app.vault.read(child);
						const { frontmatter, body } = parseFrontmatter(content);

						// Extract name from frontmatter or filename
						let name = frontmatter.name ? String(frontmatter.name) : child.basename;
						if (name.endsWith('.prompt')) {
							name = name.replace('.prompt', '');
						}

						// Description is required, but we'll use a default if not provided
						const description = frontmatter.description 
							? String(frontmatter.description) 
							: `Prompt from ${child.name}`;

						prompts.push({
							name,
							description,
							tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
							model: frontmatter.model ? String(frontmatter.model) : undefined,
							agent: frontmatter.agent ? String(frontmatter.agent) : undefined,
							argumentHint: frontmatter['argument-hint'] ? String(frontmatter['argument-hint']) : undefined,
							timeout: typeof frontmatter.timeout === 'number' ? frontmatter.timeout : undefined,
							path: child.path,
							content: body,
						});
					} catch (error) {
						console.error(`Failed to load prompt from ${child.path}:`, error);
					}
				}
			}
		}

		return prompts;
	}

	/**
	 * Get a single agent by name
	 */
	async getAgent(directories: string[], name: string): Promise<CustomAgent | undefined> {
		const agents = await this.loadAgents(directories);
		return agents.find(a => a.name === name);
	}

	/**
	 * Get a single prompt by name
	 */
	async getPrompt(directories: string[], name: string): Promise<CustomPrompt | undefined> {
		const prompts = await this.loadPrompts(directories);
		return prompts.find(p => p.name === name);
	}

	/**
	 * Load all voice agents from the configured directories
	 * Voice agents use the .voice-agent.md extension
	 */
	async loadVoiceAgents(directories: string[]): Promise<VoiceAgentDefinition[]> {
		const voiceAgents: VoiceAgentDefinition[] = [];

		for (const dir of directories) {
			const folder = this.getFolderFromPath(dir);
			if (!folder) {
				console.log(`[VC] Voice agent directory not found: "${dir}"`);
				continue;
			}

			console.log(`[VC] Scanning voice agent directory: "${dir}" with ${folder.children.length} children`);

			// Find all .voice-agent.md files in this directory
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md' && child.name.endsWith('.voice-agent.md')) {
					try {
						const content = await this.app.vault.read(child);
						const { frontmatter, body } = parseFrontmatter(content);

						if (frontmatter.name) {
							voiceAgents.push({
								name: String(frontmatter.name),
								description: frontmatter.description ? String(frontmatter.description) : '',
								handoffDescription: frontmatter.handoffDescription ? String(frontmatter.handoffDescription) : '',
								voice: frontmatter.voice ? String(frontmatter.voice) : undefined,
								tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : [],
								handoffs: Array.isArray(frontmatter.handoffs) ? frontmatter.handoffs : [],
								path: child.path,
								instructions: body,
							});
							console.log(`[VC] Loaded voice agent: ${frontmatter.name} from ${child.path}`);
						}
					} catch (error) {
						console.error(`Failed to load voice agent from ${child.path}:`, error);
					}
				}
			}
		}

		return voiceAgents;
	}

	/**
	 * Get a single voice agent by name
	 */
	async getVoiceAgent(directories: string[], name: string): Promise<VoiceAgentDefinition | undefined> {
		const voiceAgents = await this.loadVoiceAgents(directories);
		return voiceAgents.find(a => a.name === name);
	}

	/**
	 * Load a voice agent definition from a specific file path
	 */
	async loadVoiceAgentFromFile(filePath: string): Promise<VoiceAgentDefinition | null> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				console.log(`[VC] Voice agent file not found: "${filePath}"`);
				return null;
			}

			const content = await this.app.vault.read(file);
			const { frontmatter, body } = parseFrontmatter(content);

			if (frontmatter.name) {
				const definition: VoiceAgentDefinition = {
					name: String(frontmatter.name),
					description: frontmatter.description ? String(frontmatter.description) : '',
					handoffDescription: frontmatter.handoffDescription ? String(frontmatter.handoffDescription) : '',
					voice: frontmatter.voice ? String(frontmatter.voice) : undefined,
					tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : [],
					handoffs: Array.isArray(frontmatter.handoffs) ? frontmatter.handoffs : [],
					path: file.path,
					instructions: body,
				};
				console.log(`[VC] Loaded voice agent: ${frontmatter.name} from ${file.path}`);
				return definition;
			}

			console.log(`[VC] Voice agent file missing 'name' in frontmatter: "${filePath}"`);
			return null;
		} catch (error) {
			console.error(`[VC] Failed to load voice agent from ${filePath}:`, error);
			return null;
		}
	}
}
