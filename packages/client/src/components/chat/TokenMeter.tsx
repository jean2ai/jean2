import { useState } from 'react';

interface TokenMeterProps {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
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
  totalTokens = 0,
  contextWindow = 0,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  return (
    <div
      className="flex items-center gap-1.5 cursor-pointer select-none"
      onClick={() => setShowTokens(!showTokens)}
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
    </div>
  );
}