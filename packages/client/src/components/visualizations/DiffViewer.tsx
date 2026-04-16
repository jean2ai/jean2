import { ChevronDown, ChevronRight, ExternalLink, FileText } from 'lucide-react';
import { memo, useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';

const CODE_THEME = themes.oneDark;
import type { DiffHunk } from '@/utils/diff';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import { useServerDataStore } from '@/stores/serverDataStore';

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

const DiffLine = memo(function DiffLine({ type, content, lineNumber, newLineNumber, language }: DiffLineProps) {
  const tintClass = cn(
    'flex font-mono text-xs',
    type === 'added' && 'bg-green-500/20',
    type === 'removed' && 'bg-red-500/20',
    type === 'context' && 'bg-muted/30',
  );

  const prefixColor = cn(
    'font-bold w-4 select-none',
    type === 'added' && 'text-green-400',
    type === 'removed' && 'text-red-400',
    type === 'context' && 'text-muted-foreground/50',
  );

  return (
    <div className={tintClass}>
      <span className="w-10 text-right pr-2 text-muted-foreground select-none border-r border-white/10">
        {lineNumber ?? ''}
      </span>
      <span className="w-10 text-right pr-2 text-muted-foreground select-none border-r border-white/10">
        {newLineNumber ?? ''}
      </span>
      <span className="pl-2 flex-1 whitespace-pre flex">
        <span className={prefixColor}>
          {type === 'added' && '+'}
          {type === 'removed' && '-'}
          {type === 'context' && ' '}
        </span>
        <Highlight theme={CODE_THEME} code={content} language={language}>
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

  const handlePathClick = () => {
    if (!activeWorkspace) return;
    openFilePreview({
      workspaceId: activeWorkspace.id,
      path,
      name: path.split('/').pop() || path,
    });
  };

  return (
    <div className="visualization-container overflow-x-auto border border-white/10 rounded-md">
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
            className="flex items-center gap-1 font-mono pr-2 hover:text-foreground transition-colors cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-muted"
            title="Open file preview"
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
          <div style={{ backgroundColor: '#282c34' }}>
            {hunks.map((hunk, hunkIndex) => (
              <div key={hunkIndex} className="divide-y divide-white/5">
                {hunk.changes.map((change, i) => (
                  <DiffLine key={i} {...change} language={language} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
