// =============================================================================
// Canonical Permission Contract
// 
// Design principles:
// 1. Tool-authored, platform-rendered: Tools define structured PermissionAsk
//    objects; client renders generically via the same UI
// 2. Shell is first-class: Explicit shell-command permission category with
//    pattern matching (command names like rm, sudo, curl)
// 3. Explicit grant semantics: Replace vague "alwaysAllow" with specific
//    grant scopes (once/session/workspace/always) + duration
// 4. ask.* is the only interactive channel: No side-channel grants
// 5. Persisted grants human-readable: Structured metadata for UI review
// =============================================================================

// =============================================================================
// Risk Level (unchanged)
// =============================================================================

export type PermissionRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

// Alias for backward compatibility
export type PermissionRisk = PermissionRiskLevel;

// =============================================================================
// Grant Scope (NEW - replaces PermissionScope)
// 
// This is the canonical "how long does this grant last" concept.
// - once: One-time use, NOT persisted to database
// - session: Until the session ends (may have duration-based expiration)
// - workspace: For all sessions in this workspace
// - always: Forever until explicitly revoked
// =============================================================================

export type GrantScope = 'once' | 'session' | 'workspace' | 'always';

// Backward compatibility alias
export type PermissionScope = GrantScope;

// =============================================================================
// Grant Matcher (for pattern matching grants)
// =============================================================================

export type GrantMatcher = 'exact' | 'prefix' | 'glob' | 'shell-command';

// Backward compatibility alias
export type PermissionMatcher = GrantMatcher;

// =============================================================================
// Permission Resource Type (canonical categories)
// 
// These are the first-class permission resource types that tools request.
// The shell-command type is new and handles the shell tool's special case.
// =============================================================================

export type PermissionResource =
  | 'file'
  | 'path'
  | 'directory'
  | 'shell-command'
  | 'network'
  | 'env'
  | 'clipboard'
  | string;

// Legacy compatibility alias
export type PermissionType = PermissionResource;

// =============================================================================
// Permission Decision (user's response)
// =============================================================================

export type PermissionDecision = 'granted' | 'denied' | 'timeout' | 'skipped';

// =============================================================================
// Permission Scope Definition (tool-authored scope for UI rendering)
// =============================================================================

export interface PermissionScopeDefinition {
  type: 'file' | 'path' | 'shell-command' | 'resource' | 'custom';
  value?: string;
  label?: string;
}

// =============================================================================
// Permission Ask (tool-authored, client-rendered)
// =============================================================================

