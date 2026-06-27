import { useCallback } from 'react';
import { Outlet } from '@tanstack/react-router';
import { useViewRefs } from '@/contexts/ViewRefsContext';
import { useSessionManager } from '@/contexts/SessionManagerContext';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { WorkspaceHeader } from '@/components/app/WorkspaceHeader';
import { AppPanels } from '@/components/app/AppPanels';
import { useSidebarData } from '@/hooks/useSidebarData';
import { useOverviewSessions } from '@/hooks/useOverviewSessions';
import { useInvalidateWorkspaceTags } from '@/hooks/queries';
import { useSessionStore } from '@/stores/sessionStore';
import { WorkspaceOverview } from '@/components/layout/WorkspaceOverview';

export default function OverviewView() {
  const sessionManager = useSessionManager();
  const sidebarData = useSidebarData();
  const { sidebarRef, chatInputRef, terminalPanelRef } = useViewRefs();
  const updateSession = useSessionStore(s => s.updateSession);
  const invalidateWorkspaceTags = useInvalidateWorkspaceTags();

  const {
    sessionsByWorkspace,
    tagGroupsByWorkspace,
    orderedTagNamesByWorkspace,
    allWorkspaceTagsByWorkspace,
  } = useOverviewSessions({
    sdkClient: sessionManager.sdkClient,
    workspaceIds: sidebarData.favoritedWorkspaceIds,
    connected: sidebarData.connected,
  });

  const {
    sdkClient,
    resumeSession,
    closeSession,
    reopenSession,
    permanentlyDeleteSession,
    handleRenameSession,
    regenerateSessionTitle,
    createSessionInWorkspace,
  } = sessionManager;

  const handleAddTag = useCallback(async (sessionId: string, tag: string) => {
    if (!sdkClient) return;
    const newTags = [tag];
    const { session } = await sdkClient.http.sessions.update(sessionId, { tags: newTags });
    updateSession(session);
    invalidateWorkspaceTags(session.workspaceId);
  }, [sdkClient, updateSession, invalidateWorkspaceTags]);

  const handleRemoveTag = useCallback(async (sessionId: string, _tag: string) => {
    if (!sdkClient) return;
    const { session } = await sdkClient.http.sessions.update(sessionId, { tags: [] });
    updateSession(session);
    invalidateWorkspaceTags(session.workspaceId);
  }, [sdkClient, updateSession, invalidateWorkspaceTags]);

  const sidebarContent = (
    <WorkspaceOverview
      sessionsByWorkspace={sessionsByWorkspace}
      tagGroupsByWorkspace={tagGroupsByWorkspace}
      orderedTagNamesByWorkspace={orderedTagNamesByWorkspace}
      allWorkspaceTagsByWorkspace={allWorkspaceTagsByWorkspace}
      childrenMap={sidebarData.childrenMap}
      sessionDerivedValues={sidebarData.sessionDerivedValues}
      currentSession={sidebarData.currentSession}
      currentSessionId={sidebarData.currentSessionId}
      favoritedWorkspaceIds={sidebarData.favoritedWorkspaceIds}
      workspaces={sidebarData.workspaces}
      activeWorkspace={sidebarData.activeWorkspace}
      onResumeSession={resumeSession}
      onCloseSession={closeSession}
      onReopenSession={reopenSession}
      onDeleteSession={permanentlyDeleteSession}
      onRenameSession={handleRenameSession}
      onRegenerateSessionTitle={regenerateSessionTitle}
      onCreateSessionInWorkspace={createSessionInWorkspace}
      onAddTag={handleAddTag}
      onRemoveTag={handleRemoveTag}
      connected={sidebarData.connected}
    />
  );

  return (
    <>
      <AppSidebar
        ref={sidebarRef}
        currentSessionId={sidebarData.currentSessionId}
        onEscape={() => {
          if (sidebarData.currentSessionId) {
            chatInputRef.current?.focus();
          }
        }}
      >
        {sidebarContent}
      </AppSidebar>

      <main
        className="flex-1 flex flex-col overflow-hidden min-h-0 p-2"
        style={{
          // AppHeader already handles safe-area-inset-top — don't double-count it
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden min-h-0 rounded-xl bg-background shadow-sm ring-1 ring-border">
          <WorkspaceHeader />
          <Outlet />
          <AppPanels
            sdkClient={sessionManager.sdkClient}
            terminalPanelRef={terminalPanelRef}
          />
        </div>
      </main>
    </>
  );
}
