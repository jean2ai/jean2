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
  | 'file'           // Read/write/edit files
  | 'path'           // Any path (workspace or external)
  | 'directory'      // Directory listing/creation
  | 'shell-command'   // Shell command execution (NEW - first-class shell)
  | 'network'        // HTTP/network requests
  | 'env'           // Environment variable access
  | 'clipboard'     // Clipboard operations
  | string;          // Allow custom types

// Legacy compatibility alias
export type PermissionType = PermissionResource;

// =============================================================================
// Permission Decision (user's response)
// =============================================================================

export type PermissionDecision = 'granted' | 'denied' | 'timeout' | 'skipped';

// =============================================================================
// Permission Scope Definition (tool-authored scope for UI rendering)
// 
// Tools use this to describe WHAT the permission applies to, so the UI can
// render it generically. This is NOT the same as GrantScope.
// 
// Examples:
// - Shell tool: { type: 'shell-command', value: 'rm', label: 'Remove files' }
// - File tool: { type: 'file', value: '~/secrets/.env', label: 'Sensitive file' }
// - WebFetch: { type: 'url', value: 'https://example.com', label: 'External URL' }
// =============================================================================

export interface PermissionScopeDefinition {
  type: 'file' | 'path' | 'shell-command' | 'resource' | 'custom';
  value?: string;
  label?: string;
}

// =============================================================================
// Permission Ask (tool-authored, client-rendered)
// 
// This is the canonical structure tools use to request permission. The client
// renders this generically - no tool-specific UI needed.
// 
// For shell commands, use 'shell-command' resource type with patterns for
// command name matching (e.g., { type: 'shell-command', value: 'rm', label: 'Remove files' })
// =============================================================================

export interface PermissionAsk {
  type: 'permission';
  
  // The question to ask the user (tool-authored, human-readable)
  question: string;
  
  // Optional description for context
  description?: string;
  
  // Risk level for auto-approval (low-risk can be auto-approved by client)
  risk?: PermissionRiskLevel;
  
  // Resource type being accessed (canonical)
  // Optional - can be inferred from scope.type for common cases
  // Required for shell-command and network resources
  resource?: PermissionResource;
  
  // Optional: structured scope for generic rendering
  // Shell tool: { type: 'shell-command', value: 'rm', label: 'Remove files' }
  // File tool: { type: 'file', value: '/path/to/file', label: 'Sensitive file' }
  scope?: PermissionScopeDefinition | PermissionScopeDefinition[];
  
  // Optional: default duration preference from tool
  duration?: GrantScope;
  
  // Optional: command patterns for shell (e.g., ['rm', 'sudo'])
  // Use shell-command resource type + patterns for command matching
  patterns?: string[];
  
  // Optional: paths for file operations
  paths?: string[];
  