export interface PermissionAsk {
  type: 'permission';
  question: string;
  description?: string;
  risk?: PermissionRiskLevel;
  resource?: PermissionResource;
  scope?: PermissionScopeDefinition | PermissionScopeDefinition[];
  duration?: GrantScope;
  patterns?: string[];
  paths?: string[];
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Permission Ask Response (user's decision)
// =============================================================================

export interface AskPermissionResponse {
  type: 'permission';
  grant: GrantScope | 'deny';
  scope?: string;
  duration?: number;
}

// =============================================================================
// Persisted Permission Grant (storage format)
// =============================================================================

export interface PermissionGrant {
  id: string;
  workspaceId: string;
  toolName: string;
  resource: PermissionResource;
  scope: GrantScope;
  matcher: GrantMatcher;
  patterns: string[];
  allowed: boolean;
  grantedAt: string;
  expiresAt: string | null;
  grantedBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  metadata: Record<string, unknown> | null;
}

// =============================================================================
// Grant Creation Options (from tool's ask)
// =============================================================================

export interface PermissionGrantOptions {
  scope?: GrantScope;
  matcher?: GrantMatcher;
  patterns?: string[];
  duration?: number;
  description?: string;
}

// =============================================================================
// Legacy Types
// =============================================================================

export interface ToolPermission {
  id: string;
  workspaceId: string;
  toolName: string;
  permissionType: string;
  permissionKey: string;
  allowed: boolean;
  grantedAt: string;
  grantedBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  metadata: Record<string, unknown> | null;
}

export type PermissionAction = string;
export type PermissionResourceLegacy = string;
export type PermissionDuration = 'request' | 'session' | 'workspace' | 'always';
export type PersistedPermissionGrant = PermissionGrant;

// =============================================================================
// Security Check (tool use)
// =============================================================================

export interface SecurityCheckInput {
  args: Record<string, unknown>;
  workspacePath: string;
  sessionId: string;
  allowedPaths?: string[];
}

export interface SecurityCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  permissionType: string;
  permissionKey: string;
  message: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Shell-Specific Permission Helpers
// =============================================================================

export const SHELL_DANGEROUS_COMMANDS = [
  'rm', 'rmdir', 'del', 'erase',
  'sudo', 'su', 'doas',
  'chmod', 'chown',
  'dd', 'mkfs', 'format',
  'shutdown', 'reboot', 'halt',
  'iptables', 'ufw', 'firewall-cmd',
  'curl', 'wget', 'nc', 'netcat',
  'eval', 'exec',
] as const;

export const SHELL_FILESYSTEM_COMMANDS = [
  'mv', 'cp', 'mkdir', 'touch', 'ln',
  'git push', 'git reset --hard',
] as const;

export const SHELL_SHELL_OPERATORS = ['&&', '||', '|', '>', '>>', '`', '$(', ';'] as const;

export interface ParsedShellSegment {
  raw: string;
  baseCommand: string;
  args: string[];
  flags: string[];
}

export function splitShellCommandSegments(command: string): ParsedShellSegment[] {
  const normalized = command
    .replace(/&&|\|\||;|\||>>|>|`|\$\(/g, '\n')
    .split('\n')
    .map(part => part.trim())
    .filter(Boolean);

  return normalized.map((segment) => {
    const parts = segment.split(/\s+/);
    const baseCommand = parts[0]?.replace(/.*\//, '') || '';
    const args = parts.slice(1);
    const flags = args.filter(arg => arg.startsWith('-'));
    return {
      raw: segment,
      baseCommand,
      args,
      flags,
    };
  });
}

function normalizeShellCommandIdentity(segment: ParsedShellSegment): string {
  const base = segment.baseCommand;
  const firstNonFlagArg = segment.args.find(arg => !arg.startsWith('-'));

  if (!base) {
    return segment.raw;
  }

  if (base === 'git' && firstNonFlagArg) {
    return `git ${firstNonFlagArg}`;
  }

  if (['npm', 'pnpm', 'yarn', 'bun', 'cargo'].includes(base) && firstNonFlagArg) {
    return `${base} ${firstNonFlagArg}`;
  }

  return base;
}

function getShellCommandDangerPriority(identity: string): number {
  const lower = identity.toLowerCase();

  if (lower === 'shutdown' || lower === 'reboot' || lower === 'halt') return 5;
  if (lower === 'sudo' || lower === 'su' || lower === 'doas' || lower === 'chmod' || lower === 'chown') return 4;
  if (lower === 'rm' || lower.startsWith('rm ') || lower === 'rmdir' || lower === 'del' || lower === 'erase' || lower === 'dd' || lower === 'mkfs' || lower === 'format') return 3;
  if (lower === 'mv' || lower === 'cp' || lower === 'mkdir' || lower === 'touch' || lower === 'ln' || lower === 'git push' || lower === 'git reset') return 2;
  if (lower === 'curl' || lower === 'wget' || lower === 'nc' || lower === 'netcat' || lower === 'iptables' || lower === 'ufw' || lower === 'firewall-cmd' || lower === 'eval' || lower === 'exec') return 1;
  return 0;
}

export function getEffectiveShellCommandIdentity(command: string): string {
  const segments = splitShellCommandSegments(command);
  if (segments.length === 0) {
    return '';
  }

  let selectedIdentity = normalizeShellCommandIdentity(segments[0]);
  let selectedPriority = getShellCommandDangerPriority(selectedIdentity);

  for (const segment of segments.slice(1)) {
    const identity = normalizeShellCommandIdentity(segment);
    const priority = getShellCommandDangerPriority(identity);
    if (priority > selectedPriority) {
      selectedIdentity = identity;
      selectedPriority = priority;
    }
  }

  return selectedIdentity;
}

function isDangerousShellIdentity(identity: string): boolean {
  return getShellCommandDangerPriority(identity) > 0;
}

export const SENSITIVE_FILE_PATTERNS = [
  '.env', '.pem', '.key', '.ssh/', 'id_rsa', 'id_ed25519',
  '.gitconfig', '.npmrc', 'credentials', 'secrets', 'password',
  '.htpasswd',
] as const;

// =============================================================================
// Canonical Shell Permission Helpers
// =============================================================================

export type ShellRiskCategory = 'destructive' | 'side-effect' | 'workspace-modification' | 'network' | 'outside-workspace';

export function createShellPermissionAskStructured(params: {
  command: string;
  baseCommand: string;
  flags: string[];
  risk: PermissionRiskLevel;
  riskCategory: ShellRiskCategory;
  reason: string;
  resolvedPaths?: string[];
  workspaceBound: boolean;
  hasOperators: boolean;
}): PermissionAsk {
  const commandIdentity = getEffectiveShellCommandIdentity(params.command);
  const patterns: string[] = [];

  if (commandIdentity) {
    patterns.push(commandIdentity);
  }

  if (commandIdentity === 'rm' && (params.flags.includes('-rf') || params.flags.includes('-r'))) {
    patterns.push('rm:-rf');
    patterns.push('rm:-r');
  }

  if (params.resolvedPaths && params.resolvedPaths.length > 0) {
    for (const p of params.resolvedPaths) {
      patterns.push(`path:${p}`);
    }
  }

  const scope: PermissionScopeDefinition = {
    type: 'shell-command',
    value: commandIdentity,
    label: formatCommandLabel(commandIdentity || params.baseCommand, params.flags),
  };

  let duration: 'once' | 'session' | 'workspace' = 'workspace';
  if (params.riskCategory === 'destructive' || params.riskCategory === 'network' || isDangerousShellIdentity(commandIdentity)) {
    duration = 'session';
  }

  let question = `Run command "${truncateCommand(params.command)}"`;
  if (params.workspaceBound) {
    question += ` (within workspace)`;
  } else {
    question += ` (references paths outside workspace)`;
  }
  question += `: ${params.reason}. Requires approval.`;

  return {
    type: 'permission',
    question,
    risk: params.risk,
    resource: 'shell-command',
    scope,
    patterns,
    duration,
    metadata: {
      command: params.command,
      baseCommand: commandIdentity,
      flags: params.flags,
      riskCategory: params.riskCategory,
      reason: params.reason,
      resolvedPaths: params.resolvedPaths,
      workspaceBound: params.workspaceBound,
      hasOperators: params.hasOperators,
      description: buildDescription({
        baseCommand: commandIdentity,
        flags: params.flags,
        riskCategory: params.riskCategory,
        workspaceBound: params.workspaceBound,
        hasOperators: params.hasOperators,
      }),
    },
  };
}

export function createOutsideWorkspaceAsk(params: {
  command: string;
  cwd: string;
  resolvedPaths: string[];
  hasOperators?: boolean;
}): PermissionAsk {
  const commandIdentity = getEffectiveShellCommandIdentity(params.command);
  const scope: PermissionScopeDefinition = {
    type: 'path',
    value: params.cwd,
    label: params.cwd.split('/').pop() || params.cwd,
  };

  return {
    type: 'permission',
    question: `Command "${truncateCommand(params.command)}" runs in directory outside workspace (${params.cwd}). Requires approval.`,
    risk: 'medium',
    resource: 'shell-command',
    scope,
    patterns: [commandIdentity || `cwd:${params.cwd}`],
    duration: 'session',
    metadata: {
      command: params.command,
      baseCommand: commandIdentity,
      cwd: params.cwd,
      resolvedPaths: params.resolvedPaths,
      riskCategory: 'outside-workspace',
      description: `External directory access: ${params.cwd}`,
      hasOperators: params.hasOperators ?? false,
    },
  };
}

export function createWorkspaceModificationAsk(params: {
  command: string;
  baseCommand: string;
  resolvedPaths: string[];
  hasOperators?: boolean;
}): PermissionAsk {
  const commandIdentity = getEffectiveShellCommandIdentity(params.command);
  const scope: PermissionScopeDefinition = {
    type: 'shell-command',
    value: commandIdentity,
    label: `${commandIdentity || params.baseCommand} (workspace)`,
  };

  return {
    type: 'permission',
    question: `Run filesystem command "${truncateCommand(params.command)}" within workspace. Requires approval.`,
    risk: 'medium',
    resource: 'shell-command',
    scope,
    patterns: [commandIdentity || params.baseCommand],
    duration: 'session',
    metadata: {
      command: params.command,
      baseCommand: commandIdentity || params.baseCommand,
      resolvedPaths: params.resolvedPaths,
      riskCategory: 'workspace-modification',
      description: `Workspace filesystem: ${commandIdentity || params.baseCommand}`,
      hasOperators: params.hasOperators ?? false,
    },
  };
}

function truncateCommand(cmd: string, maxLen = 80): string {
  return cmd.length > maxLen ? cmd.slice(0, maxLen) + '...' : cmd;
}

function formatCommandLabel(baseCommand: string, flags: string[]): string {
  if (!baseCommand) {
    return '';
  }
  if (flags.length === 0) {
    return baseCommand;
  }
  const commonFlags = flags.slice(0, 3).join(' ');
  return commonFlags ? `${baseCommand} ${commonFlags}` : baseCommand;
}

function buildDescription(params: {
  baseCommand: string;
  flags: string[];
  riskCategory: ShellRiskCategory;
  workspaceBound: boolean;
  hasOperators: boolean;
}): string {
  const parts: string[] = [];

  switch (params.riskCategory) {
    case 'destructive':
      parts.push('Destructive operation');
      break;
    case 'network':
      parts.push('Network access');
      break;
    case 'side-effect':
      parts.push('Side-effect command');
      break;
    case 'workspace-modification':
      parts.push('Workspace modification');
      break;
    case 'outside-workspace':
      parts.push('Outside workspace');
      break;
  }

  if (!params.workspaceBound) {
    parts.push('References external paths');
  }

  if (params.hasOperators) {
    parts.push('Contains shell operators');
  }

  return parts.join(' • ');
}

export function createFilePermissionAsk(params: {
  path: string;
  operation: 'read' | 'write' | 'edit';
  risk: PermissionRiskLevel;
  reason?: string;
  isOutsideWorkspace?: boolean;
  isSensitiveFile?: boolean;
}): PermissionAsk {
  const operationLabel = params.operation === 'read' ? 'Reading' : params.operation === 'write' ? 'Writing' : 'Editing';
  const fileName = params.path.split('/').pop() || params.path;

  let question = `${operationLabel} file "${fileName}"`;

  if (params.isSensitiveFile) {
    question += ' (sensitive file)';
  } else if (params.isOutsideWorkspace) {
    question += ' (outside workspace)';
  }

  question += ' requires approval.';

  if (params.reason) {
    question += ` ${params.reason}`;
  }

  const patterns: string[] = [];
  patterns.push(`file:${params.path}`);
  patterns.push(`file:${fileName}`);

  if (params.isOutsideWorkspace) {
    patterns.push('outside-workspace');
  }

  if (params.isSensitiveFile) {
    patterns.push('sensitive-file');
  }

  let duration: GrantScope = 'workspace';
  if (params.isSensitiveFile || params.risk === 'high' || params.risk === 'critical') {
    duration = 'session';
  }

  return {
    type: 'permission',
    question,
    risk: params.risk,
    resource: 'file',
    paths: [params.path],
    patterns,
    duration,
    metadata: {
      operation: params.operation,
      path: params.path,
      fileName,
      isOutsideWorkspace: params.isOutsideWorkspace ?? false,
      isSensitiveFile: params.isSensitiveFile ?? false,
      reason: params.reason,
    },
  };
}

export function createWebfetchPermissionAsk(params: {
  url: string;
  host: string;
  risk: PermissionRiskLevel;
  reason?: string;
  isHttp?: boolean;
}): PermissionAsk {
  let question = `Fetch URL "${params.host}"`;

  if (params.isHttp) {
    question += ' (unencrypted HTTP)';
  }

  question += ' requires approval.';

  if (params.reason) {
    question += ` ${params.reason}`;
  }

  const patterns: string[] = [params.host, params.url];

  let duration: GrantScope = 'workspace';
  if (params.isHttp || params.risk === 'high' || params.risk === 'critical') {
    duration = 'session';
  }

  return {
    type: 'permission',
    question,
    risk: params.risk,
    resource: 'network',
    scope: {
      type: 'resource',
      value: params.url,
      label: params.host,
    },
    patterns,
    duration,
    metadata: {
      url: params.url,
      host: params.host,
      isHttp: params.isHttp ?? false,
      reason: params.reason,
    },
  };
}
