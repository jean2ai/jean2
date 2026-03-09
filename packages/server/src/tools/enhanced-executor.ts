import type {
  SecurityCheckInput,
  SecurityCheckResult,
  ToolExecutionContext,
} from '@jean2/shared';
import type { DiscoveredTool, ToolResult } from './types';
import { executeTool } from './executor';
import { runSecurityCheck, hasSecurityCheck } from './security-executor';
import { checkCachedPermission, grantPermission } from '@/store';

export interface PermissionRequestCallback {
  (
    toolName: string,
    args: Record<string, unknown>,
    securityResult: SecurityCheckResult
  ): Promise<{ allowed: boolean; alwaysAllow: boolean }>;
}

export interface EnhancedExecuteOptions {
  tool: DiscoveredTool;
  args: Record<string, unknown>;
  context: ToolExecutionContext;
  timeout?: number;
  onPermissionRequest?: PermissionRequestCallback;
}

export type ExecutionDecision =
  | { type: 'execute' }
  | { type: 'blocked'; reason: string }
  | { type: 'requires_approval'; securityResult: SecurityCheckResult };

export interface EnhancedExecuteResult extends ToolResult {
  permissionGranted?: boolean;
  permissionCached?: boolean;
}

/**
 * Execute a tool with security checks and permission management.
 *
 * Flow:
 * 1. If tool has security check, run it
 * 2. If security check blocks execution, return error
 * 3. If security check requires approval, check cache first
 * 4. If not cached and requires approval, call callback
 * 5. If approved with alwaysAllow, cache the permission
 * 6. Execute the tool
 */
export async function executeToolWithSecurity(
  options: EnhancedExecuteOptions
): Promise<EnhancedExecuteResult> {
  const { tool, args, context, timeout, onPermissionRequest } = options;
  const { definition } = tool;

  // Phase 1: Run security check if configured
  if (hasSecurityCheck(tool)) {
    const securityInput: SecurityCheckInput = {
      args,
      workspacePath: context.workspacePath || '',
      sessionId: context.sessionId,
    };

    const securityOutcome = await runSecurityCheck({
      tool,
      input: securityInput,
      timeout: definition.securityTimeout,
    });

    if (!securityOutcome.success) {
      return {
        success: false,
        error: `Security check failed: ${securityOutcome.error}`,
      };
    }

    const securityResult = securityOutcome.result!;

    // Phase 2: Check if blocked
    if (!securityResult.allowed && !securityResult.requiresApproval) {
      return {
        success: false,
        error: securityResult.message || 'Operation blocked by security policy',
      };
    }

    // Phase 3: Handle approval requirement
    if (securityResult.requiresApproval) {
      // Check cache first
      if (context.workspaceId) {
        const cached = checkCachedPermission(
          context.workspaceId,
          definition.name,
          securityResult.permissionType,
          securityResult.permissionKey
        );

        if (cached) {
          // Permission already granted - proceed to execution
          return executeTool({
            tool,
            args,
            workspacePath: context.workspacePath,
            sessionId: context.sessionId,
            timeout,
          }).then((result) => ({
            ...result,
            permissionGranted: true,
            permissionCached: true,
          }));
        }
      }

      // Need to request approval
      if (onPermissionRequest) {
        const response = await onPermissionRequest(
          definition.name,
          args,
          securityResult
        );

        if (!response.allowed) {
          return {
            success: false,
            error: 'USER_REJECTION',
            permissionGranted: false,
          };
        }

        // Cache permission if requested
        if (response.alwaysAllow && context.workspaceId) {
          grantPermission({
            workspaceId: context.workspaceId,
            toolName: definition.name,
            permissionType: securityResult.permissionType,
            permissionKey: securityResult.permissionKey,
            allowed: true,
            grantedBy: context.sessionId,
            metadata: { message: securityResult.message },
          });
        }
      } else {
        // No callback provided - deny by default for safety
        return {
          success: false,
          error: `Tool requires approval but no permission callback was configured: ${securityResult.message}`,
          permissionGranted: false,
        };
      }
    }
  }

  // Phase 4: Execute the tool
  const result = await executeTool({
    tool,
    args,
    workspacePath: context.workspacePath,
    sessionId: context.sessionId,
    timeout,
  });

  return {
    ...result,
    permissionGranted: true,
  };
}

/**
 * Determine execution decision without actually executing.
 * Useful for pre-flight checks.
 */
export async function getExecutionDecision(
  tool: DiscoveredTool,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ExecutionDecision> {
  const { definition } = tool;

  if (!hasSecurityCheck(tool)) {
    return { type: 'execute' };
  }

  const securityInput: SecurityCheckInput = {
    args,
    workspacePath: context.workspacePath || '',
    sessionId: context.sessionId,
  };

  const securityOutcome = await runSecurityCheck({
    tool,
    input: securityInput,
    timeout: definition.securityTimeout,
  });

  if (!securityOutcome.success) {
    return {
      type: 'blocked',
      reason: securityOutcome.error || 'Security check failed',
    };
  }

  const securityResult = securityOutcome.result!;

  if (!securityResult.allowed && !securityResult.requiresApproval) {
    return {
      type: 'blocked',
      reason: securityResult.message || 'Blocked by security policy',
    };
  }

  if (securityResult.requiresApproval) {
    // Check cache
    if (context.workspaceId) {
      const cached = checkCachedPermission(
        context.workspaceId,
        definition.name,
        securityResult.permissionType,
        securityResult.permissionKey
      );

      if (cached) {
        return { type: 'execute' };
      }
    }

    return { type: 'requires_approval', securityResult };
  }

  return { type: 'execute' };
}
