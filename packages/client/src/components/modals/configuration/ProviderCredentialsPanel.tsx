import { useState, useEffect, useCallback } from 'react';
import { Key, Check, X, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/useApi';

interface PanelProps {
  serverUrl: string | null;
  apiToken: string | null;
}

interface ProviderCredentialStatus {
  provider: string;
  configured: boolean;
}

export function ProviderCredentialsPanel({ serverUrl, apiToken }: PanelProps) {
  const { fetchWithAuth } = useApi();
  const apiUrl = serverUrl ? `http://${serverUrl}` : '';

  const [providers, setProviders] = useState<ProviderCredentialStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    if (!apiToken || !apiUrl) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${apiUrl}/api/config/providers`, {
        headers: { 'Authorization': `Bearer ${apiToken}` },
      });
      if (!res.ok) throw new Error('Failed to load providers');
      const data = await res.json();
      setProviders(data.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, apiUrl, apiToken]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleSetKey = async (provider: string) => {
    if (!apiKeyInput.trim()) return;
    setActionLoading(provider);
    try {
      const res = await fetchWithAuth(`${apiUrl}/api/config/providers/${provider}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to set key');
      }
      setEditingProvider(null);
      setApiKeyInput('');
      setShowKey(false);
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set key');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearKey = async (provider: string) => {
    setActionLoading(provider);
    try {
      const res = await fetchWithAuth(`${apiUrl}/api/config/providers/${provider}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to clear key');
      }
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear key');
    } finally {
      setActionLoading(null);
    }
  };

  const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
    anthropic: 'Anthropic',
    google: 'Google',
    minimax: 'MiniMax',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    zhipu: 'Z.AI',
    'zhipu-coding': 'Z.AI Coding',
  };

  const formatProviderName = (provider: string): string => {
    return PROVIDER_DISPLAY_NAMES[provider] || provider.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && providers.length === 0) {
    return (
      <div className="p-4 text-sm text-destructive">{error}</div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Manage API keys for LLM providers. Keys are stored in ~/.jean2/.env and never exposed to the client.
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        OAuth-based providers (e.g., Codex) are managed in Settings → Providers.
      </p>

      {error && (
        <div className="p-2 rounded bg-destructive/10 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-2">
        {providers.map((cred) => (
          <div
            key={cred.provider}
            className="flex items-center justify-between p-3 rounded-lg border"
          >
            <div className="flex items-center gap-3">
              <Key className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{formatProviderName(cred.provider)}</span>
              <Badge variant={cred.configured ? 'default' : 'secondary'}>
                {cred.configured ? 'Configured' : 'Not set'}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              {editingProvider === cred.provider ? (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="Enter API key..."
                      className="w-full sm:w-48 h-8 text-sm pr-8"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSetKey(cred.provider);
                        if (e.key === 'Escape') {
                          setEditingProvider(null);
                          setApiKeyInput('');
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-8 w-8"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSetKey(cred.provider)}
                    disabled={!apiKeyInput.trim() || actionLoading === cred.provider}
                  >
                    {actionLoading === cred.provider ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Check className="size-3" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingProvider(null);
                      setApiKeyInput('');
                    }}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingProvider(cred.provider);
                      setApiKeyInput('');
                      setShowKey(false);
                    }}
                    disabled={actionLoading === cred.provider}
                  >
                    {cred.configured ? 'Update' : 'Set Key'}
                  </Button>
                  {cred.configured && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleClearKey(cred.provider)}
                      disabled={actionLoading === cred.provider}
                    >
                      {actionLoading === cred.provider ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
