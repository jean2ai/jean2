import { useRef, useEffect, useState } from 'react';
import { Lock, ChevronDown, ChevronRight } from 'lucide-react';
import type { Session, Preconfig, MessageWithParts, Part, TextPart, ToolPart, QueuedMessage, Message, CompactionPart, PromptInfo } from '@jean2/shared';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ChatHeader } from './ChatHeader';
import { MessageBubble } from './MessageBubble';
import { ToolCall } from './ToolCall';
import { MessageInput } from './MessageInput';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';

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

interface Model {
  id: string;
  name: string;
  contextWindow: number;
  tier: 'budget' | 'standard' | 'premium';
  providerId: string;
  providerName: string;
}

interface DisplayItem {
  message: Message;
  parts: Part[];
  isQueued?: boolean;
  queueId?: string;
}

interface ChatViewProps {
  session: Session;
  messagesWithParts: MessageWithParts[];
  queuedMessages: QueuedMessage[];
  preconfigs: Preconfig[];
  prompts?: PromptInfo[];
  models: Model[];
  connectedProviderIds?: Set<string>;
  connectableProviderIds?: Set<string>;
  defaultModel: string;
  onSendMessage: (content: string) => void;
  onRemoveFromQueue: (queueId: string) => void;
  onChangePreconfig: (preconfigId: string) => void;
  onChangeModel: (modelId: string, providerId: string) => void;
  onChangeVariant: (variant: string | null) => void;
  pendingPermissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  onRename: (sessionId: string, title: string) => void;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  modelName: string;
  onNavigateToSubagent?: (sessionId: string) => void;
  onNavigateBack?: () => void;
  isStreaming?: boolean;
  onInterrupt?: () => void;
  onRevert?: (sessionId: string, stepPartId: string) => void;
  onFork?: (sessionId: string, messageId: string) => void;
  onCompact?: () => void;
  isCompacting?: boolean;
  serverUrl?: string;
  apiToken?: string;
  selectedVariant: string | null;
  variants?: Record<string, { providerOptions: Record<string, unknown> }>;
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

function mergeMessagesWithQueue(
  messagesWithParts: MessageWithParts[],
  queuedMessages: QueuedMessage[]
): DisplayItem[] {
  const regularItems: DisplayItem[] = messagesWithParts.map(mwp => ({
    message: mwp.message,
    parts: mwp.parts,
    isQueued: false,
  }));

  const queuedItems: DisplayItem[] = queuedMessages.map(qm => ({
    message: {
      id: qm.id,
      role: 'user' as const,
      sessionId: qm.sessionId,
      createdAt: qm.createdAt,
    } as Message,
    parts: [{
      id: `${qm.id}-part`,
      messageId: qm.id,
      createdAt: qm.createdAt,
      type: 'text' as const,
      text: qm.content,
    }],
    isQueued: true,
    queueId: qm.id,
  }));

  // Sort regular messages by createdAt, then append queued messages at the end
  const sortedRegularItems = [...regularItems].sort((a, b) =>
    a.message.createdAt - b.message.createdAt
  );

  // Sort queued items by position (or createdAt as fallback) to maintain order
  const sortedQueuedItems = [...queuedItems].sort((a, b) =>
    a.message.createdAt - b.message.createdAt
  );

  return [...sortedRegularItems, ...sortedQueuedItems];
}

function CompactionDivider({ part }: { part: CompactionPart }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col items-center my-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span className="border-b border-dashed border-muted-foreground/40 pb-px">
          {part.compactedMessageIds.length} messages compacted
        </span>
      </button>
      {expanded && (
        <div className="mt-2 max-w-lg w-full rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <MarkdownRenderer>{part.summary}</MarkdownRenderer>
        </div>
      )}
    </div>
  );
}

/**
 * Renders message parts in CHRONOLOGICAL ORDER (by createdAt).
 * Text blocks and tool calls are interleaved as they were created.
 */
function MessageParts({
  parts,
  pendingPermissions,
  onPermissionResponse,
  onNavigateToSubagent,
  inverted = false,
}: {
  parts: Part[];
  pendingPermissions: PendingPermissionRequest[];
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  onNavigateToSubagent?: (sessionId: string) => void;
  inverted?: boolean;
}) {
  // Sort parts by createdAt to ensure chronological order
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

          case 'image':
            return (
              <img
                key={part.id}
                src={part.url}
                alt=""
                className="max-w-full rounded-lg mt-2"
              />
            );

          case 'file':
            return (
              <div key={part.id} className="mt-2 p-2 bg-muted rounded text-sm">
                {part.filename || 'unnamed'}
              </div>
            );

          default:
            return null;
        }
      })}
    </>
  );
}

