import {Plus, Settings, Wifi, WifiOff, ChevronRight, Server, SlidersHorizontal} from 'lucide-react';
import { useMemo, useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import type { Session, Workspace } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { useUIStore } from '@/stores/uiStore';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { ServerSwitcher } from './ServerSwitcher';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SessionsResizeHandle,
  useSidebar,
} from '@/components/ui/sidebar';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import { SessionMenuButton, type ChildrenMap } from './SessionMenuButton';
import { WorkspaceOverview } from './WorkspaceOverview';
import { Badge } from '@/components/ui/badge';
import { useServerContext } from '@/contexts/ServerContext';

interface AppSidebarProps {
  sessions: Session[];
  currentSession: Session | null;
  currentSessionId: string | null;
  streamingSessionIds: Set<string>;
  pendingPermissions: { sessionId: string }[];
  connected: boolean;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;

  allSessions: Session[];
  favoritedWorkspaceIds: string[];

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

  onOpenSettings: () => void;
  onOpenMCP: () => void;
  onOpenAddServer: () => void;
  onOpenConfiguration: () => void;
  onServerSwitch?: () => void;
  onEscape?: () => void;
  sdkClient: Jean2Client | null;
}

export interface AppSidebarHandle {
  focusSessionPanel: () => void;
}

export const AppSidebar = forwardRef<AppSidebarHandle, AppSidebarProps>((props, ref) => {
  const {
    sessions,
    currentSession,
    currentSessionId,
    streamingSessionIds,
    pendingPermissions,
    connected,
    workspaces,
    activeWorkspace,
    allSessions,
    favoritedWorkspaceIds,
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
    onOpenSettings,
    onOpenMCP,
    onOpenAddServer,
    onOpenConfiguration,
    onServerSwitch,
    onEscape,
    sdkClient,
  } = props;

  const viewMode = useUIStore((s) => s.sidebarViewMode);
  const { quickConnections, addToQuickConnections, removeFromQuickConnections, activeServer } = useServerContext();
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
    // This prevents the sidebar's arrow-key nav from stealing focus from the edit field.
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

  // No auto-focus effect here. focusSessionPanel() is called explicitly from cmd+1
  // handlers in App.tsx. Keeping it stable (no reactive deps) ensures the imperative
  // handle reference never changes unless the sidebar DOM is remounted.

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
      // Only use transient streaming state for the current session.
      // Non-current sessions should rely on authoritative session state.
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

  return (
    <Sidebar collapsible="offcanvas">
      {/* Sessions panel resize handle — desktop only, right edge */}
      <SessionsResizeHandle />
      {/* Header: Workspace + New Chat */}
      <SidebarHeader>
        <div className="p-2 space-y-2">
          <ServerSwitcher onOpenAddServer={onOpenAddServer} onServerSwitch={onServerSwitch} />
          {viewMode !== 'overview' && (
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
          )}
        </div>
        {viewMode !== 'overview' && (
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
        )}
      </SidebarHeader>

      {/* Content: Session lists */}
      <SidebarContent
        ref={sessionListRef}
        tabIndex={-1}
        onKeyDown={handleSessionListKeyDown}
        className="outline-none"
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
          <>
            {/* Active Sessions */}
            {activeSessions.length > 0 && (
              <Collapsible defaultOpen className="group/collapsible">
                <SidebarGroup>
                  <SidebarGroupLabel asChild>
                    <CollapsibleTrigger className="flex items-center justify-between w-full">
                      <span className="flex items-center gap-2">
                        <ChevronRight className="size-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        Active
                      </span>
                      <Badge variant="secondary">{activeSessions.length}</Badge>
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {activeSessions.map(session => (
                          <SessionMenuButton
                            key={session.id}
                            session={session}
                            childrenMap={childrenMap}
                            sessionDerivedValues={sessionDerivedValues}
                            isActive={currentSession?.id === session.id}
                            currentSessionId={currentSessionId}
                            onResumeSession={onResumeSession}
                            onCloseSession={onCloseSession}
                            onReopenSession={onReopenSession}
                            onDeleteSession={onDeleteSession}
                            onRename={onRenameSession}
                          />
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            )}

            {/* Archived Sessions */}
            {archivedSessions.length > 0 && (
              <Collapsible defaultOpen className="group/collapsible">
                <SidebarGroup>
                  <SidebarGroupLabel asChild>
                    <CollapsibleTrigger className="flex items-center justify-between w-full">
                      <span className="flex items-center gap-2">
                        <ChevronRight className="size-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        Archived
                      </span>
                      <Badge variant="secondary">{archivedSessions.length}</Badge>
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {archivedSessions.map(session => (
                          <SessionMenuButton
                            key={session.id}
                            session={session}
                            childrenMap={childrenMap}
                            sessionDerivedValues={sessionDerivedValues}
                            isActive={currentSession?.id === session.id}
                            currentSessionId={currentSessionId}
                            onResumeSession={onResumeSession}
                            onCloseSession={onCloseSession}
                            onReopenSession={onReopenSession}
                            onDeleteSession={onDeleteSession}
                            onRename={onRenameSession}
                          />
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            )}

            {/* Empty State */}
            {activeSessions.length === 0 && archivedSessions.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No sessions yet.
                <br />
                Start a new chat to begin.
              </div>
            )}
          </>
        )}
      </SidebarContent>

      {/* Footer: Status + Settings */}
      {/*<SidebarFooter style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>*/}
      <SidebarFooter className='pb-4'>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5">
              {connected ? (
                <Wifi className="size-3.5 text-success" />
              ) : (
                <WifiOff className="size-3.5 text-destructive" />
              )}
              <span className="text-xs text-muted-foreground">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onOpenMCP}>
              <Server className="size-4" data-icon="inline-start" />
              <span>MCP Servers</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onOpenConfiguration}>
              <SlidersHorizontal className="size-4" data-icon="inline-start" />
              <span>Configuration</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div className="flex items-center gap-1">
              <SidebarMenuButton onClick={onOpenSettings}>
                <Settings className="size-4" data-icon="inline-start" />
                <span>Settings</span>
              </SidebarMenuButton>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
});
