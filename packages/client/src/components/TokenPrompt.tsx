// packages/client/src/components/TokenPrompt.tsx
import { useState } from 'react';
import { setStoredToken, setStoredServerUrl, isValidTokenFormat } from '@/config/auth';

interface TokenPromptProps {
  onSubmit: (token: string, serverUrl: string) => void;
  error?: string;
  defaultServerUrl?: string;
}

export default function TokenPrompt({ onSubmit, error, defaultServerUrl = 'localhost:3000' }: TokenPromptProps) {
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [token, setToken] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedUrl = serverUrl.trim();
    const trimmedToken = token.trim();
    
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
    
    setStoredToken(trimmedToken);
    setStoredServerUrl(trimmedUrl);
    onSubmit(trimmedToken, trimmedUrl);
  };
  
  return (
    <div className="w-full h-full flex items-center justify-center bg-background dark:bg-gradient-to-br dark:from-muted dark:via-background dark:to-muted p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 text-center border-b border-border">
            <h1 className="text-2xl font-bold text-foreground">Jean2</h1>
            <p className="text-muted-foreground mt-1">Connect to your AI Agent Server</p>
          </div>
          
          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Server URL Input */}
            <div className="space-y-2">
              <label htmlFor="serverUrl" className="text-sm font-medium text-foreground">
                Server URL
              </label>
              <input
                id="serverUrl"
                type="text"
                value={serverUrl}
                onChange={(e) => {
                  setServerUrl(e.target.value);
                  setLocalError(null);
                }}
                placeholder="localhost:3000"
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
              Connect
            </button>
          </form>
          
          {/* Help Section */}
          <div className="px-6 pb-6">
            <details className="group">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1">
                <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                How to get your token
              </summary>
              <div className="mt-3 text-sm text-muted-foreground space-y-2 pl-5">
                <p>1. Check your server console output when it starts</p>
                <p>2. Or run: <code className="px-1.5 py-0.5 bg-muted rounded text-xs">bun run auth:token</code></p>
                <p>3. Or view the token file:</p>
                <code className="block px-3 py-2 bg-muted rounded text-xs mt-2">~/.jean2/auth-token.json</code>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
