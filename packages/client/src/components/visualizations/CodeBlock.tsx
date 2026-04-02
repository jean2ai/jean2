import { type FC, memo, useState, useMemo } from 'react';
import { Check, FileText, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Highlight, themes } from 'prism-react-renderer';

const CODE_THEME = themes.oneDark;

interface CodeBlockProps {
  content: string;
  path: string;
  language?: string;
  created?: boolean;
  highlightLines?: number[];
  showOverwriteIndicator?: boolean;
}

const PREVIEW_LINE_COUNT = 20;

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

export const CodeBlock: FC<CodeBlockProps> = memo(({
  content,
  path,
  language,
  created,
  highlightLines = [],
}) => {
  const [expanded, setExpanded] = useState(false);
  const detectedLanguage = language || detectLanguage(path);
  const highlightSet = useMemo(() => new Set(highlightLines), [highlightLines]);
  const lineCount = useMemo(() => content.split('\n').length, [content]);

  return (
    <div className="visualization-container overflow-x-auto border border-white/10 rounded-md">
      <div>
        <div className="flex items-center gap-2 px-1 bg-muted/50 text-xs text-muted-foreground">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 px-2 py-1 hover:bg-muted"
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>

          <FileText className="size-3" />
          <span className="font-mono pr-2">{path}</span>

          {!expanded && (
            <span className="text-xs text-muted-foreground/70">
              {lineCount} lines
            </span>
          )}

          {created === false ? (
            <span className="flex items-center gap-1 text-warning ml-auto mr-2">
              <AlertCircle className="size-3" />
              Overwrote
            </span>
          ) : (
            <span className="flex items-center gap-1 text-success ml-auto mr-2">
              <Check className="size-3" />
              Created
            </span>
          )}
        </div>

        <div style={{ backgroundColor: '#282c34' }}>
          <Highlight theme={CODE_THEME} code={content} language={detectedLanguage}>
            {({ tokens, getTokenProps }) => {
              const displayedTokens = expanded ? tokens : tokens.slice(0, PREVIEW_LINE_COUNT);

              return (
                <>
                  {displayedTokens.map((line, lineKey) => (
                    <div
                      key={lineKey}
                      className={`flex font-mono text-xs ${
                        highlightSet.has(lineKey + 1) ? 'bg-yellow-500/20' : ''
                      }`}
                    >
                      <span className="w-10 text-right pr-2 text-muted-foreground select-none border-r border-white/10">
                        {lineKey + 1}
                      </span>
                      <span className="pl-2 flex-1 whitespace-pre">
                        {line.map((token, tokenKey) => (
                          <span key={tokenKey} {...getTokenProps({ token })} />
                        ))}
                      </span>
                    </div>
                  ))}
                </>
              );
            }}
          </Highlight>
        </div>
      </div>
    </div>
  );
});
