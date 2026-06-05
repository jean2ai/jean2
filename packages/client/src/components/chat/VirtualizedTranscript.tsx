import { useRef, useEffect, useState, useCallback, memo, useLayoutEffect } from 'react';
import { buildApiUrl } from '@/config/urls';
import { LegendList, type LegendListRef } from '@legendapp/list/react';
import { ChevronDown, ChevronRight, Download, FileIcon, Braces } from 'lucide-react';
import type {
  MessageWithParts,
  Part,
  TextPart,
  Message,
  CompactionPart,
  AssistantMessage,
  AskResponse,
  StructuredOutputData,
} from '@jean2/sdk';
import { isAssistantMessage } from '@jean2/sdk';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Minimize2, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './MessageBubble';
import { ErrorMessageContent } from './ErrorMessageContent';
import { ToolCall } from './ToolCall';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { StructuredResponse } from '@/components/visualizations';
import type { PendingAskRequest } from '@/stores/askStore';

export interface DisplayItem {
  message: Message;
  parts: Part[];
  isQueued?: boolean;
  queueId?: string;
}

interface VirtualizedTranscriptProps {
  displayItems: DisplayItem[];
  messagesWithParts: MessageWithParts[];
  sessionId: string;
  sessionStatus?: string;
  pendingAskRequests: PendingAskRequest[];
  onAskResponse: (toolCallId: string, response: AskResponse, requestId?: string) => void;
  onNavigateToSubagent?: (sessionId: string) => void;
  onRemoveFromQueue: (queueId: string) => void;
  onRevert?: (sessionId: string, stepPartId: string) => void;
  onFork?: (sessionId: string, messageId: string) => void;
  onCompact?: () => void;
  isMainActiveSession?: boolean;
  isCompacting?: boolean;
  compactionSuccess?: boolean;
  onClearCompactionSuccess?: () => void;
  autoFollow?: boolean;
  onAutoScrollChange?: (enabled: boolean) => void;
  scrollToBottomRef?: React.RefObject<(() => void) | null>;
  serverUrl?: string;
}

function getTextContent(parts: Part[]): string {
  return parts
    .filter((part): part is TextPart => part.type === 'text')
    .map(part => part.text)
    .join('');
}

function findRevertMessageId(
  targetMessageId: string,
  messagesWithParts: MessageWithParts[]
): string | null {
  const targetIndex = messagesWithParts.findIndex(mwp => mwp.message.id === targetMessageId);

  if (targetIndex < 0) {
    return null;
  }

  if (targetIndex === 0) {
    return targetMessageId;
  }

  for (let i = targetIndex - 1; i >= 0; i--) {
    const mwp = messagesWithParts[i];
    if (mwp.message.role === 'assistant' && mwp.message.status !== 'streaming') {
      return mwp.message.id;
    }
  }

  return null;
}

function CompactionInProgressBanner() {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-foreground bg-muted rounded-lg px-3 py-2 border border-border shadow-sm">
      <Minimize2 className="size-4 animate-pulse" />
      <span>Compacting conversation...</span>
    </div>
  );
}

function CompactionSuccessBanner() {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400 bg-green-500/15 rounded-lg px-3 py-2 border border-green-500/30 shadow-sm">
      <CheckCircle2 className="size-4" />
      <span>Compaction complete</span>
    </div>
  );
}

