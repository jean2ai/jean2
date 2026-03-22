import type { ProviderStatus } from '@jean2/shared';

interface CodexStatusProps {
  status: ProviderStatus | null;
}

export function CodexStatus({ status }: CodexStatusProps) {
  if (!status) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      {status.accountId && (
        <span>Account: {status.accountId}</span>
      )}
      {status.connectedAt && (
        <span>Since: {new Date(status.connectedAt).toLocaleString()}</span>
      )}
    </div>
  );
}
