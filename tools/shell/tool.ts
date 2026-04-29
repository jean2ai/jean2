import type { ToolDefinition, ToolContext, ToolResult } from '@jean2/sdk';
import type { ShellOutputVisualization } from '@jean2/sdk';
import { 
  SHELL_DANGEROUS_COMMANDS, 
  SHELL_FILESYSTEM_COMMANDS,
  createShellPermissionAskStructured,
  createOutsideWorkspaceAsk,
  createWorkspaceModificationAsk,
  type ShellRiskCategory,
} from '@jean2/sdk';

interface Input {
  command: string;
  cwd?: string;
}

export const definition: ToolDefinition = {
  name: 'shell',
  description: `Execute a shell command in a persistent session.

This tool is for terminal operations (package managers, build tools, etc). DO NOT use it for file operations - use specialized tools instead.

## When to use

- Running package managers (npm, bun, pip)
- Build tools and compilers
- Process management
- Network operations (curl, etc)

## When NOT to use (use specialized tools instead)

- File search: Use glob tool
- Content search: Use grep tool
- Read files: Use read-file tool
- Edit files: Use edit tool
- Write files: Use write-file tool

## Usage

- The cwd parameter sets the working directory
- Commands timeout after 60 seconds by default
- Quote file paths containing spaces with double quotes

## Permission Model

This tool requires explicit permission for:
- Dangerous commands (rm, sudo, curl, etc.)
- Filesystem modifications (mv, cp, mkdir, etc.)
- Commands outside the workspace
- Commands with shell operators (|, >, &&, etc.)`,
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      cwd: {
        type: 'string',
        description: "Working directory for the command",
      },
    },
    required: ['command'],
  },
  timeout: 60000,
};

// =============================================================================
// Command Parsing
// =============================================================================

interface ParsedCommand {
  baseCommand: string;
  args: string[];
  flags: string[];
}

function parseCommand(cmd: string): ParsedCommand {
  const parts = cmd.trim().split(/\s+/);
  const baseCommand = parts[0]?.replace(/.*\//, '') || '';
  const args = parts.slice(1);
  
  // Extract flags (args starting with -)
  const flags: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('-')) {
      flags.push(arg);
    }
  }
  
  return { baseCommand, args, flags };
}

// =============================================================================
// Path Extraction
// =============================================================================

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

// =============================================================================
// Risk Analysis
// =============================================================================

interface RiskAnalysis {
  requiresAsk: boolean;
  riskCategory: ShellRiskCategory;
  risk: 'low' | 'medium' | 'high';
  reason: string;
  hasOperators: boolean;
  workspaceBound: boolean;
  resolvedPaths: string[];
  baseCommand: string;
  flags: string[];
}