function CompactionFailedMessage({
  message,
  textContent,
  onRetry,
}: {
  message: AssistantMessage;
  textContent: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-destructive ml-3">
        <AlertTriangle className="size-3" />
        Compaction Failed
      </div>
      <div className="rounded-2xl px-4 py-3 max-w-full bg-destructive/10 border border-destructive/30 rounded-bl-md">
        <p className="text-sm text-destructive/90">
          {textContent || message.error || 'Compaction failed. The conversation could not be summarized.'}
        </p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-2 h-7 text-xs gap-1.5"
          >
            <RotateCcw className="size-3" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

function getFileExtensionBadge(mimeType?: string, filename?: string): string {
  const ext = mimeType?.split('/').pop() || filename?.split('.').pop()?.toLowerCase() || '';
  return ext;
}

function CompactionDivider({ part }: { part: CompactionPart }) {
  const [expanded, setExpanded] = useState(false);

  const reason = part.overflow ? 'overflow' : part.auto ? 'auto' : 'manual';

  return (
    <div className="flex flex-col items-center py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span className="border-b border-dashed border-muted-foreground/40 pb-px">
          {reason === 'overflow' ? 'Context overflow' : reason === 'auto' ? 'Auto' : 'Manual'} compaction
        </span>
      </button>
      {expanded && (
        <div className="mt-2 text-xs text-muted-foreground italic">
          Summary available in the assistant message below
        </div>
      )}
    </div>
  );
}

const MessageParts = memo(function MessageParts({
  parts,
  pendingAskRequests,
  onAskResponse,
  onNavigateToSubagent,
  inverted = false,
  serverUrl,
}: {
  parts: Part[];
  pendingAskRequests: PendingAskRequest[];
  onAskResponse: (toolCallId: string, response: AskResponse, requestId?: string) => void;
  onNavigateToSubagent?: (sessionId: string) => void;
  inverted?: boolean;
  serverUrl?: string;
}) {
  const sortedParts = [...parts].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <>
      {sortedParts.map((part) => {
        switch (part.type) {
          case 'text': {
            const text = inverted && part.text
              ? part.text.replace(/\n(?!\n)/g, '\n\n')
              : (part.text || '...');
            return (
              <div key={part.id} className="min-w-0">
                <MarkdownRenderer inverted={inverted}>{text}</MarkdownRenderer>
              </div>
            );
          }

          case 'reasoning':
            return (
              <div
                key={part.id}
                className="visualization-container text-muted-foreground text-sm italic border-l-2 border-muted-foreground/30 pl-3 my-2 wrap-break-word"
              >
                {part.text}
              </div>
            );

          case 'tool':
            return (
              <ToolCall
                key={part.id}
                part={part}
                pendingAskRequests={pendingAskRequests}
                onAskResponse={onAskResponse}
                onNavigateToSubagent={onNavigateToSubagent}
              />
            );

          case 'image': {
            const fullUrl = serverUrl ? buildApiUrl(serverUrl, part.url) : part.url;
            return (
              <img
                key={part.id}
                src={fullUrl}
                alt=""
                className={cn(
                  'max-w-full max-h-64 rounded-xl mt-2 object-contain',
                  inverted && 'ring-2 ring-white/20'
                )}
              />
            );
          }

          case 'file': {
            const fullUrl = serverUrl ? buildApiUrl(serverUrl, part.url) : part.url;
            const ext = getFileExtensionBadge(part.mimeType, part.filename);
            const filename = part.filename || '';
            const displayName = filename.length > 30
              ? filename.slice(0, 27) + '...'
              : (filename || 'unnamed');
            return (
              <a
                key={part.id}
                href={fullUrl}
                className={cn(
                  'mt-2 p-2 rounded-lg text-sm flex items-center gap-2 transition-colors',
                  inverted
                    ? 'bg-white/15 hover:bg-white/25 text-primary-foreground'
                    : 'bg-muted hover:bg-accent'
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileIcon className="size-4 shrink-0" />
                <span className="truncate">{displayName}</span>
                {ext && (
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ml-auto shrink-0',
                    inverted
                      ? 'bg-white/25 text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground'
                  )}>
                    {ext}
                  </span>
                )}
                <Download className="size-3.5 shrink-0 opacity-60" />
              </a>
            );
          }

          default:
            return null;
        }
      })}
    </>
  );
}, (prev, next) => {
  if (prev.parts !== next.parts) return false;
  if (prev.inverted !== next.inverted) return false;
  if (prev.onNavigateToSubagent !== next.onNavigateToSubagent) return false;
  if (prev.serverUrl !== next.serverUrl) return false;

  return prev.pendingAskRequests === next.pendingAskRequests;


});

const StructuredOutputMessage = memo(function StructuredOutputMessage({
  parts,
  structuredOutput,
  pendingAskRequests,
  onAskResponse,
  onNavigateToSubagent,
  serverUrl,
}: {
  parts: Part[];
  structuredOutput: StructuredOutputData;
  pendingAskRequests: PendingAskRequest[];
  onAskResponse: (toolCallId: string, response: AskResponse, requestId?: string) => void;
  onNavigateToSubagent?: (sessionId: string) => void;
  serverUrl?: string;
}) {
  const [rawOpen, setRawOpen] = useState(false);

  return (
    <>
      <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 py-1 cursor-pointer hover:text-foreground transition-colors text-muted-foreground">
            <Braces className="size-3 text-primary" />
            {rawOpen ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
            <span className="text-xs">
              Raw Output
              {structuredOutput.formatName && (
                <span className="text-muted-foreground"> · {structuredOutput.formatName}</span>
              )}
            </span>
          </div>
        </CollapsibleTrigger>
        {rawOpen && (
          <CollapsibleContent>
            <div className="pb-2">
              <MessageParts
                parts={parts}
                pendingAskRequests={pendingAskRequests}
                onAskResponse={onAskResponse}
                onNavigateToSubagent={onNavigateToSubagent}
                inverted={false}
                serverUrl={serverUrl}
              />
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>

      <div className="mt-2">
        <StructuredResponse
          formatName={structuredOutput.formatName}
          data={structuredOutput.data}
          schema={structuredOutput.schema}
        />
      </div>
    </>
  );
});

interface MessageRowProps {
  item: DisplayItem;
  messagesWithParts: MessageWithParts[];
  sessionId: string;
  pendingAskRequests: PendingAskRequest[];
  onAskResponse: (toolCallId: string, response: AskResponse, requestId?: string) => void;
  onNavigateToSubagent?: (sessionId: string) => void;
  onRemoveFromQueue: (queueId: string) => void;
  onRevert?: (sessionId: string, stepPartId: string) => void;
  onFork?: (sessionId: string, messageId: string) => void;
  isMainActiveSession?: boolean;
  isCompacting?: boolean;
  onCompact?: () => void;
  serverUrl?: string;
}

const MessageRow = memo(function MessageRow({
  item,
  messagesWithParts,
  sessionId,
  pendingAskRequests,
  onAskResponse,
  onNavigateToSubagent,
  onRemoveFromQueue,
  onRevert,
  onFork,
  isMainActiveSession = false,
  isCompacting = false,
  onCompact,
  serverUrl,
}: MessageRowProps) {
  const compactionPart = item.parts.find(
    (p): p is CompactionPart => p.type === 'compaction'
  );

  const isCompactFailed = isAssistantMessage(item.message) && item.message.mode === 'compact_failed';

  if (isCompactFailed) {
    return (
      <CompactionFailedMessage
        message={item.message as AssistantMessage}
        textContent={getTextContent(item.parts)}
        onRetry={isMainActiveSession && !isCompacting ? onCompact : undefined}
      />
    );
  }

  const isError = isAssistantMessage(item.message) && item.message.status === 'error';

  if (isError) {
    return (
      <ErrorMessageContent
        message={item.message as AssistantMessage}
      />
    );
  }

  if (compactionPart) {
    return <CompactionDivider part={compactionPart} />;
  }

  const canRevert = !item.isQueued && item.message.role === 'user';
  const revertMessageId = canRevert
    ? findRevertMessageId(item.message.id, messagesWithParts)
    : null;
  const isClearAll = revertMessageId === item.message.id;

  return (
    <MessageBubble
      message={item.message}
      textContent={getTextContent(item.parts)}
      isQueued={item.isQueued}
      onRemove={item.isQueued ? () => onRemoveFromQueue(item.queueId!) : undefined}
      canRevert={canRevert && revertMessageId !== null}
      onRevert={revertMessageId ? () => onRevert?.(sessionId, revertMessageId) : undefined}
      canFork={canRevert && revertMessageId !== null}
      onFork={revertMessageId ? () => onFork?.(sessionId, item.message.id) : undefined}
      isClearAll={isClearAll}
    >
      {item.parts.length === 0 ? (
        <span className="opacity-50">...</span>
      ) : isAssistantMessage(item.message) && item.message.structuredOutput ? (
        <StructuredOutputMessage
          parts={item.parts}
          structuredOutput={item.message.structuredOutput}
          pendingAskRequests={pendingAskRequests}
          onAskResponse={onAskResponse}
          onNavigateToSubagent={onNavigateToSubagent}
          serverUrl={serverUrl}
        />
      ) : (
        <MessageParts
          parts={item.parts}
          pendingAskRequests={pendingAskRequests}
          onAskResponse={onAskResponse}
          onNavigateToSubagent={onNavigateToSubagent}
          inverted={item.message.role === 'user'}
          serverUrl={serverUrl}
        />
      )}
    </MessageBubble>
  );
});

function EmptyTranscript() {
  return (
    <div className="text-center py-16 text-muted-foreground px-4">
      <p className="text-lg mb-2">Start a conversation</p>
      <p className="text-sm">Send a message below to begin.</p>
    </div>
  );
}

function keyExtractor(item: DisplayItem): string {
  return item.message.id;
}

export function VirtualizedTranscript({
  displayItems,
  messagesWithParts,
  sessionId,
  sessionStatus,
  pendingAskRequests,
  isCompacting = false,
  compactionSuccess = false,
  onClearCompactionSuccess,
  onAskResponse,
  onNavigateToSubagent,
  onRemoveFromQueue,
  onRevert,
  onFork,
  onCompact,
  isMainActiveSession = false,
  autoFollow = true,
  onAutoScrollChange,
  scrollToBottomRef,
  serverUrl,
}: VirtualizedTranscriptProps) {
  const listRef = useRef<LegendListRef | null>(null);
  const autoScrollRef = useRef(autoFollow);
  const isProgrammaticScrollRef = useRef(false);
  const [maintainAutoFollow, setMaintainAutoFollow] = useState(autoFollow);
  const [showCompactionBanner, setShowCompactionBanner] = useState(false);

  useLayoutEffect(() => {
    setShowCompactionBanner(isCompacting);
  }, [isCompacting]);

  useEffect(() => {
    if (compactionSuccess) {
      const timer = setTimeout(() => {
        onClearCompactionSuccess?.();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [compactionSuccess, onClearCompactionSuccess]);

  useLayoutEffect(() => {
    autoScrollRef.current = autoFollow;
    setMaintainAutoFollow(autoFollow);
  }, [autoFollow]);

  const disableAutoFollowForUserIntent = useCallback(() => {
    if (!autoScrollRef.current && !maintainAutoFollow) return;

    autoScrollRef.current = false;
    setMaintainAutoFollow(false);
    onAutoScrollChange?.(false);
  }, [maintainAutoFollow, onAutoScrollChange]);

  useLayoutEffect(() => {
    if (displayItems.length === 0) return;

    autoScrollRef.current = autoFollow;
    setMaintainAutoFollow(autoFollow);
    if (autoFollow) {
      isProgrammaticScrollRef.current = true;
      requestAnimationFrame(() => {
        void listRef.current?.scrollToEnd({ animated: false }).finally(() => {
          isProgrammaticScrollRef.current = false;
        });
      });
    }
  }, [sessionId, autoFollow, displayItems.length]);

  useLayoutEffect(() => {
    if (scrollToBottomRef) {
      scrollToBottomRef.current = () => {
        autoScrollRef.current = true;
        setMaintainAutoFollow(true);
        isProgrammaticScrollRef.current = true;
        void listRef.current?.scrollToEnd({ animated: false }).finally(() => {
          requestAnimationFrame(() => {
            isProgrammaticScrollRef.current = false;
          });
        });
      };
    }
  }, [scrollToBottomRef]);

  useEffect(() => {
    const scrollEl = listRef.current?.getScrollableNode() as HTMLElement | null | undefined;
    if (!scrollEl) return;

    let touchStartY = 0;

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        disableAutoFollowForUserIntent();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY ?? 0;
      if (currentY > touchStartY + 5) {
        disableAutoFollowForUserIntent();
      }
    };

    scrollEl.addEventListener('wheel', onWheel, { passive: true });
    scrollEl.addEventListener('touchstart', onTouchStart, { passive: true });
    scrollEl.addEventListener('touchmove', onTouchMove, { passive: true });

    return () => {
      scrollEl.removeEventListener('wheel', onWheel);
      scrollEl.removeEventListener('touchstart', onTouchStart);
      scrollEl.removeEventListener('touchmove', onTouchMove);
    };
  }, [disableAutoFollowForUserIntent]);

  const handleScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;

    const state = listRef.current?.getState();
    if (!state) return;

    if (state.isAtEnd || state.isWithinMaintainScrollAtEndThreshold) {
      if (!autoScrollRef.current || !maintainAutoFollow) {
        autoScrollRef.current = true;
        setMaintainAutoFollow(true);
        onAutoScrollChange?.(true);
      }
      return;
    }

    if (autoScrollRef.current || maintainAutoFollow) {
      autoScrollRef.current = false;
      setMaintainAutoFollow(false);
      onAutoScrollChange?.(false);
    }
  }, [maintainAutoFollow, onAutoScrollChange]);

  const renderItem = useCallback(({ item }: { item: DisplayItem }) => (
    <div className="px-4 py-4">
      <MessageRow
        item={item}
        messagesWithParts={messagesWithParts}
        sessionId={sessionId}
        pendingAskRequests={pendingAskRequests}
        onAskResponse={onAskResponse}
        onNavigateToSubagent={onNavigateToSubagent}
        onRemoveFromQueue={onRemoveFromQueue}
        onRevert={onRevert}
        onFork={onFork}
        isMainActiveSession={isMainActiveSession}
        isCompacting={isCompacting}
        onCompact={onCompact}
        serverUrl={serverUrl}
      />
    </div>
  ), [
    messagesWithParts,
    sessionId,
    pendingAskRequests,
    onAskResponse,
    onNavigateToSubagent,
    onRemoveFromQueue,
    onRevert,
    onFork,
    isMainActiveSession,
    isCompacting,
    onCompact,
    serverUrl,
  ]);

  const header = (
    <>
      {showCompactionBanner && (
        <div className="sticky top-0 z-10 px-4 pt-4 pb-1 bg-gradient-to-b from-background via-background/95 to-transparent">
          <CompactionInProgressBanner />
        </div>
      )}

      {compactionSuccess && (
        <div className="sticky top-0 z-10 px-4 pt-4 pb-1 bg-gradient-to-b from-background via-background/95 to-transparent">
          <CompactionSuccessBanner />
        </div>
      )}

      {sessionStatus === 'closed' && (
        <Alert className="mx-4 mt-4">
          <AlertDescription>
            This session is archived. You can reopen it from the sidebar.
          </AlertDescription>
        </Alert>
      )}
    </>
  );

  return (
    <LegendList
      ref={listRef}
      data={displayItems}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      estimatedItemSize={100}
      drawDistance={800}
      initialScrollAtEnd
      maintainScrollAtEnd={maintainAutoFollow ? { animated: false } : false}
      maintainScrollAtEndThreshold={0.1}
      maintainVisibleContentPosition={{ data: true, size: true }}
      onScroll={handleScroll}
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative chat-transcript-scrollbar"
      style={{ WebkitOverflowScrolling: 'touch' }}
      ListHeaderComponent={header}
      ListEmptyComponent={EmptyTranscript}
    />
  );
}
