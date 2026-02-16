/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module AutomationEngineTests
 * @description Unit tests for AutomationEngine action implementations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AutomationEngine } from "../../automation/AutomationEngine";
import { AutomationExecutionContext } from "../../automation/types";

// Mock the main plugin
const mockPlugin = {
settings: {
aiProvider: 'copilot' as 'copilot' | 'openai' | 'azure-openai',
},
githubCopilotCliService: {
isConnected: vi.fn(() => true),
sendMessage: vi.fn(async (prompt: string) => `Response to: ${prompt}`),
},
openaiService: {
isReady: vi.fn(() => true),
sendMessage: vi.fn(async (prompt: string) => `OpenAI response to: ${prompt}`),
},
azureOpenaiService: null,
agentCache: {
getAgentByName: vi.fn((name: string) => ({
name,
description: 'Test agent',
path: '/test/agent.md',
})),
getFullAgent: vi.fn(async (name: string) => ({
name,
description: 'Test agent',
instructions: `You are a helpful agent named ${name}.`,
path: '/test/agent.md',
})),
},
promptCache: {
getFullPrompt: vi.fn(async (name: string) => ({
name,
content: `This is a prompt for ${name}. User input: {userInput}`,
path: '/test/prompt.md',
})),
},
skillRegistry: {
executeSkill: vi.fn(async (name: string, args: Record<string, unknown>) => ({
success: true,
data: { skillName: name, args, result: 'Skill executed successfully' },
})),
},
connectCopilot: vi.fn(async () => {}),
} as any;

const mockApp = {
vault: {
getAbstractFileByPath: vi.fn(),
create: vi.fn(),
modify: vi.fn(),
},
} as any;

describe("AutomationEngine Action Implementations", () => {
let engine: AutomationEngine;
let context: AutomationExecutionContext;

beforeEach(() => {
vi.clearAllMocks();
engine = new AutomationEngine(mockApp, mockPlugin);
context = {
automation: {
id: 'test-automation',
name: 'Test Automation',
config: {
triggers: [],
actions: [],
},
enabled: true,
executionCount: 0,
},
trigger: {
type: 'schedule',
schedule: '0 0 * * *',
},
		previousResults: [],
input: { task: 'Test task' },
};
});

describe("executeRunAgent", () => {
it("should execute an agent action", async () => {
const action = {
type: 'run-agent' as const,
agentId: 'test-agent',
input: { task: 'Test task' },
};

const result = await (engine as any).executeRunAgent(action, context);

expect(mockPlugin.agentCache.getAgentByName).toHaveBeenCalledWith('test-agent');
expect(mockPlugin.agentCache.getFullAgent).toHaveBeenCalledWith('test-agent');
expect(mockPlugin.githubCopilotCliService.sendMessage).toHaveBeenCalled();
expect(result).toContain('Response to:');
});

it("should throw error if agent not found", async () => {
mockPlugin.agentCache.getAgentByName.mockReturnValueOnce(undefined);

const action = {
type: 'run-agent' as const,
agentId: 'non-existent-agent',
input: {},
};

await expect((engine as any).executeRunAgent(action, context)).rejects.toThrow(
"Agent 'non-existent-agent' not found"
);
});

it("should handle agent with no input", async () => {
const action = {
type: 'run-agent' as const,
agentId: 'test-agent',
};

const result = await (engine as any).executeRunAgent(action, context);

expect(result).toContain('Response to:');
expect(mockPlugin.githubCopilotCliService.sendMessage).toHaveBeenCalled();
});

it("should use OpenAI service when configured", async () => {
mockPlugin.settings.aiProvider = 'openai';

const action = {
type: 'run-agent' as const,
agentId: 'test-agent',
input: { task: 'Test task' },
};

const result = await (engine as any).executeRunAgent(action, context);

expect(mockPlugin.openaiService.sendMessage).toHaveBeenCalled();
expect(result).toContain('OpenAI response to:');

mockPlugin.settings.aiProvider = 'copilot';
});
});

describe("executeRunPrompt", () => {
it("should execute a prompt with input variables", async () => {
const action = {
type: 'run-prompt' as const,
promptId: 'test-prompt',
input: { userInput: 'Hello world' },
};

const result = await (engine as any).executeRunPrompt(action, context);

expect(mockPlugin.promptCache.getFullPrompt).toHaveBeenCalledWith('test-prompt');
expect(mockPlugin.githubCopilotCliService.sendMessage).toHaveBeenCalled();
expect(result).toContain('Response to:');
});

it("should throw error if prompt not found", async () => {
mockPlugin.promptCache.getFullPrompt.mockResolvedValueOnce(null);

const action = {
type: 'run-prompt' as const,
promptId: 'non-existent-prompt',
input: {},
};

await expect((engine as any).executeRunPrompt(action, context)).rejects.toThrow(
"Prompt 'non-existent-prompt' not found"
);
});

it("should replace variable placeholders in prompt content", async () => {
mockPlugin.promptCache.getFullPrompt.mockResolvedValueOnce({
name: 'test-prompt',
content: 'Hello {name}, your task is: {task}',
path: '/test/prompt.md',
});

const action = {
type: 'run-prompt' as const,
promptId: 'test-prompt',
input: { name: 'Alice', task: 'Write tests' },
};

await (engine as any).executeRunPrompt(action, context);

const sentMessage = mockPlugin.githubCopilotCliService.sendMessage.mock.calls[0][0];
expect(sentMessage).toContain('Alice');
expect(sentMessage).toContain('Write tests');
});

it("should handle string input as userInput placeholder", async () => {
mockPlugin.promptCache.getFullPrompt.mockResolvedValueOnce({
name: 'test-prompt',
content: 'Task: ${userInput}',
path: '/test/prompt.md',
});

const action = {
type: 'run-prompt' as const,
promptId: 'test-prompt',
input: 'Complete the report',
};

await (engine as any).executeRunPrompt(action, context);

const sentMessage = mockPlugin.githubCopilotCliService.sendMessage.mock.calls[0][0];
expect(sentMessage).toContain('Complete the report');
});
});

describe("executeRunSkill", () => {
it("should execute a skill with arguments", async () => {
const action = {
type: 'run-skill' as const,
skillId: 'test-skill',
input: { param1: 'value1', param2: 'value2' },
};

const result = await (engine as any).executeRunSkill(action, context);

expect(mockPlugin.skillRegistry.executeSkill).toHaveBeenCalledWith('test-skill', {
param1: 'value1',
param2: 'value2',
});
expect(result).toEqual({
skillName: 'test-skill',
args: { param1: 'value1', param2: 'value2' },
result: 'Skill executed successfully',
});
});

it("should throw error if skill execution fails", async () => {
mockPlugin.skillRegistry.executeSkill.mockResolvedValueOnce({
success: false,
error: 'Skill execution failed: Invalid parameters',
});

const action = {
type: 'run-skill' as const,
skillId: 'failing-skill',
input: {},
};

await expect((engine as any).executeRunSkill(action, context)).rejects.toThrow(
'Skill execution failed: Invalid parameters'
);
});

it("should handle skill with no input", async () => {
const action = {
type: 'run-skill' as const,
skillId: 'test-skill',
};

const result = await (engine as any).executeRunSkill(action, context);

expect(mockPlugin.skillRegistry.executeSkill).toHaveBeenCalledWith('test-skill', {});
expect(result).toBeDefined();
});
});
});



