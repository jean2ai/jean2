import { Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
  modelName = '',
  compact = false,
}: TokenMeterProps) {
  const effectiveContext = totalTokens === 0 ? 0 : contextWindow;
  const percentage = effectiveContext === 0
    ? 0
    : Math.min(100, Math.round((totalTokens / effectiveContext) * 100));

  const status = getUsageStatus(percentage);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-mono">
          {formatCompact(totalTokens)}/{formatCompact(effectiveContext)}
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Model: {modelName}</p>
              <p className="text-xs">{percentage}% of context window used</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Tokens:</span>
          <span className="text-xs font-mono">
            {formatCompact(totalTokens)}/{formatCompact(effectiveContext)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Progress
            value={percentage}
            className={cn(
              'h-1 w-20',
              status === 'critical' && '[&>div]:bg-destructive',
              status === 'warning' && '[&>div]:bg-warning',
              status === 'normal' && '[&>div]:bg-primary'
            )}
          />
          <span className="text-[11px] text-muted-foreground">
            ({percentage}%)
          </span>
        </div>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="size-3.5 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Model: {modelName}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
