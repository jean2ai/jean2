import { useState, useEffect, useCallback } from 'react';
import { buildApiUrl } from '@/config/urls';
import { Loader2, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProviderStatus } from '@jean2/shared';
import { useApi } from '@/hooks/useApi';

interface PanelProps {
  serverUrl: string | null;
  apiToken: string | null;
}

export function OAuthProvidersPanel({ serverUrl, apiToken }: PanelProps) {
  const { fetchWithAuth } = useApi();
  const apiUrl = serverUrl ? buildApiUrl(serverUrl, '') : '';

  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    if (!apiToken || !apiUrl) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${apiUrl}/api/providers`, {
        headers: { 'Authorization': `Bearer ${apiToken}` },
      });
      if (!res.ok) throw new Error('Failed to load providers');
      const data = await res.json();
      setProviders(data.providers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, apiUrl, apiToken]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleConnect = async (providerId: string) => {
    setConnectingId(providerId);
    setError(null);
    try {
      const res = await fetchWithAuth(`${apiUrl}/api/providers/${providerId}/connect`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiToken}` },
      });
      if (!res.ok) throw new Error('Failed to connect provider');
      const data = await res.json();
      if (data.authorizationUrl) {
        window.open(data.authorizationUrl, '_blank');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect provider');
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    setError(null);
    try {
      const res = await fetchWithAuth(`${apiUrl}/api/providers/${providerId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiToken}` },
      });
      if (!res.ok) throw new Error('Failed to disconnect provider');
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect provider');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Connect subscription-based providers using OAuth. No API keys needed.
      </p>

      {error && (
        <div className="p-2 rounded bg-destructive/10 text-sm text-destructive">{error}</div>
      )}

      {providers.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No OAuth providers available.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {providers.map((provider) => (
            <div key={provider.provider} className="rounded-lg border p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`size-2 rounded-full ${provider.connected ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                  <span className="text-sm font-medium">
                    {provider.displayName || provider.provider}
                  </span>
                </div>
                {provider.connected && (
                  <span className="text-xs text-muted-foreground">Connected</span>
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
                {!provider.connected && (
                  <Button
                    size="sm"
                    onClick={() => handleConnect(provider.provider)}
                    disabled={connectingId === provider.provider}
                  >
                    {connectingId === provider.provider ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : null}
                    Connect
                  </Button>
                )}

                {provider.connected && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDisconnect(provider.provider)}
                  >
                    <Unplug className="size-3" />
                    <span className="hidden sm:inline">Disconnect</span>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
