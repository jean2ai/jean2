import { ChevronRight, MoreHorizontal, RotateCcw, Trash2, X, Loader2, CheckCircle, XCircle, Pause, AlertTriangle, Pencil } from 'lucide-react';
import { useMemo, useState, useRef, useEffect } from 'react';
import React from 'react';
import type { Session } from '@jean2/shared';
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useCompletionFlash } from '@/hooks/useCompletionFlash';
import { cn } from '@/lib/utils';

interface SessionMenuButtonProps {
  session: Session;
  allSessions: Session[];
  isActive: boolean;
  currentSessionId: string | null;
  streamingSessionId: string | null;
  pendingPermissions: { sessionId: string }[];
  onResumeSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onReopenSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => void;
}

// Helper: Actions dropdown
const SessionActionsDropdown = React.memo(function SessionActionsDropdown({
  isClosed,
  isEditing,
  onRename,
  onReopen,
  onClose,
  onDelete,
}: {
  isClosed: boolean;
  isEditing: boolean;
  onRename: () => void;
  onReopen: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  if (isEditing) return <div className="shrink-0 size-7" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction showOnHover>
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Session actions</span>
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onRename}>
          <Pencil className="size-4" />
          Rename
        </DropdownMenuItem>
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

// Icon component for session status
const SessionStatusIcon = React.memo(function SessionStatusIcon({
  status,
  isStreaming,
  runningAt,
}: {
  status?: 'running' | 'completed' | 'error' | 'interrupted' | null;
  isStreaming?: boolean;
  runningAt?: string | null;
}) {
  // Show running spinner when:
  // - Client is streaming this session, OR
  // - Subagent is running (status === 'running'), OR
  // - Main session has runningAt set
  const isRunning = isStreaming || status === 'running' || !!runningAt;
  if (isRunning) {
    return <Loader2 className="size-3.5 animate-spin shrink-0" />;
  }

  // Show error icon when subagent errored
  if (status === 'error') {
    return <XCircle className="size-3.5 shrink-0" />;
  }

  // Show pause icon when subagent was interrupted
  if (status === 'interrupted') {
    return <Pause className="size-3.5 shrink-0" />;
  }

  // Default: show checkmark for idle/completed sessions
  // This covers:
  // - Main sessions that are not streaming (idle)
  // - Subagent sessions with completed status
  // - Subagent sessions with no status (fallback)
  return <CheckCircle className="size-3.5 shrink-0" />;
});

export const SessionMenuButton = React.memo(function SessionMenuButton({
  session,
  allSessions,
  isActive,
  currentSessionId,
  streamingSessionId,
  pendingPermissions,
  onResumeSession,
  onCloseSession,
  onReopenSession,
  onDeleteSession,
  onRename,
}: SessionMenuButtonProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(session.title || '');
  const inputRef = useRef<HTMLInputElement>(null);

  const childSessions = useMemo(
    () => allSessions.filter(s => s.parentId === session.id),
    [allSessions, session.id]
  );
  const hasChildren = childSessions.length > 0;
  const isClosed = session.status === 'closed';

  // Track whether we've already performed the initial focus/select for the current edit session.
  // This prevents focus/select from resetting on unrelated re-renders while already editing.
  const hasFocusedRef = useRef(false);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      if (!hasFocusedRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
        hasFocusedRef.current = true;
      }
    } else {
      hasFocusedRef.current = false;
    }
  }, [isEditing]);

  // Keep edit value in sync with session.title when not editing.
  // This catches server-side renames applied while the row is not in edit mode.
  useEffect(() => {
    if (!isEditing) {
      setEditValue(session.title || '');
    }
  }, [isEditing, session.title]);

  const handleRenameStart = () => {
    setEditValue(session.title || '');
    setIsEditing(true);
  };

  const handleRenameCommit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(session.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleRenameCancel = () => {
    setIsEditing(false);
    setEditValue(session.title || '');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleRenameCancel();
    }
  };

  const hasActiveChild = useMemo(
    () => childSessions.some(c => c.id === currentSessionId),
    [childSessions, currentSessionId]
  );

  const isStreaming = session.id === streamingSessionId;
  const hasPendingPermission = pendingPermissions.some(p => p.sessionId === session.id);

  const isRunning = isStreaming || session.subagentStatus === 'running' || !!session.runningAt;
  const { isFlashing } = useCompletionFlash(session.id, isRunning);

  // No children - simple item with spacer for alignment
  if (!hasChildren) {
    return (
      <TooltipProvider delayDuration={300}>
        <SidebarMenuItem>
          <div className="flex items-center w-full">
            {/* Spacer - same size as chevron button for alignment */}
            <div className="shrink-0 size-7 p-1" />

            {/* Session name (click to open or inline edit) */}
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleRenameCommit}
                aria-label={`Rename session: ${session.title || 'Untitled'}`}
                className="flex-1 min-w-0 h-8 px-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <SidebarMenuButton
                data-session-id={session.id}
                isActive={isActive}
                onClick={() => onResumeSession(session.id)}
                className={cn('flex-1 min-w-0', isFlashing && 'animate-completion-flash rounded-md')}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate flex items-center gap-2">
                      <SessionStatusIcon status={session.subagentStatus} isStreaming={isStreaming} runningAt={session.runningAt} />
                      {hasPendingPermission && <AlertTriangle className="size-3 text-warning shrink-0 animate-pulse" />}
                      {session.title || 'Untitled'}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    {session.title || 'Untitled'}
                  </TooltipContent>
                </Tooltip>
              </SidebarMenuButton>
            )}

            {/* Actions menu */}
            <SessionActionsDropdown
              isClosed={isClosed}
              isEditing={isEditing}
              onRename={handleRenameStart}
              onReopen={() => onReopenSession(session.id)}
              onClose={() => onCloseSession(session.id)}
              onDelete={() => onDeleteSession(session.id)}
            />
          </div>
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
                <ChevronRight className="size-4 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
              </button>
            </CollapsibleTrigger>

            {/* Part 2: Session name (click to open or inline edit) */}
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleRenameCommit}
                aria-label={`Rename session: ${session.title || 'Untitled'}`}
                className="flex-1 min-w-0 h-8 px-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <SidebarMenuButton
                data-session-id={session.id}
                isActive={isActive}
                onClick={() => onResumeSession(session.id)}
                className={cn('flex-1 min-w-0', isFlashing && 'animate-completion-flash rounded-md')}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate flex items-center gap-2">
                      <SessionStatusIcon status={session.subagentStatus} isStreaming={isStreaming} runningAt={session.runningAt} />
                      {hasPendingPermission && <AlertTriangle className="size-3 text-warning shrink-0 animate-pulse" />}
                      {session.title || 'Untitled'}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    {session.title || 'Untitled'}
                  </TooltipContent>
                </Tooltip>
              </SidebarMenuButton>
            )}

            {/* Part 3: Actions menu (3 dots) */}
            <SessionActionsDropdown
              isClosed={isClosed}
              isEditing={isEditing}
              onRename={handleRenameStart}
              onReopen={() => onReopenSession(session.id)}
              onClose={() => onCloseSession(session.id)}
              onDelete={() => onDeleteSession(session.id)}
            />
          </div>

          {/* Nested children - recursive rendering */}
          <CollapsibleContent>
            <SidebarMenuSub>
              {childSessions.map((child) => (
                <SessionMenuButton
                  key={child.id}
                  session={child}
                  allSessions={allSessions}
                  isActive={currentSessionId === child.id}
                  currentSessionId={currentSessionId}
                  streamingSessionId={streamingSessionId}
                  pendingPermissions={pendingPermissions}
                  onResumeSession={onResumeSession}
                  onCloseSession={onCloseSession}
                  onReopenSession={onReopenSession}
                  onDeleteSession={onDeleteSession}
                  onRename={onRename}
                />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    </TooltipProvider>
  );
});
