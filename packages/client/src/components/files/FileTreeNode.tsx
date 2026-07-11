import { useState, useRef, useCallback } from 'react';
import { ChevronRight, Folder, FolderOpen, File, Loader2 } from 'lucide-react';
import type { FileEntry } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useFileBrowseQuery } from '@/hooks/queries';
import { queryKeys } from '@/lib/queryKeys';
import { GitStatusBadge } from './GitStatusBadge';

interface FileTreeNodeProps {
  entry: FileEntry;
  workspaceId: string;
  parentPath: string;
  depth: number;
  onFileSelect?: (file: FileEntry) => void;
  showHidden?: boolean;
  sdkClient?: Jean2Client | null;
  root?: string;
}

const FILE_ICONS: Record<string, { icon: typeof File; color: string }> = {
  '.ts': { icon: File, color: 'text-blue-500' },
  '.tsx': { icon: File, color: 'text-blue-500' },
  '.js': { icon: File, color: 'text-yellow-500' },
  '.jsx': { icon: File, color: 'text-yellow-500' },
  '.json': { icon: File, color: 'text-yellow-600' },
  '.md': { icon: File, color: 'text-gray-500' },
  '.css': { icon: File, color: 'text-purple-500' },
  '.html': { icon: File, color: 'text-orange-500' },
};

const PREFETCH_DELAY_MS = 200;

export function FileTreeNode({
  entry,
  workspaceId,
  parentPath,
  depth,
  onFileSelect,
  showHidden = true,
  sdkClient,
  root,
}: FileTreeNodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fullPath = parentPath ? `${parentPath}/${entry.path}` : entry.path;
  const isDirectory = entry.type === 'directory';

  const { data, isLoading, isFetched } = useFileBrowseQuery(
    sdkClient ?? null,
    workspaceId,
    fullPath,
    { showHidden, root },
    isDirectory && isOpen,
  );

  const children = data?.files ?? [];

  const cancelPrefetch = useCallback(() => {
    if (prefetchTimerRef.current !== null) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  }, []);

  const handlePrefetch = useCallback(() => {
    if (!isDirectory || !sdkClient || !workspaceId) return;
    cancelPrefetch();
    prefetchTimerRef.current = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.files.browse(workspaceId, fullPath, { showHidden, root }),
        queryFn: ({ signal }) =>
          sdkClient.http.files.browse(workspaceId, fullPath, { showHidden, root, signal }),
        staleTime: 10_000,
      });
    }, PREFETCH_DELAY_MS);
  }, [isDirectory, sdkClient, workspaceId, fullPath, showHidden, root, queryClient, cancelPrefetch]);

  const handleToggle = (open: boolean) => {
    cancelPrefetch();
    (document.activeElement as HTMLElement)?.focus();
    setIsOpen(open);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLButtonElement).focus();
    if (!isDirectory && onFileSelect) {
      onFileSelect({ ...entry, path: fullPath });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleClick(e as unknown as React.MouseEvent<HTMLButtonElement>);
    }
  };

  const iconConfig = entry.extension ? FILE_ICONS[entry.extension] : null;
  const Icon = isDirectory ? (isOpen ? FolderOpen : Folder) : (iconConfig?.icon || File);
  const iconColor = isDirectory ? 'text-amber-500' : (iconConfig?.color || 'text-muted-foreground');

  if (!isDirectory) {
    return (
      <button
        data-file-node
        data-file-type="file"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex items-center gap-2 w-full min-w-0 overflow-hidden rounded-md p-2 text-left text-sm',
          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          'focus:ring-1 focus:ring-inset ring-sidebar-ring outline-hidden',
          '[&_svg]:size-4 [&_svg]:shrink-0',
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <Icon className={iconColor} />
        <div className="flex-1 min-w-0 truncate">{entry.name}</div>
        {entry.git && <GitStatusBadge git={entry.git} />}
      </button>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <CollapsibleTrigger asChild>
        <button
          data-file-node
          data-file-type="directory"
          data-file-is-open={isOpen || undefined}
          onPointerEnter={handlePrefetch}
          onPointerLeave={cancelPrefetch}
          onFocus={handlePrefetch}
          onBlur={cancelPrefetch}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex items-center gap-2 w-full min-w-0 overflow-hidden rounded-md p-2 text-left text-sm',
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            'focus:ring-1 focus:ring-inset ring-sidebar-ring outline-hidden',
            '[&_svg]:size-4 [&_svg]:shrink-0',
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isOpen && isLoading && !isFetched ? (
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          ) : (
            <ChevronRight
              className={cn(
                'w-3 h-3 shrink-0 transition-transform',
                isOpen && 'rotate-90'
              )}
            />
          )}
          <Icon className={iconColor} />
          <div className="flex-1 min-w-0 truncate">{entry.name}</div>
          {entry.git && <GitStatusBadge git={entry.git} />}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {isOpen && children.map(child => (
          <FileTreeNode
            key={`${fullPath}/${child.path}`}
            entry={child}
            workspaceId={workspaceId}
            parentPath={fullPath}
            depth={depth + 1}
            onFileSelect={onFileSelect}
            showHidden={showHidden}
            sdkClient={sdkClient}
            root={root}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
