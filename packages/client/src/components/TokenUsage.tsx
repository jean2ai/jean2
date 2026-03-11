import { getModelContextWindow } from '@jean2/shared';

interface TokenUsageProps {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelName: string;
  contextWindow?: number;  // Actual context window from model config
}

export default function TokenUsage({
  /* eslint-disable @typescript-eslint/no-unused-vars */
  promptTokens,
  /* eslint-disable @typescript-eslint/no-unused-vars */
  completionTokens,
  totalTokens,
  modelName,
  contextWindow: contextWindowProp
}: TokenUsageProps) {
  // Use passed contextWindow if provided, otherwise fall back to lookup
  const actualContextWindow = contextWindowProp ?? getModelContextWindow(modelName);

  // If no LLM interaction yet (totalTokens === 0), show context as 0
  // Otherwise, show the actual context window from the model
  const contextWindow = totalTokens === 0 ? 0 : actualContextWindow;
  const percentage = contextWindow === 0 ? 0 : Math.min(100, Math.round((totalTokens / contextWindow) * 100));

  // Determine color based on usage percentage
  const getColorClass = () => {
    if (percentage >= 60) return 'critical';
    if (percentage >= 40) return 'warning';
    return 'normal';
  };

  // Format numbers with k/m suffix for compact display
  const formatCompact = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  return (
    <div className="flex flex-col gap-1 text-xs text-text-dim">
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-text-muted whitespace-nowrap">Total:</span>
        <span className="font-mono text-[11px] text-text-secondary whitespace-nowrap">
          {formatCompact(totalTokens)}/{formatCompact(contextWindow)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-20 h-1 bg-surface-600 rounded-sm overflow-hidden shrink-0">
          <div
            className={`h-full rounded-sm transition-all duration-300 ${
              getColorClass() === 'critical'
                ? 'bg-gradient-to-r from-[#e74c3c] to-[#ff6b6b]'
                : getColorClass() === 'warning'
                  ? 'bg-gradient-to-r from-[#f5a623] to-[#f7b742]'
                  : 'bg-gradient-to-r from-accent to-accent-light'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="font-medium text-text-muted text-[11px] whitespace-nowrap">({percentage}%)</span>
      </div>
    </div>
  );
}
