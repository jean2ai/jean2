import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Jean2Client } from '@jean2/sdk';
import type { ClientDescriptor } from '@jean2/sdk';
import type { SessionHandlersContext } from '@/handlers/serverMessage';
import { useConnectionStore } from '@/stores/connectionStore';
import { useAskStore } from '@/stores/askStore';
import { useClientIdentityStore } from '@/stores/clientIdentityStore';
import { subscribeToServerEvents } from './subscribeToServerEvents';
import { resolveClientDescriptor } from '@/config/client-identity';

const CONNECTION_TIMEOUT = 10000;
const MAX_RETRY_DELAY = 30000;
const INITIAL_RETRY_DELAY = 1000;

export interface ConnectionLifecycleParams {
  apiToken: string | null;
  serverUrl: string | null;
  currentSessionIdRef: RefObject<string | null>;
  handlerContextRef: RefObject<SessionHandlersContext | null>;
  handleLogout: () => void;
  clientRef?: RefObject<Jean2Client | null>;
}

export interface ConnectionLifecycleReturn {
  clientRef: RefObject<Jean2Client | null>;
  retry: () => void;
}

export function useConnectionLifecycle({
  apiToken,
  serverUrl,
  currentSessionIdRef,
  handlerContextRef,
  handleLogout,
  clientRef: externalClientRef,
}: ConnectionLifecycleParams): ConnectionLifecycleReturn {
  const internalClientRef = useRef<Jean2Client | null>(null);
  const clientRef = externalClientRef ?? internalClientRef;
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [clientDescriptor, setClientDescriptor] = useState<ClientDescriptor | null>(null);

  const retry = useCallback(() => {
    useConnectionStore.getState().setRetryCount(0);
    useConnectionStore.getState().setConnectionTimedOut(false);
    useConnectionStore.getState().setNextRetryIn(0);
    setReconnectAttempt(n => n + 1);
  }, []);

  const connected = useConnectionStore((s) => s.connected);
  const connectionTimedOut = useConnectionStore((s) => s.connectionTimedOut);

  useEffect(() => {
    if (!apiToken || !serverUrl) return;
    let cancelled = false;
    resolveClientDescriptor().then((descriptor) => {
      if (!cancelled) {
        setClientDescriptor(descriptor);
        useClientIdentityStore.getState().setClientId(descriptor.clientId);
      }
    });
    return () => { cancelled = true; };
  }, [apiToken, serverUrl]);

  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (!apiToken || !serverUrl || !clientDescriptor) {
      return;
    }

    const client = new Jean2Client({
      url: serverUrl,
      token: apiToken,
      autoSyncPermissions: false,
      clientDescriptor,
    });

    clientRef.current = client;

    client.on('connected', () => {
      useConnectionStore.getState().setConnected(true);
      useConnectionStore.getState().setAuthError(null);
      useConnectionStore.getState().setRetryCount(0);
      useConnectionStore.getState().setConnectionTimedOut(false);

      // Clear pending ask requests on reconnection (including permission asks)
      useAskStore.getState().clearPendingRequests();

      if (currentSessionIdRef.current) {
        client.sessions.resume(currentSessionIdRef.current);
      }
    });

    client.on('disconnected', (payload) => {
      useConnectionStore.getState().setConnected(false);

      if (payload.code === 1008 || payload.code === 401) {
        handleLogout();
      } else {
        useConnectionStore.getState().setConnectionTimedOut(true);
      }
    });

    client.on('error.connection', (error) => {
      console.error('WebSocket error:', error);
    });

    const unsubscribe = subscribeToServerEvents(client, handlerContextRef);

    client.connect().catch((err) => {
      console.error('Connection failed:', err);
    });

    return () => {
      unsubscribe();
      client.dispose();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [apiToken, serverUrl, clientDescriptor, reconnectAttempt]);

  useEffect(() => {
    if (apiToken && serverUrl && clientDescriptor && !connected && !connectionTimedOut) {
      const timeoutId = setTimeout(() => {
        if (!useConnectionStore.getState().connected) {
          useConnectionStore.getState().setConnectionTimedOut(true);
        }
      }, CONNECTION_TIMEOUT);

      return () => clearTimeout(timeoutId);
    }
  }, [apiToken, serverUrl, clientDescriptor, reconnectAttempt, connected, connectionTimedOut]);

  useEffect(() => {
    if (!connectionTimedOut || connected || !apiToken || !serverUrl) return;

    const retryCount = useConnectionStore.getState().retryCount;
    const delay = Math.min(
      INITIAL_RETRY_DELAY * Math.pow(2, retryCount),
      MAX_RETRY_DELAY,
    );

    let countdown = Math.floor(delay / 1000);
    useConnectionStore.getState().setNextRetryIn(countdown);

    const countdownInterval = setInterval(() => {
      countdown -= 1;
      useConnectionStore.getState().setNextRetryIn(Math.max(0, countdown));
    }, 1000);

    const retryTimeout = setTimeout(() => {
      useConnectionStore.getState().setRetryCount(c => c + 1);
      setReconnectAttempt(n => n + 1);
    }, delay);

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(retryTimeout);
    };
  }, [apiToken, serverUrl, reconnectAttempt, connected, connectionTimedOut]);

  useEffect(() => {
    const handleOnline = () => {
      if (!apiToken || !serverUrl) return;

      const client = clientRef.current;
      if (client && client.connected) return;

      useConnectionStore.getState().setConnected(false);
      useConnectionStore.getState().setRetryCount(0);
      useConnectionStore.getState().setConnectionTimedOut(false);
      setReconnectAttempt(n => n + 1);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [apiToken, serverUrl]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const client = clientRef.current;
      if (client && client.ws?.readyState === WebSocket.OPEN) return;
      if (!apiToken || !serverUrl) return;

      useConnectionStore.getState().setRetryCount(0);
      useConnectionStore.getState().setConnectionTimedOut(false);
      setReconnectAttempt(n => n + 1);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [apiToken, serverUrl]);

  return { clientRef, retry };
}
