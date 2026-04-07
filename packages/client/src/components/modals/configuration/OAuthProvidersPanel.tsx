import { useState, useEffect, useCallback } from 'react';
import type { HttpClient } from '@jean2/sdk';
import { Loader2, Unplug, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProviderStatus } from '@jean2/shared';

interface PanelProps {
  httpClient: HttpClient | null;
}

export function OAuthProvidersPanel({ httpClient }: PanelProps) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [authUrls, setAuthUrls] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    if (!httpClient) return;
    setLoading(true);
    setError(null);
    try {
      const data = await httpClient.get<{ providers: ProviderStatus[] }>('/providers');
      setProviders(data.providers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, [httpClient]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleConnect = async (providerId: string) => {
    setConnectingId(providerId);
    setAuthUrls((prev) => ({ ...prev, [providerId]: '' }));
    setError(null);
    try {
      const data = await httpClient!.post<{ authorizationUrl?: string }>(`/providers/${providerId}/connect`);
      if (data.authorizationUrl) {
        const url = data.authorizationUrl;
        setAuthUrls((prev) => ({ ...prev, [providerId]: url }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect provider');
      setAuthUrls((prev) => ({ ...prev, [providerId]: '' }));
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    setError(null);
    try {
      await httpClient!.delete(`/providers/${providerId}`);
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect provider');
    }
  };

  const handleCopyUrl = async (url: string, providerId: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(providerId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // silently fail
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
                {!provider.connected && !authUrls[provider.provider] && (
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

              {!provider.connected && authUrls[provider.provider] && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Open this URL in your browser to complete the connection:
                  </p>
                  <div className="rounded-md bg-muted p-2">
                    <a
                      href={authUrls[provider.provider]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-blue-500 underline break-all"
                    >
                      {authUrls[provider.provider]}
                    </a>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyUrl(authUrls[provider.provider]!, provider.provider)}
                  >
                    {copiedId === provider.provider ? (
                      <Check className="size-3" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    {copiedId === provider.provider ? 'Copied' : 'Copy URL'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
