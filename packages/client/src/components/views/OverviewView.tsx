import { Outlet } from '@tanstack/react-router';
import { useViewRefs } from '@/contexts/ViewRefsContext';
import { useSessionManager } from '@/contexts/SessionManagerContext';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { WorkspaceHeader } from '@/components/app/WorkspaceHeader';
import { useSidebarData } from '@/hooks/useSidebarData';
import { useOverviewSessions } from '@/hooks/useOverviewSessions';
import { WorkspaceOverview } from '@/components/layout/WorkspaceOverview';

export default function OverviewView() {
  const sessionManager = useSessionManager();
  const sidebarData = useSidebarData();
  const { sidebarRef, chatInputRef } = useViewRefs();

  const { sessionsByWorkspace } = useOverviewSessions({
    sdkClient: sessionManager.sdkClient,
    workspaceIds: sidebarData.favoritedWorkspaceIds,
    connected: sidebarData.connected,
  });

  const {
    resumeSession,
    closeSession,
    reopenSession,
    permanentlyDeleteSession,
    handleRenameSession,
    createSessionInWorkspace,
  } = sessionManager;

  const sidebarContent = (
    <WorkspaceOverview
      sessionsByWorkspace={sessionsByWorkspace}
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
          if (sidebarData.currentSessionId) {
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
        <Outlet />
      </main>
    </>
  );
}
