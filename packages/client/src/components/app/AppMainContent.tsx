import { useMemo, useCallback } from 'react';
import type {
  MessageWithParts,
  AttachmentKind,
  AskResponse,
  Message,
} from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { useAskStore, type PendingAskRequest } from '@/stores/askStore';
import type { ModelInfo } from '@/handlers/serverMessage/types';
import { ConnectingState } from '@/components/shared/LoadingSkeleton';
import { OfflineState } from '@/components/shared/OfflineState';
import { ChatView } from '@/components/chat/ChatView';
import { Button } from '@/components/ui/button';
import type { MessageInputHandle } from '@/components/chat/MessageInput';
import { usePinnedMessagesQuery, usePinMessageMutation, useUnpinMessageMutation } from '@/hooks/queries';

export interface AppMainContentProps {
  serverUrl: string | null;
  sdkClient: Jean2Client | null;
  messagesWithParts: MessageWithParts[];
  inputRef: React.RefObject<MessageInputHandle | null>;
  onRetry: () => void;
  onLogout: () => void;
  onSendMessage: (content: string, attachments?: Array<{ id: string; kind: AttachmentKind }>) => void;
  onRemoveFromQueue: (queueItemId: string) => void;
  onChangePreconfig: (preconfigId: string) => void;
  onChangeModel: (modelId: string, providerId: string) => void;
  onChangeVariant: (variant: string | null) => void;
  onAskResponse: (toolCallId: string, response: AskResponse, requestId?: string) => void;
  onRename: (sessionId: string, title: string) => void;
  onNavigateToSubagent: (sessionId: string) => void;
  onNavigateBack: () => void;
  onInterrupt: () => void;
  onRevert: (sessionId: string, messageId: string) => void;
  onFork: (sessionId: string, messageId: string) => void;
  onCompact: (sessionId: string) => void;
  onClearCompactionSuccess: () => void;
  scrollToBottomRef?: React.RefObject<(() => void) | null>;
  autoFollowToggleRef?: React.RefObject<{ toggle: () => void } | null>;
  onClaimControl?: (sessionId: string) => void;
  onReleaseControl?: (sessionId: string) => void;
  onRequestTakeover?: (sessionId: string) => void;
  onRespondTakeover?: (sessionId: string, requesterClientId: string, decision: 'approve' | 'deny') => void;
}

