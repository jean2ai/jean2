import { ChevronRight, MoreHorizontal, RotateCcw, Trash2, X, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useMemo } from 'react';
import React from 'react';
import type { Session, SubagentStatus } from '@jean2/shared';
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface SessionMenuButtonProps {
  session: Session;
  allSessions: Session[];
  isActive: boolean;
  currentSessionId: string | null;
  onResumeSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onReopenSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

// Helper: Status icon for subagents
const SubagentStatusIcon = React.memo(function SubagentStatusIcon({ status }: { status?: SubagentStatus | null }) {
  switch (status) {
    case 'running':
      return <Loader2 className="size-3 animate-spin text-yellow-500" />;
    case 'completed':
      return <CheckCircle className="size-3 text-green-500" />;
    case 'error':
      return <XCircle className="size-3 text-destructive" />;
    default:
      return null;
  }
});

// Helper: Actions dropdown
const SessionActionsDropdown = React.memo(function SessionActionsDropdown({
  isClosed,
  onReopen,
  onClose,
  onDelete,
}: {
  isClosed: boolean;
  onReopen: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction showOnHover>
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Session actions</span>
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isClosed ? (
          <>
            <DropdownMenuItem onClick={onReopen}>
              <RotateCcw className="size-4" />
              Restore
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete permanently
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onClick={onClose}>
            <X className="size-4" />
            Archive
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export const SessionMenuButton = React.memo(function SessionMenuButton({
  session,
  allSessions,
  isActive,
  currentSessionId,
  onResumeSession,
  onCloseSession,
  onReopenSession,
  onDeleteSession,
}: SessionMenuButtonProps) {
  const childSessions = useMemo(
    () => allSessions.filter(s => s.parentId === session.id),
    [allSessions, session.id]
  );
  const hasChildren = childSessions.length > 0;
  const isClosed = session.status === 'closed';

  const hasActiveChild = useMemo(
    () => childSessions.some(c => c.id === currentSessionId),
    [childSessions, currentSessionId]
  );

  // No children - simple item
  if (!hasChildren) {
    return (
      <TooltipProvider delayDuration={300}>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={isActive}
            onClick={() => onResumeSession(session.id)}
            className="w-full"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate flex-1">
                  {session.title || 'Untitled'}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                {session.title || 'Untitled'}
              </TooltipContent>
            </Tooltip>
          </SidebarMenuButton>
          <SessionActionsDropdown
            isClosed={isClosed}
            onReopen={() => onReopenSession(session.id)}
            onClose={() => onCloseSession(session.id)}
            onDelete={() => onDeleteSession(session.id)}
          />
        </SidebarMenuItem>
      </TooltipProvider>
    );
  }

  // Has children - collapsible item
  return (
    <TooltipProvider delayDuration={300}>
      <Collapsible defaultOpen={isActive || hasActiveChild} className="group/collapsible">
        <SidebarMenuItem>
          <div className="flex items-center w-full">
            {/* Part 1: Expand button (chevron) */}
              <CollapsibleTrigger asChild>
              <button
                className="flex items-center justify-center rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground shrink-0 size-7 p-1"
                aria-label="Toggle child sessions"
              >
                <ChevronRight className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </button>
            </CollapsibleTrigger>

            {/* Part 2: Session name (click to open) */}
            <SidebarMenuButton
              isActive={isActive}
              onClick={() => onResumeSession(session.id)}
              className="flex-1 min-w-0"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate">{session.title || 'Untitled'}</span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  {session.title || 'Untitled'}
                </TooltipContent>
              </Tooltip>
            </SidebarMenuButton>

            {/* Part 3: Actions menu (3 dots) */}
            <SessionActionsDropdown
              isClosed={isClosed}
              onReopen={() => onReopenSession(session.id)}
              onClose={() => onCloseSession(session.id)}
              onDelete={() => onDeleteSession(session.id)}
            />
          </div>

          {/* Nested children */}
          <CollapsibleContent>
            <SidebarMenuSub>
              {childSessions.map((child) => (
                <SidebarMenuSubItem key={child.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuSubButton
                        asChild
                        isActive={currentSessionId === child.id}
                      >
                        <button
                          onClick={() => onResumeSession(child.id)}
                          className="w-full text-left flex items-center gap-2"
                        >
                          <SubagentStatusIcon status={child.subagentStatus} />
                          <span className="truncate flex-1">{child.title || 'Untitled'}</span>
                          {child.subagentStatus === 'running' && (
                            <Badge variant="secondary" className="ml-auto">Running</Badge>
                          )}
                        </button>
                      </SidebarMenuSubButton>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      {child.title || 'Untitled'}
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    </TooltipProvider>
  );
});
