import { useRef, useEffect, useState, useCallback, memo, useLayoutEffect } from 'react';
import { buildApiUrl } from '@/config/urls';
import { useCallbackRef } from '@/hooks/useCallbackRef';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, Download, FileIcon } from 'lucide-react';
import type {
  MessageWithParts,
  Part,
  TextPart,
  ToolPart,
  Message,
  CompactionPart,
  AssistantMessage,
} from '@jean2/shared';
import { isAssistantMessage } from '@jean2/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Minimize2, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './MessageBubble';
import { ToolCall } from './ToolCall';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';

interface PendingPermissionRequest {
  toolCallId: string;
  sessionId: string;
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

interface DisplayItem {
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
  pendingPermissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
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

const MIN_ESTIMATED_SIZE = 60;
const MAX_ESTIMATED_SIZE = 300;
const ROW_PADDING = 16; // p-4 = 16px padding on each side

// Whether the last message is still streaming (growing in height)
function isLastMessageStreaming(items: DisplayItem[]): boolean {
  if (items.length === 0) return false;
  const lastItem = items[items.length - 1];
  return isAssistantMessage(lastItem.message) && lastItem.message.status === 'streaming';
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

  if (targetIndex <= 0) {
    return null;
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
  pendingPermissions,
  onPermissionResponse,
  onNavigateToSubagent,
  inverted = false,
  serverUrl,
}: {
  parts: Part[];
  pendingPermissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  onNavigateToSubagent?: (sessionId: string) => void;
  inverted?: boolean;
  serverUrl?: string;
}) {
  const sortedParts = [...parts].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <>
      {sortedParts.map((part) => {
        switch (part.type) {
          case 'text':
            return (
              <div key={part.id} className="min-w-0">
                <MarkdownRenderer inverted={inverted}>{part.text || '...'}</MarkdownRenderer>
              </div>
            );

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
                pendingPermissions={pendingPermissions}
                onPermissionResponse={onPermissionResponse}
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
  if (prev.onPermissionResponse !== next.onPermissionResponse) return false;
  if (prev.onNavigateToSubagent !== next.onNavigateToSubagent) return false;
  if (prev.serverUrl !== next.serverUrl) return false;

  const hasPendingTool = prev.parts.some(
    p => p.type === 'tool' && (p as ToolPart).state.status === 'pending'
  );
  if (!hasPendingTool) return true;

  const prevToolCallIds = new Set(
    prev.parts
      .filter((p): p is ToolPart => p.type === 'tool')
      .map(p => p.callId)
  );

  const prevRelevantPerms = prev.pendingPermissions.filter(p => prevToolCallIds.has(p.toolCallId));
  const nextRelevantPerms = next.pendingPermissions.filter(p => prevToolCallIds.has(p.toolCallId));

  if (prevRelevantPerms.length !== nextRelevantPerms.length) return false;
  for (let i = 0; i < prevRelevantPerms.length; i++) {
    if (prevRelevantPerms[i].toolCallId !== nextRelevantPerms[i].toolCallId) return false;
  }

  return true;
});

interface MessageRowProps {
  item: DisplayItem;
  messagesWithParts: MessageWithParts[];
  sessionId: string;
  pendingPermissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
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
  pendingPermissions,
  onPermissionResponse,
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

  if (compactionPart) {
    return <CompactionDivider part={compactionPart} />;
  }

  const canRevert = !item.isQueued && item.message.role === 'user';
  const revertMessageId = canRevert
    ? findRevertMessageId(item.message.id, messagesWithParts)
    : null;

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
    >
      {item.parts.length === 0 ? (
        <span className="opacity-50">...</span>
      ) : (
        <MessageParts
          parts={item.parts}
          pendingPermissions={pendingPermissions}
          onPermissionResponse={onPermissionResponse}
          onNavigateToSubagent={onNavigateToSubagent}
          inverted={item.message.role === 'user'}
          serverUrl={serverUrl}
        />
      )}
    </MessageBubble>
  );
});

export function VirtualizedTranscript({
  displayItems,
  messagesWithParts,
  sessionId,
  sessionStatus,
  pendingPermissions,
  isCompacting = false,
  compactionSuccess = false,
  onClearCompactionSuccess,
  onPermissionResponse,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showCompactionBanner, setShowCompactionBanner] = useState(false);

  // Refs for scroll-to-bottom logic
  const autoScrollRef = useRef(autoFollow);
  const prevDisplayLengthRef = useRef(displayItems.length);
  const prevLastItemSizeRef = useRef<number>(0);
  // Per-session initial scroll tracking to avoid race conditions
  const initialScrollDoneRef = useRef(false);
  // Guard against handleScroll disabling follow on programmatic scroll-to-bottom
  const isProgrammaticScrollRef = useRef(false);

  // Fingerprint of the last item's content state - robust signal for growth detection
  // Changes when: item added, item replaced, or content mutates (e.g., streaming text)
  // This ensures the growth-detection effect fires even when length doesn't change
  const lastItemFingerprintRef = useRef<string>('');
  const computeLastItemFingerprint = useCallback((items: DisplayItem[]): string => {
    if (items.length === 0) return '';
    const last = items[items.length - 1];
    // Combine: messageId + status + partCount + textContentLength
    // This captures any meaningful change to the last item
    const textParts = last.parts.filter(p => p.type === 'text');
    const totalTextLength = textParts.reduce((sum, p) => sum + (p as TextPart).text.length, 0);
    const messageId = last.message.id;
    const status = isAssistantMessage(last.message) ? last.message.status : 'n/a';
    return `${messageId}:${status}:${last.parts.length}:${totalTextLength}`;
  }, []);

  // Ref for ResizeObserver to track last row height changes
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastRowRef = useRef<HTMLDivElement | null>(null);

  // Track measured sizes for ALL items by index - robust source for growth detection
  // This is independent of getVirtualItems() which only returns visible items
  const measuredSizesRef = useRef<Map<number, number>>(new Map());

  // Stable ref to access displayItems without recreating estimateSize
  const displayItemsRef = useRef(displayItems);
  displayItemsRef.current = displayItems;

  // Stable estimateSize using ref - no dependencies, won't recreate on render
  const estimateSize = useCallback((index: number): number => {
    const item = displayItemsRef.current[index];
    if (!item) return MIN_ESTIMATED_SIZE + ROW_PADDING;

    // Assistant messages with code/reasoning tend to be taller
    if (item.message.role === 'assistant') {
      let height = 100;
      const hasCode = item.parts.some(
        p => (p.type === 'text' && (p as TextPart).text?.includes('```')) ||
             (p.type === 'tool' && (p as ToolPart).state.input?.command)
      );
      if (hasCode) height = 180;

      const hasToolResult = item.parts.some(p => p.type === 'tool');
      if (hasToolResult) height = Math.max(height, 150);

      // Account for compaction dividers (smaller)
      if (item.parts.some(p => p.type === 'compaction')) {
        height = 60;
      }

      // Account for compaction failed state
      if ((item.message as AssistantMessage).mode === 'compact_failed') {
        height = 100;
      }

      return Math.min(Math.max(height + ROW_PADDING, MIN_ESTIMATED_SIZE + ROW_PADDING), MAX_ESTIMATED_SIZE + ROW_PADDING);
    }

    // User messages are typically shorter
    const userHeight = item.parts.length > 1 ? 80 : 60;
    return Math.min(Math.max(userHeight + ROW_PADDING, MIN_ESTIMATED_SIZE + ROW_PADDING), MAX_ESTIMATED_SIZE + ROW_PADDING);
  }, []); // Empty deps - uses ref internally

  // ResizeObserver side channel for tracking row heights.
  // Uses requestAnimationFrame to capture rendered row heights after virtualizer layout.
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    // Defer to next frame so virtualizer has rendered rows first
    const rafId = requestAnimationFrame(() => {
      const rowEls = scrollEl.querySelectorAll('[data-index]');
      rowEls.forEach((rowEl) => {
        const indexAttr = rowEl.getAttribute('data-index');
        if (indexAttr === null) return;
        const index = parseInt(indexAttr, 10);
        measuredSizesRef.current.set(index, (rowEl as HTMLElement).offsetHeight);
      });
    });

    return () => cancelAnimationFrame(rafId);
  }, [displayItems.length]);

