import { forwardRef, useCallback, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { X, RefreshCw, Search, ChevronDown, Folder, Check } from 'lucide-react';
import type { FileEntry } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { FileTree, type FileTreeHandle, GitChangesView } from '@/components/files';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  PanelResizeHandle,
} from '@/components/ui/sidebar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import { useUIStore } from '@/stores/uiStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { queryClient } from '@/components/providers/QueryProvider';
import { platform } from '@/platform';

interface FilesPanelProps {
  sdkClient: Jean2Client | null;
}

export interface FilesPanelHandle {
  focus: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

function pathBasename(p: string): string {
  const trimmed = p.replace(/\/+$/, '');
  const slashIdx = trimmed.lastIndexOf('/');
  return slashIdx === -1 ? trimmed : trimmed.slice(slashIdx + 1);
}

function PathSwitcher({
  workspace,
  selectedRoot,
  onSelect,
}: {
  workspace: { name: string; path: string; additionalPaths: string[] };
  selectedRoot: string;
  onSelect: (root: string) => void;
}) {
  const options = [
    { label: workspace.name || pathBasename(workspace.path) || 'Workspace', value: workspace.path },
    ...workspace.additionalPaths.map((p) => ({ label: pathBasename(p) || p, value: p })),
  ];
  const selectedLabel = options.find((o) => o.value === selectedRoot)?.label ?? options[0].label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 min-w-0 flex-1 justify-between gap-1 px-2 text-sm font-medium"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <Folder className="size-3.5 shrink-0 text-amber-500" />
            <span className="truncate">{selectedLabel}</span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[12rem] max-w-[18rem]">
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className="gap-2"
          >
            <Folder className="size-3.5 shrink-0 text-amber-500" />
            <span className="truncate">{opt.label}</span>
            {opt.value === selectedRoot && <Check className="size-3.5 ml-auto shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Debounced search results list (flat), reusing the server search endpoint.
 */
function SearchResults({
  workspaceId,
  sdkClient,
  query,
  root,
  onFileSelect,
}: {
  workspaceId: string;
  sdkClient: Jean2Client | null;
  query: string;
  root: string | undefined;
  onFileSelect: (file: FileEntry) => void;
}) {
  const [results, setResults] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const queryIdRef = useRef(0);

  useEffect(() => {
    if (!query || query.length < 2 || !sdkClient) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      const queryId = ++queryIdRef.current;
      setLoading(true);
      const controller = new AbortController();

      sdkClient.http.files
        .search(workspaceId, query, { showHidden: true, root, limit: 50, signal: controller.signal })
        .then((data) => {
          if (queryId !== queryIdRef.current) return;
          setResults(data.files ?? []);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name !== 'AbortError') {
            console.error('File search failed:', err);
          }
        })
        .finally(() => {
          if (queryId === queryIdRef.current) setLoading(false);
        });

      return () => controller.abort();
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [workspaceId, query, root, sdkClient, onFileSelect]);

  if (!query || query.length < 2) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        Type at least 2 characters to search files...
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" />
        Searching...
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        No files found matching &quot;{query}&quot;
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-2 pb-2 space-y-0.5">
        {results.map((file) => {
          const lastSlash = file.path.lastIndexOf('/');
          const fileName = lastSlash === -1 ? file.path : file.path.slice(lastSlash + 1);
          const dirPath = lastSlash === -1 ? '' : file.path.slice(0, lastSlash + 1);
          return (
            <button
              key={file.path}
              onClick={() => onFileSelect(file)}
              className={cn(
                'flex items-center gap-2 w-full min-w-0 px-2 py-1.5 rounded-md text-sm text-left',
                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <span className="truncate flex-1 min-w-0">
                {dirPath && <span className="text-muted-foreground">{dirPath}</span>}
                <span>{fileName}</span>
              </span>
              {file.extension && (
                <span className="text-[10px] text-muted-foreground shrink-0">{file.extension}</span>
              )}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

export const FilesPanel = forwardRef<FilesPanelHandle, FilesPanelProps>(
  ({ sdkClient }, ref) => {
    const isMobile = useIsMobile();
    const fileTreeRef = useRef<FileTreeHandle>(null);
    const filesPanelWidth = useChatLayoutStore((s) => s.filesPanelWidth);
    const showFilesPanel = useChatLayoutStore((s) => s.showFilesPanel);
    const setShowFilesPanel = useChatLayoutStore((s) => s.setShowFilesPanel);
    const filesPanelTab = useChatLayoutStore((s) => s.filesPanelTab);
    const setFilesPanelTab = useChatLayoutStore((s) => s.setFilesPanelTab);
    const filesPanelRoot = useChatLayoutStore((s) => s.filesPanelRoot);
    const setFilesPanelRoot = useChatLayoutStore((s) => s.setFilesPanelRoot);
    const filesPanelGitMode = useChatLayoutStore((s) => s.filesPanelGitMode);
    const setFilesPanelGitMode = useChatLayoutStore((s) => s.setFilesPanelGitMode);
    const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);
    const workspaceId = activeWorkspace?.id;
    const [searchQuery, setSearchQuery] = useState('');

    // Resolve the effective selected root (fall back to workspace.path).
    const selectedRoot = filesPanelRoot ?? activeWorkspace?.path ?? '';
    const isMainRoot = selectedRoot === activeWorkspace?.path;

    // Reset stale root when the active workspace changes.
    useEffect(() => {
      if (!activeWorkspace) return;
      if (filesPanelRoot && filesPanelRoot !== activeWorkspace.path && !activeWorkspace.additionalPaths.includes(filesPanelRoot)) {
        setFilesPanelRoot(null);
      }
    }, [activeWorkspace, filesPanelRoot, setFilesPanelRoot]);

    const handleRefresh = useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    }, []);

    const focus = useCallback(() => {
      setShowFilesPanel(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fileTreeRef.current?.focus();
        });
      });
    }, [setShowFilesPanel]);

    useImperativeHandle(ref, () => ({ focus }), [focus]);

    const openFilePreview = useUIStore((s) => s.openFilePreview);

    const handleFileSelect = useCallback((file: FileEntry) => {
      if (file.type === 'file' && workspaceId) {
        if (platform.capabilities.fileOpen && platform.openFile) {
          const rootPath = isMainRoot ? (activeWorkspace?.path ?? '') : selectedRoot;
          const absPath = rootPath ? `${rootPath}/${file.path}` : file.path;
          void platform.openFile(absPath);
        } else {
          openFilePreview({
            workspaceId,
            path: file.path,
            name: file.name,
            root: isMainRoot ? undefined : selectedRoot,
          });
        }
      }
    }, [workspaceId, openFilePreview, activeWorkspace?.path, isMainRoot, selectedRoot]);

    const headerContent = activeWorkspace ? (
      <div className="flex flex-col gap-2 px-2 pt-2 pb-2">
        <div className="flex items-center gap-1.5">
          <PathSwitcher
            workspace={activeWorkspace}
            selectedRoot={selectedRoot}
            onSelect={setFilesPanelRoot}
          />
          <Button variant="ghost" size="icon-sm" onClick={handleRefresh} className="shrink-0">
            <RefreshCw className="size-4" />
          </Button>
          {isMobile && (
            <Button variant="ghost" size="icon-sm" onClick={() => setShowFilesPanel(false)} className="shrink-0">
              <X className="size-4" />
            </Button>
          )}
        </div>
        <Tabs value={filesPanelTab} onValueChange={(v) => setFilesPanelTab(v as 'project' | 'changes')}>
          <TabsList className="w-full">
            <TabsTrigger value="project" className="flex-1">Project</TabsTrigger>
            <TabsTrigger value="changes" className="flex-1">Changes</TabsTrigger>
          </TabsList>
        </Tabs>
        {filesPanelTab === 'project' && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="h-7 pl-7 pr-2 text-sm"
            />
          </div>
        )}
        {filesPanelTab === 'changes' && (
          <Tabs value={filesPanelGitMode} onValueChange={(v) => setFilesPanelGitMode(v as 'grouped' | 'flat')}>
            <TabsList variant="line" className="w-full">
              <TabsTrigger value="grouped" className="flex-1">Grouped</TabsTrigger>
              <TabsTrigger value="flat" className="flex-1">Flat</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
    ) : null;

    const content = workspaceId ? (
      filesPanelTab === 'project' ? (
        searchQuery.trim().length >= 2 ? (
          <SearchResults
            workspaceId={workspaceId}
            sdkClient={sdkClient}
            query={searchQuery.trim()}
            root={isMainRoot ? undefined : selectedRoot}
            onFileSelect={handleFileSelect}
          />
        ) : (
          <FileTree
            ref={fileTreeRef}
            key={workspaceId + selectedRoot}
            workspaceId={workspaceId}
            sdkClient={sdkClient}
            showHidden={true}
            width={filesPanelWidth}
            root={isMainRoot ? undefined : selectedRoot}
            onFileSelect={handleFileSelect}
          />
        )
      ) : (
        <GitChangesView
          workspaceId={workspaceId}
          sdkClient={sdkClient}
          root={isMainRoot ? undefined : selectedRoot}
          mode={filesPanelGitMode}
          onFileSelect={handleFileSelect}
          width={filesPanelWidth}
        />
      )
    ) : null;

    if (!workspaceId) {
      return null;
    }

    if (isMobile) {
      return (
        <Sheet open={showFilesPanel} onOpenChange={(open) => !open && setShowFilesPanel(false)}>
          <SheetContent side="right" className="w-72 p-0 bg-sidebar [&>button]:hidden">
            <SheetHeader className="sr-only">
              <SheetTitle>Files</SheetTitle>
            </SheetHeader>
            {headerContent}
            <div className="flex flex-1 flex-col min-h-0 overflow-hidden border-t border-border">
              {content}
            </div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <SidebarProvider
        panelId="files"
        defaultOpen={true}
        className="w-0 shrink-0"
        style={{ '--sidebar-width': `${filesPanelWidth}px` } as React.CSSProperties}
      >
        <Sidebar side="right" isOpen={showFilesPanel} variant="floating">
          <PanelResizeHandle side="right" panelId="files" />
          {headerContent}
          <SidebarContent className="overflow-hidden border-t border-border">
            {content}
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
  }
);

FilesPanel.displayName = 'FilesPanel';
