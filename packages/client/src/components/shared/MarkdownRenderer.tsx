import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

export function MarkdownRenderer({ children, className }: MarkdownRendererProps) {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
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
                <Highlight theme={themes.oneDark} code={codeString.trim()} language={language}>
                  {({ className: hlClassName, style, tokens, getLineProps, getTokenProps }) => (
                    <pre className={cn('rounded-md text-sm p-3 overflow-x-auto', hlClassName)} style={style}>
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
              );
            }

            return (
              <code className={cn('px-1.5 py-0.5 rounded bg-muted text-sm', codeClassName)} {...props}>
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
                className="text-primary underline underline-offset-2 hover:text-primary/80"
                {...props}
              >
                {children}
              </a>
            );
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>;
          },
          ul({ children }) {
            return <ul className="mb-2 list-disc pl-4">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="mb-2 list-decimal pl-4">{children}</ol>;
          },
          li({ children }) {
            return <li className="mb-1">{children}</li>;
          },
          h1({ children }) {
            return <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-muted-foreground/30 pl-3 my-2 text-muted-foreground italic">
                {children}
              </blockquote>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
