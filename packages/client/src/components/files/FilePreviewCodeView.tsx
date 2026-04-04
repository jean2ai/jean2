import { Highlight, themes } from 'prism-react-renderer';
import { cn } from '@/lib/utils';

export interface FilePreviewCodeViewProps {
  content: string;
  path: string;
  language?: string;
  showLineNumbers?: boolean;
}

const CODE_THEME_DEFAULT = themes.oneDark;

export default function FilePreviewCodeView({
  content,
  path: _path,
  language,
  showLineNumbers = true,
}: FilePreviewCodeViewProps) {
  return (
    <div className={cn('h-full overflow-auto bg-[#282c34] chat-transcript-scrollbar')} style={{ WebkitOverflowScrolling: 'touch' }}>
      <Highlight
        theme={CODE_THEME_DEFAULT}
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
