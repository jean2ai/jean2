import { ChevronRight, MoreHorizontal, RotateCcw, Trash2, X, Loader2, CheckCircle, XCircle, Pause, AlertTriangle, Pencil, CheckSquare, Square } from 'lucide-react';
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
import { useCompletionStore, selectCompletionRecord, COMPLETION_FLASH_DURATION_MS } from '@/stores/completionStore';

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
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (sessionId: string) => void;
}

const SessionActionsDropdown = React.memo(function SessionActionsDropdown({
  isClosed,
  isEditing,
  selectionMode,
  onRename,
  onReopen,
  onClose,
  onDelete,
}: {
  isClosed: boolean;
  isEditing: boolean;
  selectionMode?: boolean;
  onRename: () => void;
  onReopen: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  if (isEditing) return <div className="shrink-0 size-7" />;

  if (selectionMode) return <div className="shrink-0 size-7" />;

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
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: SessionMenuButtonProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(session.title || '');
  const inputRef = useRef<HTMLInputElement>(null);

  const derived = sessionDerivedValues.get(session.id) ?? {
    isStreaming: false,
    hasPendingPermission: false,
    isRunning: false,
  };

  const childSessions = childrenMap.get(session.id) ?? [];
  const hasChildren = childSessions.length > 0;
  const isClosed = session.status === 'closed';

  const hasActiveChild = childSessions.some((c) => c.id === currentSessionId);
  const hasPendingPermissionInSubtree = childSessions.some((child) => {
    const childDerived = sessionDerivedValues.get(child.id);
    return childDerived?.hasPendingPermission;
  });

  const completionRecord = useCompletionStore(selectCompletionRecord(session.id));
  const clearCompletion = useCompletionStore((s) => s.clearCompletion);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!completionRecord) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [!!completionRecord]);

  const isFlashing = !!completionRecord && (now - completionRecord.flashStartedAt < COMPLETION_FLASH_DURATION_MS);
  const isSticky = completionRecord?.type === 'flash-then-sticky';

  useEffect(() => {
    if (!completionRecord || completionRecord.type !== 'flash-only') return;

    const remainingTime = COMPLETION_FLASH_DURATION_MS - (Date.now() - completionRecord.flashStartedAt);
    if (remainingTime <= 0) {
      clearCompletion(session.id);
      return;
    }

    const timer = setTimeout(() => {
      clearCompletion(session.id);
    }, remainingTime);

    return () => clearTimeout(timer);
  }, [completionRecord, session.id, clearCompletion]);

  const highlightClass = isFlashing
    ? 'animate-completion-flash rounded-md'
    : isSticky
      ? 'bg-[oklch(0.85_0.15_145_/_0.15)] rounded-md'
      : '';

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

  const handleRowClick = () => {
    if (selectionMode && onToggleSelect) {
      onToggleSelect(session.id);
    } else {
      onResumeSession(session.id);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleSelect) {
      onToggleSelect(session.id);
    }
  };

  const rowClassName = cn(
    selected && selectionMode && 'bg-accent/50',
    selectionMode && 'cursor-pointer',
  );

  if (!hasChildren) {
    return (
      <TooltipProvider delayDuration={300}>
        <SidebarMenuItem>
          <div
            className={cn('flex items-center w-full', rowClassName)}
            onClick={selectionMode ? handleRowClick : undefined}
          >
            {selectionMode ? (
              <button
                className="shrink-0 size-7 p-1 flex items-center justify-center hover:bg-accent/70 rounded-md transition-colors"
                onClick={handleCheckboxClick}
                aria-label={selected ? 'Deselect session' : 'Select session'}
              >
                {selected ? (
                  <CheckSquare className="size-4 text-primary" />
                ) : (
                  <Square className="size-4 text-muted-foreground" />
                )}
              </button>
            ) : (
              <div className="shrink-0 size-7 p-1" />
            )}

            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleRenameCommit}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Rename session: ${session.title || 'Untitled'}`}
                className="flex-1 min-w-0 h-8 px-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <SidebarMenuButton
                data-session-id={session.id}
                isActive={isActive}
                onClick={selectionMode ? undefined : handleRowClick}
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

            <SessionActionsDropdown
              isClosed={isClosed}
              isEditing={isEditing}
              selectionMode={selectionMode}
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

  return (
    <TooltipProvider delayDuration={300}>
      <Collapsible
        defaultOpen={isActive || hasActiveChild || derived.hasPendingPermission || hasPendingPermissionInSubtree}
        className="group/collapsible"
      >
        <SidebarMenuItem>
          <div
            className={cn('flex items-center w-full', rowClassName)}
            onClick={selectionMode ? handleRowClick : undefined}
          >
            {selectionMode ? (
              <button
                className="shrink-0 size-7 p-1 flex items-center justify-center hover:bg-accent/70 rounded-md transition-colors"
                onClick={handleCheckboxClick}
                aria-label={selected ? 'Deselect session' : 'Select session'}
              >
                {selected ? (
                  <CheckSquare className="size-4 text-primary" />
                ) : (
                  <Square className="size-4 text-muted-foreground" />
                )}
              </button>
            ) : (
              <CollapsibleTrigger asChild>
                <button
                  className="flex items-center justify-center rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground shrink-0 size-7 p-1"
                  aria-label="Toggle child sessions"
                >
                  <ChevronRight className="size-4 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
                </button>
              </CollapsibleTrigger>
            )}

            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleRenameCommit}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Rename session: ${session.title || 'Untitled'}`}
                className="flex-1 min-w-0 h-8 px-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <SidebarMenuButton
                data-session-id={session.id}
                isActive={isActive}
                onClick={selectionMode ? undefined : handleRowClick}
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

            <SessionActionsDropdown
              isClosed={isClosed}
              isEditing={isEditing}
              selectionMode={selectionMode}
              onRename={handleRenameStart}
              onReopen={() => onReopenSession(session.id)}
              onClose={() => onCloseSession(session.id)}
              onDelete={() => onDeleteSession(session.id)}
            />
          </div>

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
                  selectionMode={selectionMode}
                  selected={selected}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    </TooltipProvider>
  );
});
