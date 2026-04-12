import { useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useParams, useRouter } from '@tanstack/react-router';

import { useServerContext } from '@/contexts/ServerContext';
import { useUIStore } from '@/stores/uiStore';
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
    setShowSettings,
    setShowAddServer,
    setShowConfiguration,
    setShowMCPDialog,
    setShowWorkspacePermissions,
  } = useUIStore(
    useShallow((s) => ({
      setShowSettings: s.setShowSettings,
      setShowAddServer: s.setShowAddServer,
      setShowConfiguration: s.setShowConfiguration,
      setShowMCPDialog: s.setShowMCPDialog,
      setShowWorkspacePermissions: s.setShowWorkspacePermissions,
    })),
  );

  const {
    showFilesPanel,
    setShowFilesPanel,
    filesPanelWidth,
    setSidebarViewMode,
    sessionsPanelWidth,
  } = useChatLayoutStore(useShallow((s) => ({
    showFilesPanel: s.showFilesPanel,
    setShowFilesPanel: s.setShowFilesPanel,
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
    connected,
    authError,
    connectionTimedOut,
    retryCount,
    nextRetryIn,
    serverUrl,
    apiToken,
    sdkClient,
    currentSession,
    sessions,
    workspaceSessions,
    messagesWithParts,
    pendingPermissions,
    queuedMessages,
    sessionUsage,
    currentModel,
    selectedVariant,
    isCompacting,
    compactionSuccess,
    isPrimarySession,
    workspaces,
    activeWorkspace,
    preconfigs,
    primaryPreconfigs,
    prompts,
    models,
    defaultModel,
    streamingSessionIds,
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
    favoritedWorkspaceIds,
    setCompactionSuccess,
    permissions,
  } = sessionManager;

  return (
    <SidebarProvider panelId="sessions" defaultOpen={true} className="flex-col" style={{ '--sidebar-width': `${sessionsPanelWidth}px`, '--header-height': '3.5rem' } as React.CSSProperties}>
      <AppHeader
        onSidebarViewModeChange={handleSidebarViewModeChange}
        connected={connected}
        onOpenSettings={() => setShowSettings(true)}
        onOpenConfiguration={() => setShowConfiguration(true)}
        onOpenAddServer={() => setShowAddServer(true)}
      />

      <div className="flex flex-1 min-h-0">
        <AppSidebar
          ref={sidebarRef}
          allSessions={sessions}
          favoritedWorkspaceIds={favoritedWorkspaceIds}
          sessions={workspaceSessions}
          currentSession={currentSession}
          currentSessionId={currentSession?.id ?? null}
          streamingSessionIds={streamingSessionIds}
          connected={connected}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          activeServer={activeServer}
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
          pendingPermissions={pendingPermissions}
          sdkClient={sdkClient}
        />

        <ShellContent
          connected={connected}
          authError={authError}
          connectionTimedOut={connectionTimedOut}
          retryCount={retryCount}
          nextRetryIn={nextRetryIn}
          serverUrl={serverUrl}
          currentSession={currentSession}
          messagesWithParts={messagesWithParts}
          queuedMessages={queuedMessages}
          preconfigs={preconfigs}
          primaryPreconfigs={primaryPreconfigs}
          prompts={prompts}
          models={models}
          defaultModel={defaultModel}
          selectedVariant={selectedVariant}
          pendingPermissions={pendingPermissions}
          sessionUsage={sessionUsage}
          currentModel={currentModel}
          streamingSessionIds={streamingSessionIds}
          isCompacting={isCompacting}
          compactionSuccess={compactionSuccess}
          isPrimarySession={isPrimarySession}
          inputRef={chatInputRef}
          sdkClient={sdkClient}
          terminalPanelRef={terminalPanelRef}
          workspaceId={activeWorkspace?.id}
          workspacePath={activeWorkspace?.path}
          workspaceName={activeWorkspace?.name}
          activeWorkspace={activeWorkspace}
          onOpenMCP={() => setShowMCPDialog(true)}
          onOpenPermissions={() => setShowWorkspacePermissions(true)}
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
          workspaceId={activeWorkspace?.id}
          sdkClient={sdkClient}
          isOpen={showFilesPanel}
          onClose={() => setShowFilesPanel(false)}
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
        activeWorkspace={activeWorkspace}
        primaryPreconfigs={primaryPreconfigs}
        handleInterruptSession={handleInterruptSession}
        handleSidebarViewModeChange={handleSidebarViewModeChange}
        createSession={createSession}
        onToggleAutoFollow={() => autoFollowToggleRef.current?.toggle()}
      />

      <ServerDialogs
        apiToken={apiToken}
        sdkClient={sdkClient}
        activeWorkspace={activeWorkspace}
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