export function ChatView({
  session,
  messagesWithParts,
  queuedMessages,
  preconfigs,
  prompts,
  models,
  connectedProviderIds,
  connectableProviderIds,
  defaultModel,
  onSendMessage,
  onRemoveFromQueue,
  onChangePreconfig,
  onChangeModel,
  onChangeVariant,
  pendingPermissions,
  onPermissionResponse,
  onRename,
  usage,
  modelName,
  onNavigateToSubagent,
  onNavigateBack,
  isStreaming,
  onInterrupt,
  onRevert: _onRevert,
  onFork: _onFork,
  onCompact,
  isCompacting,
  serverUrl,
  apiToken,
  selectedVariant,
  variants,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const SCROLL_THRESHOLD = 150;

  const displayItems = mergeMessagesWithQueue(messagesWithParts, queuedMessages);

  // Scroll to bottom on initial session load and reset near-bottom state
  useEffect(() => {
    setIsNearBottom(true);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.id]);

  // Scroll to bottom when new messages arrive (only if user is near bottom)
  useEffect(() => {
    if (scrollRef.current && isNearBottom) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesWithParts, isNearBottom]);

  // Track scroll position to determine if user is near bottom
  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;

    const handleScroll = () => {
      const { scrollHeight, scrollTop, clientHeight } = viewport;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      setIsNearBottom(distanceFromBottom < SCROLL_THRESHOLD);
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  // Find orphaned permissions (not tied to a visible tool part)
  const orphanedPermissions = pendingPermissions.filter((p) => {
    return !messagesWithParts.some((mwp) =>
      mwp.parts.some(
        (part) => part.type === 'tool' && (part as ToolPart).callId === p.toolCallId
      )
    );
  });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ChatHeader
        session={session}
        preconfigs={preconfigs}
        models={models}
        defaultModel={defaultModel}
        usage={usage}
        modelName={modelName}
        onChangePreconfig={onChangePreconfig}
        onChangeModel={onChangeModel}
        onChangeVariant={onChangeVariant}
        onRename={onRename}
        onNavigateBack={onNavigateBack}
        isStreaming={isStreaming}
        onInterrupt={onInterrupt}
        onCompact={onCompact}
        isCompacting={isCompacting}
        canCompact={messagesWithParts.length >= 4}
        connectedProviderIds={connectedProviderIds}
        connectableProviderIds={connectableProviderIds}
        selectedVariant={selectedVariant}
        variants={variants}
      />

      {session.status === 'closed' && (
        <Alert className="mx-4 mt-4">
          <AlertDescription>
            This session is archived. You can reopen it from the sidebar.
          </AlertDescription>
        </Alert>
      )}

      <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
        <div className="p-4">
          {displayItems.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg mb-2">Start a conversation</p>
              <p className="text-sm">Send a message below to begin.</p>
            </div>
          ) : (
            displayItems.map((item) => {
              const compactionPart = item.parts.find(
                (p): p is CompactionPart => p.type === 'compaction'
              );

              if (compactionPart) {
                return (
                  <CompactionDivider key={item.message.id} part={compactionPart} />
                );
              }

              const canRevert = !item.isQueued && item.message.role === 'user';
              const revertMessageId = canRevert
                ? findRevertMessageId(item.message.id, messagesWithParts)
                : null;

              return (
                <MessageBubble
                  key={item.message.id}
                  message={item.message}
                  textContent={getTextContent(item.parts)}
                  isQueued={item.isQueued}
                  onRemove={item.isQueued ? () => onRemoveFromQueue(item.queueId!) : undefined}
                  canRevert={canRevert && revertMessageId !== null}
                  onRevert={revertMessageId ? () => _onRevert?.(session.id, revertMessageId) : undefined}
                  canFork={canRevert && revertMessageId !== null}
                  onFork={revertMessageId ? () => _onFork?.(session.id, item.message.id) : undefined}
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
                  />
                )}
              </MessageBubble>
            );
            })
          )}

          {orphanedPermissions.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {orphanedPermissions.map((p) => (
                <div
                  key={p.toolCallId}
                  className="p-3 bg-warning/10 border border-warning/30 rounded-lg"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">{p.toolName}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.permissionType}
                    </span>
                  </div>
                  <p className="text-sm mb-3">{p.message}</p>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPermissionResponse(p.toolCallId, false, false)}
                    >
                      Deny
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onPermissionResponse(p.toolCallId, true, false)}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {session.status === 'active' && !session.parentId && (
        <MessageInput
          onSendMessage={onSendMessage}
          disabled={isCompacting}
          workspaceId={session.workspaceId}
          serverUrl={serverUrl}
          apiToken={apiToken}
          prompts={prompts}
        />
      )}

      {session.parentId && (
        <div className="p-4 border-t border-border bg-muted/50 text-center flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" />
          This is a subagent session (read-only)
        </div>
      )}
    </div>
  );
}
