import { createContext, useContext, useMemo } from 'react';
import type { Jean2Client } from '@jean2/sdk';

export interface ServerClientValue {
  sdkClient: Jean2Client | null;
  serverUrl: string | null;
  apiToken: string | null;
  connected: boolean;
}

const ServerClientContext = createContext<ServerClientValue | null>(null);

export const ServerClientProvider = ServerClientContext.Provider;

export function useServerClient(): ServerClientValue {
  const ctx = useContext(ServerClientContext);
  if (!ctx) {
    throw new Error('useServerClient must be used within a ServerClientProvider');
  }
  return ctx;
}

export function useSdkClient(): Jean2Client | null {
  return useServerClient().sdkClient;
}

export function useServerUrl(): string | null {
  return useServerClient().serverUrl;
}

/**
 * Convenience hook for components that need the stable sdkClient only.
 * Does not trigger rerenders from session/ask/queue changes.
 */
export function useServerClientMemo(
  sdkClient: Jean2Client | null,
  serverUrl: string | null,
  apiToken: string | null,
  connected: boolean,
): ServerClientValue {
  return useMemo(
    () => ({ sdkClient, serverUrl, apiToken, connected }),
    [sdkClient, serverUrl, apiToken, connected],
  );
}
