import { useMemo } from 'react';
import type { Part } from '@jean2/sdk';
import { useViewRefs } from '@/contexts/ViewRefsContext';
import { useSessionManager } from '@/contexts/SessionManagerContext';
import { AppMainContent } from '@/components/app/AppMainContent';
import { ChatLoadingState } from '@/components/shared/LoadingSkeleton';
import { useSessionStore } from '@/stores/sessionStore';

const EMPTY_PARTS: Part[] = [];

export default function SessionContent() {
  const sessionManager = useSessionManager();
  const { chatInputRef, scrollToBottomRef, autoFollowToggleRef } = useViewRefs();

  const {
    sdkClient,
    serverUrl,
    currentSession,
    isSessionLoading,
    resumeSession,
    revertSession,
    forkSession,
    editMessage,
    compactSession,
    removeFromQueue,
    sendChatMessage,
    handleAskResponse,
    handleInterruptSession,
    setCompactionSuccess,
  } = sessionManager;

  const activeSessionMessages = useSessionStore((state) =>
    currentSession ? state.messagesBySession[currentSession.id] : undefined,
  );
  const activeSessionParts = useSessionStore((state) =>
    currentSession ? state.partsBySession[currentSession.id] : undefined,
  );
  const messagesWithParts = useMemo(
    () => (activeSessionMessages ?? []).map((message) => ({
      message,
      parts: activeSessionParts?.[message.id] ?? EMPTY_PARTS,
    })),
    [activeSessionMessages, activeSessionParts],
  );

  if (isSessionLoading) {
    return <ChatLoadingState />;
  }

  if (!currentSession) {
    return null;
  }

  return (
    <AppMainContent
      sdkClient={sdkClient}
      inputRef={chatInputRef}
      messagesWithParts={messagesWithParts}
      serverUrl={serverUrl}
      onRetry={sessionManager.handleRetry}
      onLogout={sessionManager.handleLogout}
      onSendMessage={sendChatMessage}
      onRemoveFromQueue={removeFromQueue}
      onAskResponse={handleAskResponse}
      onNavigateToSubagent={resumeSession}
      onInterrupt={handleInterruptSession}
      onRevert={revertSession}
      onFork={forkSession}
      onEditMessage={editMessage}
      onCompact={compactSession}
      onClearCompactionSuccess={() => setCompactionSuccess(false)}
      scrollToBottomRef={scrollToBottomRef}
      autoFollowToggleRef={autoFollowToggleRef}
    />
  );
}