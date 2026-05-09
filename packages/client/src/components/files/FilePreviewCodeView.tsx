import { Highlight, themes } from 'prism-react-renderer';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/providers/ThemeProvider';

export interface FilePreviewCodeViewProps {
  content: string;
  path: string;
  language?: string;
  showLineNumbers?: boolean;
}

const CODE_THEME_DARK = themes.oneDark;
const CODE_THEME_LIGHT = themes.oneLight;

export default function FilePreviewCodeView({
  content,
  path: _path,
  language,
  showLineNumbers = true,
}: FilePreviewCodeViewProps) {
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === 'dark';
  const codeTheme = isDark ? CODE_THEME_DARK : CODE_THEME_LIGHT;

  return (
    <div className={cn('h-full overflow-auto chat-transcript-scrollbar')} style={{ WebkitOverflowScrolling: 'touch', backgroundColor: codeTheme.plain.backgroundColor || (isDark ? '#282c34' : '#fafafa') }}>
      <Highlight
        theme={codeTheme}
        code={content}
        language={language || 'plaintext'}
      >
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre className="text-sm p-4 min-h-full font-mono" style={style}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })} className="table-row">
                {showLineNumbers && (
                  <span className="table-cell pr-4 text-right select-none opacity-50 text-xs w-12">
                    {i + 1}
                  </span>
                )}
                <span className="table-cell">
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
