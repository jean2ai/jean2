import { useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Outlet } from '@tanstack/react-router';
import { useViewRefs } from '@/contexts/ViewRefsContext';
import { useSessionManager } from '@/contexts/SessionManagerContext';
import { useSidebarData } from '@/hooks/useSidebarData';
import { useWorkspaceSessions } from '@/hooks/useWorkspaceSessions';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { WorkspaceHeader } from '@/components/app/WorkspaceHeader';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { WorkspaceSessionContent } from '@/components/layout/WorkspaceSessionContent';
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

export default function WorkspaceView() {
  const sessionManager = useSessionManager();
  const sidebarData = useSidebarData();
  const { sidebarRef, chatInputRef } = useViewRefs();

  const {
    sdkClient,
    primaryPreconfigs,
    createSession,
    resumeSession,
    closeSession,
    reopenSession,
    permanentlyDeleteSession,
    handleRenameSession,
    selectWorkspace,
    handleCreateVirtualWorkspace,
    handleCreatePhysicalWorkspace,
    deleteWorkspace,
  } = sessionManager;

  useWorkspaceSessions({
    sdkClient,
    workspaceId: sidebarData.activeWorkspace?.id ?? null,
    connected: sidebarData.connected,
  });

  // Read from store via useSidebarData — WebSocket events update the store
  const activeSessions = sidebarData.activeSessions;
  const archivedSessions = sidebarData.archivedSessions;

  const sidebarHeader = (
    <SidebarHeader>
      <div className="p-2 space-y-2">
        <WorkspaceSwitcher
          workspaces={sidebarData.workspaces}
          activeWorkspace={sidebarData.activeWorkspace}
          onSelectWorkspace={selectWorkspace}
          onCreateVirtualWorkspace={handleCreateVirtualWorkspace}
          onCreatePhysicalWorkspace={handleCreatePhysicalWorkspace}
          isWorkspaceFavorited={sidebarData.isWorkspaceFavorited}
          onToggleFavorite={sidebarData.handleToggleWorkspaceFavorite}
          onDeleteWorkspace={deleteWorkspace}
          sdkClient={sdkClient}
        />
      </div>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => createSession(primaryPreconfigs[0]?.id)}
            disabled={!sidebarData.connected}
            className="w-full"
          >
            <Plus className="size-4" data-icon="inline-start" />
            <span>New Chat</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );

  const handleBulkCloseSessions = useCallback((sessionIds: Set<string>) => {
    sessionIds.forEach(id => closeSession(id));
  }, [closeSession]);

  const handleBulkDeleteSessions = useCallback((sessionIds: Set<string>) => {
    sessionIds.forEach(id => permanentlyDeleteSession(id));
  }, [permanentlyDeleteSession]);

  const sidebarContent = (
    <WorkspaceSessionContent
      activeSessions={activeSessions}
      archivedSessions={archivedSessions}
      childrenMap={sidebarData.childrenMap}
      sessionDerivedValues={sidebarData.sessionDerivedValues}
      currentSessionId={sidebarData.currentSessionId}
      onResumeSession={resumeSession}
      onCloseSession={closeSession}
      onReopenSession={reopenSession}
      onDeleteSession={permanentlyDeleteSession}
      onRenameSession={handleRenameSession}
      onBulkCloseSessions={handleBulkCloseSessions}
      onBulkDeleteSessions={handleBulkDeleteSessions}
    />
  );

  return (
    <>
      <AppSidebar
        ref={sidebarRef}
        header={sidebarHeader}
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
        className="flex-1 flex flex-col overflow-hidden min-h-0"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0)',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        }}
      >
        <WorkspaceHeader />
        <Outlet />
      </main>
    </>
  );
}
