import { useSyncExternalStore } from 'react';
import type { ConnectionState } from '@jean2/sdk';
import { useClientFromContext } from './use-internal-client';

interface ConnectionStateSnapshot {
  state: ConnectionState;
  connected: boolean;
  reconnecting: boolean;
}

function subscribe(client: ReturnType<typeof useClientFromContext>, callback: () => void): () => void {
  client.on('connected', callback);
  client.on('disconnected', callback);
  client.on('reconnecting', callback);
  return () => {
    client.off('connected', callback);
    client.off('disconnected', callback);
    client.off('reconnecting', callback);
  };
}

function getSnapshot(client: ReturnType<typeof useClientFromContext>): ConnectionStateSnapshot {
  return {
    state: client.state,
    connected: client.connected,
    reconnecting: client.reconnecting,
  };
}

function getServerSnapshot(): ConnectionStateSnapshot {
  return { state: 'disconnected', connected: false, reconnecting: false };
}

export function useConnectionState(): ConnectionStateSnapshot {
  const client = useClientFromContext();
  return useSyncExternalStore(
    (callback) => subscribe(client, callback),
    () => getSnapshot(client),
    getServerSnapshot,
  );
}
