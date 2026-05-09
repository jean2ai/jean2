import { memo, useMemo } from 'react';
import type { ComponentPropsWithoutRef, ElementType } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { Highlight, themes } from 'prism-react-renderer';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/providers/ThemeProvider';

const CODE_THEME_DARK = themes.oneDark;
const CODE_THEME_LIGHT = themes.oneLight;
const CODE_THEME_INVERTED_DARK = themes.nightOwl;
const CODE_THEME_INVERTED_LIGHT = themes.nightOwlLight;

export interface MarkdownRendererProps {
  children: string;
  className?: string;
  inverted?: boolean;
}

type ComponentProps<T extends ElementType> = ComponentPropsWithoutRef<T>;

export const MarkdownRenderer = memo(function MarkdownRenderer({ children, className, inverted = false }: MarkdownRendererProps) {
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === 'dark';

  const codeTheme = inverted
    ? (isDark ? CODE_THEME_INVERTED_DARK : CODE_THEME_INVERTED_LIGHT)
    : (isDark ? CODE_THEME_DARK : CODE_THEME_LIGHT);

  const components: Components = useMemo(() => ({
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
            <Highlight theme={codeTheme} code={codeString.trim()} language={language}>
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
        <code className={cn('px-1.5 py-0.5 rounded text-sm font-mono', inverted ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted', codeClassName)} {...props}>
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
    p({ children }: ComponentProps<'p'>) {
      return <p className="last:mb-0 leading-relaxed wrap-break-words">{children}</p>;
    },
    ul({ children }: ComponentProps<'ul'>) {
      return <ul className="list-outside list-disc pl-8">{children}</ul>;
    },
    ol({ children }: ComponentProps<'ol'>) {
      return <ol className="list-outside list-decimal pl-8">{children}</ol>;
    },
    li({ children, className }: ComponentProps<'li'>) {
      const isNested = className?.includes('nested');
      return <li className={cn('leading-snug', isNested && 'ml-8')}>{children}</li>;
    },
    h1({ children }: ComponentProps<'h1'>) {
      return <h1 className="text-lg font-semibold mb-1.5 mt-3 first:mt-0">{children}</h1>;
    },
    h2({ children }: ComponentProps<'h2'>) {
      return <h2 className="text-base font-semibold mb-1.5 mt-2.5 first:mt-0">{children}</h2>;
    },
    h3({ children }: ComponentProps<'h3'>) {
      return <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>;
    },
    blockquote({ children }: ComponentProps<'blockquote'>) {
      return (
        <blockquote className={cn('border-l-2 pl-3 my-1.5 italic', inverted ? 'border-primary-foreground/40 text-primary-foreground/70' : 'border-muted-foreground/40 text-muted-foreground')}>
          {children}
        </blockquote>
      );
    },
    strong({ children }: ComponentProps<'strong'>) {
      return <strong className={cn('font-semibold', inverted && 'text-primary-foreground')}>{children}</strong>;
    },
    em({ children }: ComponentProps<'em'>) {
      return <em className="italic">{children}</em>;
    },
    hr() {
      return <hr className={cn('my-3', inverted ? 'border-primary-foreground/30' : 'border-border')} />;
    },
    table({ children }: ComponentProps<'table'>) {
      return (
        <div className="my-2 overflow-x-auto max-w-full">
          <table className="w-full border-collapse text-sm">
            {children}
          </table>
        </div>
      );
    },
    th({ children }: ComponentProps<'th'>) {
      return (
        <th className={cn('border border-border px-2 py-1.5 text-left font-semibold', inverted ? 'bg-primary-foreground/10 text-primary-foreground' : 'bg-muted')}>
          {children}
        </th>
      );
    },
    td({ children }: ComponentProps<'td'>) {
      return (
        <td className={cn('border px-2 py-1.5', inverted ? 'border-primary-foreground/20' : 'border-border')}>
          {children}
        </td>
      );
    },
  }), [inverted, codeTheme]);

  return (
    <div className={cn('w-full markdown-render overflow-x-auto wrap-break-words break', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
