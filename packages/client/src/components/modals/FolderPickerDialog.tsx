import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, Folder, Loader2, Check, Search } from 'lucide-react';
import type { FileEntry } from '@jean2/shared';
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
import { dirname } from '@/lib/path';

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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setSelectedIndex(0);
    setSearchQuery('');
    
    try {
      const res = await fetch(`/api/fs/browse?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Failed to browse directory');
      }
      
      // Only show directories for folder picker
      const directories = data.files.filter((f: FileEntry) => f.type === 'directory');
      setFiles(directories);
      setCurrentPath(data.currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadDirectory(initialPath || '');
    }
  }, [open, initialPath, loadDirectory]);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Filter files based on search query
  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleNavigateUp = () => {
    const parent = dirname(currentPath);
    if (parent && parent !== currentPath) {
      loadDirectory(parent);
    }
  };

  const handleSelectCurrent = () => {
    if (currentPath) {
      onSelect(currentPath);
      onOpenChange(false);
    }
  };

  const handleNavigateInto = (folder: FileEntry) => {
    const newPath = currentPath ? `${currentPath}/${folder.name}` : folder.name;
    loadDirectory(newPath);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredFiles.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredFiles.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredFiles[selectedIndex]) {
          handleNavigateInto(filteredFiles[selectedIndex]);
        }
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

  // Truncate path for display
  const truncatePath = (path: string, maxLength: number = 50) => {
    if (path.length <= maxLength) return path;
    const parts = path.split('/');
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
              disabled={loading || !currentPath}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="flex-1 text-sm font-mono truncate" title={currentPath}>
              {truncatePath(currentPath) || 'Home'}
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
                    onClick={() => {
                      setSelectedIndex(index);
                    }}
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
          {filteredFiles[selectedIndex] ? (
            <Button onClick={() => handleNavigateInto(filteredFiles[selectedIndex])}>
              Open "{filteredFiles[selectedIndex].name}"
            </Button>
          ) : (
            <Button onClick={handleSelectCurrent} disabled={!currentPath}>
              Use This Folder
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
