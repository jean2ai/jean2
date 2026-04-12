import { useParams, useRouter } from '@tanstack/react-router';

import { useServerContext } from '@/contexts/ServerContext';
import { useViewRefs } from '@/contexts/ViewRefsContext';
import { useServerSessionManager } from '@/hooks/useServerSessionManager';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppMainContent } from '@/components/app/AppMainContent';
import { AppPanels } from '@/components/app/AppPanels';
import { WorkspaceHeader } from '@/components/app/WorkspaceHeader';

export default function WorkspaceView() {
  const router = useRouter();
  const params = useParams({ from: '/server/$serverId', strict: false } as unknown as Parameters<typeof useParams>[0]);
  const serverId = params.serverId;

  const {
    servers,
    removeFromQuickConnectionsByWorkspace,
    quickConnections,
  } = useServerContext();

  const activeServer = servers.find(s => s.id === serverId) ?? null;

  const sessionManager = useServerSessionManager({
    serverId,
    activeServer,
    navigate: (opts: { to: string }) => router.navigate({ to: opts.to }),
    removeFromQuickConnectionsByWorkspace,
    quickConnections,
  });

  const { sidebarRef, chatInputRef, terminalPanelRef, scrollToBottomRef, autoFollowToggleRef } = useViewRefs();

  const {
    sdkClient,
    messagesWithParts,
    serverUrl,
    primaryPreconfigs,
    createSession,
    resumeSession,
    closeSession,
    reopenSession,
    permanentlyDeleteSession,
    handleRenameSession,
    revertSession,
    forkSession,
    compactSession,
    removeFromQueue,
    sendChatMessage,
    handlePermissionResponse,
    handleInterruptSession,
    updateSessionPreconfig,
    updateSessionModel,
    updateSessionVariant,
    handleNavigateBack,
    createSessionInWorkspace,
    currentSession,
    setCompactionSuccess,
  } = sessionManager;

  return (
    <>
      <AppSidebar
        ref={sidebarRef}
        mode="workspace"
        onCreateSession={() => createSession(primaryPreconfigs[0]?.id)}
        onResumeSession={resumeSession}
        onCloseSession={closeSession}
        onReopenSession={reopenSession}
        onDeleteSession={permanentlyDeleteSession}
        onRenameSession={handleRenameSession}
        onSelectWorkspace={sessionManager.selectWorkspace}
        onCreateVirtualWorkspace={sessionManager.handleCreateVirtualWorkspace}
        onCreatePhysicalWorkspace={sessionManager.handleCreatePhysicalWorkspace}
        onDeleteWorkspace={sessionManager.deleteWorkspace}
        onEscape={() => {
          if (currentSession) {
            chatInputRef.current?.focus();
          }
        }}
        onCreateSessionInWorkspace={createSessionInWorkspace}
        sdkClient={sdkClient}
      />

      <main className="flex-1 flex flex-col overflow-hidden min-h-0" style={{
        paddingTop: 'env(safe-area-inset-top, 0)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}>
        <WorkspaceHeader />
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
        <AppPanels
          sdkClient={sdkClient}
          terminalPanelRef={terminalPanelRef}
        />
      </main>
    </>
  );
}