function analyzeRisk(cmd: string, ctx: ToolContext): RiskAnalysis {
  const { baseCommand, flags } = parseCommand(cmd);
  const lowerCmd = cmd.toLowerCase();
  const paths = extractPathArguments(cmd);
  const resolvedPaths: string[] = [];
  let workspaceBound = true;
  
  // Resolve and check paths
  for (const p of paths) {
    const resolved = ctx.resolvePath(p);
    resolvedPaths.push(resolved);
    if (!ctx.isWithinWorkspace(resolved)) {
      workspaceBound = false;
    }
  }
  
  // Check for shell operators
  const shellOperators = ['&&', '||', '|', '>', '>>', '`', '$(', ';'];
  const hasOperators = shellOperators.some(op => cmd.includes(op));
  
  // Check for outside workspace CWD
  if (ctx.workspacePath) {
    // This is checked separately
  }
  
  // Check for dangerous commands
  const isDangerous = SHELL_DANGEROUS_COMMANDS.some(dangerous =>
    baseCommand === dangerous || lowerCmd.startsWith(dangerous + ' ')
  );
  
  if (isDangerous) {
    // Categorize dangerous commands
    let riskCategory: ShellRiskCategory = 'side-effect';
    
    if (['rm', 'rmdir', 'del', 'erase', 'dd', 'mkfs', 'format'].includes(baseCommand)) {
      riskCategory = 'destructive';
    } else if (['curl', 'wget', 'nc', 'netcat'].includes(baseCommand)) {
      riskCategory = 'network';
    } else if (['sudo', 'su', 'doas', 'chmod', 'chown', 'shutdown', 'reboot', 'iptables'].includes(baseCommand)) {
      riskCategory = 'destructive';
    }
    
    return {
      requiresAsk: true,
      riskCategory,
      risk: 'high',
      reason: `contains dangerous command "${baseCommand}"`,
      hasOperators,
      workspaceBound,
      resolvedPaths,
      baseCommand,
      flags,
    };
  }
  
  // Check for filesystem commands
  const isFilesystem = SHELL_FILESYSTEM_COMMANDS.some(fs => lowerCmd.startsWith(fs));
  
  if (isFilesystem) {
    return {
      requiresAsk: true,
      riskCategory: 'workspace-modification',
      risk: workspaceBound ? 'medium' : 'high',
      reason: `contains filesystem command "${baseCommand}"`,
      hasOperators,
      workspaceBound,
      resolvedPaths,
      baseCommand,
      flags,
    };
  }
  
  // Check for operators (medium risk)
  if (hasOperators) {
    return {
      requiresAsk: true,
      riskCategory: 'side-effect',
      risk: 'medium',
      reason: 'contains shell operators (|, >, &&, etc.)',
      hasOperators,
      workspaceBound,
      resolvedPaths,
      baseCommand,
      flags,
    };
  }
  
  // Check for outside workspace paths (without dangerous commands)
  if (!workspaceBound) {
    return {
      requiresAsk: true,
      riskCategory: 'outside-workspace',
      risk: 'medium',
      reason: 'references paths outside the workspace',
      hasOperators: false,
      workspaceBound,
      resolvedPaths,
      baseCommand,
      flags,
    };
  }
  
  // Safe command - no ask needed
  return {
    requiresAsk: false,
    riskCategory: 'side-effect',
    risk: 'low',
    reason: '',
    hasOperators: false,
    workspaceBound: true,
    resolvedPaths: [],
    baseCommand,
    flags,
  };
}

// =============================================================================
// Execute
// =============================================================================

export async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  try {
    // Analyze risk (includes parsed command info)
    const risk = analyzeRisk(input.command, ctx);
    
    // Check for outside workspace CWD (separate from command path checking)
    const resolvedCwd = input.cwd ? ctx.resolvePath(input.cwd) : ctx.workspacePath;
    const outsideWorkspaceCwd = input.cwd && !ctx.isWithinWorkspace(resolvedCwd);
    
    // Handle permission asks with structured requests
    if (risk.requiresAsk) {
      let permAsk;
      
      // Use structured helpers based on risk category
      if (outsideWorkspaceCwd) {
        // CWD is outside workspace - use outside workspace ask
        permAsk = createOutsideWorkspaceAsk({
          command: input.command,
          cwd: resolvedCwd,
          resolvedPaths: risk.resolvedPaths,
          hasOperators: risk.hasOperators,
        });
      } else if (risk.riskCategory === 'outside-workspace') {
        // Command references outside paths - use structured ask
        permAsk = createShellPermissionAskStructured({
          command: input.command,
          baseCommand: risk.baseCommand,
          flags: risk.flags,
          risk: risk.risk,
          riskCategory: risk.riskCategory,
          reason: risk.reason,
          resolvedPaths: risk.resolvedPaths,
          workspaceBound: risk.workspaceBound,
          hasOperators: risk.hasOperators,
        });
      } else if (risk.riskCategory === 'workspace-modification') {
        // Workspace filesystem modification
        permAsk = createWorkspaceModificationAsk({
          command: input.command,
          baseCommand: risk.baseCommand,
          resolvedPaths: risk.resolvedPaths,
          hasOperators: risk.hasOperators,
        });
      } else {
        // Dangerous/side-effect commands - use full structured ask
        permAsk = createShellPermissionAskStructured({
          command: input.command,
          baseCommand: risk.baseCommand,
          flags: risk.flags,
          risk: risk.risk,
          riskCategory: risk.riskCategory,
          reason: risk.reason,
          resolvedPaths: risk.resolvedPaths,
          workspaceBound: risk.workspaceBound,
          hasOperators: risk.hasOperators,
        });
      }
      
      const approved = await ctx.ask(permAsk);
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
