import path from 'node:path';

interface SecurityInput {
  args: {
    command: string;
    cwd?: string;
  };
  workspacePath: string;
  sessionId: string;
}

interface SecurityResult {
  allowed: boolean;
  requiresApproval: boolean;
  permissionType: 'tool' | 'action';
  permissionKey: string;
  message: string;
  details?: Record<string, unknown>;
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

function parseCommand(cmd: string): { baseCommand: string; args: string[] } {
  const parts = cmd.trim().split(/\s+/);
  const baseCommand = parts[0]?.replace(/.*\//, '') || '';
  return { baseCommand, args: parts.slice(1) };
}

function extractPathArguments(cmd: string): string[] {
  const paths: string[] = [];
  const parts = cmd.split(/\s+/);

  for (const part of parts) {
    if (part.startsWith('-')) continue;

    if (part.startsWith('/') || part.startsWith('~') ||
        part.startsWith('./') || part.startsWith('../')) {
      paths.push(part);
    }
  }

  return paths;
}

function hasPathOutsideWorkspace(cmd: string, workspacePath: string): boolean {
  const paths = extractPathArguments(cmd);
  const resolvedWorkspace = path.resolve(normalizePath(workspacePath));

  for (const p of paths) {
    const resolved = resolvePath(p, workspacePath);
    if (!resolved.startsWith(resolvedWorkspace)) {
      return true;
    }
  }

  return false;
}

function getDangerReason(cmd: string, workspacePath: string): string | null {
  if (hasPathOutsideWorkspace(cmd, workspacePath)) {
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
      return `contains shell redirection or substitution`;
    }
  }

  return null;
}

function normalizePath(pathToNormalize: string): string {
  if (pathToNormalize === '~' || pathToNormalize.startsWith('~/')) {
    return pathToNormalize.replace('~', process.env.HOME || '~');
  }
  return pathToNormalize;
}

function resolvePath(inputPath: string, workspacePath: string): string {
  const normalized = normalizePath(inputPath);
  const normalizedWorkspace = normalizePath(workspacePath);

  if (normalized.startsWith('/')) {
    return path.resolve(normalized);
  }

  const resolved = path.resolve(normalizedWorkspace, normalized);
  return resolved;
}

function isOutsideWorkspace(resolvedPath: string, workspacePath: string): boolean {
  const resolvedWorkspace = path.resolve(normalizePath(workspacePath));
  return !resolvedPath.startsWith(resolvedWorkspace);
}

async function main() {
  const inputText = await Bun.stdin.text();
  const input: SecurityInput = JSON.parse(inputText);
  const { command, cwd } = input.args;
  const { workspacePath } = input;

  const { baseCommand } = parseCommand(command);
  const dangerReason = getDangerReason(command, workspacePath);
  const isDangerous = dangerReason !== null;

  const resolvedCwd = cwd ? resolvePath(cwd, workspacePath) : normalizePath(workspacePath);
  let pathContext = 'workspace';
  if (cwd && isOutsideWorkspace(resolvedCwd, workspacePath)) {
    pathContext = 'outside_workspace';
  }

  let permissionKey: string;
  let message: string;
  let requiresApproval: boolean;

  if (isDangerous && dangerReason) {
    permissionKey = `command:${baseCommand}`;
    message = `Command "${command.slice(0, 50)}${command.length > 50 ? '...' : ''}" ${dangerReason} and requires approval.`;
    requiresApproval = true;
  } else if (pathContext === 'outside_workspace') {
    permissionKey = 'path:outside_workspace';
    message = `This command runs outside the workspace directory and requires approval.`;
    requiresApproval = true;
  } else {
    permissionKey = 'tool:shell';
    message = `Command execution within workspace.`;
    requiresApproval = false;
  }

  const result: SecurityResult = {
    allowed: true,
    requiresApproval,
    permissionType: isDangerous ? 'action' : 'tool',
    permissionKey,
    message,
    details: {
      baseCommand,
      isDangerous,
      pathContext,
      cwd: cwd || workspacePath,
      resolvedCwd,
    },
  };

  console.log(JSON.stringify(result));
}

main().catch(err => {
  console.log(JSON.stringify({
    allowed: false,
    requiresApproval: false,
    permissionType: 'tool',
    permissionKey: 'tool:shell',
    message: `Security check failed: ${err.message}`,
  }));
});
