import { HttpClient } from '@jean2/sdk';
import { normalizeServerUrl } from '@/config/auth';

export interface ServerAuthResult {
  success: boolean;
  error?: string;
  authEnabled?: boolean;
}

/**
 * Pre-validate server authentication before saving and navigating.
 *
 * 1. Hits the public /api/info endpoint to detect auth status.
 * 2. If auth is disabled → success.
 * 3. If auth is enabled and no token → error.
 * 4. If auth is enabled and token provided → validates via /api/auth/verify.
 * 5. If server is unreachable → error with clear message.
 */
export async function validateServerAuth(
  rawUrl: string,
  token?: string,
): Promise<ServerAuthResult> {
  const url = normalizeServerUrl(rawUrl);

  interface ServerInfo {
    features?: { authentication?: boolean };
  }

  let authEnabled: boolean;
  try {
    const proto = url.startsWith('https') ? 'https' : 'http';
    const clean = url.replace(/^https?:\/\//, '');
    const res = await fetch(`${proto}://${clean}/api/info`);
    if (!res.ok) {
      return {
        success: false,
        error: `Server returned ${res.status}. Check the URL and try again.`,
      };
    }
    const info = (await res.json()) as ServerInfo;
    authEnabled = info.features?.authentication ?? false;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Could not reach server: ${message}`,
    };
  }

  if (!authEnabled) {
    return { success: true, authEnabled: false };
  }

  if (!token) {
    return {
      success: false,
      authEnabled: true,
      error: 'This server requires an API token. Enable the token toggle and enter your token.',
    };
  }

  try {
    const valid = await HttpClient.verifyToken(url, token);
    if (!valid) {
      return {
        success: false,
        authEnabled: true,
        error: 'Invalid token. Check your API token and try again.',
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      authEnabled: true,
      error: `Could not verify token: ${message}`,
    };
  }

  return { success: true, authEnabled: true };
}
