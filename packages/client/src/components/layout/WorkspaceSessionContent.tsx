import { ChevronRight } from 'lucide-react';
import type { Session } from '@jean2/sdk';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { SessionMenuButton, type ChildrenMap, type SessionDerivedValuesMap } from './SessionMenuButton';

interface WorkspaceSessionContentProps {
  activeSessions: Session[];
  archivedSessions: Session[];
  childrenMap: ChildrenMap;
  sessionDerivedValues: SessionDerivedValuesMap;
  currentSessionId: string | null;
  onResumeSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onReopenSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
}

export function WorkspaceSessionContent({
  activeSessions,
  archivedSessions,
  childrenMap,
  sessionDerivedValues,
  currentSessionId,
  onResumeSession,
  onCloseSession,
  onReopenSession,
  onDeleteSession,
  onRenameSession,
}: WorkspaceSessionContentProps) {
  return (
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
                      isActive={currentSessionId === session.id}
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
                      isActive={currentSessionId === session.id}
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
  );
}