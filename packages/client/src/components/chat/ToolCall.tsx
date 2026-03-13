import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Copy, Check, Wrench, Loader2, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import type { ToolPart, AnyVisualization } from '@jean2/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { VisualizationRenderer } from '@/components/visualizations';

interface PendingPermissionRequest {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  permissionType: string;
  permissionKey?: string;
  message: string;
  details?: Record<string, unknown>;
  dangerous?: boolean;
  childSessionId?: string;
  subagentName?: string;
}

interface ToolCallProps {
  part: ToolPart;
  pendingPermissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  onNavigateToSubagent?: (sessionId: string) => void;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'pending':
      return <Clock className="size-3 text-warning" />;
    case 'running':
      return <Loader2 className="size-3 text-warning animate-spin" />;
    case 'completed':
      return <CheckCircle className="size-3 text-success" />;
    case 'error':
      return <XCircle className="size-3 text-destructive" />;
    default:
      return null;
  }
}

function extractVisualization(output: unknown): AnyVisualization | undefined {
  if (output && typeof output === 'object' && '_visualization' in output) {
    return (output as Record<string, unknown>)._visualization as AnyVisualization;
  }
  return undefined;
}

export function ToolCall({
  part,
  pendingPermissions,
  onPermissionResponse,
  onNavigateToSubagent,
}: ToolCallProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const state = part.state;
  const status = state.status;

  // Extract visualization at component level to render outside collapsible
  const visualization = status === 'completed' && 'output' in state
    ? extractVisualization(state.output)
    : undefined;

  const pendingPermission = status === 'pending'
    ? pendingPermissions.find((p) => p.toolCallId === part.callId)
    : undefined;

  let taskSessionId: string | null = null;
  if (part.name === 'task') {
    if ('childSessionId' in state && state.childSessionId) {
      taskSessionId = state.childSessionId as string;
    } else if (status === 'completed' && 'output' in state) {
      const output = typeof state.output === 'string' ? state.output : '';
      const match = output.match(/task_id:\s*([a-f0-9-]{36})/i);
      if (match) {
        taskSessionId = match[1];
      }
    }
  }

  const handleCopyOutput = async () => {
    if ('output' in state) {
      const output = typeof state.output === 'string'
        ? state.output
        : JSON.stringify(state.output, null, 2);
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const truncatedArgs = (() => {
    try {
      const args = JSON.stringify(state.input);
      return args.length > 50 ? args.slice(0, 47) + '...' : args;
    } catch {
      return String(state.input);
    }
  })();

  return (
    <div className="my-1">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div
            className="flex items-center gap-2 py-1 cursor-pointer hover:text-foreground transition-colors text-muted-foreground"
          >
            {isOpen ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}

            <Wrench className="size-3" />
            <span className="text-xs truncate max-w-[120px] sm:max-w-none">{part.name}</span>

            {!isOpen && (
              <span className="text-xs text-muted-foreground font-mono truncate flex-1 min-w-0 sm:max-w-[200px] hidden sm:block">
                {truncatedArgs}
              </span>
            )}

            <div className="ml-auto flex items-center gap-2">
              {getStatusIcon(status)}

              {taskSessionId && onNavigateToSubagent && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 sm:w-auto sm:px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToSubagent(taskSessionId!);
                  }}
                  title="View session"
                >
                  <ExternalLink className="size-3" />
                  <span className="hidden sm:inline ml-1">View</span>
                </Button>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="pl-5 pb-2 flex flex-col gap-2">
            {/* Input */}
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Input</div>
              <pre className="text-xs bg-background border rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words">
                {JSON.stringify(state.input, null, 2)}
              </pre>
            </div>

            {/* Permission Request */}
            {status === 'pending' && pendingPermission && (
              <div className="border border-warning/50 bg-warning/10 rounded-md p-3 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-warning" />
                  <Badge variant="outline" className="text-warning border-warning">
                    {pendingPermission.permissionType}
                  </Badge>
                  <span className="text-sm font-mono text-muted-foreground">
                    {pendingPermission.permissionKey}
                  </span>
                </div>

                {pendingPermission.message && (
                  <p className="text-sm">{pendingPermission.message}</p>
                )}

                {pendingPermission.dangerous && (
                  <div className="flex items-center gap-2 text-sm text-destructive font-medium">
                    <AlertTriangle className="size-4" />
                    This operation is marked as dangerous
                  </div>
                )}

                <div className="flex justify-end gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPermissionResponse(part.callId, false, false)}
                  >
                    Deny
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onPermissionResponse(part.callId, true, false)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onPermissionResponse(part.callId, true, true)}
                  >
                    Always Allow
                  </Button>
                </div>
              </div>
            )}

            {/* Subagent Navigation */}
            {(status === 'running' || status === 'completed') && taskSessionId && onNavigateToSubagent && (
              <Button
                variant="outline"
                className="w-full"
                size="sm"
                onClick={() => onNavigateToSubagent(taskSessionId!)}
              >
                <ExternalLink className="size-4" data-icon="inline-start" />
                {status === 'running' ? 'Watch Subagent' : 'View Session'}
              </Button>
            )}

            {/* Output - always show raw (visualization shown separately below) */}
            {status === 'completed' && 'output' in state && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs uppercase text-muted-foreground">Output</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyOutput}
                    className="size-6"
                  >
                    {copied ? (
                      <Check className="size-3 text-success" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </Button>
                </div>
                <pre className="text-xs bg-success/10 border border-success/20 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words">
                  {typeof state.output === 'string'
                    ? state.output
                    : JSON.stringify(state.output, null, 2)}
                </pre>
              </div>
            )}

            {/* Error */}
            {status === 'error' && 'error' in state && (
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Error</div>
                <pre className="text-xs bg-destructive/10 border border-destructive/20 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words text-destructive">
                  {state.error as string}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Visualization - outside Collapsible, always visible at bottom */}
      {status === 'completed' && visualization && (
        <div className="mt-2">
          <VisualizationRenderer visualization={visualization} />
        </div>
      )}
    </div>
  );
}
