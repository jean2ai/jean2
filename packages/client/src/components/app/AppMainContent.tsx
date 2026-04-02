import { useMemo } from 'react';
import type {
  Session,
  MessageWithParts,
  Preconfig,
  PromptInfo,
  ProviderStatus,
  QueuedMessage,
  SavedServer,
} from '@jean2/shared';
import type { PendingPermissionRequest } from '@/stores/sessionMetaStore';
import type { ModelInfo } from '@/handlers/serverMessage/types';
import { ConnectingState } from '@/components/shared/LoadingSkeleton';
import { OfflineState } from '@/components/shared/OfflineState';
import FirstServerScreen from '@/components/FirstServerScreen';
import { ChatView } from '@/components/chat/ChatView';
import { Button } from '@/components/ui/button';
import type { MessageInputHandle } from '@/components/chat/MessageInput';

export interface AppMainContentProps {
  servers: SavedServer[];
  activeServer: SavedServer | null;
  isSwitching: boolean;
  connected: boolean;
  authError: string | null;
  connectionTimedOut: boolean;
  retryCount: number;
  nextRetryIn: number;
  serverUrl: string | null;
  currentSession: Session | null;
  messagesWithParts: MessageWithParts[];
  queuedMessages: Record<string, QueuedMessage[]>;
  preconfigs: Preconfig[];
  primaryPreconfigs: Preconfig[];
  prompts: PromptInfo[];
  models: ModelInfo[];
  providerStatuses: ProviderStatus[];
  defaultModel: string;
  selectedVariant: string | null;
  pendingPermissions: PendingPermissionRequest[];
  sessionUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  currentModel: string;
  streamingSessionIds: Set<string>;
  isCompacting: boolean;
  compactionSuccess: boolean;
  isPrimarySession: boolean;
  inputRef: React.RefObject<MessageInputHandle | null>;
  apiToken: string | null;
  onFirstServerAdded: (server: SavedServer) => void;
  onRetry: () => void;
  onLogout: () => void;
  onSendMessage: (content: string) => void;
  onRemoveFromQueue: (queueItemId: string) => void;
  onChangePreconfig: (preconfigId: string) => void;
  onChangeModel: (modelId: string, providerId: string) => void;
  onChangeVariant: (variant: string | null) => void;
  onPermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  onRename: (sessionId: string, title: string) => void;
  onNavigateToSubagent: (sessionId: string) => void;
  onNavigateBack: () => void;
  onInterrupt: () => void;
  onRevert: (sessionId: string, messageId: string) => void;
  onFork: (sessionId: string, messageId: string) => void;
  onCompact: (sessionId: string) => void;
  onClearCompactionSuccess: () => void;
}

export function AppMainContent({
  servers,
  activeServer,
  isSwitching,
  connected,
  authError,
  connectionTimedOut,
  retryCount,
  nextRetryIn,
  serverUrl,
  currentSession,
  messagesWithParts,
  queuedMessages,
  preconfigs,
  primaryPreconfigs,
  prompts,
  models,
  providerStatuses,
  defaultModel,
  selectedVariant,
  pendingPermissions,
  sessionUsage,
  currentModel,
  streamingSessionIds,
  isCompacting,
  compactionSuccess,
  isPrimarySession,
  inputRef,
  apiToken,
  onFirstServerAdded,
  onRetry,
  onLogout,
  onSendMessage,
  onRemoveFromQueue,
  onChangePreconfig,
  onChangeModel,
  onChangeVariant,
  onPermissionResponse,
  onRename,
  onNavigateToSubagent,
  onNavigateBack,
  onInterrupt,
  onRevert,
  onFork,
  onCompact,
  onClearCompactionSuccess,
}: AppMainContentProps) {
  const connectedProviderIds = useMemo(
    () => new Set(providerStatuses.filter((s) => s.connected).map((s) => s.provider)),
    [providerStatuses]
  );

  const connectableProviderIds = useMemo(
    () => new Set(providerStatuses.filter((s) => s.connectable).map((s) => s.provider)),
    [providerStatuses]
  );

  const isLoggedIn = !!(activeServer);

  const handleChangePreconfig = (preconfigId: string) => {
    onChangePreconfig(preconfigId);
  };

  const handleChangeVariant = (variant: string | null) => {
    onChangeVariant(variant);
  };

  const handleInterrupt = () => {
    onInterrupt();
  };

  if (servers.length === 0) {
    return (
      <FirstServerScreen
        onServerAdded={onFirstServerAdded}
        error={authError || undefined}
      />
    );
  }

  if (!isLoggedIn) {
    return (
      <FirstServerScreen
        onServerAdded={onFirstServerAdded}
        error={authError || undefined}
      />
    );
  }

  if (isSwitching) {
    return (
      <div className="flex flex-col w-full h-full items-center justify-center bg-background gap-4">
        <ConnectingState message={`Connecting to ${activeServer?.name || 'server'}...`} />
      </div>
    );
  }

  if (!connected && servers.length > 0) {
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
  const canCompact = compactable.length >= 4;

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
      connectedProviderIds={connectedProviderIds}
      connectableProviderIds={connectableProviderIds}
      defaultModel={defaultModel}
      onSendMessage={onSendMessage}
      onRemoveFromQueue={onRemoveFromQueue}
      onChangePreconfig={handleChangePreconfig}
      onChangeModel={onChangeModel}
      onChangeVariant={handleChangeVariant}
      selectedVariant={selectedVariant}
      variants={currentModelInfo?.variants}
      pendingPermissions={pendingPermissions}
      onPermissionResponse={onPermissionResponse}
      onRename={onRename}
      usage={sessionUsage}
      modelName={currentModel}
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
      apiToken={apiToken ?? undefined}
    />
  );
}
