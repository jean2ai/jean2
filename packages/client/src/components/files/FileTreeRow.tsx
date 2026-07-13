import { memo, useRef, useCallback } from 'react';
import { ChevronRight, Folder, FolderOpen, File, Loader2 } from 'lucide-react';
import type { FileEntry } from '@jean2/sdk';
import { cn } from '@/lib/utils';
import { GitStatusBadge } from './GitStatusBadge';
import { FOLDER_ICON_COLOR, fileIconColor } from './fileIcons';
import type { VisibleFileNode } from '@/hooks/useFlatFileTree';

const PREFETCH_DELAY_MS = 200;

interface FileTreeRowProps {
  node: VisibleFileNode;
  onToggle: (fullPath: string) => void;
  onFileSelect?: (file: FileEntry) => void;
  onPrefetch: (fullPath: string) => void;
  isFocused: boolean;
}

export const FileTreeRow = memo(function FileTreeRow({
  node,
  onToggle,
  onFileSelect,
  onPrefetch,
  isFocused,
}: FileTreeRowProps) {
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { entry, depth, isExpanded, isLoading, fullPath } = node;
  const isDirectory = entry.type === 'directory';

  const cancelPrefetch = useCallback(() => {
    if (prefetchTimerRef.current !== null) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  }, []);

  const handlePrefetch = useCallback(() => {
    if (!isDirectory) return;
    cancelPrefetch();
    prefetchTimerRef.current = setTimeout(() => {
      onPrefetch(fullPath);
    }, PREFETCH_DELAY_MS);
  }, [isDirectory, fullPath, onPrefetch, cancelPrefetch]);

  const handleClick = useCallback(() => {
    if (isDirectory) {
      onToggle(fullPath);
    } else if (onFileSelect) {
      onFileSelect({ ...entry, path: fullPath });
    }
  }, [isDirectory, fullPath, onToggle, onFileSelect, entry]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  const Icon = isDirectory ? (isExpanded ? FolderOpen : Folder) : File;
  const iconColor = isDirectory ? FOLDER_ICON_COLOR : (fullPath ? fileIconColor(fullPath) : 'text-muted-foreground');

  return (
    <button
      data-file-node
      data-file-type={isDirectory ? 'directory' : 'file'}
      data-file-is-open={isExpanded || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerEnter={handlePrefetch}
      onPointerLeave={cancelPrefetch}
      onFocus={handlePrefetch}
      onBlur={cancelPrefetch}
      tabIndex={isFocused ? 0 : -1}
      className={cn(
        'flex items-center gap-2 w-full min-w-0 overflow-hidden rounded-md p-2 text-left text-sm',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'focus:ring-1 focus:ring-inset ring-sidebar-ring outline-hidden',
        '[&_svg]:size-4 [&_svg]:shrink-0',
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {isDirectory && isLoading ? (
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
      ) : isDirectory ? (
        <ChevronRight
          className={cn(
            'w-3 h-3 shrink-0 transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
      ) : null}
      <Icon className={iconColor} />
      <div className="flex-1 min-w-0 truncate">{entry.name}</div>
      {entry.git && <GitStatusBadge git={entry.git} />}
    </button>
  );
}, (prev, next) => {
  return (
    prev.node === next.node &&
    prev.isFocused === next.isFocused &&
    prev.onToggle === next.onToggle &&
    prev.onFileSelect === next.onFileSelect &&
    prev.onPrefetch === next.onPrefetch
  );
});
