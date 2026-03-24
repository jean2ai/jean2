import { useState } from 'react';
import { ChevronRight, Folder, FolderOpen, File, Loader2 } from 'lucide-react';
import type { FileEntry } from '@jean2/shared';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';

interface FileTreeNodeProps {
  entry: FileEntry;
  workspaceId: string;
  parentPath: string;
  depth: number;
  onFileSelect?: (file: FileEntry) => void;
  showHidden?: boolean;
  serverUrl?: string;
  apiToken?: string;
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

export function FileTreeNode({
  entry,
  workspaceId,
  parentPath,
  depth,
  onFileSelect,
  showHidden = true,
  serverUrl,
  apiToken,
}: FileTreeNodeProps) {
  const { fetchWithAuth } = useApi();
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fullPath = parentPath ? `${parentPath}/${entry.path}` : entry.path;
  const isDirectory = entry.type === 'directory';

  const loadChildren = async () => {
    if (hasLoaded || isLoading) return;

    setIsLoading(true);

    try {
      const res = await fetchWithAuth(
        `/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(fullPath)}&showHidden=${showHidden}`,
        {},
        { serverUrl, token: apiToken }
      );
      const data = await res.json();
      setChildren(data.files || []);
      setHasLoaded(true);
    } catch (err) {
      console.error('Failed to load children:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (open: boolean) => {
    setIsOpen(open);
    if (open && isDirectory) {
      loadChildren();
    }
  };

  const handleClick = () => {
    if (!isDirectory && onFileSelect) {
      onFileSelect({ ...entry, path: fullPath });
    }
  };

  const iconConfig = entry.extension ? FILE_ICONS[entry.extension] : null;
  const Icon = isDirectory ? (isOpen ? FolderOpen : Folder) : (iconConfig?.icon || File);
  const iconColor = isDirectory ? 'text-amber-500' : (iconConfig?.color || 'text-muted-foreground');

  if (!isDirectory) {
    return (
      <button
        onClick={handleClick}
        className={cn(
          'flex items-center gap-1.5 w-full min-w-0 overflow-x-hidden px-1.5 py-0.5 rounded text-sm',
          'hover:bg-accent hover:text-accent-foreground',
          'transition-colors text-left',
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        <Icon className={cn('w-4 h-4 shrink-0', iconColor)} />
        <span className="truncate min-w-0 flex-1">{entry.name}</span>
      </button>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 w-full min-w-0 overflow-x-hidden px-1.5 py-0.5 rounded text-sm',
            'hover:bg-accent hover:text-accent-foreground',
            'transition-colors text-left',
          )}
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          ) : (
            <ChevronRight
              className={cn(
                'w-3 h-3 shrink-0 transition-transform',
                isOpen && 'rotate-90'
              )}
            />
          )}
          <Icon className={cn('w-4 h-4 shrink-0', iconColor)} />
          <span className="truncate min-w-0 flex-1">{entry.name}</span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {children.map(child => (
          <FileTreeNode
            key={`${fullPath}/${child.path}`}
            entry={child}
            workspaceId={workspaceId}
            parentPath={fullPath}
            depth={depth + 1}
            onFileSelect={onFileSelect}
            showHidden={showHidden}
            serverUrl={serverUrl}
            apiToken={apiToken}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
