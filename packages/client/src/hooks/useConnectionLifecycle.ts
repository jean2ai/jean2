import { useEffect, useRef, useState, type RefObject } from 'react';
import { Jean2Client } from '@jean2/sdk';
import type { SessionHandlersContext } from '@/handlers/serverMessage';
import { useConnectionStore } from '@/stores/connectionStore';
import { subscribeToServerEvents } from './subscribeToServerEvents';

const CONNECTION_TIMEOUT = 10000;
const MAX_RETRY_DELAY = 30000;
const INITIAL_RETRY_DELAY = 1000;
const STALE_THRESHOLD = 30_000;

export interface ConnectionLifecycleParams {
  apiToken: string | null;
  serverUrl: string | null;
  currentSessionIdRef: RefObject<string | null>;
  handlerContextRef: RefObject<SessionHandlersContext | null>;
  clearPendingPermissions: () => void;
  handleLogout: () => void;
  clientRef?: RefObject<Jean2Client | null>;
}

export interface ConnectionLifecycleReturn {
  clientRef: RefObject<Jean2Client | null>;
}

export function useConnectionLifecycle({
  apiToken,
  serverUrl,
  currentSessionIdRef,
  handlerContextRef,
  clearPendingPermissions,
  handleLogout,
  clientRef: externalClientRef,
}: ConnectionLifecycleParams): ConnectionLifecycleReturn {
  const internalClientRef = useRef<Jean2Client | null>(null);
  const clientRef = externalClientRef ?? internalClientRef;
  const lastMessageTimeRef = useRef<number>(0);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (!apiToken || !serverUrl) {
      return;
    }

    const client = new Jean2Client({
      url: serverUrl,
      token: apiToken,
      autoSyncPermissions: false,
    });

    clientRef.current = client;

    client.on('connected', () => {
      useConnectionStore.getState().setConnected(true);
      useConnectionStore.getState().setAuthError(null);
      useConnectionStore.getState().setRetryCount(0);
      useConnectionStore.getState().setConnectionTimedOut(false);

      clearPendingPermissions();

      if (currentSessionIdRef.current) {
        client.sessions.resume(currentSessionIdRef.current);
      }

      client.permissions.sync();
    });

    client.on('disconnected', (payload) => {
      useConnectionStore.getState().setConnected(false);

      if (payload.code === 1008 || payload.code === 401) {
        handleLogout();
      }
    });

    client.on('error.connection', (error) => {
      console.error('WebSocket error:', error);
    });

    client.on('*', () => {
      lastMessageTimeRef.current = Date.now();
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
  }, [apiToken, serverUrl, reconnectAttempt]);

  useEffect(() => {
    const { connected, connectionTimedOut } = useConnectionStore.getState();
    if (apiToken && serverUrl && !connected && !connectionTimedOut) {
      const timeoutId = setTimeout(() => {
        if (!useConnectionStore.getState().connected) {
          useConnectionStore.getState().setConnectionTimedOut(true);
        }
      }, CONNECTION_TIMEOUT);

      return () => clearTimeout(timeoutId);
    }
  }, [apiToken, serverUrl, reconnectAttempt]);

  useEffect(() => {
    const { connectionTimedOut, connected, retryCount } = useConnectionStore.getState();
    if (connectionTimedOut && !connected && apiToken && serverUrl) {
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
      }, delay);

      return () => {
        clearInterval(countdownInterval);
        clearTimeout(retryTimeout);
      };
    }
  }, [apiToken, serverUrl, reconnectAttempt]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const client = clientRef.current;
      if (!client || !apiToken || !serverUrl) return;

      if (client.connected) {
        const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;
        if (timeSinceLastMessage < STALE_THRESHOLD) {
          return;
        }
        client.dispose();
        clientRef.current = null;
        useConnectionStore.getState().setConnected(false);
        useConnectionStore.getState().setRetryCount(0);
        useConnectionStore.getState().setConnectionTimedOut(false);
        setReconnectAttempt(n => n + 1);
      } else if (!client.connected) {
        useConnectionStore.getState().setConnected(false);
        useConnectionStore.getState().setRetryCount(0);
        useConnectionStore.getState().setConnectionTimedOut(false);
        setReconnectAttempt(n => n + 1);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [apiToken, serverUrl, lastMessageTimeRef]);

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

  return { clientRef };
}
