import type { SecurityCheckResult, SecurityContext, LoadedTool } from '@jean2/sdk';
import { homedir } from 'os';
import { join, resolve } from 'path';

const BLOCKED_PATHS = [
  '/etc/', '/usr/', '/bin/', '/sbin/', '/boot/', '/dev/',
  '/proc/', '/sys/', '/root/',
];

const SENSITIVE_PATTERNS = [
  '.env', '.pem', '.key', '.ssh/', 'id_rsa', 'id_ed25519',
  '.gitconfig', '.npmrc', 'credentials', 'secrets', 'password',
  '.htpasswd',
];

export interface SecurityCheckOutcome {
  success: boolean;
  result?: SecurityCheckResult;
  error?: string;
}

export interface RunSecurityCheckOptions {
  tool: LoadedTool;
  input: {
    args: Record<string, unknown>;
    workspacePath: string;
    sessionId: string;
    allowedPaths?: string[];
  };
}

function createSecurityContext(input: RunSecurityCheckOptions['input']): SecurityContext {
  const { workspacePath, sessionId, allowedPaths = [] } = input;

  return {
    workspacePath,
    sessionId,
    allowedPaths,
    env: {
      get: (key: string) => process.env[key],
    },

    resolvePath(path: string): string {
      if (path.startsWith('~/') || path === '~') {
        return join(homedir(), path.slice(1));
      }
      if (path.startsWith('/')) {
        return path;
      }
      return resolve(workspacePath, path);
    },

    isWithinWorkspace(path: string): boolean {
      const resolved = this.resolvePath(path);
      const normalizedWorkspace = resolve(workspacePath);
      return resolved.startsWith(normalizedWorkspace);
    },

    isSensitivePath(path: string): boolean {
      const lower = path.toLowerCase();
      return SENSITIVE_PATTERNS.some(p => lower.includes(p));
    },

    isBlockedPath(path: string): boolean {
      const resolved = this.resolvePath(path);
      return BLOCKED_PATHS.some(p => resolved.startsWith(p));
    },
  };
}

export async function runSecurityCheck(
  options: RunSecurityCheckOptions
): Promise<SecurityCheckOutcome> {
  const { tool, input } = options;

  if (!tool.security) {
    return { success: true, result: { allowed: true, requiresApproval: false, permissionType: 'tool', permissionKey: 'none', message: '' } };
  }

  try {
    const ctx = createSecurityContext(input);
    const result = await tool.security(input.args, ctx);

    if (typeof result.allowed !== 'boolean' ||
        typeof result.requiresApproval !== 'boolean' ||
        !result.permissionType ||
        !result.permissionKey) {
      return {
        success: false,
        error: 'Security function returned invalid result structure',
      };
    }

    return { success: true, result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Security check failed: ${message}` };
  }
}

export function hasSecurityCheck(tool: LoadedTool): boolean {
  return typeof tool.security === 'function';
}
