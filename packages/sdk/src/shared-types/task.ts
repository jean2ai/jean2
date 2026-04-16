import type { Preconfig } from './preconfig';

/**
 * Parameters for the task tool
 */
export interface TaskToolParams {
  /** Short description (3-5 words) of the task */
  description: string;
  
  /** The task prompt for the subagent to perform */
  prompt: string;
  
  /** Type of subagent (preconfig id) to use */
  subagent_type: string;
  
  /** Optional: Resume a previous subagent session */
  task_id?: string;
  
  /** Optional: The command that triggered this task */
  command?: string;
}

/**
 * Result from task tool execution
 */
export interface TaskToolResult {
  /** Whether the task succeeded */
  success: boolean;
  
  /** Session ID of the child session (for resumption) */
  task_id: string;
  
  /** The subagent's response text */
  result?: string;
  
  /** Error message if failed */
  error?: string;
}

/**
 * Context passed to subagent execution
 */
export interface SubagentContext {
  /** Parent session ID */
  parentSessionId: string;
  
  /** Workspace path */
  workspacePath?: string;
  
  /** Workspace ID */
  workspaceId?: string;
  
  /** The subagent preconfig */
  preconfig: Preconfig;
  
  /** Abort signal from parent */
  abortSignal?: AbortSignal;
}
