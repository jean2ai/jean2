import { spawn } from 'child_process';
import { join } from 'path';
import type { SecurityCheckInput, SecurityCheckResult } from '@jean2/shared';
import type { DiscoveredTool } from './types';
import { RUNTIME_COMMANDS } from './executor';
import { getToolEnv } from '../env';

const DEFAULT_SECURITY_TIMEOUT = 10000; // 10 seconds for security checks

export interface RunSecurityCheckOptions {
  tool: DiscoveredTool;
  input: SecurityCheckInput;
  timeout?: number;
}

export interface SecurityCheckOutcome {
  success: boolean;
  result?: SecurityCheckResult;
  error?: string;
}

export async function runSecurityCheck(
  options: RunSecurityCheckOptions
): Promise<SecurityCheckOutcome> {
  const { tool, input, timeout = DEFAULT_SECURITY_TIMEOUT } = options;
  const { definition, path: toolPath } = tool;

  // Determine the security script filename
  const securityScript = definition.securityScript || 'security.ts';
  const scriptPath = join(toolPath, securityScript);

  const runtimeCmd = RUNTIME_COMMANDS[definition.runtime];
  const command = definition.runtime === 'binary'
    ? [scriptPath]
    : [...runtimeCmd, scriptPath];

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const proc = spawn(command[0], command.slice(1), {
      cwd: toolPath, // Run from tool directory
      env: { ...getToolEnv(tool.definition.env) },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    // Set timeout (shorter for security checks)
    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeout);

    // Send input via stdin
    proc.stdin?.write(JSON.stringify(input));
    proc.stdin?.end();

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        resolve({
          success: false,
          error: `Security check timed out after ${timeout}ms`,
        });
        return;
      }

      if (code !== 0) {
        resolve({
          success: false,
          error: stderr || `Security script exited with code ${code}`,
        });
        return;
      }

      try {
        const result = JSON.parse(stdout) as SecurityCheckResult;
        
        // Validate the result has required fields
        if (typeof result.allowed !== 'boolean' || 
            typeof result.requiresApproval !== 'boolean' ||
            !result.permissionType ||
            !result.permissionKey) {
          resolve({
            success: false,
            error: 'Security script returned invalid result structure',
          });
          return;
        }

        resolve({
          success: true,
          result,
        });
      } catch (_e) {
        resolve({
          success: false,
          error: `Failed to parse security check output: ${stdout.slice(0, 200)}`,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: `Failed to execute security script: ${err.message}`,
      });
    });
  });
}

/**
 * Check if a tool has a security check configured
 */
export function hasSecurityCheck(tool: DiscoveredTool): boolean {
  return tool.definition.hasSecurityCheck === true;
}
