import { useViewRefs } from '@/contexts/ViewRefsContext';
import { useSessionManager } from '@/contexts/SessionManagerContext';
import { AppMainContent } from '@/components/app/AppMainContent';
import { ChatLoadingState } from '@/components/shared/LoadingSkeleton';

export default function SessionContent() {
  const sessionManager = useSessionManager();
  const { chatInputRef, scrollToBottomRef, autoFollowToggleRef } = useViewRefs();

  const {
    sdkClient,
    messagesWithParts,
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