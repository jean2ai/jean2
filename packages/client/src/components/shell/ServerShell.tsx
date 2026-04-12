import { useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useParams, useRouter } from '@tanstack/react-router';

import { useServerContext } from '@/contexts/ServerContext';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import { SidebarProvider } from '@/components/ui/sidebar';

import { AppSidebar, type AppSidebarHandle } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/app';
import { AppKeyboardHandlersMount } from '@/hooks/useAppKeyboardHandlers';
import { FilesPanel, type FilesPanelHandle } from '@/components/layout/FilesPanel';
import type { MessageInputHandle } from '@/components/chat/MessageInput';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';
import { ShellContent } from './ShellContent';
import { ServerDialogs } from './ServerDialogs';
import { useServerSessionManager } from '@/hooks/useServerSessionManager';

export default function ServerShell() {
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

  const chatInputRef = useRef<MessageInputHandle>(null);
  const terminalPanelRef = useRef<TerminalPanelHandle>(null);
  const filesPanelRef = useRef<FilesPanelHandle>(null);
  const sidebarRef = useRef<AppSidebarHandle>(null);
  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const autoFollowToggleRef = useRef<{ toggle: () => void } | null>(null);

  const {
    showFilesPanel,
    filesPanelWidth,
    setSidebarViewMode,
    sessionsPanelWidth,
  } = useChatLayoutStore(useShallow((s) => ({
    showFilesPanel: s.showFilesPanel,
    filesPanelWidth: s.filesPanelWidth,
    setSidebarViewMode: s.setSidebarViewMode,
    sessionsPanelWidth: s.sessionsPanelWidth,
  })));

  const handleSidebarViewModeChange = useCallback((
    mode: 'default' | 'overview' | ((prev: 'default' | 'overview') => 'default' | 'overview')
  ) => {
    const currentMode = useChatLayoutStore.getState().sidebarViewMode;
    const resolvedMode = typeof mode === 'function' ? mode(currentMode) : mode;
    setSidebarViewMode(resolvedMode);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sidebarRef.current?.focusSessionPanel();
      });
    });
  }, [sidebarRef, setSidebarViewMode]);

  const {
    serverUrl,
    apiToken,
    sdkClient,
    currentSession,
    messagesWithParts,
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
    refreshPermissions,
    createSessionInWorkspace,
    revokePermission,
    revokeAllPermissions,
    selectWorkspace,
    handleCreateVirtualWorkspace,
    handleCreatePhysicalWorkspace,
    deleteWorkspace,
    handleLogout,
    handleRetry,
    setCompactionSuccess,
    permissions,
  } = sessionManager;

  return (
    <SidebarProvider panelId="sessions" defaultOpen={true} className="flex-col" style={{ '--sidebar-width': `${sessionsPanelWidth}px`, '--header-height': '3.5rem' } as React.CSSProperties}>
      <AppHeader
        onSidebarViewModeChange={handleSidebarViewModeChange}
      />

      <div className="flex flex-1 min-h-0">
        <AppSidebar
          ref={sidebarRef}
          onCreateSession={() => createSession(primaryPreconfigs[0]?.id)}
          onResumeSession={resumeSession}
          onCloseSession={closeSession}
          onReopenSession={reopenSession}
          onDeleteSession={permanentlyDeleteSession}
          onRenameSession={handleRenameSession}
          onSelectWorkspace={selectWorkspace}
          onCreateVirtualWorkspace={handleCreateVirtualWorkspace}
          onCreatePhysicalWorkspace={handleCreatePhysicalWorkspace}
          onDeleteWorkspace={deleteWorkspace}
          onEscape={() => {
            if (currentSession) {
              chatInputRef.current?.focus();
            }
          }}
          onCreateSessionInWorkspace={createSessionInWorkspace}
          sdkClient={sdkClient}
        />

        <ShellContent
          sdkClient={sdkClient}
          inputRef={chatInputRef}
          messagesWithParts={messagesWithParts}
          serverUrl={serverUrl}
          terminalPanelRef={terminalPanelRef}
          onRetry={handleRetry}
          onLogout={handleLogout}
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

        <FilesPanel
          ref={filesPanelRef}
          sdkClient={sdkClient}
        />

        <div
          data-panel-gap="files"
          className={`relative bg-transparent transition-[width] duration-200 ease-linear shrink-0 ${!showFilesPanel ? 'w-0' : ''}`}
          style={{ width: showFilesPanel ? filesPanelWidth : 0 }}
        />
      </div>

      <AppKeyboardHandlersMount
        sidebarRef={sidebarRef}
        terminalPanelRef={terminalPanelRef}
        filesPanelRef={filesPanelRef}
        chatInputRef={chatInputRef}
        handleInterruptSession={handleInterruptSession}
        handleSidebarViewModeChange={handleSidebarViewModeChange}
        createSession={createSession}
        onToggleAutoFollow={() => autoFollowToggleRef.current?.toggle()}
      />

      <ServerDialogs
        apiToken={apiToken}
        sdkClient={sdkClient}
        permissions={permissions}
        onLogout={handleLogout}
        onRefreshPermissions={refreshPermissions}
        onRevokePermission={revokePermission}
        onRevokeAllPermissions={revokeAllPermissions}
        onConfigurationClose={() => router.invalidate()}
      />
    </SidebarProvider>
  );
}