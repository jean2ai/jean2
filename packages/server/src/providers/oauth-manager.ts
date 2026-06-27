/**
 * Generalized OAuth 2.0 + PKCE flow manager.
 *
 * Owns: PKCE generation, state, pending flow tracking, token exchange, token refresh.
 * Each OAuth provider registers its config (clientId, endpoints, scopes).
 * The client-side handles receiving the redirect and posting the code back.
 */
import type { OAuthProviderConfig, OAuthRedirectStrategy } from '@jean2/sdk';
import type { TokenResponse } from './registry';
import { getProvider } from './registry';

interface PkceCodes {
  verifier: string;
  challenge: string;
}

interface PendingFlow {
  providerId: string;
  state: string;
  pkce: PkceCodes;
  redirectUri: string;
  timeout: ReturnType<typeof setTimeout>;
}

/** Per-provider OAuth configuration registry. */
const oauthConfigs = new Map<string, OAuthProviderConfig>();

/** Active pending OAuth flows, keyed by flowId. */
const pendingFlows = new Map<string, PendingFlow>();

/** Completion callbacks per provider, keyed by providerId. */
const completionCallbacks = new Map<string, (success: boolean, error?: string) => void>();

interface LocalServerEntry {
  server: ReturnType<typeof Bun.serve>;
  /** Registered callback paths (e.g. "/auth/callback", "/oauth/gmail/callback"). */
  paths: Set<string>;
  /** Reference count of active flows using this server. */
  activeFlows: number;
}

/** Localhost callback servers, keyed by port. Multiple providers can share a port if they use different paths. */
const localServers = new Map<number, LocalServerEntry>();

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

/**
 * Register an OAuth configuration for a provider.
 * Call this once at startup for each OAuth-based provider.
 */
export function registerOAuthConfig(providerId: string, config: OAuthProviderConfig): void {
  oauthConfigs.set(providerId, config);
}

/**
 * Set the completion callback for a provider (called when tokens are saved or flow fails).
 */
export function setOAuthCompletionCallback(
  providerId: string,
  callback: ((success: boolean, error?: string) => void) | undefined,
): void {
  if (callback) {
    completionCallbacks.set(providerId, callback);
  } else {
    completionCallbacks.delete(providerId);
  }
}

/**
 * Get the registered redirect URI for a provider.
 */
export function getDefaultRedirectUri(providerId: string): string {
  const config = oauthConfigs.get(providerId);
  return config?.redirectUri ?? `http://localhost:1455/oauth/${providerId}/callback`;
}

/**
 * Start a localhost HTTP server on the port from the redirect URI.
 * Handles the OAuth callback automatically by matching the state parameter.
 */
function ensureLocalServer(redirectUri: string): void {
  const parsed = new URL(redirectUri);
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return;
  const port = parseInt(parsed.port, 10);
  if (!port || isNaN(port)) return;

  const path = parsed.pathname;
  const existing = localServers.get(port);

  if (existing) {
    existing.paths.add(path);
    existing.activeFlows++;
    return;
  }

  const paths = new Set<string>([path]);
  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (paths.has(url.pathname)) {
        return handleLocalhostCallback(url);
      }
      return new Response('Not found', { status: 404 });
    },
  });

  localServers.set(port, { server, paths, activeFlows: 1 });
}

function stopLocalServerForPath(redirectUri: string): void {
  const parsed = new URL(redirectUri);
  const port = parseInt(parsed.port, 10);
  if (!port || isNaN(port)) return;

  const entry = localServers.get(port);
  if (!entry) return;

  entry.activeFlows--;
  if (entry.activeFlows <= 0) {
    entry.server.stop();
    localServers.delete(port);
  }
}

/**
 * Handle a callback received by the localhost server.
 * Matches the state parameter to find the pending flow, then completes it.
 */
