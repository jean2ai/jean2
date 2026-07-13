import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Loader2, File, ChevronRight, Folder } from 'lucide-react';
import type { FileEntry, GitDiffSummary } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useGitStatusQuery } from '@/hooks/queries';
import { GitStatusBadge } from './GitStatusBadge';
import { FOLDER_ICON_COLOR, fileIconColor } from './fileIcons';

export interface GitChangesViewHandle {
  focus: () => void;
}

interface GitChangesViewProps {
  workspaceId: string;
  sdkClient: Jean2Client | null;
  root?: string;
  mode: 'grouped' | 'flat';
  onFileSelect: (file: FileEntry) => void;
  width?: number;
}

type ChangedFile = { path: string; git: GitDiffSummary };

// --- Tree model ---

export interface ChangedDirectoryNode {
  name: string;
  path: string;
  directories: ChangedDirectoryNode[];
  files: ChangedFile[];
  fileCount: number;
}

export interface ChangedFilesTree {
  directories: ChangedDirectoryNode[];
  files: ChangedFile[];
}

function getFileName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * Build a recursive directory tree from a flat list of changed files.
 * Every directory segment in a file's path becomes a node.
 * Directories are sorted before files at every level, both alphabetically.
 * The input array is not mutated.
 */
export function buildChangedFilesTree(files: ChangedFile[]): ChangedFilesTree {
  interface BuilderDir {
    name: string;
    path: string;
    directories: Map<string, BuilderDir>;
    files: ChangedFile[];
  }

  const root: BuilderDir = {
    name: '',
    path: '',
    directories: new Map(),
    files: [],
  };

  for (const f of files) {
    const segments = f.path.split('/');
    const dirSegments = segments.slice(0, -1);
    const fileName = segments[segments.length - 1];

    if (!fileName) continue;

    let current = root;
    for (const seg of dirSegments) {
      if (!seg) continue;
      let child = current.directories.get(seg);
      if (!child) {
        child = {
          name: seg,
          path: current.path ? `${current.path}/${seg}` : seg,
          directories: new Map(),
          files: [],
        };
        current.directories.set(seg, child);
      }
      current = child;
    }
    current.files.push(f);
  }

  function convert(dir: BuilderDir): ChangedDirectoryNode {
    const directories = Array.from(dir.directories.values())
      .map(convert)
      .sort((a, b) => a.name.localeCompare(b.name));
    const sortedFiles = [...dir.files].sort((a, b) =>
      getFileName(a.path).localeCompare(getFileName(b.path)),
    );
    const fileCount =
      sortedFiles.length + directories.reduce((sum, d) => sum + d.fileCount, 0);
    return {
      name: dir.name,
      path: dir.path,
      directories,
      files: sortedFiles,
      fileCount,
    };
  }

  return {
    directories: Array.from(root.directories.values())
      .map(convert)
      .sort((a, b) => a.name.localeCompare(b.name)),
    files: [...root.files].sort((a, b) =>
      getFileName(a.path).localeCompare(getFileName(b.path)),
    ),
  };
}

// --- File row ---

function ChangedFileRow({
  path,
  git,
  onFileSelect,
  depth = 0,
  showChevronSpacer = false,
  showDirPrefix = true,
}: {
  path: string;
  git: GitDiffSummary;
  onFileSelect: (file: FileEntry) => void;
  depth?: number;
  showChevronSpacer?: boolean;
  showDirPrefix?: boolean;
}) {
  const lastSlash = path.lastIndexOf('/');
  const fileName = lastSlash === -1 ? path : path.slice(lastSlash + 1);
  const dirPath = lastSlash === -1 ? '' : path.slice(0, lastSlash + 1);

  const handleClick = () => {
    const ext = fileName.lastIndexOf('.') !== -1 ? fileName.slice(fileName.lastIndexOf('.')) : undefined;
    onFileSelect({ name: fileName, type: 'file', path, extension: ext, git });
  };

  return (
    <button
      data-file-node
      data-file-type="file"
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 w-full min-w-0 overflow-hidden rounded-md p-2 text-left text-sm',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'focus:ring-1 focus:ring-inset ring-sidebar-ring outline-hidden',
        '[&_svg]:size-4 [&_svg]:shrink-0',
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {showChevronSpacer && <span className="w-3 h-3 shrink-0" aria-hidden />}
      <File className={fileIconColor(path)} />
      <span className="truncate flex-1 min-w-0">
        {showDirPrefix && dirPath && <span className="text-muted-foreground">{dirPath}</span>}
        <span>{fileName}</span>
      </span>
      <GitStatusBadge git={git} />
    </button>
  );
}

