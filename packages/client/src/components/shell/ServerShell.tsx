import { useMemo, useRef, useState } from 'react';
import { useParams, useRouter, Outlet } from '@tanstack/react-router';
import { useShallow } from 'zustand/react/shallow';

import { useServerContext } from '@/contexts/ServerContext';
import { ViewRefsContext } from '@/contexts/ViewRefsContext';
import { SessionManagerContext } from '@/contexts/SessionManagerContext';
import { ServerClientProvider, useServerClientMemo } from '@/contexts/ServerClientContext';
import { SessionCommandsProvider } from '@/contexts/SessionCommandsContext';
import {
  SessionPaneRegistryContext,
  type SessionPaneHandle,
  type SessionPaneRegistry,
} from '@/contexts/SessionPaneRegistryContext';
import { useServerSessionManager } from '@/hooks/useServerSessionManager';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import { platform } from '@/platform';
import { SidebarProvider } from '@/components/ui/sidebar';

import { AppHeader } from '@/components/app/AppHeader';
import { AppKeyboardHandlersMount } from '@/hooks/useAppKeyboardHandlers';
import { FilesPanel, type FilesPanelHandle } from '@/components/layout/FilesPanel';
import type { MessageInputHandle } from '@/components/chat/MessageInput';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';
import type { AppSidebarHandle } from '@/components/layout/AppSidebar';
import { ServerDialogs } from './ServerDialogs';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate: (opts: { to: string; params?: Record<string, string>; search?: Record<string, unknown> }) => router.navigate({ to: opts.to as any, params: opts.params as any, search: opts.search as any }),
    removeFromQuickConnectionsByWorkspace,
    quickConnections,
  });

  const chatInputRef = useRef<MessageInputHandle>(null);
  const terminalPanelRef = useRef<TerminalPanelHandle>(null);
  const filesPanelRef = useRef<FilesPanelHandle>(null);
  const sidebarRef = useRef<AppSidebarHandle>(null);
  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const autoFollowToggleRef = useRef<{ toggle: () => void } | null>(null);
  const [paneHandles] = useState<Map<string, SessionPaneHandle>>(() => new Map());
  const paneRegistry = useMemo<SessionPaneRegistry>(() => ({
    panes: paneHandles,
    register: (sessionId, handle) => { paneHandles.set(sessionId, handle); },
    unregister: (sessionId) => { paneHandles.delete(sessionId); },
    getHandle: (sessionId) => paneHandles.get(sessionId),
  }), [paneHandles]);

  const {
    showFilesPanel,
    filesPanelWidth,
    sessionsPanelWidth,
  } = useChatLayoutStore(useShallow((s) => ({
    showFilesPanel: s.showFilesPanel,
    filesPanelWidth: s.filesPanelWidth,
    sessionsPanelWidth: s.sessionsPanelWidth,
  })));

  const viewRefs = {
    sidebarRef,
    chatInputRef,
    terminalPanelRef,
    filesPanelRef,
    scrollToBottomRef,
    autoFollowToggleRef,
  };

  const serverClientValue = useServerClientMemo(
    sessionManager.sdkClient,
    sessionManager.serverUrl,
    sessionManager.apiToken,
    sessionManager.connected,
  );

  return (
    <SessionPaneRegistryContext.Provider value={paneRegistry}>
      <SidebarProvider panelId="sessions" defaultOpen={true} className="flex-col" style={{ '--sidebar-width': `${sessionsPanelWidth}px`, '--header-height': platform.id === 'electron' ? '4.625rem' : '2.75rem' } as React.CSSProperties}>
        <div className="bg-background">
          <AppHeader />
        </div>

        <div className="flex flex-1 min-h-0">
          <SessionManagerContext.Provider value={sessionManager}>
            <ServerClientProvider value={serverClientValue}>
              <SessionCommandsProvider value={sessionManager}>
                <ViewRefsContext.Provider value={viewRefs}>
                  <Outlet />
                </ViewRefsContext.Provider>
              </SessionCommandsProvider>
            </ServerClientProvider>
          </SessionManagerContext.Provider>

          <FilesPanel
            ref={filesPanelRef}
            sdkClient={sessionManager.sdkClient}
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
          handleInterruptSession={sessionManager.handleInterruptSession}
          serverId={serverId}
          createSession={sessionManager.createSession}
          onToggleAutoFollow={() => autoFollowToggleRef.current?.toggle()}
        />

        <ServerDialogs
          apiToken={sessionManager.apiToken}
          isConnected={sessionManager.connected}
          sdkClient={sessionManager.sdkClient}
          onLogout={sessionManager.handleLogout}
          onConfigurationClose={() => router.invalidate()}
          permissions={sessionManager.permissions}
          onRefreshPermissions={sessionManager.refreshPermissions}
          onRevokePermission={sessionManager.revokePermission}
          onRevokeAllPermissions={sessionManager.revokeAllPermissions}
          onUpdateWorkspacePaths={sessionManager.updateWorkspacePaths}
          onUpdateWorkspaceSettings={sessionManager.updateWorkspaceSettings}
          isUpdatingWorkspace={sessionManager.isUpdatingWorkspace}
        />
      </SidebarProvider>
    </SessionPaneRegistryContext.Provider>
  );
}
