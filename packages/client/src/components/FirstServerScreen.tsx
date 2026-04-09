// packages/client/src/components/FirstServerScreen.tsx
import { useState } from 'react';
import type { SavedServer } from '@/types/client';
import { isValidTokenFormat, normalizeServerUrl } from '@/config/auth';

interface FirstServerScreenProps {
  onServerAdded: (server: SavedServer) => void;
  error?: string;
}

export default function FirstServerScreen({ onServerAdded, error }: FirstServerScreenProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('localhost:8742');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const trimmedToken = token.trim();

    if (!trimmedName) {
      setLocalError('Please enter a server name');
      return;
    }

    if (!trimmedUrl) {
      setLocalError('Please enter a server URL');
      return;
    }

    if (!trimmedToken) {
      setLocalError('Please enter an API token');
      return;
    }

    if (!isValidTokenFormat(trimmedToken)) {
      setLocalError('Invalid token format. Token should be 64 hex characters (0-9, a-f).');
      return;
    }

    const normalizedUrl = normalizeServerUrl(trimmedUrl);

    const newServer: SavedServer = {
      id: crypto.randomUUID(),
      name: trimmedName,
      url: normalizedUrl,
      token: trimmedToken,
      createdAt: new Date().toISOString(),
    };

    onServerAdded(newServer);
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-background dark:bg-gradient-to-br dark:from-muted dark:via-background dark:to-muted p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 text-center border-b border-border">
            <h1 className="text-2xl font-bold text-foreground">Add your first server</h1>
            <p className="text-muted-foreground mt-1">Connect to a Jean2 server to get started</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Server Name Input */}
            <div className="space-y-2">
              <label htmlFor="serverName" className="text-sm font-medium text-foreground">
                Server Name
              </label>
              <input
                id="serverName"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setLocalError(null);
                }}
                placeholder="Production"
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>

            {/* Server URL Input */}
            <div className="space-y-2">
              <label htmlFor="serverUrl" className="text-sm font-medium text-foreground">
                Server URL
              </label>
              <input
                id="serverUrl"
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setLocalError(null);
                }}
                placeholder="localhost:8742"
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>

            {/* Token Input */}
            <div className="space-y-2">
              <label htmlFor="token" className="text-sm font-medium text-foreground">
                API Token
              </label>
              <div className="relative">
                <input
                  id="token"
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder="Enter your 64-character token"
                  className="w-full px-3 py-2 pr-10 bg-background border border-input rounded-lg text-foreground font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {(localError || error) && (
              <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {localError || error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
            >
              Add Server
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
