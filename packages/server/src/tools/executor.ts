import { spawn } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { ToolRuntime } from '@jean2/shared';
import type { DiscoveredTool, ToolResult } from './types';
import { getToolEnv } from '../env';

const RUNTIME_COMMANDS: Record<ToolRuntime, string[]> = {
  bun: ['bun', 'run'],
  node: ['node'],
  python: ['python3'],
  bash: ['bash'],
  go: ['go', 'run'],
  binary: [],
  powershell: ['pwsh', '-File'],
};

/**
 * Expands ~ in paths to the user's home directory
 */
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return path.replace('~', homedir());
  }
  return path;
}

export interface ExecuteToolOptions {
  tool: DiscoveredTool;
  args: Record<string, unknown>;
  workspacePath?: string;
  sessionId?: string;
  toolCallId?: string;
  abortSignal?: AbortSignal;
  timeout?: number;
}

export async function executeTool(
  options: ExecuteToolOptions
): Promise<ToolResult> {
  const { tool, args, workspacePath, sessionId, toolCallId: _toolCallId, abortSignal, timeout = 30000 } = options;
  const { definition, path: toolPath } = tool;
  const scriptPath = join(toolPath, definition.script);
  
  const runtimeCmd = RUNTIME_COMMANDS[definition.runtime];
  const command = definition.runtime === 'binary' 
    ? [scriptPath]
    : [...runtimeCmd, scriptPath];
  
  // Determine the working directory for tool execution
  let cwd: string;
  if (workspacePath) {
    const expandedWorkspacePath = expandPath(workspacePath);
    // Validate that the workspace path exists
    if (!existsSync(expandedWorkspacePath)) {
      return {
        success: false,
        error: `Workspace path does not exist: ${expandedWorkspacePath}`,
      };
    }
    cwd = expandedWorkspacePath;
  } else {
    cwd = process.cwd();
  }
  
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let interrupted = false;
    
    // Check if already aborted before spawning
    if (abortSignal?.aborted) {
      resolve({
        success: false,
        error: 'Tool execution interrupted before start',
        interrupted: true,
      });
      return;
    }
    
    const proc = spawn(command[0], command.slice(1), {
      cwd,
      env: { ...getToolEnv() },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    
    // Set timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeout);
    
    // Handle abort signal
    const abortHandler = () => {
      interrupted = true;
      proc.kill('SIGTERM');
    };
    
    if (abortSignal) {
      abortSignal.addEventListener('abort', abortHandler);
    }
    
    // Build input with Jean2-provided context
    const scriptInput = {
      ...args,
      workspacePath: workspacePath || process.cwd(),
      sessionId: sessionId || '',
    };

    // Send input via stdin
    proc.stdin?.write(JSON.stringify(scriptInput));
    proc.stdin?.end();
    
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      if (abortSignal) {
        abortSignal.removeEventListener('abort', abortHandler);
      }
      
      if (interrupted) {
        resolve({
          success: false,
          error: 'Tool execution interrupted',
          interrupted: true,
          partialOutput: stdout || undefined,
        });
        return;
      }
      
      if (timedOut) {
        resolve({
          success: false,
          error: `Tool execution timed out after ${timeout}ms`,
        });
        return;
      }
      
      if (code !== 0) {
        resolve({
          success: false,
          error: stderr || `Tool exited with code ${code}`,
        });
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        resolve({
          success: true,
          result,
        });
      } catch (_e) {
        resolve({
          success: false,
          error: `Failed to parse tool output: ${stdout.slice(0, 200)}`,
        });
      }
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      if (abortSignal) {
        abortSignal.removeEventListener('abort', abortHandler);
      }
      
      if (interrupted) {
        resolve({
          success: false,
          error: 'Tool execution interrupted',
          interrupted: true,
          partialOutput: stdout || undefined,
        });
        return;
      }
      
      resolve({
        success: false,
        error: `Failed to execute tool: ${err.message}`,
      });
    });
  });
}

export { RUNTIME_COMMANDS };
