import { ChevronDown, ChevronRight, ExternalLink, FileText } from 'lucide-react';
import { memo, useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';

const CODE_THEME_DARK = themes.oneDark;
const CODE_THEME_LIGHT = themes.oneLight;
import type { DiffHunk } from '@/utils/diff';
import { cn } from '@/lib/utils';
import { isAbsolutePath, pathBasename } from '@/lib/platform';
import { useUIStore } from '@/stores/uiStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { useTheme } from '@/components/providers/ThemeProvider';
import { platform } from '@/platform';

interface DiffViewerProps {
  hunks: DiffHunk[];
  path: string;
  language?: string;
  additions?: number;
  deletions?: number;
  matchInfo?: {
    strategy: string;
    lineNumber: number;
  };
}

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    py: 'python',
    go: 'go',
    rs: 'rust',
    sh: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return langMap[ext || ''] || ext || 'text';
}

interface DiffLineProps {
  type: 'added' | 'removed' | 'context';
  content: string;
  lineNumber?: number;
  newLineNumber?: number;
  language: string;
}

const DiffLine = memo(function DiffLine({ type, content, lineNumber, newLineNumber, language, codeTheme }: DiffLineProps & { codeTheme: typeof CODE_THEME_DARK }) {
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === 'dark';

  const tintClass = cn(
    'flex font-mono text-xs',
    type === 'added' && (isDark ? 'bg-green-500/20' : 'bg-green-500/15'),
    type === 'removed' && (isDark ? 'bg-red-500/20' : 'bg-red-500/15'),
    type === 'context' && 'bg-muted/30',
  );

  const prefixColor = cn(
    'font-bold w-4 select-none',
    type === 'added' && (isDark ? 'text-green-400' : 'text-green-600'),
    type === 'removed' && (isDark ? 'text-red-400' : 'text-red-600'),
    type === 'context' && 'text-muted-foreground/50',
  );

  return (
    <div className={tintClass}>
      <span className={cn('w-10 text-right pr-2 text-muted-foreground select-none border-r', isDark ? 'border-white/10' : 'border-border')}>
        {lineNumber ?? ''}
      </span>
      <span className={cn('w-10 text-right pr-2 text-muted-foreground select-none border-r', isDark ? 'border-white/10' : 'border-border')}>
        {newLineNumber ?? ''}
      </span>
      <span className="pl-2 flex-1 whitespace-pre overflow-hidden flex">
        <span className={prefixColor}>
          {type === 'added' && '+'}
          {type === 'removed' && '-'}
          {type === 'context' && ' '}
        </span>
        <Highlight theme={codeTheme} code={content} language={language}>
          {({ tokens, getTokenProps }) => (
            <>
              {tokens.map((line, lineKey) => (
                <span key={lineKey}>
                  {line.map((token, tokenKey) => (
                    <span key={tokenKey} {...getTokenProps({ token })} />
                  ))}
                </span>
              ))}
            </>
          )}
        </Highlight>
      </span>
    </div>
  );
});

export const DiffViewer = memo(function DiffViewer({ hunks, path, language: propLanguage, additions, deletions }: DiffViewerProps) {
  const [expanded, setExpanded] = useState(true);
  const language = propLanguage || detectLanguage(path);

  const openFilePreview = useUIStore((s) => s.openFilePreview);
  const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);

  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === 'dark';
  const codeTheme = isDark ? CODE_THEME_DARK : CODE_THEME_LIGHT;

  const handlePathClick = () => {
    if (!activeWorkspace) return;
    if (platform.capabilities.fileOpen && platform.openFile) {
      const absPath = isAbsolutePath(path) ? path : (activeWorkspace.path ? `${activeWorkspace.path}/${path}` : path);
      void platform.openFile(absPath);
      return;
    }
    openFilePreview({
      workspaceId: activeWorkspace.id,
      path,
      name: pathBasename(path),
    });
  };

  return (
    <div className="visualization-container max-w-full overflow-x-auto border border-border rounded-md">
      <div>
        <div className="group/path flex items-center gap-2 px-1 bg-muted/50 text-xs text-muted-foreground">
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-1 py-1 hover:bg-muted rounded"
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>

          <FileText className="size-3" />
          <button
            type="button"
            onClick={handlePathClick}
            className="flex items-center gap-1 font-mono pr-2 hover:text-foreground transition-colors cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-muted min-w-0 truncate"
            title={path}
          >
            {path}
            <ExternalLink className="size-2.5 opacity-0 group-hover/path:opacity-100 transition-opacity" />
          </button>

          {additions !== undefined && deletions !== undefined && (
            <span className="ml-auto mr-2 text-muted-foreground">
              +{additions} -{deletions}
            </span>
          )}
        </div>

        {expanded && (
          <div style={{ backgroundColor: codeTheme.plain.backgroundColor || (isDark ? '#282c34' : '#fafafa') }}>
            {hunks.map((hunk, hunkIndex) => (
              <div key={hunkIndex} className={cn('divide-y', isDark ? 'divide-white/5' : 'divide-border')}>
                {hunk.changes.map((change, i) => (
                  <DiffLine key={i} {...change} language={language} codeTheme={codeTheme} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
