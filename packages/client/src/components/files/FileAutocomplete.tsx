import { useState, useEffect } from 'react';
import { File, Folder, Loader2 } from 'lucide-react';
import type { FileEntry } from '@jean2/shared';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';

interface FileAutocompleteProps {
  workspaceId: string;
  searchQuery: string;
  selectedIndex: number;
  onSelect: (file: FileEntry) => void;
  onFilesChange: (files: FileEntry[]) => void;
  showHidden?: boolean;
  serverUrl?: string;
  apiToken?: string;
}

export function FileAutocomplete({
  workspaceId,
  searchQuery,
  selectedIndex,
  onSelect,
  onFilesChange,
  showHidden = true,
  serverUrl,
  apiToken,
}: FileAutocompleteProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  const { fetchWithAuth } = useApi();

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch files when debounced query changes
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setFiles([]);
      onFilesChange([]);
      return;
    }

    setLoading(true);

    const controller = new AbortController();

    fetchWithAuth(
      `/api/workspaces/${workspaceId}/files?search=${encodeURIComponent(debouncedQuery)}&showHidden=${showHidden}`,
      { signal: controller.signal },
      { serverUrl, token: apiToken }
    )
      .then(res => res.json())
      .then(data => {
        const newFiles = data.files || [];
        setFiles(newFiles);
        onFilesChange(newFiles);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('File search failed:', err);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [workspaceId, debouncedQuery, onFilesChange, showHidden, fetchWithAuth, serverUrl, apiToken]);

  if (!searchQuery || searchQuery.length < 2) {
    return (
      <div className="p-2 text-xs text-muted-foreground">
        Type at least 2 characters to search files...
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Searching...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="p-2 text-xs text-muted-foreground">
        No files found matching "{searchQuery}"
      </div>
    );
  }

  return (
    <div className="p-1">
      {files.map((file, index) => (
        <button
          key={file.path}
          onClick={() => onSelect(file)}
          className={cn(
            'flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-left',
            'hover:bg-muted',
            index === selectedIndex && 'bg-primary/20 text-primary font-medium ring-1 ring-primary/50'
          )}
        >
          {file.type === 'directory' ? (
            <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
          ) : (
            <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          <span className="truncate flex-1">{file.path}</span>
          {file.extension && (
            <span className="text-xs text-muted-foreground">{file.extension}</span>
          )}
        </button>
      ))}
      <div className="mt-1 pt-1 border-t text-xs text-muted-foreground px-2">
        {files.length} result{files.length !== 1 ? 's' : ''} • 
        <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd> navigate
        <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-[10px]">↵</kbd> select
        <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-[10px]">esc</kbd> close
      </div>
    </div>
  );
}
