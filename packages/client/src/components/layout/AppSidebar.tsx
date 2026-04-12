import { Plus } from 'lucide-react';
import { useMemo, useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import type { Session, Workspace } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { usePermissionStore } from '@/stores/permissionStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import type { ChildrenMap } from './SessionMenuButton';
import { WorkspaceOverview } from './WorkspaceOverview';
import { useServerContext } from '@/contexts/ServerContext';
import { ResizablePanel } from './ResizablePanel';
import { WorkspaceSessionContent } from './WorkspaceSessionContent';

interface AppSidebarProps {
  onCreateSession: () => void;
  onResumeSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onReopenSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;

  onSelectWorkspace: (workspace: Workspace) => void;
  onCreateVirtualWorkspace: () => void;
  onCreatePhysicalWorkspace: (path: string) => void;
  onDeleteWorkspace: (id: string) => void;

  onCreateSessionInWorkspace: (workspaceId: string) => void;

  onEscape?: () => void;
  sdkClient: Jean2Client | null;
}

export interface AppSidebarHandle {
  focusSessionPanel: () => void;
}

export const AppSidebar = forwardRef<AppSidebarHandle, AppSidebarProps>((props, ref) => {
  const {
    onCreateSession,
    onResumeSession,
    onCloseSession,
    onReopenSession,
    onDeleteSession,
    onRenameSession,
    onSelectWorkspace,
    onCreateVirtualWorkspace,
    onCreatePhysicalWorkspace,
    onDeleteWorkspace,
    onCreateSessionInWorkspace,
    onEscape,
    sdkClient,
  } = props;

  // Read from stores
  const allSessions = useSessionStore(s => s.sessions);
  const currentSession = useSessionStore(s => s.currentSession);
  const currentSessionId = currentSession?.id ?? null;
  const streamingSessionIds = useConnectionStore(s => s.streamingSessionIds);
  const pendingPermissions = usePermissionStore(s => s.pendingPermissions);
  const connected = useConnectionStore(s => s.connected);
  const workspaces = useServerDataStore(s => s.workspaces);
  const activeWorkspace = useServerDataStore(s => s.activeWorkspace);

  // Derive activeServer from ServerContext and URL params
  const { servers, quickConnections, addToQuickConnections, removeFromQuickConnections } = useServerContext();
  const params = useParams({ from: '/server/$serverId', strict: false } as unknown as Parameters<typeof useParams>[0]);
  const serverId = params?.serverId as string | undefined;
  const activeServer = serverId ? servers.find(s => s.id === serverId) ?? null : null;

  // Derive favoritedWorkspaceIds
  const favoritedWorkspaceIds = quickConnections
    .filter(conn => conn.serverId === activeServer?.id && conn.workspaceId)
    .map(conn => conn.workspaceId!);

  // Derive workspaceSessions (was the old `sessions` prop)
  const sessions = allSessions.filter(s => s.workspaceId === activeWorkspace?.id);

  const viewMode = useChatLayoutStore((s) => s.sidebarViewMode);
  useSidebar(); // Keep hook call to maintain sidebar context

  const sessionListRef = useRef<HTMLDivElement>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const focusSessionPanel = useCallback(() => {
    const container = sessionListRef.current;
    if (!container) return;

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-sidebar="menu-button"]')
    );

    if (buttons.length === 0) {
      container.focus();
      return;
    }

    const currentButton = buttons.find(btn => {
      return btn.getAttribute('data-session-id') === currentSessionIdRef.current;
    });

    if (currentButton) {
      currentButton.focus();
    } else {
      buttons[0]?.focus();
    }
  }, []);

  useImperativeHandle(ref, () => ({
    focusSessionPanel,
  }), [focusSessionPanel]);

  const handleSessionListKeyDown = useCallback((e: React.KeyboardEvent) => {
    const container = sessionListRef.current;
    if (!container) return;

    // Don't intercept keyboard navigation when an inline rename input is focused.
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      (active instanceof HTMLElement && active.contentEditable === 'true')
    ) {
      return;
    }

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-sidebar="menu-button"]'
      )
    );
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0;
        buttons[nextIndex]?.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1;
        buttons[prevIndex]?.focus();
        break;
      }
      case 'ArrowRight': {
        const flexContainer = (document.activeElement as HTMLElement)?.parentElement;
        if (!flexContainer) break;
        const chevronButton = flexContainer.querySelector<HTMLButtonElement>(
          'button[aria-label="Toggle child sessions"]'
        );
        if (!chevronButton) break;
        const collapsible = flexContainer.closest<HTMLElement>('[data-state]');
        if (collapsible?.dataset.state === 'closed') {
          e.preventDefault();
          chevronButton.click();
        }
        break;
      }
      case 'ArrowLeft': {
        const flexContainer = (document.activeElement as HTMLElement)?.parentElement;
        if (!flexContainer) break;
        const chevronButton = flexContainer.querySelector<HTMLButtonElement>(
          'button[aria-label="Toggle child sessions"]'
        );
        if (!chevronButton) break;
        const collapsible = flexContainer.closest<HTMLElement>('[data-state]');
        if (collapsible?.dataset.state === 'open') {
          e.preventDefault();
          chevronButton.click();
        }
        break;
      }
      case 'Enter': {
        if (document.activeElement instanceof HTMLButtonElement) {
          document.activeElement.click();
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        (document.activeElement as HTMLElement)?.blur();
        onEscape?.();
        break;
      }
    }
  }, [onEscape]);

  // Precompute childrenMap from allSessions for overview mode compatibility
  const childrenMap = useMemo((): ChildrenMap => {
    const map = new Map<string, Session[]>();
    for (const session of allSessions) {
      if (session.parentId) {
        const existing = map.get(session.parentId) ?? [];
        existing.push(session);
        map.set(session.parentId, existing);
      }
    }
    return map;
  }, [allSessions]);

  // Precompute derived values from allSessions for overview mode compatibility
  const sessionDerivedValues = useMemo(() => {
    const pendingSet = new Set(pendingPermissions.map(p => p.sessionId));
    const derived = new Map<string, { isStreaming: boolean; hasPendingPermission: boolean; isRunning: boolean }>();
    for (const session of allSessions) {
      const isStreaming = streamingSessionIds.has(session.id);
      const hasPendingPermission = pendingSet.has(session.id);
      const isCurrentSession = session.id === currentSessionId;
      const isRunning = (isCurrentSession && isStreaming) || session.subagentStatus === 'running' || !!session.runningAt;
      derived.set(session.id, { isStreaming, hasPendingPermission, isRunning });
    }
    return derived;
  }, [allSessions, streamingSessionIds, pendingPermissions, currentSessionId]);

  // Separate active and archived sessions (only root sessions, no parent)
  const { activeSessions, archivedSessions } = useMemo(() => {
    const rootSessions = sessions.filter((s) => !s.parentId);
    return {
      activeSessions: rootSessions.filter((s) => s.status === 'active'),
      archivedSessions: rootSessions.filter((s) => s.status === 'closed'),
    };
  }, [sessions]);

  const isWorkspaceFavorited = (workspaceId: string) => {
    return quickConnections.some(
      conn => conn.workspaceId === workspaceId && conn.serverId === activeServer?.id
    );
  };

  const handleToggleWorkspaceFavorite = (workspaceId: string, workspaceName: string) => {
    if (!activeServer) return;

    const existing = quickConnections.find(
      conn => conn.workspaceId === workspaceId && conn.serverId === activeServer.id
    );

    if (existing) {
      removeFromQuickConnections(existing.id);
    } else {
      addToQuickConnections(activeServer.id, activeServer.name, workspaceId, workspaceName);
    }
  };

  // Build header: only shown in default (single-workspace) mode
  const header = viewMode !== 'overview' ? (
    <SidebarHeader>
      <div className="p-2 space-y-2">
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={onSelectWorkspace}
          onCreateVirtualWorkspace={onCreateVirtualWorkspace}
          onCreatePhysicalWorkspace={onCreatePhysicalWorkspace}
          isWorkspaceFavorited={isWorkspaceFavorited}
          onToggleFavorite={handleToggleWorkspaceFavorite}
          onDeleteWorkspace={onDeleteWorkspace}
          sdkClient={sdkClient}
        />
      </div>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={onCreateSession}
            disabled={!connected}
            className="w-full"
          >
            <Plus className="size-4" data-icon="inline-start" />
            <span>New Chat</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  ) : undefined;

  return (
    <ResizablePanel
      header={header}
      contentRef={sessionListRef}
      onContentKeyDown={handleSessionListKeyDown}
    >
      {viewMode === 'overview' ? (
        <WorkspaceOverview
          allSessions={allSessions}
          childrenMap={childrenMap}
          sessionDerivedValues={sessionDerivedValues}
          currentSession={currentSession}
          currentSessionId={currentSessionId}
          favoritedWorkspaceIds={favoritedWorkspaceIds}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={onSelectWorkspace}
          onResumeSession={onResumeSession}
          onCloseSession={onCloseSession}
          onReopenSession={onReopenSession}
          onDeleteSession={onDeleteSession}
          onRenameSession={onRenameSession}
          onCreateSessionInWorkspace={onCreateSessionInWorkspace}
          connected={connected}
        />
      ) : (
        <WorkspaceSessionContent
          activeSessions={activeSessions}
          archivedSessions={archivedSessions}
          childrenMap={childrenMap}
          sessionDerivedValues={sessionDerivedValues}
          currentSessionId={currentSessionId}
          onResumeSession={onResumeSession}
          onCloseSession={onCloseSession}
          onReopenSession={onReopenSession}
          onDeleteSession={onDeleteSession}
          onRenameSession={onRenameSession}
        />
      )}
    </ResizablePanel>
  );
});