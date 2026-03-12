import { useState } from 'react';
import { RotateCcw, Trash2, X, ChevronRight, ChevronDown, Loader2, CheckCircle, XCircle } from 'lucide-react';
import type { Session, SubagentStatus } from '@jean2/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

function getSubagentStatusIcon(status: SubagentStatus | null | undefined) {
  if (!status) return null;
  switch (status) {
    case 'running':
      return <Loader2 className="size-3 animate-spin text-yellow-500" data-icon="status-running" />;
    case 'completed':
      return <CheckCircle className="size-3 text-green-500" data-icon="status-completed" />;
    case 'error':
      return <XCircle className="size-3 text-destructive" data-icon="status-error" />;
    default:
      return null;
  }
}

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function SessionItem({
  session,
  isActive,
  onSelect,
  onClose,
  onReopen,
  onDelete,
  onRename,
  hasChildren,
  isExpanded,
  onToggleExpand,
}: SessionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title || '');

  const handleRenameSubmit = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setEditTitle(session.title || '');
      setIsEditing(false);
    }
  };

  const isClosed = session.status === 'closed';

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-all duration-200',
        'hover:bg-accent hover:translate-x-1',
        isActive && 'bg-accent',
        isClosed && 'opacity-60'
      )}
      onClick={onSelect}
    >
      {hasChildren ? (
        <button
          className={cn(
            'flex size-5 items-center justify-center text-xs text-muted-foreground',
            'hover:bg-muted rounded transition-colors'
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand?.();
          }}
          data-icon="expand-toggle"
        >
          {isExpanded ? (
            <ChevronDown data-icon="chevron-down" />
          ) : (
            <ChevronRight data-icon="chevron-right" />
          )}
        </button>
      ) : (
        <div className="size-5" />
      )}

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleKeyDown}
            className="w-full bg-background border border-primary rounded px-1 text-sm outline-none"
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span className="block truncate text-sm">
            {session.title || 'Untitled'}
          </span>
        )}
      </div>

      <span className="text-xs text-muted-foreground hidden group-hover:hidden">
        {getRelativeTime(session.createdAt)}
      </span>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isClosed ? (
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onReopen();
              }}
              title="Reopen"
              data-icon="reopen"
            >
              <RotateCcw data-icon="rotate-ccw" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete permanently"
              className="text-destructive hover:text-destructive"
              data-icon="delete"
            >
              <Trash2 data-icon="trash2" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Archive"
            data-icon="close"
          >
            <X data-icon="x" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface SubagentItemProps {
  session: Session;
  isActive: boolean;
  onSelect: () => void;
}

export function SubagentItem({ session, isActive, onSelect }: SubagentItemProps) {
  const statusIcon = getSubagentStatusIcon(session.subagentStatus);

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1 cursor-pointer transition-all duration-200',
        'hover:bg-accent hover:translate-x-1',
        isActive && 'bg-accent'
      )}
      onClick={onSelect}
    >
      {statusIcon}
      <span className="flex-1 truncate text-sm text-muted-foreground">
        {session.title || 'Untitled'}
      </span>
      {session.subagentStatus === 'running' && (
        <Badge variant="secondary" className="text-xs">
          Running
        </Badge>
      )}
    </div>
  );
}
