import { useEffect, useRef, type RefObject } from 'react';
import { Jean2Client } from '@jean2/sdk';

const CONNECTION_TIMEOUT = 10000;
const MAX_RETRY_DELAY = 30000;
const INITIAL_RETRY_DELAY = 1000;

export interface ConnectionLifecycleParams {
  apiToken: string | null;
  serverUrl: string | null;
  currentSessionIdRef: RefObject<string | null>;
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
  clientRef?: RefObject<Jean2Client | null>;
  onClientChange?: (client: Jean2Client | null) => void;
}

export interface ConnectionLifecycleReturn {
  clientRef: RefObject<Jean2Client | null>;
}

export function useConnectionLifecycle({
  apiToken,
  serverUrl,
  currentSessionIdRef,
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
  onClientChange,
}: ConnectionLifecycleParams): ConnectionLifecycleReturn {
  const internalClientRef = useRef<Jean2Client | null>(null);
  const clientRef = externalClientRef ?? internalClientRef;
  const handleLogoutRef = useRef(handleLogout);
  // eslint-disable-next-line react-hooks/refs -- intentionally updating ref during render to avoid effect re-connection
  handleLogoutRef.current = handleLogout;

  // eslint-disable-next-line react-hooks/immutability -- clientRef is intentionally mutable to share client instance
  useEffect(() => {
    if (!apiToken || !serverUrl) {
      onClientChange?.(null);
      return;
    }

    const client = new Jean2Client({
      url: serverUrl,
      token: apiToken,
      autoSyncPermissions: false,
    });

    clientRef.current = client;
    onClientChange?.(client);

    client.on('connected', () => {
      setConnected(true);
      setAuthError(null);
      setRetryCount(0);
      setConnectionTimedOut(false);

      if (currentSessionIdRef.current) {
        client.sessions.resume(currentSessionIdRef.current);
      }

      client.permissions.sync();
    });

    client.on('disconnected', (payload) => {
      setConnected(false);

      if (payload.code === 1008 || payload.code === 401) {
        handleLogoutRef.current();
      }
    });

    client.on('error.connection', (error) => {
      console.error('WebSocket error:', error);
    });

    client.connect().catch((err) => {
      console.error('Connection failed:', err);
    });

    return () => {
      onClientChange?.(null);
      client.dispose();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [apiToken, serverUrl, reconnectTrigger, onClientChange]);

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
        setRetryCount(c => c + 1);
        setReconnectTrigger(t => t + 1);
      }, delay);

      return () => {
        clearInterval(countdownInterval);
        clearTimeout(retryTimeout);
      };
    }
  }, [connectionTimedOut, connected, apiToken, serverUrl, retryCount, setReconnectTrigger, setNextRetryIn, setRetryCount]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const client = clientRef.current;
      if (!client || !apiToken || !serverUrl) return;

      if (client.connected) {
        return;
      }

      setConnected(false);
      setRetryCount(0);
      setConnectionTimedOut(false);
      setReconnectTrigger(t => t + 1);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [apiToken, serverUrl, setReconnectTrigger, setConnected, setRetryCount, setConnectionTimedOut]);

  useEffect(() => {
    const handleOnline = () => {
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
  }, [apiToken, serverUrl, setReconnectTrigger, setConnected, setRetryCount, setConnectionTimedOut]);

  return { clientRef };
}
