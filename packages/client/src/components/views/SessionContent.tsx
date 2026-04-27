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
    compactSession,
    removeFromQueue,
    sendChatMessage,
    handlePermissionResponse,
    handleAskUserResponse,
    handleInterruptSession,
    updateSessionPreconfig,
    updateSessionModel,
    updateSessionVariant,
    handleNavigateBack,
    handleRenameSession,
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
      onChangePreconfig={updateSessionPreconfig}
      onChangeModel={updateSessionModel}
      onChangeVariant={updateSessionVariant}
      onPermissionResponse={handlePermissionResponse}
      onAskUserResponse={handleAskUserResponse}
      onRename={handleRenameSession}
      onNavigateToSubagent={resumeSession}
      onNavigateBack={handleNavigateBack}
      onInterrupt={handleInterruptSession}
      onRevert={revertSession}
      onFork={forkSession}
      onCompact={compactSession}
      onClearCompactionSuccess={() => setCompactionSuccess(false)}
      scrollToBottomRef={scrollToBottomRef}
      autoFollowToggleRef={autoFollowToggleRef}
    />
  );
}