export function AppMainContent({
  serverUrl,
  messagesWithParts,
  inputRef,
  sdkClient,
  onRetry,
  onLogout,
  onSendMessage,
  onRemoveFromQueue,
  onChangePreconfig,
  onChangeModel,
  onChangeVariant,
  onAskResponse,
  onRename,
  onNavigateToSubagent,
  onNavigateBack,
  onInterrupt,
  onRevert,
  onFork,
  onCompact,
  onClearCompactionSuccess,
  scrollToBottomRef,
  autoFollowToggleRef,
  onClaimControl,
  onReleaseControl,
  onRequestTakeover,
  onRespondTakeover,
}: AppMainContentProps) {
  // Read from stores
  const connected = useConnectionStore(s => s.connected);
  const authError = useConnectionStore(s => s.authError);
  const connectionTimedOut = useConnectionStore(s => s.connectionTimedOut);
  const retryCount = useConnectionStore(s => s.retryCount);
  const nextRetryIn = useConnectionStore(s => s.nextRetryIn);
  const streamingSessionIds = useConnectionStore(s => s.streamingSessionIds);

  const currentSession = useSessionStore(s => s.currentSession);
  const queuedMessages = useSessionStore(s => s.queuedMessages);
  const sessionUsage = useSessionStore(s => s.sessionUsage);
  const currentModel = useSessionStore(s => s.currentModel);
  const selectedVariant = useSessionStore(s => s.selectedVariant);
  const compactionSuccess = useSessionStore(s => s.compactionSuccess);

  const preconfigs = useServerDataStore(s => s.preconfigs);
  const prompts = useServerDataStore(s => s.prompts);
  const models = useServerDataStore(s => s.models) as ModelInfo[];
  const defaultModel = useServerDataStore(s => s.defaultModel);

  const pendingAskRequests = useAskStore(s => s.pendingRequests) as PendingAskRequest[];
  const navigationIntent = useSessionStore(s => s.navigationIntent);
  const clearTargetMessageIntent = useSessionStore(s => s.clearTargetMessageIntent);
  const targetMessageId = navigationIntent.mode === 'target-message' ? navigationIntent.messageId : null;

  const activeWorkspace = useServerDataStore(s => s.activeWorkspace);
  const { data: pinnedMessages } = usePinnedMessagesQuery(sdkClient, activeWorkspace?.id);
  const pinMessageMutation = usePinMessageMutation(sdkClient, activeWorkspace?.id);
  const unpinMessageMutation = useUnpinMessageMutation(sdkClient, activeWorkspace?.id);

  const pinnedMessageIds = useMemo(
    () => new Set((pinnedMessages ?? []).map(pin => pin.messageId)),
    [pinnedMessages],
  );

  const handleTogglePinMessage = useCallback((message: Message) => {
    if (!activeWorkspace || message.role !== 'assistant') return;

    if (pinnedMessageIds.has(message.id)) {
      unpinMessageMutation.mutate({ messageId: message.id });
    } else {
      pinMessageMutation.mutate({
        sessionId: message.sessionId,
        messageId: message.id,
      });
    }
  }, [activeWorkspace, pinnedMessageIds, pinMessageMutation, unpinMessageMutation]);

  const handleTargetMessageHandled = useCallback(() => {
    clearTargetMessageIntent();
  }, [clearTargetMessageIntent]);

  const primaryPreconfigs = preconfigs.filter(p => p.mode !== 'subagent');
  const isPrimarySession = !currentSession?.parentId;
  const isCompacting = currentSession?.compacting ?? false;

  const handleChangePreconfig = (preconfigId: string) => {
    onChangePreconfig(preconfigId);
  };

  const handleChangeVariant = (variant: string | null) => {
    onChangeVariant(variant);
  };

  const handleInterrupt = () => {
    onInterrupt();
  };

  if (!connected) {
    if (connectionTimedOut) {
      return (
        <div className="flex w-full h-full items-center justify-center bg-background">
          <OfflineState
            serverUrl={serverUrl!}
            authError={authError}
            retryCount={retryCount}
            nextRetryIn={nextRetryIn}
            onRetry={onRetry}
            onLogout={onLogout}
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col w-full h-full items-center justify-center bg-background gap-4">
        <ConnectingState />
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="text-muted-foreground"
        >
          Change Server
        </Button>
      </div>
    );
  }

  if (!currentSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground px-6">
        <h2 className="mb-2">Select or create a session</h2>
        <p>Choose a session from the sidebar or create a new one to start chatting.</p>
      </div>
    );
  }

  const compactable = messagesWithParts.filter(
    (m) => m.message.role !== 'system'
  );
  const canCompact = compactable.length >= 2;

  // Find the provider ID for the current model
  const currentModelInfo = models.find((m) => m.id === currentModel);

  return (
    <ChatView
      inputRef={inputRef}
      session={currentSession}
      messagesWithParts={messagesWithParts}
      queuedMessages={queuedMessages[currentSession.id] || []}
      preconfigs={isPrimarySession ? primaryPreconfigs : preconfigs}
      prompts={prompts}
      models={models}
      defaultModel={defaultModel}
      onSendMessage={onSendMessage}
      onRemoveFromQueue={onRemoveFromQueue}
      onChangePreconfig={handleChangePreconfig}
      onChangeModel={onChangeModel}
      onChangeVariant={handleChangeVariant}
      selectedVariant={selectedVariant}
      variants={currentModelInfo?.variants}
      pendingAskRequests={pendingAskRequests}
      onAskResponse={onAskResponse}
      onRename={onRename}
      usage={sessionUsage}
      modelName={currentModel}
      modelSupportsImage={currentModelInfo?.capabilities?.input?.image ?? false}
      onNavigateToSubagent={onNavigateToSubagent}
      onNavigateBack={onNavigateBack}
      isStreaming={streamingSessionIds.has(currentSession.id) || !!currentSession.runningAt}
      onInterrupt={handleInterrupt}
      onRevert={onRevert}
      onFork={onFork}
      onCompact={canCompact ? () => onCompact(currentSession.id) : undefined}
      isCompacting={isCompacting}
      compactionSuccess={compactionSuccess}
      onClearCompactionSuccess={onClearCompactionSuccess}
      serverUrl={serverUrl ?? undefined}
      sdkClient={sdkClient}
      scrollToBottomRef={scrollToBottomRef}
      autoFollowToggleRef={autoFollowToggleRef}
      onClaimControl={onClaimControl}
      onReleaseControl={onReleaseControl}
      onRequestTakeover={onRequestTakeover}
      onRespondTakeover={onRespondTakeover}
      pinnedMessageIds={pinnedMessageIds}
      onTogglePinMessage={handleTogglePinMessage}
      targetMessageId={targetMessageId}
      navigationIntent={navigationIntent}
      onTargetMessageHandled={handleTargetMessageHandled}
    />
  );
}