  // Optional: arbitrary metadata for backward compatibility
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Permission Ask Response (user's decision)
// 
// The user chooses:
// - grant: The grant scope (once/session/workspace/always)
// - scope: Optional specific scope for pattern matching (default: exact match)
// - duration: Optional duration in ms (only for session scope grants)
// =============================================================================

export interface AskPermissionResponse {
  type: 'permission';
  
  // The grant scope chosen by user (deny = reject the request)
  grant: GrantScope | 'deny';
  
  // Optional: The specific scope/pattern to grant (for glob/shell-command matchers)
  // Example: 'rm*' to match all rm variants, or '~/projects/*' for file glob
  scope?: string;
  
  // Optional: Duration in ms for session-scoped grants
  // Only applies when grant === 'session'
  duration?: number;
}

// =============================================================================
// Persisted Permission Grant (storage format)
// 
// Human-reviewable structure for the permissions UI.
// Shows: who granted, when, what scope, what patterns.
// =============================================================================

export interface PermissionGrant {
  id: string;
  workspaceId: string;
  
  // Tool that requested this permission
  toolName: string;
  
  // Resource type (file, path, shell-command, network, etc.)
  resource: PermissionResource;
  
  // Grant scope (once/session/workspace/always)
  scope: GrantScope;
  
  // Matcher for pattern matching
  matcher: GrantMatcher;
  
  // The pattern(s) this grant applies to
  // For shell-command: ['rm', 'sudo'] or ['curl:*']
  // For file: ['/path/to/file'] or ['~/secrets/*']
  patterns: string[];
  
  // Whether this grant allows or denies
  allowed: boolean;
  
  // When this grant was created
  grantedAt: string;
  
  // When this grant expires (null for workspace/always)
  // For session scope: computed from duration
  expiresAt: string | null;
  
  // Who granted this (null for auto-grants)
  grantedBy: string | null;
  
  // Revocation tracking
  revokedAt: string | null;
  revokedBy: string | null;
  
  // Human-readable metadata for review UI
  // Example: { description: 'Remove files command', command: 'rm -rf' }
  metadata: Record<string, unknown> | null;
}

// =============================================================================
// Grant Creation Options (from tool's ask)
// =============================================================================

export interface PermissionGrantOptions {
  scope?: GrantScope;
  matcher?: GrantMatcher;
  patterns?: string[];
  duration?: number; // ms, for session scope expiration
  description?: string;
}

// =============================================================================
// Legacy Types (kept for migration - will be deprecated)
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

// Legacy exports
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

// Dangerous command categories for shell permission requests
export const SHELL_DANGEROUS_COMMANDS = [
  'rm', 'rmdir', 'del', 'erase',     // Delete
  'sudo', 'su', 'doas',               // Privilege escalation
  'chmod', 'chown',                   // Permissions
  'dd', 'mkfs', 'format',             // Destructive disk
  'shutdown', 'reboot', 'halt',       // System control
  'iptables', 'ufw', 'firewall-cmd',  // Firewall
  'curl', 'wget', 'nc', 'netcat',      // Network download
  'eval', 'exec',                     // Code execution
] as const;

export const SHELL_FILESYSTEM_COMMANDS = [
  'mv', 'cp', 'mkdir', 'touch', 'ln',
  'git push', 'git reset --hard',
] as const;

export const SHELL_SHELL_OPERATORS = ['&&', '||', '|', '>', '>>', '`', '$(', ';'] as const;

// Sensitive file patterns
export const SENSITIVE_FILE_PATTERNS = [
  '.env', '.pem', '.key', '.ssh/', 'id_rsa', 'id_ed25519',
  '.gitconfig', '.npmrc', 'credentials', 'secrets', 'password',
  '.htpasswd',
] as const;

// =============================================================================
// Canonical Shell Permission Helpers
// 
// These helpers create structured permission asks that:
// 1. Use canonical PermissionAsk format with scope definitions
// 2. Include rich metadata for grant review UI
// 3. Provide patterns for matcher-based grant matching
// 4. Distinguish between risk categories (destructive vs side-effect)
// =============================================================================

// Shell risk categories for determining persistability
export type ShellRiskCategory = 'destructive' | 'side-effect' | 'workspace-modification' | 'network' | 'outside-workspace';

/**
 * Creates a structured shell permission ask for dangerous commands.
 * Uses canonical format with explicit scope and patterns for grant matching.
 */
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
  // Build patterns for matching grants
  const patterns: string[] = [];
  
  // Primary pattern: the base command
  if (params.baseCommand) {
    patterns.push(params.baseCommand);
  }
  
  // For destructive commands like rm -rf, add specific patterns
  if (params.baseCommand === 'rm' && (params.flags.includes('-rf') || params.flags.includes('-r'))) {
    patterns.push('rm:-rf');
    patterns.push('rm:-r');
  }
  
  // Add path patterns if outside workspace
  if (params.resolvedPaths && params.resolvedPaths.length > 0) {
    for (const p of params.resolvedPaths) {
      patterns.push(`path:${p}`);
    }
  }
  
  // Build the scope definition for UI rendering
  const scope: PermissionScopeDefinition = {
    type: 'shell-command',
    value: params.baseCommand,
    label: formatCommandLabel(params.baseCommand, params.flags),
  };
  
  // Determine default duration preference based on risk category
  // Destructive commands should not persist, side-effects can
  let duration: 'once' | 'session' | 'workspace' = 'workspace';
  if (params.riskCategory === 'destructive' || params.riskCategory === 'network') {
    duration = 'session'; // Don't persist forever for dangerous commands
  }
  
  // Build rich question that makes clear what's being approved
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
      baseCommand: params.baseCommand,
      flags: params.flags,
      riskCategory: params.riskCategory,
      reason: params.reason,
      resolvedPaths: params.resolvedPaths,
      workspaceBound: params.workspaceBound,
      hasOperators: params.hasOperators,
      description: buildDescription(params),
    },
  };
}

/**
 * Creates a structured permission ask for commands outside workspace.
 * Uses canonical format with path scope.
 */
export function createOutsideWorkspaceAsk(params: {
  command: string;
  cwd: string;
  resolvedPaths: string[];
  hasOperators?: boolean;
}): PermissionAsk {
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
    patterns: [`cwd:${params.cwd}`],
    duration: 'session', // Don't persist - outside workspace commands should be re-confirmed
    metadata: {
      command: params.command,
      cwd: params.cwd,
      resolvedPaths: params.resolvedPaths,
      riskCategory: 'outside-workspace',
      description: `External directory access: ${params.cwd}`,
      hasOperators: params.hasOperators ?? false,
    },
  };
}

/**
 * Creates a structured permission ask for filesystem-modifying commands within workspace.
 * Distinguishes from destructive commands.
 */
