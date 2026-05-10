import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Lock, Eye, ArrowDown, ShieldOff, Wifi } from 'lucide-react';
import type { Jean2Client } from '@jean2/sdk';
import type { Session, Preconfig, MessageWithParts, QueuedMessage, AttachmentKind, AskResponse } from '@jean2/sdk';
import { ChatHeader } from './ChatHeader';
import { MessageInput } from './MessageInput';
import type { MessageInputHandle } from './MessageInput';
import { VirtualizedTranscript } from './VirtualizedTranscript';
import type { PendingAskRequest } from '@/stores/askStore';
import { useSessionControlStore, type ActionRejection } from '@/stores/sessionControlStore';
import { useClientIdentityStore } from '@/stores/clientIdentityStore';

export interface Model {
  id: string;
  name: string;
  contextWindow: number;
  tier: 'budget' | 'standard' | 'premium';
  providerId: string;
  providerName: string;
  capabilities?: {
    input?: {
      text?: boolean;
      image?: boolean;
      video?: boolean;
      file?: boolean;
    };
  };
}

export interface DisplayItem {
  message: import('@jean2/sdk').Message;
  parts: import('@jean2/sdk').Part[];
  isQueued?: boolean;
  queueId?: string;
}

interface ChatViewProps {
  session: Session;
  messagesWithParts: MessageWithParts[];
  queuedMessages: QueuedMessage[];
  preconfigs: Preconfig[];
  prompts?: import('@jean2/sdk').PromptInfo[];
  models: Model[];
  defaultModel: string;
  onSendMessage: (content: string, attachments?: Array<{ id: string; kind: AttachmentKind }>) => void;
  onRemoveFromQueue: (queueId: string) => void;
  onChangePreconfig: (preconfigId: string) => void;
  onChangeModel: (modelId: string, providerId: string) => void;
  onChangeVariant: (variant: string | null) => void;
  pendingAskRequests: PendingAskRequest[];
  onAskResponse: (toolCallId: string, response: AskResponse, requestId?: string) => void;
  onRename: (sessionId: string, title: string) => void;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  modelName: string;
  modelSupportsImage?: boolean;
  onNavigateToSubagent?: (sessionId: string) => void;
  onNavigateBack?: () => void;
  isStreaming?: boolean;
  onInterrupt?: () => void;
  onRevert?: (sessionId: string, stepPartId: string) => void;
  onFork?: (sessionId: string, messageId: string) => void;
  onCompact?: () => void;
  isCompacting?: boolean;
  compactionSuccess?: boolean;
  onClearCompactionSuccess?: () => void;
  serverUrl?: string;
  sdkClient?: Jean2Client | null;
  selectedVariant: string | null;
  variants?: Record<string, { providerOptions: Record<string, unknown> }>;
  inputRef?: React.RefObject<MessageInputHandle | null>;
  scrollToBottomRef?: React.RefObject<(() => void) | null>;
  autoFollowToggleRef?: React.RefObject<{ toggle: () => void } | null>;
  onClaimControl?: (sessionId: string) => void;
  onReleaseControl?: (sessionId: string) => void;
  onRequestTakeover?: (sessionId: string) => void;
  onRespondTakeover?: (sessionId: string, requesterClientId: string, decision: 'approve' | 'deny') => void;
}

