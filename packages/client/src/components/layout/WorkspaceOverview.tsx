import React, { useMemo } from 'react';
import { Folder, Box, ChevronRight, Plus } from 'lucide-react';
import type { Session, Workspace } from '@jean2/shared';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { SessionMenuButton } from './SessionMenuButton';

interface WorkspaceOverviewProps {
  allSessions: Session[];
  currentSession: Session | null;
  currentSessionId: string | null;
  streamingSessionIds: Set<string>;
  pendingPermissions: { sessionId: string }[];
  favoritedWorkspaceIds: string[];
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onResumeSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onReopenSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onCreateSessionInWorkspace: (workspaceId: string) => void;
  connected: boolean;
}

export const WorkspaceOverview = React.memo(function WorkspaceOverview({
  allSessions,
  currentSession,
  currentSessionId,
  streamingSessionIds,
  pendingPermissions,
  favoritedWorkspaceIds,
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onResumeSession,
  onCloseSession,
  onReopenSession,
  onDeleteSession,
  onRenameSession,
  onCreateSessionInWorkspace,
  connected,
}: WorkspaceOverviewProps) {
  const favoritedWorkspaces = useMemo(() => {
    const workspaceMap = new Map(workspaces.map((w) => [w.id, w]));
    return favoritedWorkspaceIds
      .map((id) => workspaceMap.get(id))
      .filter((w): w is Workspace => w !== undefined);
  }, [workspaces, favoritedWorkspaceIds]);

  const workspaceSessions = useMemo(() => {
    const sessionsByWorkspace = new Map<string, Session[]>();
    for (const workspace of favoritedWorkspaces) {
      const workspaceSessionList = allSessions
        .filter(
          (s) =>
            s.workspaceId === workspace.id &&
            s.status === 'active' &&
            s.parentId === null
        )
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      sessionsByWorkspace.set(workspace.id, workspaceSessionList);
    }
    return sessionsByWorkspace;
  }, [allSessions, favoritedWorkspaces]);

  if (favoritedWorkspaces.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Overview</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="px-2 py-8 text-center text-sm text-muted-foreground">
            Star a workspace to see it here
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      {favoritedWorkspaces.map((workspace) => {
        const isActiveWorkspace = workspace.id === activeWorkspace?.id;
        const isCurrentSessionWorkspace = currentSession?.workspaceId === workspace.id;
        const activeSessions = workspaceSessions.get(workspace.id) || [];

        return (
          <Collapsible
            key={workspace.id}
            defaultOpen={isActiveWorkspace}
            className="group/collapsible"
          >
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex items-center justify-between w-full" onClick={() => onSelectWorkspace(workspace)}>
                  <span className="flex items-center gap-2">
                    <ChevronRight className="size-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    {workspace.isVirtual ? (
                      <Box className="size-3.5" />
                    ) : (
                      <Folder className="size-3.5" />
                    )}
                    <span className={isCurrentSessionWorkspace ? "truncate text-sidebar-foreground font-medium" : "truncate"}>{workspace.name}</span>
                  </span>
                  <Badge variant="secondary">{activeSessions.length}</Badge>
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => onCreateSessionInWorkspace(workspace.id)}
                        disabled={!connected}
                        className="w-full"
                      >
                        <Plus className="size-4" data-icon="inline-start" />
                        <span>New Chat</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                  <SidebarSeparator />
                  <SidebarMenu>
                    {activeSessions.length === 0 ? (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        (no active sessions)
                      </div>
                    ) : (
                      activeSessions.map((session) => (
                        <SessionMenuButton
                          key={session.id}
                          session={session}
                          allSessions={allSessions}
                          isActive={currentSession?.id === session.id}
                          currentSessionId={currentSessionId}
                          streamingSessionIds={streamingSessionIds}
                          pendingPermissions={pendingPermissions}
                          onResumeSession={onResumeSession}
                          onCloseSession={onCloseSession}
                          onReopenSession={onReopenSession}
                          onDeleteSession={onDeleteSession}
                          onRename={onRenameSession}
                        />
                      ))
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        );
      })}
    </>
  );
});
