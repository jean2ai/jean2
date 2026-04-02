import { useEffect, type RefObject } from 'react';
import type { ServerMessage } from '@jean2/shared';

const getWsUrl = (token: string | null, url: string | null) =>
  (token && url) ? `ws://${url}/ws?token=${token}` : null;

const CONNECTION_TIMEOUT = 10000;
const MAX_RETRY_DELAY = 30000;
const INITIAL_RETRY_DELAY = 1000;

export interface ConnectionLifecycleParams {
  apiToken: string | null;
  serverUrl: string | null;
  wsRef: RefObject<WebSocket | null>;
  serverEpochRef: RefObject<number>;
  currentSessionIdRef: RefObject<string | null>;
  clearPendingPermissions: () => void;
  handleLogout: () => void;
  setWs: (ws: WebSocket | null) => void;
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
  onMessage: (msg: ServerMessage) => void;
}

export function useConnectionLifecycle({
  apiToken,
  serverUrl,
  wsRef,
  serverEpochRef,
  currentSessionIdRef,
  clearPendingPermissions,
  handleLogout,
  setWs,
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
  onMessage,
}: ConnectionLifecycleParams) {
  useEffect(() => {
    if (!apiToken || !serverUrl) {
      return;
    }

    const wsUrl = getWsUrl(apiToken, serverUrl);
    if (!wsUrl) return;

    const socket = new WebSocket(wsUrl);

    const localEpoch = serverEpochRef.current;

    socket.onopen = () => {
      if (serverEpochRef.current !== localEpoch) return;
      setConnected(true);
      setAuthError(null);
      setRetryCount(0);
      setConnectionTimedOut(false);

      clearPendingPermissions();

      if (currentSessionIdRef.current) {
        socket.send(JSON.stringify({
          type: 'session.resume',
          sessionId: currentSessionIdRef.current,
        }));
      }

      socket.send(JSON.stringify({ type: 'permissions.sync' }));
    };

    socket.onclose = (event) => {
      if (serverEpochRef.current !== localEpoch) return;
      setConnected(false);

      if (event.code === 1008 || event.code === 401) {
        handleLogout();
      }
    };

    socket.onerror = (error) => {
      if (serverEpochRef.current !== localEpoch) return;
      console.error('WebSocket error:', error);
    };

    socket.onmessage = (event) => {
      if (serverEpochRef.current !== localEpoch) return;
      const msg: ServerMessage = JSON.parse(event.data);
      onMessage(msg);
    };

    setWs(socket);

    return () => socket.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        MAX_RETRY_DELAY
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionTimedOut, connected, apiToken, serverUrl, retryCount, serverEpochRef, setReconnectTrigger, setNextRetryIn]);

  useEffect(() => {
    const localEpoch = serverEpochRef.current;

    const handleVisibilityChange = () => {
      if (serverEpochRef.current !== localEpoch) return;

      if (document.visibilityState !== 'visible') return;

      const socket = wsRef.current;
      if (!socket || !apiToken || !serverUrl) return;

      if (socket.readyState === WebSocket.OPEN) {
        socket.onclose = null;
        socket.close();
        setConnected(false);
        setRetryCount(0);
        setConnectionTimedOut(false);
        setReconnectTrigger(t => t + 1);
      } else if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        setConnected(false);
        setRetryCount(0);
        setConnectionTimedOut(false);
        setReconnectTrigger(t => t + 1);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiToken, serverUrl, serverEpochRef, setReconnectTrigger, setConnected, setRetryCount, setConnectionTimedOut]);

  useEffect(() => {
    const localEpoch = serverEpochRef.current;

    const handleOnline = () => {
      if (serverEpochRef.current !== localEpoch) return;

      if (!apiToken || !serverUrl) return;

      const socket = wsRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) return;

      setConnected(false);
      setRetryCount(0);
      setConnectionTimedOut(false);
      setReconnectTrigger(t => t + 1);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiToken, serverUrl, serverEpochRef, setReconnectTrigger, setConnected, setRetryCount, setConnectionTimedOut]);
}
