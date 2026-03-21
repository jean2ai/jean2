import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';
import { cn } from '@/lib/utils';

export interface MarkdownRendererProps {
  children: string;
  className?: string;
  inverted?: boolean;
}

export function MarkdownRenderer({ children, className, inverted = false }: MarkdownRendererProps) {
  return (
    <div className={cn('markdown-render break-words', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: codeClassName, children: codeChildren, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const language = match ? match[1] : '';
            const isInline = !language;

            const codeString = Array.isArray(codeChildren)
              ? codeChildren.join('')
              : String(codeChildren);

            if (!isInline && language) {
              return (
                <div className="w-full max-w-full overflow-x-auto my-2 min-w-0">
                  <Highlight theme={inverted ? themes.nightOwl : themes.oneDark} code={codeString.trim()} language={language}>
                    {({ className: hlClassName, style, tokens, getLineProps, getTokenProps }) => (
                      <pre className={cn('rounded-lg text-sm p-3', hlClassName)} style={style}>
                        {tokens.map((line, i) => (
                          <div key={i} {...getLineProps({ line })}>
                            {line.map((token, key) => (
                              <span key={key} {...getTokenProps({ token })} />
                            ))}
                          </div>
                        ))}
                      </pre>
                    )}
                  </Highlight>
                </div>
              );
            }

            return (
              <code className={cn('px-1.5 py-0.5 rounded text-sm font-mono break-all', inverted ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted', codeClassName)} {...props}>
                {codeChildren}
              </code>
            );
          },
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('underline underline-offset-2 transition-colors', inverted ? 'text-primary-foreground/80 hover:text-primary-foreground' : 'text-primary hover:text-primary/80')}
                {...props}
              >
                {children}
              </a>
            );
          },
          p({ children }) {
            return <p className="last:mb-0 leading-relaxed wrap-break-words">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-outside list-disc pl-4">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-outside list-decimal pl-4">{children}</ol>;
          },
          li({ children, className }) {
            const isNested = className?.includes('nested');
            return <li className={cn('leading-snug', isNested && 'ml-4')}>{children}</li>;
          },
          h1({ children }) {
            return <h1 className="text-lg font-semibold mb-1.5 mt-3 first:mt-0">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-base font-semibold mb-1.5 mt-2.5 first:mt-0">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>;
          },
          blockquote({ children }) {
            return (
              <blockquote className={cn('border-l-2 pl-3 my-1.5 italic', inverted ? 'border-primary-foreground/40 text-primary-foreground/70' : 'border-muted-foreground/40 text-muted-foreground')}>
                {children}
              </blockquote>
            );
          },
          strong({ children }) {
            return <strong className={cn('font-semibold', inverted && 'text-primary-foreground')}>{children}</strong>;
          },
          em({ children }) {
            return <em className="italic">{children}</em>;
          },
          hr() {
            return <hr className={cn('my-3', inverted ? 'border-primary-foreground/30' : 'border-border')} />;
          },
          table({ children }) {
            return (
              <div className="my-2 overflow-x-auto max-w-full">
                <table className="w-full border-collapse text-sm">
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className={cn('border border-border px-2 py-1.5 text-left font-semibold', inverted ? 'bg-primary-foreground/10 text-primary-foreground' : 'bg-muted')}>
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className={cn('border px-2 py-1.5', inverted ? 'border-primary-foreground/20' : 'border-border')}>
                {children}
              </td>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
