import { useState, useEffect, useRef } from 'react';
import { Loader2, Unplug, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProviderStatus } from '@jean2/shared';

interface ProviderCardProps {
  provider: ProviderStatus;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ProviderCard({ provider, onConnect, onDisconnect }: ProviderCardProps) {
  const [loading, setLoading] = useState(false);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    if (provider.authorizationUrl && popupRef.current) {
      try {
        popupRef.current.location.href = provider.authorizationUrl;
      } catch {
        window.open(provider.authorizationUrl, '_blank');
      }
      popupRef.current = null;
    }
  }, [provider.authorizationUrl]);

  useEffect(() => {
    if (provider.error || provider.connected) {
      setLoading(false);
    }
  }, [provider.error, provider.connected]);

  const handleConnect = () => {
    const popup = window.open('', '_blank', 'width=600,height=700');
    popupRef.current = popup;
    setLoading(true);
    onConnect();
  };

  const handleDisconnect = () => {
    onDisconnect();
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`size-2 rounded-full ${provider.connected ? 'bg-green-500' : 'bg-muted-foreground'}`} />
          <span className="text-sm font-medium">
            {provider.displayName || provider.provider}
          </span>
        </div>
        {provider.connected && (
          <span className="text-xs text-muted-foreground">
            Connected
          </span>
        )}
      </div>

      {provider.error && (
        <p className="text-xs text-destructive">{provider.error}</p>
      )}

      {provider.connected && provider.connectedAt && (
        <p className="text-xs text-muted-foreground">
          Connected {new Date(provider.connectedAt).toLocaleDateString()}
        </p>
      )}

      <div className="flex gap-2">
        {!provider.connected ? (
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-3 animate-spin" data-icon="inline-start" />
            ) : (
              <Plug className="size-3" data-icon="inline-start" />
            )}
            Connect
          </Button>
        ) : (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDisconnect}
          >
            <Unplug className="size-3" data-icon="inline-start" />
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}
