import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

export function MarkdownRenderer({ children, className }: MarkdownRendererProps) {
  return (
    <div className={`leading-relaxed ${className || ''}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const language = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');
            const isInline = !codeClassName;

            if (isInline) {
              return (
                <code
                  className="bg-surface-600 px-1.5 py-0.5 rounded font-mono text-sm text-[#f08cbd]"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <div className="w-full max-w-full overflow-x-auto my-4 -mx-4 px-4 sm:mx-0 sm:px-0">
                <Highlight
                  theme={themes.vsDark}
                  code={codeString}
                  language={language || 'text'}
                >
                  {({ style, tokens, getLineProps, getTokenProps }) => (
                    <pre
                      className="bg-[#1e1e1e] p-4 rounded-lg"
                      style={style}
                    >
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
          },
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#60a5fa] no-underline hover:underline transition-all"
                {...props}
              >
                {children}
              </a>
            );
          },
          h1({ children }) {
            return (
              <h1 className="font-bold text-[#e5e5e5] mt-6 mb-3 text-[1.875rem]">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="font-bold text-[#e5e5e5] mt-6 mb-3 text-[1.5rem]">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="font-bold text-[#e5e5e5] mt-6 mb-3 text-[1.25rem]">
                {children}
              </h3>
            );
          },
          h4({ children }) {
            return (
              <h4 className="font-bold text-[#e5e5e5] mt-6 mb-3 text-[1.125rem]">
                {children}
              </h4>
            );
          },
          p({ children }) {
            return (
              <p className="my-4 text-[#d4d4d4]">
                {children}
              </p>
            );
          },
          ul({ children }) {
            return (
              <ul className="my-4 pl-6 text-[#d4d4d4] list-disc">
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol className="my-4 pl-6 text-[#d4d4d4] list-decimal">
                {children}
              </ol>
            );
          },
          li({ children }) {
            return <li className="my-1">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-surface-500 pl-4 my-4 italic text-[#a0a0a0]">
                {children}
              </blockquote>
            );
          },
          hr() {
            return <hr className="border-0 border-t border-surface-500 my-8" />;
          },
          img({ src, alt }) {
            return (
              <img
                src={src}
                alt={alt || ''}
                className="max-w-full h-auto rounded-lg my-4"
              />
            );
          },
          strong({ children }) {
            return (
              <strong className="font-bold text-[#e5e5e5]">
                {children}
              </strong>
            );
          },
          em({ children }) {
            return (
              <em className="italic text-[#c0c0c0]">
                {children}
              </em>
            );
          },
          table({ children }) {
            return (
              <table className="border-collapse w-full my-4">
                {children}
              </table>
            );
          },
          th({ children }) {
            return (
              <th className="border border-surface-500 px-2 py-2 bg-surface-600 font-semibold">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border border-surface-500 px-2 py-2">
                {children}
              </td>
            );
          },
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}

export default MarkdownRenderer;
