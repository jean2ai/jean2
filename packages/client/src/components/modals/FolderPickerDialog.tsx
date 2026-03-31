import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, Folder, Loader2, Check, Search, HardDrive } from 'lucide-react';
import type { FileEntry } from '@jean2/shared';
import { useApi } from '@/hooks/useApi';
import { useServerContext } from '@/contexts/ServerContext';
import { join } from '@/lib/path';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface FolderPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  initialPath?: string;
  title?: string;
}

export function FolderPickerDialog({
  open,
  onOpenChange,
  onSelect,
  initialPath,
  title = 'Select Folder',
}: FolderPickerDialogProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRoot, setIsRoot] = useState(false);
  const [drives, setDrives] = useState<string[]>([]);
  const [showDrives, setShowDrives] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { fetchWithAuth } = useApi();
  const { activeServer } = useServerContext();

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setSelectedIndex(0);
    setSearchQuery('');
    setShowDrives(false);
    
    try {
      const res = await fetchWithAuth(
        `/api/fs/browse?path=${encodeURIComponent(path)}`,
        {},
        { serverUrl: activeServer?.url, token: activeServer?.token }
      );
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Failed to browse directory');
      }
      
      // Only show directories for folder picker
      const directories = data.files.filter((f: FileEntry) => f.type === 'directory');
      setFiles(directories);
      setCurrentPath(data.currentPath);
      setIsRoot(data.isRoot ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, activeServer]);

  const loadDrives = useCallback(async () => {
    try {
      const res = await fetchWithAuth(
        '/api/fs/drives',
        {},
        { serverUrl: activeServer?.url, token: activeServer?.token }
      );
      const data = await res.json();
      setDrives(data.drives || []);
    } catch {
      // Silently fail — drives are optional UI
    }
  }, [fetchWithAuth, activeServer]);

  useEffect(() => {
    if (open) {
      loadDirectory(initialPath || '');
      loadDrives();
    }
  }, [open, initialPath, loadDirectory, loadDrives]);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Filter files based on search query
  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Derive selected folder from index
  const selectedFolder = filteredFiles[selectedIndex] ?? null;

  // Helper: compute full path for a folder entry
  // file.path from browse API is just the entry name, not a full path
  const getFullPath = useCallback((folder: FileEntry): string => {
    return join(currentPath, folder.name);
  }, [currentPath]);

  // Compute the path to display/use for selection and navigation
  const targetPath = selectedFolder ? getFullPath(selectedFolder) : currentPath;

  const isUsingCurrentFolder = !selectedFolder;

  const handleNavigateUp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(
        `/api/fs/parent?path=${encodeURIComponent(currentPath)}`,
        {},
        { serverUrl: activeServer?.url, token: activeServer?.token }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to navigate up');
      }
      const directories = data.files.filter((f: FileEntry) => f.type === 'directory');
      setFiles(directories);
      setCurrentPath(data.currentPath);
      setIsRoot(data.isRoot ?? false);
      setSelectedIndex(0);
      setSearchQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to navigate up');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCurrent = () => {
    if (targetPath) {
      onSelect(targetPath);
      onOpenChange(false);
    }
  };

  const handleNavigateInto = (folder: FileEntry) => {
    const newPath = getFullPath(folder);
    loadDirectory(newPath);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredFiles.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredFiles.length - 1));
        break;
      case 'ArrowRight':
        if (filteredFiles[selectedIndex]) {
          e.preventDefault();
          handleNavigateInto(filteredFiles[selectedIndex]);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        handleSelectCurrent();
        break;
      case 'Escape':
        if (searchQuery) {
          e.preventDefault();
          setSearchQuery('');
        }
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredFiles.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, filteredFiles.length]);

  // Focus search input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    setShowDrives(false);
  }, [currentPath]);

  // Truncate path for display
  const truncatePath = (path: string, maxLength: number = 50) => {
    if (path.length <= maxLength) return path;
    const parts = path.split(/[/\\]/);
    if (parts.length <= 2) return path;
    return '.../' + parts.slice(-2).join('/');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3">
          {/* Path breadcrumb / navigation */}
          <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={handleNavigateUp}
              disabled={loading || !currentPath || isRoot}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {drives.length > 1 && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={() => setShowDrives(prev => !prev)}
                  disabled={loading}
                >
                  <HardDrive className="w-4 h-4" />
                </Button>
                {showDrives && (
                  <div className="absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-md z-50 min-w-[120px]">
                    {drives.map(drive => (
                      <button
                        key={drive}
                        onClick={() => {
                          loadDirectory(drive);
                          setShowDrives(false);
                        }}
                        className={cn(
                          'flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-muted',
                          currentPath === drive && 'bg-primary/20 text-primary font-medium'
                        )}
                      >
                        <Folder className="w-3.5 h-3.5 text-amber-500" />
                        {drive}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <span className="flex-1 text-sm font-mono truncate" title={targetPath}>
              {selectedFolder ? (
                <span className="text-primary">
                  {truncatePath(getFullPath(selectedFolder), 45)}
                </span>
              ) : (
                truncatePath(currentPath) || 'Home'
              )}
            </span>
          </div>
          
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Filter folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          
          {/* Directory listing */}
          <ScrollArea className="h-64 border rounded-md">
            {loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading...
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <span className="text-destructive">{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadDirectory(currentPath)}
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                <Folder className="w-8 h-8 mb-2 opacity-50" />
                {searchQuery ? 'No matching folders' : 'No folders in this directory'}
              </div>
            ) : (
              <div className="p-1" ref={listRef}>
                {filteredFiles.map((file, index) => (
                  <button
                    key={file.path}
                    onClick={() => setSelectedIndex(index)}
                    onDoubleClick={() => handleNavigateInto(file)}
                    className={cn(
                      'flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-left',
                      'hover:bg-muted',
                      index === selectedIndex && 'bg-primary/20 text-primary font-medium ring-1 ring-primary/50'
                    )}
                  >
                    <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span className="truncate flex-1">{file.name}</span>
                    {index === selectedIndex && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
          
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSelectCurrent} disabled={!targetPath || loading}>
            {isUsingCurrentFolder ? 'Use This Folder' : 'Add Selected Folder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
