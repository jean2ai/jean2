import { ChevronRight, MoreHorizontal, RotateCcw, Trash2, X, Loader2, CheckCircle, XCircle, Pause, AlertTriangle, Pencil } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import React from 'react';
import type { Session } from '@jean2/sdk';
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
import { cn } from '@/lib/utils';
import { useUIStore, selectCompletionRecord, COMPLETION_FLASH_DURATION_MS } from '@/stores/uiStore';

export type ChildrenMap = Map<string, Session[]>;

export type SessionDerivedValuesMap = Map<string, {
  isStreaming: boolean;
  hasPendingPermission: boolean;
  isRunning: boolean;
}>;

interface SessionMenuButtonProps {
  session: Session;
  childrenMap: ChildrenMap;
  sessionDerivedValues: SessionDerivedValuesMap;
  isActive: boolean;
  currentSessionId: string | null;
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
  const isRunning = isStreaming || status === 'running' || !!runningAt;
  if (isRunning) {
    return <Loader2 className="size-3.5 animate-spin shrink-0" />;
  }

  if (status === 'error') {
    return <XCircle className="size-3.5 shrink-0" />;
  }

  if (status === 'interrupted') {
    return <Pause className="size-3.5 shrink-0" />;
  }

  return <CheckCircle className="size-3.5 shrink-0" />;
});

export const SessionMenuButton = React.memo(function SessionMenuButton({
  session,
  childrenMap,
  sessionDerivedValues,
  isActive,
  currentSessionId,
  onResumeSession,
  onCloseSession,
  onReopenSession,
  onDeleteSession,
  onRename,
}: SessionMenuButtonProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(session.title || '');
  const inputRef = useRef<HTMLInputElement>(null);

  // O(1) lookup for derived values from the shared map
  const derived = sessionDerivedValues.get(session.id) ?? {
    isStreaming: false,
    hasPendingPermission: false,
    isRunning: false,
  };

  // O(1) lookup instead of O(N) filter
  const childSessions = childrenMap.get(session.id) ?? [];
  const hasChildren = childSessions.length > 0;
  const isClosed = session.status === 'closed';

  const hasActiveChild = childSessions.some(c => c.id === currentSessionId);

  // Read completion record directly from store
  const completionRecord = useUIStore(selectCompletionRecord(session.id));
  const clearCompletion = useUIStore(s => s.clearCompletion);

  // Track current time for flash phase calculation
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);

  // Derive visual state from completion record
  const isFlashing = !!completionRecord && (now - completionRecord.flashStartedAt < COMPLETION_FLASH_DURATION_MS);
  const isSticky = completionRecord?.type === 'flash-then-sticky';

  // Auto-clear flash-only records after flash duration
  useEffect(() => {
    if (!completionRecord || completionRecord.type !== 'flash-only') return;

    const remainingTime = COMPLETION_FLASH_DURATION_MS - (now - completionRecord.flashStartedAt);
    if (remainingTime <= 0) {
      clearCompletion(session.id);
      return;
    }

    const timer = setTimeout(() => {
      clearCompletion(session.id);
    }, remainingTime);

    return () => clearTimeout(timer);
  }, [completionRecord, session.id, clearCompletion, now]);

  // Determine the highlight class: flashing takes precedence, then sticky green
  const highlightClass = isFlashing
    ? 'animate-completion-flash rounded-md'
    : isSticky
      ? 'bg-[oklch(0.85_0.15_145_/_0.15)] rounded-md'
      : '';

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
                className={cn('flex-1 min-w-0', highlightClass)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate flex items-center gap-2">
                      <SessionStatusIcon status={session.subagentStatus} isStreaming={isActive ? derived.isStreaming : false} runningAt={session.runningAt} />
                      {derived.hasPendingPermission && <AlertTriangle className="size-3 text-warning shrink-0 animate-pulse" />}
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
                className={cn('flex-1 min-w-0', highlightClass)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate flex items-center gap-2">
                      <SessionStatusIcon status={session.subagentStatus} isStreaming={isActive ? derived.isStreaming : false} runningAt={session.runningAt} />
                      {derived.hasPendingPermission && <AlertTriangle className="size-3 text-warning shrink-0 animate-pulse" />}
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

          {/* Nested children - recursive rendering with same childrenMap */}
          <CollapsibleContent>
            <SidebarMenuSub>
              {childSessions.map((child) => (
                <SessionMenuButton
                  key={child.id}
                  session={child}
                  childrenMap={childrenMap}
                  sessionDerivedValues={sessionDerivedValues}
                  isActive={currentSessionId === child.id}
                  currentSessionId={currentSessionId}
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
