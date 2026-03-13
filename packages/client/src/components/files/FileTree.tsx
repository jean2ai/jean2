import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import type { FileEntry } from '@jean2/shared';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileTreeNode } from './FileTreeNode';

interface FileTreeProps {
  workspaceId: string;
  onFileSelect?: (file: FileEntry) => void;
  showHidden?: boolean;
}

export function FileTree({ workspaceId, onFileSelect, showHidden = true }: FileTreeProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/files?showHidden=${showHidden}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to load files');
      }

      setFiles(data.files);
      setCurrentPath(data.currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, showHidden]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  if (loading) {
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
        {error}
        <Button variant="ghost" size="sm" onClick={loadRoot} className="ml-2">
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Empty workspace
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Files
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={loadRoot}
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>

        <div className="space-y-0.5">
          {files.map(file => (
            <FileTreeNode
              key={file.path}
              entry={file}
              workspaceId={workspaceId}
              parentPath={currentPath}
              depth={0}
              onFileSelect={onFileSelect}
              showHidden={showHidden}
            />
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
