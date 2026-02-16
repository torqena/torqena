/**
 * @module agents
 * @description Re-exports all specialist voice agents
 * 
 * This module provides convenient access to all voice agents:
 * - TaskManagementAgent - Task and checklist management
 * - NoteManagementAgent - Note operations (read, create, edit, search)
 * - WorkIQAgent - Microsoft 365 integration (calendar, email, meetings)
 * 
 * @example
 * ```typescript
 * import { TaskManagementAgent, NoteManagementAgent, WorkIQAgent } from './agents';
 * ```
 * 
 * @see {@link TaskManagementAgent} for task management
 * @see {@link NoteManagementAgent} for note operations
 * @see {@link WorkIQAgent} for Microsoft 365 integration
 */

// Task Management Agent
export {
	TaskManagementAgent,
	TASK_AGENT_ID,
	TASK_AGENT_DEFINITION_FILE,
} from './task-agent/TaskManagementAgent';
export type { TaskManagementAgentConfig } from './task-agent/types';

// Note Management Agent
export {
	NoteManagementAgent,
	NOTE_AGENT_ID,
	NOTE_AGENT_DEFINITION_FILE,
} from './note-agent/NoteManagementAgent';
export type { NoteManagementAgentConfig } from './note-agent/types';

// WorkIQ Agent
export {
	WorkIQAgent,
	WORKIQ_AGENT_ID,
	WORKIQ_AGENT_DEFINITION_FILE,
} from './workiq-agent/WorkIQAgent';
export type { WorkIQAgentConfig } from './workiq-agent/types';
