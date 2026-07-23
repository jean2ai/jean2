import { memo, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Copy, Check, Wrench, Loader2, CheckCircle, XCircle, Clock, Pause, Download } from 'lucide-react';
import type { ToolPart, AnyVisualization, AskResponse, Session, ToolOutputReference } from '@jean2/sdk';
import { isToolOutputReference } from '@jean2/sdk';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { VisualizationRenderer } from '@/components/visualizations';
import { AskQuestion } from './AskQuestion';
import type { PendingAskRequest } from '@/stores/askStore';
import { useSessionStore } from '@/stores/sessionStore';
import { RENDER_BUDGETS } from '@/lib/renderBudgets';
import { useToolOutputOriginal, describeCompressionSavings } from '@/hooks/useToolOutputOriginal';

interface LazyOutputProps {
  content: string;
  className?: string;
}

const LazyOutput = memo(function LazyOutput({ content, className }: LazyOutputProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const size = content.length;
  const isLarge = size > RENDER_BUDGETS.toolOutputPreviewChars;
  const preview = isLarge ? content.slice(0, RENDER_BUDGETS.toolOutputPreviewChars) + '\n...' : null;

  if (!isLarge) {
    return <pre className={className}>{content}</pre>;
  }

  const sizeLabel = size > 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : size > 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${size} bytes`;

  return (
    <div>
      <pre className={className}>{isExpanded ? content : preview}</pre>
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground mt-1 transition-colors cursor-pointer"
        onClick={() => setIsExpanded(prev => !prev)}
      >
        {isExpanded ? 'Show less' : `Show full output (${sizeLabel})`}
      </button>
    </div>
  );
});

interface ToolCallProps {
  part: ToolPart;
  pendingAskRequests: PendingAskRequest[];
  onAskResponse: (toolCallId: string, response: AskResponse, requestId?: string) => void;
  onNavigateToSubagent?: (sessionId: string) => void;
  sessionId?: string;
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
    case 'interrupted':
      return <Pause className="size-3 text-warning" />;
    default:
      return null;
  }
}

function extractTaskSessionId(part: ToolPart): string | null {
  if (part.name !== 'task') return null;
  const state = part.state;
  if ('childSessionId' in state && state.childSessionId) {
    return state.childSessionId as string;
  }
  const output = 'output' in state
    ? state.output
    : 'partialOutput' in state
      ? state.partialOutput
      : null;
  if (output && typeof output === 'string') {
    const match = output.match(/task_id:\s*([a-f0-9-]{36})/i);
    if (match) return match[1];
  }
  return null;
}

function extractVisualization(output: unknown): AnyVisualization | undefined {
  if (output && typeof output === 'object' && '_visualization' in output) {
    return (output as Record<string, unknown>)._visualization as AnyVisualization;
  }
  return undefined;
}

function extractReference(output: unknown): ToolOutputReference | null {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null;
  if (!isToolOutputReference(output)) return null;
  return output;
}

function getDescendantSessionIds(parentId: string, sessions: Session[]): Set<string> {
  const descendants = new Set<string>();
  const queue = [parentId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const session of sessions) {
      if (session.parentId === current && !descendants.has(session.id)) {
        descendants.add(session.id);
        queue.push(session.id);
      }
    }
  }

  return descendants;
}

const areToolCallPropsEqual = (
  prev: ToolCallProps,
  next: ToolCallProps,
): boolean => {
  if (prev.part !== next.part) return false;
  if (prev.sessionId !== next.sessionId) return false;
  if (prev.onNavigateToSubagent !== next.onNavigateToSubagent) return false;
  if (prev.onAskResponse !== next.onAskResponse) return false;
  if (prev.pendingAskRequests !== next.pendingAskRequests) return false;

  return true;
};

interface CompressedOutputSectionProps {
  reference: ToolOutputReference;
  sessionId?: string;
  fallbackOutput: unknown;
  onCopy: (text: string) => void;
  copied: boolean;
}

function CompressedOutputSection({
  reference,
  sessionId,
  fallbackOutput,
  onCopy,
  copied,
}: CompressedOutputSectionProps) {
  const retrievalId = reference.retrievalId;
  const { loading, error, data, reload } = useToolOutputOriginal({
    sessionId: sessionId ?? '',
    retrievalId,
    enabled: false,
  });
  const [hasRequested, setHasRequested] = useState(false);
  const savings = describeCompressionSavings(reference);

  const handleLoad = () => {
    if (!hasRequested) setHasRequested(true);
    reload();
  };

  const renderOutput = (output: unknown) => {
    if (typeof output === 'string') return output;
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  };

  const handleCopyExact = () => {
    onCopy(renderOutput(data?.output ?? fallbackOutput));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex flex-col gap-0.5">
          <div className="text-xs uppercase text-muted-foreground">Output sent to model</div>
          <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-muted font-mono uppercase">
              {reference.strategy}
            </span>
            <span>
              {reference.originalChars.toLocaleString()} → {reference.modelChars.toLocaleString()} chars ({savings} smaller)
            </span>
            <span className="text-warning">Incomplete, exact output available</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopyExact}
          className="size-6"
          title={data ? 'Copy exact output' : 'Copy output sent to model'}
        >
          {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
        </Button>
      </div>
      <pre className="text-xs bg-success/10 border border-success/20 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words">
        {renderOutput(fallbackOutput)}
      </pre>
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleLoad}
          disabled={loading || !sessionId}
          className="text-xs h-7"
          title={sessionId ? undefined : 'Session is unavailable'}
        >
          <Download className="size-3" data-icon="inline-start" />
          {loading ? 'Loading…' : hasRequested ? 'Reload exact output' : 'Load exact output'}
        </Button>
        {hasRequested && error && (
          <span className="text-xs text-destructive">{error}</span>
        )}
      </div>
      {data && (
        <div className="mt-2">
          <LazyOutput
            content={renderOutput(data.output)}
            className="text-xs bg-background border rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words"
          />
        </div>
      )}
    </div>
  );
}

export const ToolCall = memo(function ToolCall({
  part,
  pendingAskRequests,
  onAskResponse,
  onNavigateToSubagent,
  sessionId,
}: ToolCallProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const state = part.state;
  const status = state.status;

  const serializedInput = useMemo((): string => {
    if (!isOpen) return '';
    try {
      return JSON.stringify(state.input, null, 2);
    } catch {
      return String(state.input);
    }
  }, [state.input, isOpen]);

  const serializedOutput = useMemo((): string | null => {
    if (!isOpen) return null;
    if (status !== 'completed' || !('output' in state)) return null;
    const output = state.output;
    if (typeof output === 'string') return output;
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  }, [status, state, isOpen]);

  const visualization = status === 'completed' && 'output' in state
    ? extractVisualization(state.output)
    : undefined;

  const reference = status === 'completed' && 'output' in state
    ? extractReference(state.output)
    : null;

  const taskSessionId = extractTaskSessionId(part);

  const sessions = useSessionStore((s) => s.sessions);

  const allPendingAsks: PendingAskRequest[] = [];

  if (status === 'pending' || status === 'running') {
    const directAsk = pendingAskRequests.find((r) => r.toolCallId === part.callId);
    if (directAsk) {
      allPendingAsks.push(directAsk);
    }

    if (taskSessionId) {
      const descendantIds = getDescendantSessionIds(taskSessionId, sessions);
      descendantIds.add(taskSessionId);
      const childAsks = pendingAskRequests.filter(
        (r) => {
          const isChildOrDescendant = r.originSessionId && descendantIds.has(r.originSessionId);
          const isDirectChildSession = r.sessionId === taskSessionId;
          return (isChildOrDescendant || isDirectChildSession) && r.toolCallId !== part.callId;
        },
      );
      allPendingAsks.push(...childAsks);
    }
  }

  const handleCopyOutput = async (content?: string) => {
    if (!('output' in state) && content === undefined) return;

    let output = content;
    if (output === undefined && 'output' in state) {
      if (typeof state.output === 'string') {
        output = state.output;
      } else {
        try {
          output = JSON.stringify(state.output, null, 2);
        } catch {
          output = String(state.output);
        }
      }
    }
    if (output === undefined) return;

    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            {getStatusIcon(status)}

            {isOpen ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}

            <Wrench className="size-3" />
            <span className="text-xs truncate max-w-[120px] sm:max-w-none">{part.name}</span>

            {!isOpen && (
              <span className="text-xs text-muted-foreground font-mono truncate flex-1 min-w-0 hidden sm:block">
                {truncatedArgs}
              </span>
            )}

            {taskSessionId && onNavigateToSubagent && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 w-6 p-0 sm:w-auto sm:px-2"
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
        </CollapsibleTrigger>

        {isOpen && <CollapsibleContent>
          <div className="pl-5 pb-2 flex flex-col gap-2">
            {/* Input */}
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Input</div>
              <LazyOutput
                content={serializedInput}
                className="text-xs bg-background border rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words"
              />
            </div>

            {/* Subagent Navigation */}
            {(status === 'running' || status === 'completed' || status === 'interrupted') && taskSessionId && onNavigateToSubagent && (
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

            {/* Output */}
            {status === 'completed' && reference && (
              <CompressedOutputSection
                key={reference.retrievalId}
                reference={reference}
                sessionId={sessionId}
                fallbackOutput={state.output}
                onCopy={handleCopyOutput}
                copied={copied}
              />
            )}
            {status === 'completed' && !reference && serializedOutput !== null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs uppercase text-muted-foreground">Output</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopyOutput()}
                    className="size-6"
                  >
                    {copied ? (
                      <Check className="size-3 text-success" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </Button>
                </div>
                <LazyOutput
                  content={serializedOutput}
                  className="text-xs bg-success/10 border border-success/20 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words"
                />
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
        </CollapsibleContent>}
      </Collapsible>

      {/* Ask Questions (direct + child session asks) */}
      {allPendingAsks.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {allPendingAsks.map((request) => (
            <AskQuestion
              key={request.requestId ?? request.toolCallId}
              request={request}
              onRespond={onAskResponse}
            />
          ))}
        </div>
      )}

      {/* Visualization - outside Collapsible, always visible at bottom */}
      {status === 'completed' && visualization && (
        <div className="mt-2">
          <VisualizationRenderer visualization={visualization} />
        </div>
      )}
    </div>
  );
}, areToolCallPropsEqual);