// --- Grouped mode ---

function GroupedChangedFiles({
  files,
  onFileSelect,
}: {
  files: ChangedFile[];
  onFileSelect: (file: FileEntry) => void;
}) {
  const tree = useMemo(() => buildChangedFilesTree(files), [files]);

  return (
    <div className="space-y-0.5">
      {tree.directories.map((dir) => (
        <GroupedDirectoryNode key={dir.path} node={dir} depth={0} onFileSelect={onFileSelect} />
      ))}
      {tree.files.map((f) => (
        <ChangedFileRow
          key={f.path}
          path={f.path}
          git={f.git}
          depth={0}
          showChevronSpacer
          showDirPrefix={false}
          onFileSelect={onFileSelect}
        />
      ))}
    </div>
  );
}

function GroupedDirectoryNode({
  node,
  depth,
  onFileSelect,
}: {
  node: ChangedDirectoryNode;
  depth: number;
  onFileSelect: (file: FileEntry) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          data-file-node
          data-file-type="directory"
          data-file-is-open={open || undefined}
          className={cn(
            'flex items-center gap-2 w-full min-w-0 overflow-hidden rounded-md p-2 text-left text-sm',
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            'focus:ring-1 focus:ring-inset ring-sidebar-ring outline-hidden',
            '[&_svg]:size-4 [&_svg]:shrink-0',
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <ChevronRight className={cn('w-3 h-3 shrink-0 transition-transform', open && 'rotate-90')} />
          <Folder className={FOLDER_ICON_COLOR} />
          <span className="flex-1 min-w-0 truncate">{node.name}</span>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{node.fileCount}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-0.5">
          {node.directories.map((child) => (
            <GroupedDirectoryNode key={child.path} node={child} depth={depth + 1} onFileSelect={onFileSelect} />
          ))}
          {node.files.map((f) => (
            <ChangedFileRow
              key={f.path}
              path={f.path}
              git={f.git}
              depth={depth + 1}
              showChevronSpacer
              showDirPrefix={false}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// --- Main component ---

const REASON_LABELS: Record<string, string> = {
  git_not_installed: 'Git is not installed',
  not_a_git_repo: 'Not a git repository',
  git_error: 'Unable to read git status',
};

export const GitChangesView = forwardRef<GitChangesViewHandle, GitChangesViewProps>(
  ({ workspaceId, sdkClient, root, mode, onFileSelect, width }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { data, isLoading, error } = useGitStatusQuery(sdkClient, workspaceId, root);

    const focus = useCallback(() => {
      const container = containerRef.current;
      if (container) {
        const firstNode = container.querySelector<HTMLButtonElement>('[data-file-node]');
        if (firstNode) {
          firstNode.focus();
        } else {
          container.focus();
        }
      }
    }, []);

    useImperativeHandle(ref, () => ({ focus }), [focus]);

    if (isLoading) {
      return (
        <div ref={containerRef} className="flex items-center justify-center h-32 text-muted-foreground" tabIndex={-1}>
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading changes...
        </div>
      );
    }

    if (error) {
      return (
        <div ref={containerRef} className="p-4 text-sm text-destructive" tabIndex={-1}>{error.message}</div>
      );
    }

    const availability = data?.availability;
    const files = data?.files ?? [];

    if (availability && !availability.available) {
      const label = availability.reason ? REASON_LABELS[availability.reason] ?? 'Git unavailable' : 'Git unavailable';
      return (
        <div ref={containerRef} className="p-4 text-sm text-muted-foreground text-center" tabIndex={-1}>{label}</div>
      );
    }

    if (files.length === 0) {
      return (
        <div ref={containerRef} className="p-4 text-sm text-muted-foreground text-center" tabIndex={-1}>No changes</div>
      );
    }

    return (
      <div ref={containerRef} className="flex-1 min-h-0 min-w-0 w-full outline-none" tabIndex={-1}>
        <ScrollArea className="h-full">
          <div className="px-2 pb-2 w-full min-w-0" style={width ? { width: `${width - 8}px` } : undefined}>
            {mode === 'grouped' ? (
              <GroupedChangedFiles files={files} onFileSelect={onFileSelect} />
            ) : (
              <div className="space-y-0.5">
                {files.map((f) => (
                  <ChangedFileRow key={f.path} path={f.path} git={f.git} onFileSelect={onFileSelect} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }
);

GitChangesView.displayName = 'GitChangesView';
