import { useMemo, useState } from 'react';
import { Loader2, File, ChevronRight, Folder } from 'lucide-react';
import type { FileEntry, GitDiffSummary } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useGitStatusQuery } from '@/hooks/queries';
import { GitStatusBadge } from './GitStatusBadge';

interface GitChangesViewProps {
  workspaceId: string;
  sdkClient: Jean2Client | null;
  root?: string;
  mode: 'grouped' | 'flat';
  onFileSelect: (file: FileEntry) => void;
  width?: number;
}

type ChangedFile = { path: string; git: GitDiffSummary };

const FILE_ICON_COLORS: Record<string, string> = {
  '.ts': 'text-blue-500',
  '.tsx': 'text-blue-500',
  '.js': 'text-yellow-500',
  '.jsx': 'text-yellow-500',
  '.json': 'text-yellow-600',
  '.md': 'text-gray-500',
  '.css': 'text-purple-500',
  '.html': 'text-orange-500',
};

function iconColorFor(path: string): string {
  const dotIdx = path.lastIndexOf('.');
  if (dotIdx === -1) return 'text-muted-foreground';
  return FILE_ICON_COLORS[path.slice(dotIdx)] ?? 'text-muted-foreground';
}

function ChangedFileRow({
  path,
  git,
  onFileSelect,
  indent = 0,
}: {
  path: string;
  git: GitDiffSummary;
  onFileSelect: (file: FileEntry) => void;
  indent?: number;
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
      style={{ paddingLeft: `${indent + 8}px` }}
    >
      <File className={iconColorFor(path)} />
      <span className="truncate flex-1 min-w-0">
        {dirPath && <span className="text-muted-foreground">{dirPath}</span>}
        <span>{fileName}</span>
      </span>
      <GitStatusBadge git={git} />
    </button>
  );
}

function GroupedChangedFiles({
  files,
  onFileSelect,
}: {
  files: ChangedFile[];
  onFileSelect: (file: FileEntry) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, ChangedFile[]>();
    for (const f of files) {
      // Group by top-level directory (first path segment).
      // Files at the repo root (no slash) go in the '' bucket and render ungrouped.
      const slashIdx = f.path.indexOf('/');
      const dir = slashIdx === -1 ? '' : f.path.slice(0, slashIdx);
      const existing = map.get(dir) ?? [];
      existing.push(f);
      map.set(dir, existing);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === '') return 1;
      if (b[0] === '') return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [files]);

  return (
    <div className="space-y-0.5">
      {groups.map(([dir, dirFiles]) => {
        if (dir === '') {
          return dirFiles.map((f) => (
            <ChangedFileRow key={f.path} path={f.path} git={f.git} onFileSelect={onFileSelect} />
          ));
        }
        return <GroupedDirectory key={dir} dir={dir} dirFiles={dirFiles} onFileSelect={onFileSelect} />;
      })}
    </div>
  );
}

function GroupedDirectory({
  dir,
  dirFiles,
  onFileSelect,
}: {
  dir: string;
  dirFiles: ChangedFile[];
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
        >
          <ChevronRight className={cn('w-3 h-3 shrink-0 transition-transform', open && 'rotate-90')} />
          <Folder className="text-amber-500" />
          <span className="flex-1 min-w-0 truncate">{dir}</span>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{dirFiles.length}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-0.5">
          {dirFiles.map((f) => {
            const relativeName = f.path.slice(dir.length + 1);
            return (
              <ChangedFileRow
                key={f.path}
                path={relativeName}
                git={f.git}
                indent={20}
                onFileSelect={(file) => onFileSelect({ ...file, path: f.path })}
              />
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const REASON_LABELS: Record<string, string> = {
  git_not_installed: 'Git is not installed',
  not_a_git_repo: 'Not a git repository',
  git_error: 'Unable to read git status',
};

export function GitChangesView({
  workspaceId,
  sdkClient,
  root,
  mode,
  onFileSelect,
  width,
}: GitChangesViewProps) {
  const { data, isLoading, error } = useGitStatusQuery(sdkClient, workspaceId, root);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading changes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">{error.message}</div>
    );
  }

  const availability = data?.availability;
  const files = data?.files ?? [];

  if (availability && !availability.available) {
    const label = availability.reason ? REASON_LABELS[availability.reason] ?? 'Git unavailable' : 'Git unavailable';
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">{label}</div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">No changes</div>
    );
  }

  return (
    <div className="flex-1 min-h-0 min-w-0 w-full outline-none">
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
