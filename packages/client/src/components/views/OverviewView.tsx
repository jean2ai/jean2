import { useViewRefs } from '@/contexts/ViewRefsContext';
import { useSessionManager } from '@/contexts/SessionManagerContext';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { WorkspaceHeader } from '@/components/app/WorkspaceHeader';
import { AppMainContent } from '@/components/app/AppMainContent';
import { AppPanels } from '@/components/app/AppPanels';
import { useSidebarData } from '@/hooks/useSidebarData';
import { WorkspaceOverview } from '@/components/layout/WorkspaceOverview';

export default function OverviewView() {
  const sessionManager = useSessionManager();
  const sidebarData = useSidebarData();

  const { sidebarRef, chatInputRef, terminalPanelRef, scrollToBottomRef, autoFollowToggleRef } = useViewRefs();

  const {
    sdkClient,
    messagesWithParts,
    serverUrl,
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

  const sidebarContent = (
    <WorkspaceOverview
      allSessions={sidebarData.allSessions}
      childrenMap={sidebarData.childrenMap}
      sessionDerivedValues={sidebarData.sessionDerivedValues}
      currentSession={sidebarData.currentSession}
      currentSessionId={sidebarData.currentSessionId}
      favoritedWorkspaceIds={sidebarData.favoritedWorkspaceIds}
      workspaces={sidebarData.workspaces}
      activeWorkspace={sidebarData.activeWorkspace}
      onSelectWorkspace={sessionManager.selectWorkspace}
      onResumeSession={resumeSession}
      onCloseSession={closeSession}
      onReopenSession={reopenSession}
      onDeleteSession={permanentlyDeleteSession}
      onRenameSession={handleRenameSession}
      onCreateSessionInWorkspace={createSessionInWorkspace}
      connected={sidebarData.connected}
    />
  );

  return (
    <>
      <AppSidebar
        ref={sidebarRef}
        currentSessionId={sidebarData.currentSessionId}
        onEscape={() => {
          if (currentSession) {
            chatInputRef.current?.focus();
          }
        }}
      >
        {sidebarContent}
      </AppSidebar>

      <main className="flex-1 flex flex-col overflow-hidden min-h-0" style={{
        paddingTop: 'env(safe-area-inset-top, 0)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}>
        <WorkspaceHeader />
        {currentSession ? (
          <>
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
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground px-6">
            <h2 className="mb-2 text-lg font-medium">Overview</h2>
            <p className="text-sm">Select a session from the sidebar to start working.</p>
          </div>
        )}
      </main>
    </>
  );
}
