import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import type { FileEntry } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileTreeNode } from './FileTreeNode';
import { useFileBrowseQuery } from '@/hooks/queries';

interface FileTreeProps {
  workspaceId: string;
  sdkClient: Jean2Client | null;
  onFileSelect?: (file: FileEntry) => void;
  showHidden?: boolean;
  width?: number;
}

export interface FileTreeHandle {
  refresh: () => void;
  focus: () => void;
}

export const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(
  ({ workspaceId, sdkClient, onFileSelect, showHidden = true, width }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const { data, isLoading, error, refetch } = useFileBrowseQuery(
      sdkClient,
      workspaceId,
      undefined,
      { showHidden },
    );

    const files = data?.files ?? [];
    const currentPath = data?.currentPath ?? '';

    useImperativeHandle(ref, () => ({
      refresh: () => {
        refetch();
      },
      focus: () => {
        const container = containerRef.current;
        if (!container) return;
        const firstNode = container.querySelector<HTMLButtonElement>('[data-file-node]');
        if (firstNode) {
          firstNode.focus();
        } else {
          container.focus();
        }
      },
    }), [refetch]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const allNodes = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[data-file-node]')
      );
      if (allNodes.length === 0) return;

      const currentIndex = allNodes.indexOf(document.activeElement as HTMLButtonElement);

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = currentIndex < allNodes.length - 1 ? currentIndex + 1 : 0;
          allNodes[nextIndex]?.focus();
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : allNodes.length - 1;
          allNodes[prevIndex]?.focus();
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const focused = document.activeElement as HTMLElement;
          if (!focused) break;
          const fileType = focused.getAttribute('data-file-type');
          if (fileType === 'directory') {
            const isOpen = focused.getAttribute('data-file-is-open');
            if (isOpen !== 'true') {
              focused.click();
            } else {
              const nextIndex = currentIndex < allNodes.length - 1 ? currentIndex + 1 : -1;
              if (nextIndex >= 0) allNodes[nextIndex]?.focus();
            }
          } else {
            const nextIndex = currentIndex < allNodes.length - 1 ? currentIndex + 1 : -1;
            if (nextIndex >= 0) allNodes[nextIndex]?.focus();
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const focused = document.activeElement as HTMLElement;
          if (!focused) break;
          const fileType = focused.getAttribute('data-file-type');
          if (fileType === 'directory') {
            const isOpen = focused.getAttribute('data-file-is-open');
            if (isOpen === 'true') {
              focused.click();
            } else {
              const prevIndex = currentIndex > 0 ? currentIndex - 1 : -1;
              if (prevIndex >= 0) allNodes[prevIndex]?.focus();
            }
          } else {
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : -1;
            if (prevIndex >= 0) allNodes[prevIndex]?.focus();
          }
          break;
        }
        case 'Enter': {
          if (document.activeElement instanceof HTMLButtonElement) {
            document.activeElement.click();
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          (document.activeElement as HTMLElement)?.blur();
          break;
        }
      }
    }, []);

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading files...
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-4 text-sm text-destructive">
          {error.message}
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-2">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
      );
    }

    if (files.length === 0) {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          Empty workspace
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-2">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
      );
    }

    return (
      <div ref={containerRef} tabIndex={-1} onKeyDown={handleKeyDown} className="flex-1 min-h-0 min-w-0 w-full outline-none">
        <ScrollArea className="h-full">
          <div className="px-2 pb-2 w-full min-w-0" style={width ? { width: `${width - 8}px` } : undefined}>
            <div className="space-y-0.5 min-w-0">
              {files.map(file => (
                <FileTreeNode
                  key={file.path}
                  entry={file}
                  workspaceId={workspaceId}
                  parentPath={currentPath}
                  depth={0}
                  onFileSelect={onFileSelect}
                  showHidden={showHidden}
                  sdkClient={sdkClient}
                />
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }
);

FileTree.displayName = 'FileTree';
