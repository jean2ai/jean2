import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TokenMeterProps {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  noCacheTokens?: number;
  contextWindow?: number;
  modelName?: string;
  compact?: boolean;
}

function formatCompact(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function getUsageStatus(percentage: number): 'normal' | 'warning' | 'critical' {
  if (percentage >= 60) return 'critical';
  if (percentage >= 40) return 'warning';
  return 'normal';
}

export function TokenMeter({
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  noCacheTokens = 0,
  contextWindow = 0,
  modelName,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  compact,
}: TokenMeterProps) {
  const [showTokens, setShowTokens] = useState(false);
  const effectiveContext = totalTokens === 0 ? 0 : contextWindow;
  const percentage = effectiveContext === 0
    ? 0
    : Math.min(100, Math.round((totalTokens / effectiveContext) * 100));

  const status = getUsageStatus(percentage);

  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - percentage / 100);

  const ringColorClass = percentage === 0
    ? 'text-muted-foreground/30'
    : status === 'critical'
      ? 'text-destructive'
      : status === 'warning'
        ? 'text-warning'
        : 'text-primary';

  const usageRows = [
    ['Prompt tokens', promptTokens],
    ['Completion tokens', completionTokens],
    ['Total tokens', totalTokens],
    ['Cache read', cacheReadTokens],
    ['Cache write', cacheWriteTokens],
    ['Not cached', noCacheTokens],
    ['Context window', contextWindow],
  ] as const;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 cursor-pointer select-none"
            onClick={() => setShowTokens((current) => !current)}
            aria-label={`Token usage: ${percentage}% of context window`}
          >
            <svg
              viewBox="0 0 20 20"
              className="size-5"
              fill="none"
            >
              <circle
                cx="10"
                cy="10"
                r={radius}
                stroke="currentColor"
                className="text-muted-foreground/20"
                strokeWidth="3"
              />
              <circle
                cx="10"
                cy="10"
                r={radius}
                stroke="currentColor"
                className={ringColorClass}
                strokeWidth="3"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 10 10)"
                style={{ transition: 'stroke-dashoffset 0.3s ease' }}
              />
            </svg>
            <span className="text-xs font-mono text-muted-foreground">
              {showTokens
                ? `${formatCompact(totalTokens)}/${formatCompact(effectiveContext)}`
                : `${percentage}%`}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="flex-col items-stretch gap-1.5">
          {modelName && <p className="font-medium">{modelName}</p>}
          <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 font-mono tabular-nums">
            {usageRows.map(([label, value]) => (
              <div key={label} className="contents">
                <span>{label}</span>
                <span className="text-right">{value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}