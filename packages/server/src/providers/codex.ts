import type { LanguageModel } from 'ai';
import type { CodexProviderConfig, ProviderStatus } from '@jean2/shared';
import { registerProvider } from './registry';
import type { ConnectableProvider } from './registry';
import { loadProviderConfig, saveProviderConfig, deleteProviderConfig } from './storage';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const ISSUER = 'https://auth.openai.com';
const CODEX_API_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
const OAUTH_PORT = 1455;
const OAUTH_DUMMY_KEY = 'codex-oauth-dummy-key';
const SCOPES = 'openid profile email offline_access';

interface PkceCodes {
  verifier: string;
  challenge: string;
}

interface TokenResponse {
  id_token?: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

interface PendingOAuth {
  state: string;
  pkce: PkceCodes;
  resolve: (tokens: TokenResponse) => void;
  reject: (err: Error) => void;
}

interface IdTokenClaims {
  chatgpt_account_id?: string;
  organizations?: Array<{ id: string }>;
  email?: string;
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string;
  };
}

let oauthServer: ReturnType<typeof Bun.serve> | undefined;
let pendingOAuth: PendingOAuth | undefined;

export type OAuthCompletionCallback = (success: boolean, error?: string) => void;

let onOAuthComplete: OAuthCompletionCallback | undefined;

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePKCE(): Promise<PkceCodes> {
  const verifier = generateRandomString(43);
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const challenge = base64UrlEncode(hash);
  return { verifier, challenge };
}

function parseJwtClaims(token: string): IdTokenClaims | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch {
    return undefined;
  }
}

function extractAccountId(claims: IdTokenClaims): string | undefined {
  return (
    claims.chatgpt_account_id ||
    claims['https://api.openai.com/auth']?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  );
}

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  pkce: PkceCodes
): Promise<TokenResponse> {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier,
    }).toString(),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }
  return response.json() as Promise<TokenResponse>;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
  }
  return response.json() as Promise<TokenResponse>;
}

async function startOAuthServer(): Promise<{ port: number; redirectUri: string }> {
  if (oauthServer) {
    return { port: OAUTH_PORT, redirectUri: `http://localhost:${OAUTH_PORT}/auth/callback` };
  }

  const port = OAUTH_PORT;

  oauthServer = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/auth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        if (error) {
          const errorMsg = errorDescription || error;
          pendingOAuth?.reject(new Error(errorMsg));
          pendingOAuth = undefined;
          return new Response(HTML_ERROR(errorMsg), {
            headers: { 'Content-Type': 'text/html' },
          });
        }

        if (!code) {
          pendingOAuth?.reject(new Error('Missing authorization code'));
          pendingOAuth = undefined;
          return new Response(HTML_ERROR('Missing authorization code'), {
            status: 400,
            headers: { 'Content-Type': 'text/html' },
          });
        }

        if (!pendingOAuth || state !== pendingOAuth.state) {
          return new Response(HTML_ERROR('Invalid state - potential CSRF attack'), {
            status: 400,
            headers: { 'Content-Type': 'text/html' },
          });
        }

        const current = pendingOAuth;
        pendingOAuth = undefined;

        exchangeCodeForTokens(code, `http://localhost:${port}/auth/callback`, current.pkce)
          .then((tokens) => current.resolve(tokens))
          .catch((err) => current.reject(err instanceof Error ? err : new Error(String(err))));

        return new Response(HTML_SUCCESS, {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      return new Response('Not found', { status: 404 });
    },
  });

  return { port, redirectUri: `http://localhost:${port}/auth/callback` };
}

function stopOAuthServer(): void {
  if (oauthServer) {
    oauthServer.stop();
    oauthServer = undefined;
  }
  pendingOAuth = undefined;
}

export function setOAuthCompletionCallback(callback: OAuthCompletionCallback | undefined): void {
  onOAuthComplete = callback;
}

const HTML_SUCCESS = `<!DOCTYPE html>
<html>
<head><title>Connection Successful</title></head>
<body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #1a1a2e; color: #eee;">
  <div style="text-align: center;">
    <h1 style="color: #4ade80;">✓ Connected Successfully</h1>
    <p>You can close this window and return to jean2.</p>
  </div>
</body>
</html>`;

const HTML_ERROR = (message: string) => `<!DOCTYPE html>
<html>
<head><title>Connection Failed</title></head>
<body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #1a1a2e; color: #eee;">
  <div style="text-align: center;">
    <h1 style="color: #f87171;">✗ Connection Failed</h1>
    <p>${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    <p>Please try again.</p>
  </div>
</body>
</html>`;

