import { useState } from 'react';
import { Plus, Settings, Wifi, WifiOff } from 'lucide-react';
import type { Session, Workspace, ToolPermission } from '@jean2/shared';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { SessionItem, SubagentItem } from './SessionItem';
import { SessionGroup } from './SessionGroup';

interface AppSidebarProps {
  sessions: Session[];
  currentSession: Session | null;
  connected: boolean;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  permissions: ToolPermission[];

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

  onOpenSettings: () => void;
}

export function AppSidebar({
  sessions,
  currentSession,
  connected,
  workspaces,
  activeWorkspace,
  onCreateSession,
  onResumeSession,
  onCloseSession,
  onReopenSession,
  onDeleteSession,
  onRenameSession,
  onSelectWorkspace,
  onCreateVirtualWorkspace,
  onCreatePhysicalWorkspace,
  onOpenSettings,
}: AppSidebarProps) {
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const toggleExpanded = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  // Separate active and archived sessions (only root sessions, no parent)
  const rootSessions = sessions.filter((s) => !s.parentId);
  const activeSessions = rootSessions.filter((s) => s.status === 'active');
  const archivedSessions = rootSessions.filter((s) => s.status === 'closed');

  return (
    <aside className="flex flex-col h-full w-[260px] border-r border-sidebar-border bg-sidebar">
      {/* Workspace Switcher */}
      <div className="p-3">
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={onSelectWorkspace}
          onCreateVirtualWorkspace={onCreateVirtualWorkspace}
          onCreatePhysicalWorkspace={onCreatePhysicalWorkspace}
        />
      </div>

      <Separator />

      {/* New Session Button */}
      <div className="p-3">
        <Button
          onClick={onCreateSession}
          disabled={!connected}
          className="w-full"
          size="sm"
        >
          <Plus className="size-4" data-icon="inline-start" />
          New Chat
        </Button>
      </div>

      <Separator />

      {/* Session List */}
      <ScrollArea className="flex-1">
        <div className="p-3 flex flex-col gap-4">
          {/* Active Sessions */}
          {activeSessions.length > 0 && (
            <SessionGroup title="Active" count={activeSessions.length}>
              {activeSessions.map((session) => {
                const childSessions = sessions.filter(
                  (s) => s.parentId === session.id
                );
                const hasChildren = childSessions.length > 0;
                const isExpanded = expandedSessions.has(session.id);

                return (
                  <div key={session.id}>
                    <SessionItem
                      session={session}
                      isActive={currentSession?.id === session.id}
                      onSelect={() => onResumeSession(session.id)}
                      onClose={() => onCloseSession(session.id)}
                      onReopen={() => onReopenSession(session.id)}
                      onDelete={() => onDeleteSession(session.id)}
                      onRename={(title) => onRenameSession(session.id, title)}
                      hasChildren={hasChildren}
                      isExpanded={isExpanded}
                      onToggleExpand={() => toggleExpanded(session.id)}
                    />

                    {/* Subagent Sessions - properly nested */}
                    {isExpanded && hasChildren && (
                      <div className="ml-4 border-l-2 border-border pl-2">
                        {childSessions.map((child) => (
                          <SubagentItem
                            key={child.id}
                            session={child}
                            isActive={currentSession?.id === child.id}
                            onSelect={() => onResumeSession(child.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </SessionGroup>
          )}

          {/* Archived Sessions */}
          {archivedSessions.length > 0 && (
            <SessionGroup
              title="Archived"
              count={archivedSessions.length}
              defaultExpanded={false}
            >
              {archivedSessions.map((session) => {
                const childSessions = sessions.filter(
                  (s) => s.parentId === session.id
                );
                const hasChildren = childSessions.length > 0;
                const isExpanded = expandedSessions.has(session.id);

                return (
                  <div key={session.id}>
                    <SessionItem
                      session={session}
                      isActive={currentSession?.id === session.id}
                      onSelect={() => onResumeSession(session.id)}
                      onClose={() => onCloseSession(session.id)}
                      onReopen={() => onReopenSession(session.id)}
                      onDelete={() => onDeleteSession(session.id)}
                      onRename={(title) => onRenameSession(session.id, title)}
                      hasChildren={hasChildren}
                      isExpanded={isExpanded}
                      onToggleExpand={() => toggleExpanded(session.id)}
                    />

                    {/* Subagent Sessions for archived */}
                    {isExpanded && hasChildren && (
                      <div className="ml-4 border-l-2 border-border pl-2">
                        {childSessions.map((child) => (
                          <SubagentItem
                            key={child.id}
                            session={child}
                            isActive={currentSession?.id === child.id}
                            onSelect={() => onResumeSession(child.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </SessionGroup>
          )}

          {/* Empty State */}
          {activeSessions.length === 0 && archivedSessions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No sessions yet.
              <br />
              Start a new chat to begin.
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Bottom Actions */}
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {connected ? (
            <Wifi className="size-3.5 text-success" />
          ) : (
            <WifiOff className="size-3.5 text-destructive" />
          )}
          <span className="text-xs text-muted-foreground">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            title="Settings"
          >
            <Settings className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
