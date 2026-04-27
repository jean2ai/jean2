import type { ToolDefinition, ToolContext, ToolResult } from '@jean2/sdk';
import type { ShellOutputVisualization } from '@jean2/sdk';

interface Input {
  command: string;
  cwd?: string;
}

const DANGEROUS_COMMANDS = [
  'rm', 'rmdir', 'del', 'erase',
  'sudo', 'su', 'doas',
  'chmod', 'chown',
  'dd', 'mkfs', 'format',
  'shutdown', 'reboot', 'halt', 'poweroff',
  'iptables', 'ufw', 'firewall-cmd',
  'curl', 'wget', 'nc', 'netcat',
  'eval', 'exec',
];

const FILESYSTEM_COMMANDS = [
  'mv', 'cp', 'mkdir', 'touch', 'ln',
  'git push', 'git reset --hard',
];

export const definition: ToolDefinition = {
  name: 'shell',
  description: `Execute a shell command in a persistent session.

This tool is for terminal operations (package managers, build tools, etc). DO NOT use it for file operations - use specialized tools instead.

## When to use

- Running package managers (npm, bun, pip)
- Build tools and compilers
- Process management
- Network operations (curl, etc)

## When NOT to use (use these instead)

- File search: Use glob tool (NOT find or ls)
- Content search: Use grep tool (NOT grep command)
- Read files: Use read-file tool (NOT cat/head/tail)
- Edit files: Use edit tool (NOT sed/awk)
- Write files: Use write-file tool (NOT echo >)

## Usage

- The cwd parameter sets the working directory. Use this instead of 'cd <directory> && <command>' patterns.
- Commands timeout after 60 seconds by default.
- Quote file paths containing spaces with double quotes.

## Examples

- Good: cwd="/project" command="npm test"
- Bad: command="cd /project && npm test"`,
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      cwd: {
        type: 'string',
        description: "Working directory for the command. Defaults to the workspace directory. Use this instead of 'cd <directory> && <command>' patterns.",
      },
    },
    required: ['command'],
  },
  timeout: 60000,
  dangerous: true,
};

function parseCommand(cmd: string): { baseCommand: string; args: string[] } {
  const parts = cmd.trim().split(/\s+/);
  const baseCommand = parts[0]?.replace(/.*\//, '') || '';
  return { baseCommand, args: parts.slice(1) };
}

function getDangerReason(cmd: string, ctx: ToolContext): string | null {
  if (hasPathOutsideWorkspace(cmd, ctx)) {
    return 'references paths outside the workspace';
  }

  const shellOperators = ['&&', '||', '|'];
  let subCommands: string[] = [cmd];

  for (const op of shellOperators) {
    const parts = cmd.split(new RegExp(`\\s*${op.replace(/[|&]/g, '\\$&')}\\s*`));
    if (parts.length > 1) {
      subCommands = parts;
      break;
    }
  }

  for (const subCmd of subCommands) {
    const trimmed = subCmd.trim();
    if (!trimmed) continue;

    const { baseCommand } = parseCommand(trimmed);
    const lowerSub = trimmed.toLowerCase();

    if (DANGEROUS_COMMANDS.some(dangerous =>
      baseCommand === dangerous || lowerSub.startsWith(dangerous + ' ')
    )) {
      return `contains dangerous command "${baseCommand}"`;
    }

    if (FILESYSTEM_COMMANDS.some(fs => lowerSub.startsWith(fs))) {
      return `contains filesystem command "${baseCommand}"`;
    }

    if (trimmed.includes('>') || trimmed.includes('>>') ||
        trimmed.includes('`') || trimmed.includes('$(')) {
      return 'contains shell redirection or substitution';
    }
  }

  return null;
}

function hasPathOutsideWorkspace(cmd: string, ctx: ToolContext): boolean {
  const paths = extractPathArguments(cmd);

  for (const p of paths) {
    const resolved = ctx.resolvePath(p);
    if (!ctx.isWithinWorkspace(resolved)) {
      return true;
    }
  }

  return false;
}

function extractPathArguments(cmd: string): string[] {
  const paths: string[] = [];
  const parts = cmd.split(/\s+/);

  for (const part of parts) {
    if (part.startsWith('-')) continue;

    const isUnixPath = part.startsWith('/') || part.startsWith('~') ||
      part.startsWith('./') || part.startsWith('../');
    const isWindowsPath = /^[A-Za-z]:[\\]/.test(part) || /^\\\\/.test(part);

    if (isUnixPath || isWindowsPath) {
      paths.push(part);
    }
  }

  return paths;
}

export async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  try {
    const { baseCommand } = parseCommand(input.command);
    const dangerReason = getDangerReason(input.command, ctx);
    const isDangerous = dangerReason !== null;

    const resolvedCwd = input.cwd ? ctx.resolvePath(input.cwd) : ctx.workspacePath;
    const outsideWorkspace = input.cwd && !ctx.isWithinWorkspace(resolvedCwd);

    if (isDangerous) {
      const approved = await ctx.ask({
        target: 'permission',
        type: 'permission',
        question: `Command "${input.command.slice(0, 50)}${input.command.length > 50 ? '...' : ''}" ${dangerReason} and requires approval.`,
        risk: 'high',
        metadata: { permissionKey: `command:${baseCommand}`, permissionType: 'action' }
      });
      if (!approved) return { success: false, error: 'USER_REJECTION' };
    } else if (outsideWorkspace) {
      const approved = await ctx.ask({
        target: 'permission',
        type: 'permission',
        question: 'This command runs outside the workspace directory and requires approval.',
        risk: 'medium',
        metadata: { permissionKey: 'path:outside_workspace', permissionType: 'action' }
      });
      if (!approved) return { success: false, error: 'USER_REJECTION' };
    }

    const cwd = input.cwd ? ctx.fs.resolve(input.cwd) : ctx.workspacePath;

    let shell: string[];
    const platform = await detectPlatform();
    
    if (platform === 'windows') {
      shell = await detectWindowsShell();
    } else {
      shell = ['sh', '-c', input.command];
    }

    const result = Bun.spawnSync(shell, {
      cwd,
      maxSize: 10 * 1024 * 1024,
    } as Parameters<typeof Bun.spawnSync>[1]);

    const stdout = result.stdout?.toString() ?? '';
    const stderr = result.stderr?.toString() ?? '';
    const exitCode = result.exitCode ?? 1;

    const visualization: ShellOutputVisualization = {
      type: 'shell-output',
      command: input.command.substring(0, 100),
      stdout: stdout || undefined,
      stderr: stderr || undefined,
      exitCode,
    };

    return {
      success: exitCode === 0,
      result: { stdout, stderr, exitCode },
      visualization,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

async function detectPlatform(): Promise<'windows' | 'unix'> {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform === 'win32' ? 'windows' : 'unix';
  }
  return 'unix';
}

async function detectWindowsShell(): Promise<string[]> {
  if (typeof Bun !== 'undefined' && Bun.which) {
    if (Bun.which('pwsh')) {
      return ['pwsh', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command'];
    }
    if (Bun.which('powershell')) {
      return ['powershell', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command'];
    }
  }
  return ['cmd.exe', '/c'];
}
