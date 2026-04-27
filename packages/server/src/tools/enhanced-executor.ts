import type {
  SecurityCheckResult,
  ToolExecutionContext,
  LoadedTool,
  ToolResult,
  LlmApi,
  AskUserApi,
} from '@jean2/sdk';
import { executeTool } from './executor';
import { runSecurityCheck, hasSecurityCheck } from './security-executor';
import { checkCachedPermission, grantPermission } from '@/store';

export interface PermissionRequestCallback {
  (
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    securityResult: SecurityCheckResult
  ): Promise<{ allowed: boolean; alwaysAllow: boolean }>;
}

export interface EnhancedExecuteOptions {
  tool: LoadedTool;
  args: Record<string, unknown>;
  context: ToolExecutionContext;
  toolCallId: string;
  timeout?: number;
  onPermissionRequest?: PermissionRequestCallback;
  abortSignal?: AbortSignal;
  createLlmApi?: () => LlmApi;
  createAskUserApi?: (toolCallId: string) => AskUserApi;
}

export type ExecutionDecision =
  | { type: 'execute' }
  | { type: 'blocked'; reason: string }
  | { type: 'requires_approval'; securityResult: SecurityCheckResult };

export interface EnhancedExecuteResult extends ToolResult {
  permissionGranted?: boolean;
  permissionCached?: boolean;
}

export async function executeToolWithSecurity(
  options: EnhancedExecuteOptions
): Promise<EnhancedExecuteResult> {
  const { tool, args, context, toolCallId, timeout, onPermissionRequest, abortSignal } = options;
  const { definition } = tool;

  if (hasSecurityCheck(tool)) {
    const securityOutcome = await runSecurityCheck({
      tool,
      input: {
        args,
        workspacePath: context.workspacePath || '',
        sessionId: context.sessionId,
        allowedPaths: context.allowedPaths,
      },
    });

    if (!securityOutcome.success) {
      return {
        success: false,
        error: `Security check failed: ${securityOutcome.error}`,
      };
    }

    const securityResult = securityOutcome.result!;

    if (!securityResult.allowed && !securityResult.requiresApproval) {
      return {
        success: false,
        error: securityResult.message || 'Operation blocked by security policy',
      };
    }

    if (securityResult.requiresApproval) {
      if (context.workspaceId) {
        const cached = checkCachedPermission(
          context.workspaceId,
          definition.name,
          securityResult.permissionType,
          securityResult.permissionKey
        );

        if (cached) {
          return executeTool({
            tool,
            args,
            workspacePath: context.workspacePath,
            sessionId: context.sessionId,
            toolCallId,
            timeout,
            abortSignal,
            createLlmApi: options.createLlmApi,
            createAskUserApi: options.createAskUserApi,
          }).then((result) => ({
            ...result,
            permissionGranted: true,
            permissionCached: true,
          }));
        }
      }

      if (onPermissionRequest) {
        const response = await onPermissionRequest(
          toolCallId,
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
        return {
          success: false,
          error: `Tool requires approval but no permission callback was configured: ${securityResult.message}`,
          permissionGranted: false,
        };
      }
    }
  }

  const result = await executeTool({
    tool,
    args,
    workspacePath: context.workspacePath,
    sessionId: context.sessionId,
    toolCallId,
    timeout,
    abortSignal,
    createLlmApi: options.createLlmApi,
    createAskUserApi: options.createAskUserApi,
  });

  return {
    ...result,
    permissionGranted: true,
  };
}

export async function getExecutionDecision(
  tool: LoadedTool,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ExecutionDecision> {
  const { definition } = tool;

  if (!hasSecurityCheck(tool)) {
    return { type: 'execute' };
  }

  const securityOutcome = await runSecurityCheck({
    tool,
    input: {
      args,
      workspacePath: context.workspacePath || '',
      sessionId: context.sessionId,
      allowedPaths: context.allowedPaths,
    },
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
