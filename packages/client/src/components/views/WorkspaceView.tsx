import { useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Outlet } from '@tanstack/react-router';
import { useViewRefs } from '@/contexts/ViewRefsContext';
import { useSessionManager } from '@/contexts/SessionManagerContext';
import { useSidebarData } from '@/hooks/useSidebarData';
import { useWorkspaceSessions } from '@/hooks/useWorkspaceSessions';
import { useWorkspaceTagsQuery, useInvalidateWorkspaceTags } from '@/hooks/queries';
import { useSessionStore } from '@/stores/sessionStore';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { WorkspaceHeader } from '@/components/app/WorkspaceHeader';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { WorkspaceSessionContent } from '@/components/layout/WorkspaceSessionContent';
import { PinnedMessagesPanel } from '@/components/layout/PinnedMessagesPanel';
import { AppPanels } from '@/components/app/AppPanels';
import { hasCapability } from '@/platform';
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

export default function WorkspaceView() {
  const sessionManager = useSessionManager();
  const sidebarData = useSidebarData();
  const { sidebarRef, chatInputRef, terminalPanelRef } = useViewRefs();

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
    renameWorkspace,
    updateWorkspacePaths,
    updateWorkspaceSettings,
  } = sessionManager;

  useWorkspaceSessions({
    sdkClient,
    workspaceId: sidebarData.activeWorkspace?.id ?? null,
    connected: sidebarData.connected,
  });

  // Read from store via useSidebarData — WebSocket events update the store
  const activeSessions = sidebarData.activeSessions;
  const archivedSessions = sidebarData.archivedSessions;

  // Tags
  const { data: tagsData } = useWorkspaceTagsQuery(sdkClient, sidebarData.activeWorkspace?.id ?? null);
  const allWorkspaceTags = tagsData?.tags ?? [];
  const invalidateWorkspaceTags = useInvalidateWorkspaceTags();

  const updateSession = useSessionStore(s => s.updateSession);

  const handleAddTag = useCallback(async (sessionId: string, tag: string) => {
    if (!sdkClient) return;
    const newTags = [tag];
    const { session } = await sdkClient.http.sessions.update(sessionId, { tags: newTags });
    updateSession(session);
    if (sidebarData.activeWorkspace?.id) {
      invalidateWorkspaceTags(sidebarData.activeWorkspace.id);
    }
  }, [sdkClient, sidebarData.activeWorkspace?.id, invalidateWorkspaceTags, updateSession]);

  const handleRemoveTag = useCallback(async (sessionId: string, _tag: string) => {
    if (!sdkClient) return;
    const { session } = await sdkClient.http.sessions.update(sessionId, { tags: [] });
    updateSession(session);
    if (sidebarData.activeWorkspace?.id) {
      invalidateWorkspaceTags(sidebarData.activeWorkspace.id);
    }
  }, [sdkClient, sidebarData.activeWorkspace?.id, invalidateWorkspaceTags, updateSession]);

  const sidebarHeader = (
    <SidebarHeader>
      {hasCapability('multiView') && (
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
          onRenameWorkspace={renameWorkspace}
          onUpdateWorkspacePaths={updateWorkspacePaths}
          sdkClient={sdkClient}
        />
      </div>
      )}
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
      tagGroups={sidebarData.tagGroups}
      orderedTagNames={sidebarData.orderedTagNames}
      allWorkspaceTags={allWorkspaceTags}
      onAddTag={handleAddTag}
      onRemoveTag={handleRemoveTag}
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
        {sidebarData.activeWorkspace && (
          <PinnedMessagesPanel
            sdkClient={sdkClient}
            workspaceId={sidebarData.activeWorkspace.id}
            currentSessionId={sidebarData.currentSessionId}
            onNavigateToPinnedMessage={(sessionId, messageId) => {
              resumeSession(sessionId, { targetMessageId: messageId });
            }}
          />
        )}
      </AppSidebar>

      <main
        className={hasCapability('multiView') ? 'flex-1 flex flex-col overflow-hidden min-h-0 p-2' : 'flex-1 flex flex-col overflow-hidden min-h-0'}
        style={hasCapability('multiView') ? {
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
        } : undefined}
      >
        <div className={hasCapability('multiView') ? 'flex flex-1 flex-col overflow-hidden min-h-0 rounded-xl bg-background shadow-sm ring-1 ring-border' : 'flex flex-1 flex-col overflow-hidden min-h-0 bg-background'}>
          <WorkspaceHeader
            onUpdateWorkspacePaths={updateWorkspacePaths}
            onUpdateWorkspaceSettings={updateWorkspaceSettings}
            sdkClient={sdkClient}
          />
          <Outlet />
          <AppPanels
            sdkClient={sdkClient}
            terminalPanelRef={terminalPanelRef}
          />
        </div>
      </main>
    </>
  );
}