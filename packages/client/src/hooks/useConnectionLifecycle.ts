import { useEffect, useRef, type RefObject } from 'react';
import { Jean2Client } from '@jean2/sdk';
import type { SessionHandlersContext } from '@/handlers/serverMessage';
import { subscribeToServerEvents } from './subscribeToServerEvents';

const CONNECTION_TIMEOUT = 10000;
const MAX_RETRY_DELAY = 30000;
const INITIAL_RETRY_DELAY = 1000;
const STALE_THRESHOLD = 30_000;

export interface ConnectionLifecycleParams {
  apiToken: string | null;
  serverUrl: string | null;
  serverEpochRef: RefObject<number>;
  currentSessionIdRef: RefObject<string | null>;
  handlerContextRef: React.RefObject<SessionHandlersContext | null>;
  clearPendingPermissions: () => void;
  handleLogout: () => void;
  setConnected: (connected: boolean) => void;
  setAuthError: (error: string | null) => void;
  setConnectionTimedOut: (timedOut: boolean) => void;
  setRetryCount: React.Dispatch<React.SetStateAction<number>>;
  setNextRetryIn: React.Dispatch<React.SetStateAction<number>>;
  setReconnectTrigger: React.Dispatch<React.SetStateAction<number>>;
  reconnectTrigger: number;
  connected: boolean;
  connectionTimedOut: boolean;
  retryCount: number;
  clientRef?: React.RefObject<Jean2Client | null>;
}

export interface ConnectionLifecycleReturn {
  clientRef: React.RefObject<Jean2Client | null>;
}

export function useConnectionLifecycle({
  apiToken,
  serverUrl,
  serverEpochRef,
  currentSessionIdRef,
  handlerContextRef,
  clearPendingPermissions,
  handleLogout,
  setConnected,
  setAuthError,
  setConnectionTimedOut,
  setRetryCount,
  setNextRetryIn,
  setReconnectTrigger,
  reconnectTrigger,
  connected,
  connectionTimedOut,
  retryCount,
  clientRef: externalClientRef,
}: ConnectionLifecycleParams): ConnectionLifecycleReturn {
  const internalClientRef = useRef<Jean2Client | null>(null);
  const clientRef = externalClientRef ?? internalClientRef;
  const lastMessageTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!apiToken || !serverUrl) {
      return;
    }

    const localEpoch = serverEpochRef.current;

    const client = new Jean2Client({
      url: serverUrl,
      token: apiToken,
      autoSyncPermissions: false,
    });

    clientRef.current = client;

    client.on('connected', () => {
      if (serverEpochRef.current !== localEpoch) return;
      setConnected(true);
      setAuthError(null);
      setRetryCount(0);
      setConnectionTimedOut(false);

      clearPendingPermissions();

      if (currentSessionIdRef.current) {
        client.sessions.resume(currentSessionIdRef.current);
      }

      client.permissions.sync();
    });

    client.on('disconnected', (payload) => {
      if (serverEpochRef.current !== localEpoch) return;
      setConnected(false);

      if (payload.code === 1008 || payload.code === 401) {
        handleLogout();
      }
    });

    client.on('error.connection', (error) => {
      if (serverEpochRef.current !== localEpoch) return;
      console.error('WebSocket error:', error);
    });

    client.on('*', () => {
      if (serverEpochRef.current !== localEpoch) return;
      lastMessageTimeRef.current = Date.now();
    });

    const unsubscribe = subscribeToServerEvents(client, handlerContextRef);

    client.connect().catch((err) => {
      if (serverEpochRef.current !== localEpoch) return;
      console.error('Connection failed:', err);
    });

    return () => {
      unsubscribe();
      client.dispose();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [apiToken, serverUrl, handleLogout, reconnectTrigger]);

  useEffect(() => {
    if (apiToken && serverUrl && !connected && !connectionTimedOut) {
      const timeoutId = setTimeout(() => {
        if (!connected) {
          setConnectionTimedOut(true);
        }
      }, CONNECTION_TIMEOUT);

      return () => clearTimeout(timeoutId);
    }
  }, [apiToken, serverUrl, connected, connectionTimedOut, setConnectionTimedOut]);

  useEffect(() => {
    const localEpoch = serverEpochRef.current;

    if (connectionTimedOut && !connected && apiToken && serverUrl) {
      const delay = Math.min(
        INITIAL_RETRY_DELAY * Math.pow(2, retryCount),
        MAX_RETRY_DELAY,
      );

      let countdown = Math.floor(delay / 1000);
      setNextRetryIn(countdown);

      const countdownInterval = setInterval(() => {
        countdown -= 1;
        setNextRetryIn(Math.max(0, countdown));
      }, 1000);

      const retryTimeout = setTimeout(() => {
        if (serverEpochRef.current !== localEpoch) return;
        setRetryCount(c => c + 1);
        setReconnectTrigger(t => t + 1);
      }, delay);

      return () => {
        clearInterval(countdownInterval);
        clearTimeout(retryTimeout);
      };
    }
  }, [connectionTimedOut, connected, apiToken, serverUrl, retryCount, serverEpochRef, setReconnectTrigger, setNextRetryIn]);

  useEffect(() => {
    const localEpoch = serverEpochRef.current;

    const handleVisibilityChange = () => {
      if (serverEpochRef.current !== localEpoch) return;

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
        setConnected(false);
        setRetryCount(0);
        setConnectionTimedOut(false);
        setReconnectTrigger(t => t + 1);
      } else if (!client.connected) {
        setConnected(false);
        setRetryCount(0);
        setConnectionTimedOut(false);
        setReconnectTrigger(t => t + 1);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [apiToken, serverUrl, serverEpochRef, setReconnectTrigger, setConnected, setRetryCount, setConnectionTimedOut, lastMessageTimeRef]);

  useEffect(() => {
    const localEpoch = serverEpochRef.current;

    const handleOnline = () => {
      if (serverEpochRef.current !== localEpoch) return;

      if (!apiToken || !serverUrl) return;

      const client = clientRef.current;
      if (client && client.connected) return;

      setConnected(false);
      setRetryCount(0);
      setConnectionTimedOut(false);
      setReconnectTrigger(t => t + 1);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [apiToken, serverUrl, serverEpochRef, setReconnectTrigger, setConnected, setRetryCount, setConnectionTimedOut]);

  return { clientRef };
}
