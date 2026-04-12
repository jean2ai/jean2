import { useRef } from 'react';
import { useParams, useRouter, Outlet } from '@tanstack/react-router';
import { useShallow } from 'zustand/react/shallow';

import { useServerContext } from '@/contexts/ServerContext';
import { ViewRefsContext } from '@/contexts/ViewRefsContext';
import { useServerSessionManager } from '@/hooks/useServerSessionManager';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
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

  return (
    <SidebarProvider panelId="sessions" defaultOpen={true} className="flex-col" style={{ '--sidebar-width': `${sessionsPanelWidth}px`, '--header-height': '3.5rem' } as React.CSSProperties}>
      <AppHeader />

      <div className="flex flex-1 min-h-0">
        <ViewRefsContext.Provider value={viewRefs}>
          <Outlet />
        </ViewRefsContext.Provider>

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
        sdkClient={sessionManager.sdkClient}
        permissions={sessionManager.permissions}
        onLogout={sessionManager.handleLogout}
        onRefreshPermissions={sessionManager.refreshPermissions}
        onRevokePermission={sessionManager.revokePermission}
        onRevokeAllPermissions={sessionManager.revokeAllPermissions}
        onConfigurationClose={() => router.invalidate()}
      />
    </SidebarProvider>
  );
}