async function handleLocalhostCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  if (error) {
    const errorMsg = errorDescription || error;
    for (const [flowId, flow] of pendingFlows) {
      if (flow.state === state) {
        completionCallbacks.get(flow.providerId)?.(false, errorMsg);
        clearTimeout(flow.timeout);
        pendingFlows.delete(flowId);
        break;
      }
    }
    return new Response(htmlError(errorMsg), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (!code || !state) {
    return new Response(htmlError('Missing authorization code or state'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Find the pending flow by state
  let matchedFlowId: string | undefined;
  for (const [flowId, flow] of pendingFlows) {
    if (flow.state === state) {
      matchedFlowId = flowId;
      break;
    }
  }

  if (!matchedFlowId) {
    return new Response(htmlError('Invalid state — no matching OAuth flow'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    const flow = pendingFlows.get(matchedFlowId);
    const redirectUri = flow?.redirectUri ?? '';
    const result = await completeOAuthFlow(matchedFlowId, code, state, redirectUri);
    stopLocalServerForPath(redirectUri);
    void result;
    return new Response(HTML_SUCCESS, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Token exchange failed';
    return new Response(htmlError(message), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

/**
 * Initiate an OAuth flow for a provider.
 * Returns the authorization URL, flow ID, and redirect info.
 */
export async function initiateOAuthFlow(
  providerId: string,
  redirectStrategy: OAuthRedirectStrategy = 'client_redirect',
): Promise<{
  authorizationUrl: string;
  flowId: string;
  redirectStrategy: OAuthRedirectStrategy;
  redirectUri: string;
}> {
  const config = oauthConfigs.get(providerId);
  if (!config) {
    throw new Error(`No OAuth configuration registered for provider: ${providerId}`);
  }

  const pkce = await generatePKCE();
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const flowId = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)).buffer);

  const redirectUri = config.redirectUri;

  // For localhost redirect URIs, start a local callback server
  if (redirectStrategy === 'client_redirect') {
    ensureLocalServer(redirectUri);
  }

  const authorizationUrl = new URL(config.authorizeUrl);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', config.clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('scope', config.scopes);
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', pkce.challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');

  if (config.extraAuthParams) {
    for (const [key, value] of Object.entries(config.extraAuthParams)) {
      authorizationUrl.searchParams.set(key, value);
    }
  }

  const timeout = setTimeout(() => {
    pendingFlows.delete(flowId);
  }, 5 * 60 * 1000);

  pendingFlows.set(flowId, {
    providerId,
    state,
    pkce,
    redirectUri,
    timeout,
  });

  return {
    authorizationUrl: authorizationUrl.toString(),
    flowId,
    redirectStrategy,
    redirectUri,
  };
}

/**
 * Complete an OAuth flow by exchanging the authorization code for tokens.
 * Called when the client posts the code back to the server.
 */
export async function completeOAuthFlow(
  flowId: string,
  code: string,
  state: string,
  redirectUri: string,
): Promise<{ providerId: string }> {
  const flow = pendingFlows.get(flowId);
  if (!flow) {
    throw new Error('Unknown or expired OAuth flow');
  }

  if (state !== flow.state) {
    pendingFlows.delete(flowId);
    clearTimeout(flow.timeout);
    throw new Error('State mismatch — potential CSRF attack');
  }

  const config = oauthConfigs.get(flow.providerId);
  if (!config) {
    throw new Error(`No OAuth configuration for provider: ${flow.providerId}`);
  }

  clearTimeout(flow.timeout);
  pendingFlows.delete(flowId);

  const tokens = await exchangeCodeForTokens(config, code, redirectUri, flow.pkce);

  const provider = getProvider(flow.providerId);
  if (provider) {
    await provider.onTokensReceived(tokens);
  }

  completionCallbacks.get(flow.providerId)?.(true);

  return { providerId: flow.providerId };
}

/**
 * Handle a direct server callback (when the server has a public URL).
 * Returns HTML response for the browser.
 */
export async function handleServerCallback(
  providerId: string,
  url: URL,
): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  if (error) {
    const errorMsg = errorDescription || error;
    completionCallbacks.get(providerId)?.(false, errorMsg);
    return new Response(htmlError(errorMsg), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (!code) {
    completionCallbacks.get(providerId)?.(false, 'Missing authorization code');
    return new Response(htmlError('Missing authorization code'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Find the pending flow by state for this provider
  let matchedFlowId: string | undefined;
  for (const [flowId, flow] of pendingFlows) {
    if (flow.providerId === providerId && flow.state === state) {
      matchedFlowId = flowId;
      break;
    }
  }

  if (!matchedFlowId) {
    return new Response(htmlError('Invalid state — no matching OAuth flow'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    await completeOAuthFlow(matchedFlowId, code, state!, getDefaultRedirectUri(providerId));
    return new Response(HTML_SUCCESS, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Token exchange failed';
    return new Response(htmlError(message), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

/**
 * Refresh an access token using a refresh token.
 */
export async function refreshTokens(
  providerId: string,
  refreshToken: string,
): Promise<TokenResponse> {
  const config = oauthConfigs.get(providerId);
  if (!config) {
    throw new Error(`No OAuth configuration for provider: ${providerId}`);
  }

  const refreshParams: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  };
  if (config.clientSecret) {
    refreshParams.client_secret = config.clientSecret;
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(refreshParams).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<TokenResponse>;
}

async function exchangeCodeForTokens(
  config: OAuthProviderConfig,
  code: string,
  redirectUri: string,
  pkce: PkceCodes,
): Promise<TokenResponse> {
  const exchangeParams: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: pkce.verifier,
  };
  if (config.clientSecret) {
    exchangeParams.client_secret = config.clientSecret;
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(exchangeParams).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<TokenResponse>;
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

function htmlError(message: string): string {
  return `<!DOCTYPE html>
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
}
