import { forwardRef, useCallback, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { X, RefreshCw, Search, ChevronDown, Folder, Check } from 'lucide-react';
import type { FileEntry } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { FileTree, type FileTreeHandle, GitChangesView, type GitChangesViewHandle } from '@/components/files';
import { FOLDER_ICON_COLOR } from '@/components/files/fileIcons';
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
import { useFileSearchQuery } from '@/hooks/queries';
import { queryKeys } from '@/lib/queryKeys';

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
            <Folder className={cn('size-3.5 shrink-0', FOLDER_ICON_COLOR)} />
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
            <Folder className={cn('size-3.5 shrink-0', FOLDER_ICON_COLOR)} />
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
  const normalizedQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState(normalizedQuery);

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setDebouncedQuery('');
      return;
    }

    const timer = window.setTimeout(() => {
      setDebouncedQuery(normalizedQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [normalizedQuery]);

  const effectiveQuery = normalizedQuery.length >= 2 ? debouncedQuery : '';
  const { data, isFetching, error } = useFileSearchQuery(
    sdkClient,
    workspaceId,
    effectiveQuery,
    root,
  );
  const results = data?.files ?? [];
  const loading = normalizedQuery.length >= 2 && (
    effectiveQuery !== normalizedQuery || isFetching
  );

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

  if (error) {
    return (
      <div className="p-3 text-xs text-destructive">
        {error instanceof Error ? error.message : 'File search failed'}
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
    const gitChangesRef = useRef<GitChangesViewHandle>(null);
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

    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = useCallback(() => {
      setIsRefreshing(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.files.browsePrefix });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.searchPrefix });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.browseFsPrefix });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.parentPrefix });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.drivesPrefix });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.gitStatusPrefix });

      if (sdkClient && workspaceId) {
        void sdkClient.http.workspaces
          .get(workspaceId)
          .then(({ workspace: updatedWorkspace }) => {
            const store = useServerDataStore.getState();
            store.setWorkspaces(
              store.workspaces.map((w) => (w.id === updatedWorkspace.id ? updatedWorkspace : w)),
            );
            if (store.activeWorkspace?.id === updatedWorkspace.id) {
              store.setActiveWorkspace(updatedWorkspace);
            }
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error('Failed to refresh workspace:', message);
          })
          .finally(() => setIsRefreshing(false));
      } else {
        setIsRefreshing(false);
      }
    }, [sdkClient, workspaceId]);

    const focus = useCallback(() => {
      setShowFilesPanel(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (filesPanelTab === 'changes') {
            gitChangesRef.current?.focus();
          } else {
            fileTreeRef.current?.focus();
          }
        });
      });
    }, [setShowFilesPanel, filesPanelTab]);

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
          <Button variant="ghost" size="icon-sm" onClick={handleRefresh} disabled={isRefreshing} className="shrink-0">
            <RefreshCw className={cn('size-4', isRefreshing && 'animate-spin')} />
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
          ref={gitChangesRef}
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