function mergeMessagesWithQueue(
  messagesWithParts: MessageWithParts[],
  queuedMessages: QueuedMessage[],
  getUrl: (sessionId: string, attachmentId: string, key: string) => string
): DisplayItem[] {
  const regularItems: DisplayItem[] = messagesWithParts.map(mwp => ({
    message: mwp.message,
    parts: mwp.parts,
    isQueued: false,
  }));

  const queuedItems: DisplayItem[] = queuedMessages.map(qm => {
    const attachmentParts = (qm.attachments || []).map(att => {
      const url = getUrl(qm.sessionId, att.id, att.accessKey ?? '');
      if (att.kind === 'image') {
        return {
          id: `${qm.id}-att-${att.id}`,
          messageId: qm.id,
          createdAt: qm.createdAt,
          type: 'image' as const,
          url,
          mimeType: att.mimeType,
        };
      }
      return {
        id: `${qm.id}-att-${att.id}`,
        messageId: qm.id,
        createdAt: qm.createdAt,
        type: 'file' as const,
        url,
        mimeType: att.mimeType || '',
        filename: att.filename,
      };
    });

    return {
      message: {
        id: qm.id,
        role: 'user' as const,
        sessionId: qm.sessionId,
        createdAt: qm.createdAt,
      },
      parts: [
        ...attachmentParts,
        ...(qm.content.trim() ? [{
          id: `${qm.id}-part`,
          messageId: qm.id,
          createdAt: qm.createdAt,
          type: 'text' as const,
          text: qm.content,
        }] : []),
      ],
      isQueued: true,
      queueId: qm.id,
    };
  });

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

export function ChatView({
  session,
  messagesWithParts,
  queuedMessages,
  preconfigs,
  prompts,
  models,
  defaultModel,
  onSendMessage,
  onRemoveFromQueue,
  onChangePreconfig,
  onChangeModel,
  onChangeVariant,
  pendingAskRequests,
  onAskResponse,
  onRename,
  usage,
  modelName,
  modelSupportsImage,
  onNavigateToSubagent,
  onNavigateBack,
  isStreaming,
  onInterrupt,
  onRevert: _onRevert,
  onFork: _onFork,
  onCompact,
  isCompacting,
  compactionSuccess,
  onClearCompactionSuccess,
  serverUrl,
  sdkClient,
  selectedVariant,
  variants,
  inputRef,
  scrollToBottomRef,
  autoFollowToggleRef,
  onClaimControl,
  onReleaseControl,
  onRequestTakeover,
  onRespondTakeover,
}: ChatViewProps) {
  const isPrimarySession = !session.parentId;
  const isMainActiveSession = isPrimarySession && session.status === 'active';

  const controlState = useSessionControlStore((s) => s.controlBySessionId[session.id]);
  const myClientId = useClientIdentityStore((s) => s.clientId);
  const isObserver = controlState?.status === 'controlled' && controlState.controllerClientId !== myClientId;
  const isInGrace = controlState?.status === 'grace';
  const isInputDisabled = isObserver || isInGrace;

  const [rejectionNotice, setRejectionNotice] = useState<string | null>(null);
  const rejectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showRejectionNotice = useCallback((message: string) => {
    if (rejectionTimerRef.current) {
      clearTimeout(rejectionTimerRef.current);
    }
    setRejectionNotice(message);
    rejectionTimerRef.current = setTimeout(() => {
      setRejectionNotice(null);
      rejectionTimerRef.current = null;
    }, 4_000);
  }, []);

  useEffect(() => {
    return () => {
      if (rejectionTimerRef.current) {
        clearTimeout(rejectionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let lastRejection: ActionRejection | null = null;
    const unsub = useSessionControlStore.subscribe((state) => {
      if (state.lastActionRejection !== lastRejection) {
        lastRejection = state.lastActionRejection;
        if (lastRejection && lastRejection.sessionId === session.id) {
          showRejectionNotice(lastRejection.message);
        }
      }
    });
    return unsub;
  }, [session.id, showRejectionNotice]);

  const [autoFollow, setAutoFollow] = useState(true);

  const handleToggleAutoFollow = useCallback(() => {
    setAutoFollow((prev) => {
      const newValue = !prev;
      if (newValue) {
        scrollToBottomRef?.current?.();
      }
      return newValue;
    });
  }, [scrollToBottomRef]);

  // Expose toggle function via ref for keyboard shortcuts
  useEffect(() => {
    if (autoFollowToggleRef) {
      autoFollowToggleRef.current = {
        toggle: () => {
          handleToggleAutoFollow();
        },
      };
    }
  }, [autoFollowToggleRef, handleToggleAutoFollow]);

  const displayItems = useMemo(
    () => mergeMessagesWithQueue(
      messagesWithParts,
      queuedMessages,
      sdkClient?.http.attachments.getUrl ?? ((sessionId, attachmentId, key) =>
        `/api/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}/content?key=${encodeURIComponent(key)}`
      )
    ),
    [messagesWithParts, queuedMessages, sdkClient]
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
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
        canCompact={messagesWithParts.length >= 2}
        selectedVariant={selectedVariant}
        variants={variants}
        onClaimControl={onClaimControl}
        onReleaseControl={onReleaseControl}
        onRequestTakeover={onRequestTakeover}
        onRespondTakeover={onRespondTakeover}
      />

      {/* Transcript area with floating auto-follow button */}
      <div className="relative flex flex-col flex-1 min-h-0">
        {/* Virtualized transcript - handles scrolling for messages only */}
        <VirtualizedTranscript
          displayItems={displayItems}
          messagesWithParts={messagesWithParts}
          sessionId={session.id}
          sessionStatus={session.status}
          pendingAskRequests={pendingAskRequests}
          isCompacting={isCompacting}
          compactionSuccess={compactionSuccess}
          onClearCompactionSuccess={onClearCompactionSuccess}
          onAskResponse={onAskResponse}
          onNavigateToSubagent={onNavigateToSubagent}
          onRemoveFromQueue={onRemoveFromQueue}
          onRevert={_onRevert}
          onFork={_onFork}
          onCompact={onCompact}
          isMainActiveSession={isMainActiveSession}
          autoFollow={autoFollow}
          onAutoScrollChange={setAutoFollow}
          scrollToBottomRef={scrollToBottomRef}
          serverUrl={serverUrl}
        />

        {/* Floating auto-follow toggle button - positioned within transcript area */}
        <button
          onClick={handleToggleAutoFollow}
          className="absolute bottom-4 right-4 z-50 flex items-center p-1.5 text-xs rounded-full transition-colors cursor-pointer bg-background/80 backdrop-blur-sm hover:bg-background border border-border/50 shadow-sm pointer-events-auto"
          title={autoFollow ? 'Auto-follow enabled (Cmd+Shift+F)' : 'Auto-follow disabled (Cmd+Shift+F)'}
        >
          {autoFollow ? (
            <ArrowDown className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
        </button>
      </div>

      {session.status === 'active' && !session.parentId && (
        <MessageInput
          ref={inputRef}
          onSendMessage={onSendMessage}
          disabled={isCompacting || isInputDisabled}
          workspaceId={session.workspaceId}
          sdkClient={sdkClient}
          prompts={prompts}
          sessionId={session.id}
          modelSupportsImage={modelSupportsImage}
        />
      )}

      {session.parentId && (
        <div className="p-4 border-t border-border bg-muted/50 text-center flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" />
          This is a subagent session (read-only)
        </div>
      )}

      {isObserver && (
        <div className="px-4 py-2 border-t border-border bg-muted/30 text-center flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldOff className="size-3.5" />
          You are observing this session. Input is disabled.
        </div>
      )}

      {isInGrace && (
        <div className="px-4 py-2 border-t border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/30 text-center flex items-center justify-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
          <Wifi className="size-3.5" />
          Reconnecting to session… waiting for control to be restored.
        </div>
      )}

      {rejectionNotice && (
        <div className="px-4 py-2 border-t border-orange-500/30 bg-orange-50 dark:bg-orange-950/30 text-center flex items-center justify-center gap-2 text-xs text-orange-600 dark:text-orange-400">
          <ShieldOff className="size-3.5" />
          {rejectionNotice}
        </div>
      )}
    </div>
  );
}
