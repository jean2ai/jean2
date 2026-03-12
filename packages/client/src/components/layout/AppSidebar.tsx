import { Plus, Settings, Wifi, WifiOff, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import type { Session, Workspace } from '@jean2/shared';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

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
} from '@/components/ui/sidebar';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import { SessionMenuButton } from './SessionMenuButton';
import { Badge } from '@/components/ui/badge';

interface AppSidebarProps {
  sessions: Session[];
  currentSession: Session | null;
  currentSessionId: string | null;
  connected: boolean;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;

  onCreateSession: () => void;
  onResumeSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onReopenSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;

  onSelectWorkspace: (workspace: Workspace) => void;
  onCreateVirtualWorkspace: () => void;
  onCreatePhysicalWorkspace: (path: string) => void;
  onDeleteWorkspace: (id: string) => void;

  onOpenSettings: () => void;
}

export function AppSidebar({
  sessions,
  currentSession,
  currentSessionId,
  connected,
  workspaces,
  activeWorkspace,
  onCreateSession,
  onResumeSession,
  onCloseSession,
  onReopenSession,
  onDeleteSession,
  onSelectWorkspace,
  onCreateVirtualWorkspace,
  onCreatePhysicalWorkspace,
  onOpenSettings,
}: AppSidebarProps) {
  // Separate active and archived sessions (only root sessions, no parent)
  const { activeSessions, archivedSessions } = useMemo(() => {
    const rootSessions = sessions.filter((s) => !s.parentId);
    return {
      activeSessions: rootSessions.filter((s) => s.status === 'active'),
      archivedSessions: rootSessions.filter((s) => s.status === 'closed'),
    };
  }, [sessions]);

  return (
    <Sidebar collapsible="icon">
      {/* Header: Workspace + New Chat */}
      <SidebarHeader>
        <div className="p-2">
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            onSelectWorkspace={onSelectWorkspace}
            onCreateVirtualWorkspace={onCreateVirtualWorkspace}
            onCreatePhysicalWorkspace={onCreatePhysicalWorkspace}
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

      {/* Content: Session lists */}
      <SidebarContent>
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
                        allSessions={sessions}
                        isActive={currentSession?.id === session.id}
                        currentSessionId={currentSessionId}
                        onResumeSession={onResumeSession}
                        onCloseSession={onCloseSession}
                        onReopenSession={onReopenSession}
                        onDeleteSession={onDeleteSession}
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
                        allSessions={sessions}
                        isActive={currentSession?.id === session.id}
                        currentSessionId={currentSessionId}
                        onResumeSession={onResumeSession}
                        onCloseSession={onCloseSession}
                        onReopenSession={onReopenSession}
                        onDeleteSession={onDeleteSession}
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
      </SidebarContent>

      {/* Footer: Status + Settings */}
      <SidebarFooter>
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
}
