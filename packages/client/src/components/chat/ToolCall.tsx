import { memo, useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Copy, Check, Wrench, Loader2, CheckCircle, XCircle, Clock, Pause } from 'lucide-react';
import type { ToolPart, AnyVisualization, AskResponse } from '@jean2/sdk';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { VisualizationRenderer } from '@/components/visualizations';
import { AskQuestion } from './AskQuestion';
import type { PendingAskRequest } from '@/stores/askStore';

const LARGE_OUTPUT_THRESHOLD = 1536;

interface LazyOutputProps {
  content: string;
  className?: string;
}

const LazyOutput = memo(function LazyOutput({ content, className }: LazyOutputProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const size = new Blob([content]).size;
  const isLarge = size > LARGE_OUTPUT_THRESHOLD;
  const preview = isLarge ? content.slice(0, LARGE_OUTPUT_THRESHOLD) + '\n...' : null;

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
  onAskResponse: (toolCallId: string, response: AskResponse) => void;
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
    case 'interrupted':
      return <Pause className="size-3 text-warning" />;
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

const areToolCallPropsEqual = (
  prev: ToolCallProps,
  next: ToolCallProps
): boolean => {
  if (prev.part !== next.part) return false;
  if (prev.onNavigateToSubagent !== next.onNavigateToSubagent) return false;

  const status = prev.part.state.status;
  if (status !== 'pending' && status !== 'running') return true;

  const prevAsk = prev.pendingAskRequests.find(r => r.toolCallId === prev.part.callId);
  const nextAsk = next.pendingAskRequests.find(r => r.toolCallId === next.part.callId);

  return prevAsk === nextAsk;
};

export const ToolCall = memo(function ToolCall({
  part,
  pendingAskRequests,
  onAskResponse,
  onNavigateToSubagent,
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
    return typeof state.output === 'string'
      ? state.output
      : JSON.stringify(state.output, null, 2);
  }, [status, state, isOpen]);

  // Extract visualization at component level to render outside collapsible
  const visualization = status === 'completed' && 'output' in state
    ? extractVisualization(state.output)
    : undefined;

  const pendingAskRequest = status === 'pending' || status === 'running'
    ? pendingAskRequests.find((r) => r.toolCallId === part.callId)
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
            {status === 'completed' && serializedOutput !== null && (
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

      {/* Ask Question */}
      {pendingAskRequest && (
        <div className="mt-2">
          <AskQuestion
            request={pendingAskRequest}
            onRespond={onAskResponse}
          />
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