export async function startCodexConnect(): Promise<{ authorizationUrl: string }> {
  const { redirectUri } = await startOAuthServer();
  const pkce = await generatePKCE();
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer);

  const authorizationUrl = new URL(`${ISSUER}/oauth/authorize`);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', CLIENT_ID);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('scope', SCOPES);
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', pkce.challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');
  authorizationUrl.searchParams.set('id_token_add_organizations', 'true');
  authorizationUrl.searchParams.set('codex_cli_simplified_flow', 'true');
  authorizationUrl.searchParams.set('originator', 'jean2');

  const timeout = setTimeout(() => {
    pendingOAuth = undefined;
    stopOAuthServer();
  }, 5 * 60 * 1000);

  pendingOAuth = {
    state,
    pkce,
    resolve: (tokens) => {
      clearTimeout(timeout);
      const accountId = tokens.id_token ? extractAccountId(parseJwtClaims(tokens.id_token) ?? {}) : undefined;
      const config: CodexProviderConfig = {
        type: 'oauth',
        provider: 'codex',
        access: tokens.access_token,
        refresh: tokens.refresh_token,
        expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        ...(accountId && { accountId }),
        connectedAt: new Date().toISOString(),
      };
      saveProviderConfig('codex', config);
      stopOAuthServer();
      onOAuthComplete?.(true);
    },
    reject: (err) => {
      clearTimeout(timeout);
      stopOAuthServer();
      const message = err instanceof Error ? err.message : 'OAuth failed';
      onOAuthComplete?.(false, message);
    },
  };

  return { authorizationUrl: authorizationUrl.toString() };
}

export async function getCodexConfig(): Promise<CodexProviderConfig | null> {
  const config = loadProviderConfig<CodexProviderConfig>('codex');
  if (!config) {
    return null;
  }

  if (config.expires < Date.now()) {
    try {
      const tokens = await refreshAccessToken(config.refresh);
      config.access = tokens.access_token;
      config.refresh = tokens.refresh_token;
      config.expires = Date.now() + (tokens.expires_in ?? 3600) * 1000;

      if (tokens.id_token) {
        const claims = parseJwtClaims(tokens.id_token);
        if (claims) {
          const accountId = extractAccountId(claims);
          if (accountId) {
            config.accountId = accountId;
          }
        }
      }

      saveProviderConfig('codex', config);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to refresh Codex token, clearing config:', message);
      deleteProviderConfig('codex');
      return null;
    }
  }

  return config;
}

export function getCodexStatus(): { connected: boolean; connectedAt?: string; accountId?: string } {
  const config = loadProviderConfig<CodexProviderConfig>('codex');
  if (!config) {
    return { connected: false };
  }
  return {
    connected: true,
    connectedAt: config.connectedAt,
    accountId: config.accountId,
  };
}

export function disconnectCodex(): void {
  deleteProviderConfig('codex');
  stopOAuthServer();
}

export async function createCodexFetch(config: CodexProviderConfig): Promise<typeof globalThis.fetch> {
  const currentConfig = config.expires < Date.now()
    ? await getCodexConfig()
    : config;

  if (!currentConfig) {
    throw new Error('Codex not connected');
  }

  const codexFetch = async (input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => {
    const headers = new Headers(init?.headers);

    headers.delete('authorization');
    headers.delete('Authorization');
    headers.set('authorization', `Bearer ${currentConfig.access}`);

    if (currentConfig.accountId) {
      headers.set('ChatGPT-Account-Id', currentConfig.accountId);
    }

    headers.set('originator', 'jean2');

    const parsed = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    const isCodexEndpoint = parsed.pathname.includes('/v1/responses') || parsed.pathname.includes('/chat/completions');
    const url = isCodexEndpoint
      ? new URL(CODEX_API_ENDPOINT)
      : new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);

    const response = await globalThis.fetch(url, {
      ...init,
      headers,
    });

    if (response.status === 401) {
      const refreshed = await getCodexConfig();
      if (refreshed) {
        const retryHeaders = new Headers(headers);
        retryHeaders.set('authorization', `Bearer ${refreshed.access}`);
        return globalThis.fetch(url, { ...init, headers: retryHeaders });
      }
    }

    return response;
  };

  return Object.assign(codexFetch, {
    preconnect: globalThis.fetch.preconnect,
  });
}

export { OAUTH_DUMMY_KEY };

const codexProvider: ConnectableProvider = {
  descriptor: {
    id: 'codex',
    displayName: 'ChatGPT (Codex)',
    description: 'Use ChatGPT subscription models via OAuth',
    authType: 'oauth',
    connectable: true,
  },

  getStatus(): ProviderStatus {
    const status = getCodexStatus();
    return {
      provider: 'codex',
      connected: status.connected,
      connectedAt: status.connectedAt,
      accountId: status.accountId,
    };
  },

  async connect() {
    const result = await startCodexConnect();
    return { authorizationUrl: result.authorizationUrl };
  },

  async disconnect() {
    disconnectCodex();
  },

  async createModel(options) {
    const config = await getCodexConfig();
    if (!config) {
      throw new Error('Codex not connected. Please connect your ChatGPT subscription in Settings.');
    }
    const codexFetch = await createCodexFetch(config);
    const { createOpenAI } = await import('@ai-sdk/openai');
    const openai = createOpenAI({
      apiKey: OAUTH_DUMMY_KEY,
      fetch: codexFetch,
    });
    return {
      model: openai.responses(options.modelId) as unknown as LanguageModel,
      useProviderInstructions: true,
      omitMaxOutputTokens: true,
      providerOptions: {
        openai: {
          instructions: options.systemPrompt || 'You are a helpful assistant.',
          store: false,
        },
      },
    };
  },

  onConnectComplete(callback) {
    setOAuthCompletionCallback(callback);
  },
};

registerProvider(codexProvider);