  // ResizeObserver to track row height changes (e.g., streaming text growth)
  // Separate from the scroll-to-bottom observer - this updates measuredSizesRef
  const rowResizeObserverRef = useRef<ResizeObserver | null>(null);
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    // Clean up previous observer
    if (rowResizeObserverRef.current) {
      rowResizeObserverRef.current.disconnect();
    }

    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const el = entry.target as HTMLElement;
        const indexAttr = el.getAttribute('data-index');
        if (indexAttr === null) return;
        const index = parseInt(indexAttr, 10);
        const height = el.offsetHeight;
        measuredSizesRef.current.set(index, height);
      });
    });

    rowResizeObserverRef.current = observer;

    // Observe all current rows
    const rowEls = scrollEl.querySelectorAll('[data-index]');
    rowEls.forEach((rowEl) => observer.observe(rowEl));

    return () => observer.disconnect();
  }, [displayItems.length]);

  // TanStack Virtual returns functions that cannot be memoized by React Compiler
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: displayItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: 5,
    getItemKey: (index) => {
      const item = displayItems[index];
      return item?.message?.id ?? `fallback-${index}`;
    },
  });

  // Scroll to bottom on initial session load or session change
  // Uses virtualizer-native scrollToIndex for reliable positioning with unmeasured items
  useLayoutEffect(() => {
    // Reset auto-follow state for new session (respects prop if explicitly false)
    autoScrollRef.current = autoFollow;
    prevDisplayLengthRef.current = displayItems.length;
    prevLastItemSizeRef.current = 0;
    initialScrollDoneRef.current = false;
    lastItemFingerprintRef.current = '';

    if (displayItems.length === 0) return;

    // Use virtualizer-native scrolling instead of raw DOM manipulation.
    // scrollToIndex handles unmeasured items correctly by using estimated sizes
    // and is the proper API for programmatic scrolling in virtualized lists.
    rowVirtualizer.scrollToIndex(displayItems.length - 1, { align: 'end' });
    initialScrollDoneRef.current = true;
  }, [sessionId]); // Only depend on sessionId - rowVirtualizer is stable reference

  // Wheel handler: when in follow mode and user scrolls up, disable follow and notify parent
  // Uses passive: false to allow preventDefault for the scroll direction change
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const onWheel = (e: WheelEvent) => {
      // Only trigger on upward scroll (deltaY < 0) while in follow mode
      if (autoScrollRef.current && e.deltaY < 0) {
        // Disable follow mode and notify parent
        autoScrollRef.current = false;
        onAutoScrollChange?.(false);
        // Do NOT preventDefault - allow the scroll to proceed naturally
      }
    };

    scrollEl.addEventListener('wheel', onWheel, { passive: false });
    return () => scrollEl.removeEventListener('wheel', onWheel);
  }, [onAutoScrollChange]);

  // Scroll handler for auto-follow state management
  const handleScroll = useCallbackRef(() => {
    // Guard against programmatic scroll triggering follow logic
    if (isProgrammaticScrollRef.current) return;

    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    // In follow mode, enforce scroll-to-bottom if user scrolled away
    if (autoScrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // If not at bottom, scroll back to bottom immediately
      if (distanceFromBottom > 0) {
        isProgrammaticScrollRef.current = true;
        scrollEl.scrollTop = scrollHeight;
        requestAnimationFrame(() => {
          isProgrammaticScrollRef.current = false;
        });
      }
    } else {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      if (distanceFromBottom <= 5) {
        autoScrollRef.current = true;
        onAutoScrollChange?.(true);
      }
    }
  });

  // Banner visibility — independent of scroll state
  useLayoutEffect(() => {
    setShowCompactionBanner(isCompacting);
  }, [isCompacting]);

  // Compute fingerprint value BEFORE the effect so we can include it in deps.
  // This ensures the effect fires when the last item's content mutates
  // (e.g., streaming text growth) even when displayItems.length doesn't change.
  const lastItemFingerprintValue = computeLastItemFingerprint(displayItems);



  // Track content changes and handle conditional auto-scroll
  // Fires on: new items appended, growing last item (streaming height change)
  // Fires on: last item content mutations (captured via fingerprint VALUE dependency)
  // Does NOT force follow on user messages - respects user's scroll position
  // Does NOT fire on sessionId change (handled by session-load effect above)
  useLayoutEffect(() => {
    const currentLength = displayItems.length;
    const prevLength = prevDisplayLengthRef.current;
    const lengthChanged = currentLength !== prevLength;

    // Compute and compare last-item fingerprint for robust growth detection
    // This ensures we catch content mutations even when length doesn't change
    const currentFingerprint = lastItemFingerprintValue;
    const fingerprintChanged = currentFingerprint !== lastItemFingerprintRef.current;
    lastItemFingerprintRef.current = currentFingerprint;

    // Get the last item's measured size from our robust tracking map
    // This does NOT depend on the last item being currently visible in the virtual window
    const lastIndex = currentLength - 1;
    let lastItemMeasuredSize = 0;
    if (lastIndex >= 0) {
      lastItemMeasuredSize = measuredSizesRef.current.get(lastIndex) ?? 0;
    }
    const prevLastItemSize = prevLastItemSizeRef.current;
    const lastItemGrew = lastIndex >= 0 && lastItemMeasuredSize > prevLastItemSize && prevLastItemSize > 0;

    // Only update refs AFTER all comparisons are done so next render sees correct values
    prevDisplayLengthRef.current = currentLength;
    prevLastItemSizeRef.current = lastItemMeasuredSize;

    // Nothing to do if no content or nothing changed
    if (currentLength === 0 || (!lengthChanged && !fingerprintChanged && !lastItemGrew)) {
      return;
    }

    // Skip if this is the initial load for a session (session-load effect handles it)
    // We detect initial load by checking if prevLength was 0 and lengthChanged is true
    // and prevLastItemSize was 0 (meaning no previous measurement existed)
    // AND initial scroll hasn't been done yet for this session
    if (prevLength === 0 && currentLength > 0 && prevLastItemSize === 0 && !initialScrollDoneRef.current) {
      // Initial content load for a session - perform initial scroll here since
      // session-load effect may have skipped it if content wasn't loaded yet
      rowVirtualizer.scrollToIndex(currentLength - 1, { align: 'end' });
      initialScrollDoneRef.current = true;
      return;
    }

    // Only follow if auto-follow is currently enabled
    if (!autoScrollRef.current) {
      return;
    }

    // User is at bottom (or was on this render) — follow new content
    scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight;
  }, [displayItems.length, lastItemFingerprintValue, rowVirtualizer]);

  // Set up ResizeObserver on the last row to detect height growth during streaming
  // NOTE: This only observes when autoScrollRef is true AND user hasn't scrolled up.
  // The fingerprint effect above handles new content + growth detection for auto-follow.
  // This ResizeObserver provides smoother incremental updates during active streaming
  // by pushing down on each small height change, rather than waiting for fingerprint.
  useEffect(() => {
    // Find the last rendered row element via data-index
    const virtualItems = rowVirtualizer.getVirtualItems();
    const lastIndex = virtualItems.length - 1;
    if (lastIndex < 0) return;

    const lastVirtualItem = virtualItems[lastIndex];
    const lastRowElement = scrollRef.current?.querySelector(
      `[data-index="${lastVirtualItem.index}"]`
    ) as HTMLDivElement | null;

    // Clean up previous observer
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }

    if (!lastRowElement) return;

    lastRowRef.current = lastRowElement;

    // Only observe during streaming when user wants auto-scroll
    if (!isLastMessageStreaming(displayItems) || !autoScrollRef.current) {
      return;
    }

    resizeObserverRef.current = new ResizeObserver((_entries) => {
      // After the resize is measured, scroll to bottom if:
      // - user wants auto-scroll (autoScrollRef.current)
      // - last message is still streaming
      if (autoScrollRef.current && isLastMessageStreaming(displayItems)) {
        requestAnimationFrame(() => {
          if (!autoScrollRef.current) return;
          scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight;
        });
      }
    });

    resizeObserverRef.current.observe(lastRowElement);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [displayItems, rowVirtualizer]);



  // Auto-clear compaction success after delay
  useEffect(() => {
    if (compactionSuccess) {
      const timer = setTimeout(() => {
        onClearCompactionSuccess?.();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [compactionSuccess, onClearCompactionSuccess]);

  // Sync scrollToBottomRef for programmatic scrolling (e.g., when enabling auto-follow)
  useLayoutEffect(() => {
    if (scrollToBottomRef) {
      scrollToBottomRef.current = () => {
        autoScrollRef.current = true;
        isProgrammaticScrollRef.current = true;
        scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight;
        requestAnimationFrame(() => {
          isProgrammaticScrollRef.current = false;
        });
      };
    }
  }, [scrollToBottomRef]);

  // Sync autoFollow prop to autoScrollRef when prop changes
  // This ensures external changes (e.g., toggling "Free" mode) are respected immediately
  useLayoutEffect(() => {
    autoScrollRef.current = autoFollow;
  }, [autoFollow]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto relative chat-transcript-scrollbar"
      style={{ WebkitOverflowScrolling: 'touch' }}
      onScroll={handleScroll}
    >
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

      <div
        className="relative w-full"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {displayItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground px-4">
            <p className="text-lg mb-2">Start a conversation</p>
            <p className="text-sm">Send a message below to begin.</p>
          </div>
        ) : (
          <div
            className="absolute top-0 left-0 w-full"
            style={{
              transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
            }}
          >
            {virtualItems.map((virtualItem) => {
              const item = displayItems[virtualItem.index];
              return (
                <div
                  key={item.message.id}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  className="px-4 py-4"
                >
                  <MessageRow
                    item={item}
                    messagesWithParts={messagesWithParts}
                    sessionId={sessionId}
                    pendingPermissions={pendingPermissions}
                    onPermissionResponse={onPermissionResponse}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
