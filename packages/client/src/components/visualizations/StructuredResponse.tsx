import { memo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StructuredResponseProps {
  formatName?: string;
  data: Record<string, unknown>;
  schema?: Record<string, unknown>;
}

function HumanValue({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) {
    return <span className="text-muted-foreground italic">—</span>;
  }

  if (typeof data === 'boolean') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 text-sm font-medium',
        data ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400',
      )}>
        {data ? '✓ Yes' : '✗ No'}
      </span>
    );
  }

  if (typeof data === 'number') {
    return <span className="text-sm tabular-nums">{data}</span>;
  }

  if (typeof data === 'string') {
    if (data.includes('\n')) {
      return (
        <div className="text-sm leading-relaxed whitespace-pre-wrap">{data}</div>
      );
    }
    return <span className="text-sm">{data}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-sm text-muted-foreground italic">Empty</span>;
    }

    if (data.every(item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {data.map((item, i) => {
            if (typeof item === 'boolean') {
              return (
                <span key={i} className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                  item
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                )}>
                  {item ? 'Yes' : 'No'}
                </span>
              );
            }
            return (
              <span
                key={i}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground"
              >
                {String(item)}
              </span>
            );
          })}
        </div>
      );
    }

    return (
      <ul className="space-y-1.5">
        {data.map((item, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span className="text-muted-foreground select-none mt-0.5">•</span>
            <div className="flex-1 min-w-0">
              <HumanValue data={item} depth={depth + 1} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-sm text-muted-foreground italic">Empty</span>;
    }

    if (depth === 0) {
      return (
        <div className="space-y-2.5">
          {entries.map(([key, value]) => (
            <div key={key}>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                {formatLabel(key)}
              </div>
              <HumanValue data={value} depth={depth + 1} />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className={cn('space-y-2', depth === 1 && 'pl-3 border-l border-border')}>
        {entries.map(([key, value]) => (
          <div key={key}>
            <div className="text-xs font-medium text-muted-foreground mb-0.5">{formatLabel(key)}</div>
            <HumanValue data={value} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-sm">{String(data)}</span>;
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

export const StructuredResponse = memo(function StructuredResponse({
  formatName,
  data,
  schema,
}: StructuredResponseProps) {
  const [showSchema, setShowSchema] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 rounded-t-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {formatName || 'Response'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {schema && (
            <button
              onClick={() => setShowSchema(!showSchema)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Toggle schema"
            >
              {showSchema ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Copy JSON"
          >
            {copied ? (
              <Check className="size-3.5 text-green-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {showSchema && schema && (
        <div className="px-3 py-2 border-b bg-muted/20">
          <div className="text-xs text-muted-foreground mb-1 font-medium">Schema</div>
          <pre className="text-xs font-mono text-muted-foreground overflow-x-auto">
            {JSON.stringify(schema, null, 2)}
          </pre>
        </div>
      )}

      <div className="p-3">
        <HumanValue data={data} />
      </div>
    </div>
  );
});