export function createWorkspaceModificationAsk(params: {
  command: string;
  baseCommand: string;
  resolvedPaths: string[];
  hasOperators?: boolean;
}): PermissionAsk {
  const scope: PermissionScopeDefinition = {
    type: 'shell-command',
    value: params.baseCommand,
    label: `${params.baseCommand} (workspace)`,
  };
  
  return {
    type: 'permission',
    question: `Run filesystem command "${truncateCommand(params.command)}" within workspace. Requires approval.`,
    risk: 'medium',
    resource: 'shell-command',
    scope,
    patterns: [params.baseCommand],
    duration: 'session', // Can be session-persisted but not forever
    metadata: {
      command: params.command,
      baseCommand: params.baseCommand,
      resolvedPaths: params.resolvedPaths,
      riskCategory: 'workspace-modification',
      description: `Workspace filesystem: ${params.baseCommand}`,
      hasOperators: params.hasOperators ?? false,
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function truncateCommand(cmd: string, maxLen = 80): string {
  return cmd.length > maxLen ? cmd.slice(0, maxLen) + '...' : cmd;
}

function formatCommandLabel(baseCommand: string, flags: string[]): string {
  if (flags.length === 0) {
    return baseCommand;
  }
  // Show common flags in label
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

// Helper to create a file permission ask with structured patterns and clear justification
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
  
  // Build rich question with explicit context
  let question = `${operationLabel} file "${fileName}"`;
  
  if (params.isSensitiveFile) {
    question += ' (sensitive file)';
  } else if (params.isOutsideWorkspace) {
    question += ' (outside workspace)';
  }
  
  question += ' requires approval.';
  
  // Add reason if provided
  if (params.reason) {
    question += ` ${params.reason}`;
  }
  
  // Build patterns for grant matching (like shell tool does)
  const patterns: string[] = [];
  patterns.push(`file:${params.path}`);
  patterns.push(`file:${fileName}`);
  
  if (params.isOutsideWorkspace) {
    patterns.push('outside-workspace');
  }
  
  if (params.isSensitiveFile) {
    patterns.push('sensitive-file');
  }
  
  // Determine default duration based on risk
  let duration: GrantScope = 'workspace';
  if (params.isSensitiveFile || params.risk === 'high' || params.risk === 'critical') {
    duration = 'session'; // Don't persist forever for sensitive files
  }
  
  return {
    type: 'permission',
    question,
    risk: params.risk,
    resource: 'file',
    paths: [params.path],
    scope: {
      type: 'file',
      value: params.path,
      label: fileName,
    },
    patterns,
    duration,
    metadata: {
      operation: params.operation,
      fileName,
      isOutsideWorkspace: params.isOutsideWorkspace ?? false,
      isSensitiveFile: params.isSensitiveFile ?? false,
      description: [
        params.isOutsideWorkspace ? 'External file access' : 'Workspace file access',
        params.isSensitiveFile ? 'Sensitive file pattern detected' : null,
        params.reason ? params.reason : null,
      ].filter(Boolean).join(' • '),
    },
  };
}

// =============================================================================
// WebFetch Permission Helper
// 
// Creates a structured permission ask for network/URL fetch operations.
// Follows the canonical pattern used by shell and file tools.
// =============================================================================

/**
 * Creates a structured permission ask for web fetch operations.
 * Uses canonical format with explicit URL/host context for clear user understanding.
 */
export function createWebfetchPermissionAsk(params: {
  url: string;
  hostname: string;
  protocol: string;
  risk?: PermissionRiskLevel;
}): PermissionAsk {
  const isHttp = params.protocol === 'http:';
  const truncatedUrl = params.url.length > 80 ? params.url.slice(0, 77) + '...' : params.url;
  
  // Build explicit question with URL and host info
  let question = `Fetching URL "${truncatedUrl}" from host "${params.hostname}"`;
  
  if (isHttp) {
    question += ' (unencrypted connection)';
  }
  
  question += '. Requires approval.';
  
  // Determine risk level based on protocol
  const risk = params.risk ?? (isHttp ? 'medium' : 'low');
  
  // Build patterns for grant matching
  const patterns: string[] = [];
  patterns.push(`url:${params.url}`);
  patterns.push(`host:${params.hostname}`);
  
  if (isHttp) {
    patterns.push('http-protocol');
  }
  
  // HTTP should be session-scoped, HTTPS can be workspace-scoped
  const duration: GrantScope = isHttp ? 'session' : 'workspace';
  
  return {
    type: 'permission',
    question,
    risk,
    resource: 'network',
    scope: {
      type: 'resource',
      value: params.url,
      label: params.hostname,
    },
    patterns,
    duration,
    metadata: {
      url: params.url,
      hostname: params.hostname,
      protocol: params.protocol,
      isHttp,
      description: isHttp 
        ? `HTTP fetch from ${params.hostname} (unencrypted)` 
        : `HTTPS fetch from ${params.hostname}`,
    },
  };
}
