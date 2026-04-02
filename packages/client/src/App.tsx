import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '@/stores/uiStore';
import { useSessionMetaStore } from '@/stores/sessionMetaStore';
import { useStreamStateStore } from '@/stores/streamStateStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useSessionContentStore } from '@/stores/sessionContentStore';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  Session,
  Part,
  MessageWithParts,
  ServerMessage,
  ClientMessage,
  Preconfig,
  PromptInfo,
  Workspace,
  ToolPermission,
  SavedServer,
  ProviderStatus,
} from '@jean2/shared';
import { ServerProvider, useServerContext } from '@/contexts/ServerContext';
import { AppSidebar, type AppSidebarHandle } from '@/components/layout/AppSidebar';
import { ChatView } from '@/components/chat/ChatView';
import { SettingsDialog } from '@/components/modals/SettingsDialog';
import { MCPManagementDialog } from '@/components/modals/MCPManagementDialog';
import { ConnectingState } from '@/components/shared/LoadingSkeleton';
import { OfflineState } from '@/components/shared/OfflineState';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import FirstServerScreen from '@/components/FirstServerScreen';
import { AddServerDialog } from '@/components/modals/AddServerDialog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { AppHeader, AppPanels } from '@/components/app';
import type { MessageInputHandle } from '@/components/chat/MessageInput';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';
import type { PendingPermissionRequest } from '@/stores/sessionMetaStore';

const getWsUrl = (token: string | null, url: string | null) =>
  (token && url) ? `ws://${url}/ws?token=${token}` : null;

const getApiUrl = (url: string | null) => url ? `http://${url}/api` : null;

type ClientMessagePayload =
  | { preconfigId?: string; title?: string; workspaceId?: string }
  | { sessionId: string }
  | { sessionId: string; content: string }
  | { toolCallId: string; approved: boolean }
  | { sessionId: string; preconfigId?: string }
  | { sessionId: string; modelId: string; providerId: string; variant?: string | null }
  | { toolCallId: string; allowed: boolean; alwaysAllow: boolean }
  | { workspaceId: string; includeRevoked?: boolean }
  | { permissionId: string }
  | { workspaceId: string }
  | { sessionId: string; reason?: string }
  | { queueId: string }
  | { sessionId: string; messageId: string }
  | { provider: string };

function KeyboardShortcutHandler({
  onNewSession,
  onNewWindow,
  onToggleViewMode,
  onCloseTerminal,
  focusChatInput,
  setTerminalOpen,
  sidebarRef,
  terminalPanelRef,
  onStopStreaming,
}: {
  onNewSession: () => void;
  onNewWindow: () => void;
  onToggleViewMode: () => void;
  onCloseTerminal: () => void;
  focusChatInput: () => void;
  setTerminalOpen: (open: boolean) => void;
  sidebarRef: React.RefObject<AppSidebarHandle | null>;
  terminalPanelRef: React.RefObject<{ focus: () => void } | null>;
  onStopStreaming: () => void;
}) {
  const { setOpen } = useSidebar();

  const focusSidebarSessionPanel = useCallback(() => {
    setOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sidebarRef.current?.focusSessionPanel();
      });
    });
  }, [setOpen, sidebarRef]);

  const focusTerminalPanel = useCallback(() => {
    setTerminalOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        terminalPanelRef.current?.focus();
      });
    });
  }, [setTerminalOpen, terminalPanelRef]);

  const focusSidebarSessionPanelRef = useRef(focusSidebarSessionPanel);
  useLayoutEffect(() => {
    focusSidebarSessionPanelRef.current = focusSidebarSessionPanel;
  });
  const focusTerminalPanelRef = useRef(focusTerminalPanel);
  useLayoutEffect(() => {
    focusTerminalPanelRef.current = focusTerminalPanel;
  });

  useKeyboardShortcuts({
    onOpenSidebar: () => focusSidebarSessionPanelRef.current(),
    onOpenTerminal: () => focusTerminalPanelRef.current(),
    onNewSession,
    onNewWindow,
    onToggleViewMode,
    onCloseFocusedPanel: () => {
      const activeEl = document.activeElement;
      if (activeEl?.closest('[data-terminal-panel]')) {
        onCloseTerminal();
      } else if (activeEl?.closest('[data-sidebar="sidebar"]')) {
        setOpen(false);
      }
    },
    onFocusChatInput: focusChatInput,
    onStopStreaming,
  });

  // Listen for native Tauri accelerator events — register once, call latest handlers via refs
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
    if (!isTauri) return;

    let disposed = false;
    const unlistenFns: UnlistenFn[] = [];

    const registerListeners = async () => {
      try {
        const unlistenSidebar = await listen('jean2://accelerator/open-sidebar', () => {
          focusSidebarSessionPanelRef.current();
        });
        if (disposed) {
          unlistenSidebar();
          return;
        }
        unlistenFns.push(unlistenSidebar);
      } catch (err) {
        console.error('Failed to register open-sidebar accelerator listener:', err);
      }

      try {
        const unlistenTerminal = await listen('jean2://accelerator/open-terminal', () => {
          focusTerminalPanelRef.current();
        });
        if (disposed) {
          unlistenTerminal();
          return;
        }
        unlistenFns.push(unlistenTerminal);
      } catch (err) {
        console.error('Failed to register open-terminal accelerator listener:', err);
      }
    };

    registerListeners();

    return () => {
      disposed = true;
      unlistenFns.forEach(fn => fn());
    };
  }, []); // Stable registration — handlers accessed via refs

  return null;
}

function AppContent() {
  const { servers, activeServer, addServer, removeServer, isSwitching, clearSwitchingState, quickConnections, isAddingServerRef, prepareForServerAdd, removeFromQuickConnectionsByWorkspace } = useServerContext();

  // Session state managed by Zustand store
  const { sessions, currentSession, setSessions, setCurrentSession, clearSessionState } = useSessionStore(
    useShallow((s) => ({
      sessions: s.sessions,
      currentSession: s.currentSession,
      setSessions: s.setSessions,
      setCurrentSession: s.setCurrentSession,
      clearSessionState: s.clearSessionState,
    })),
  );

  const [preconfigs, setPreconfigs] = useState<Preconfig[]>([]);
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);

  // Session content stored in Zustand for cross-component access
  const { messagesBySession, partsBySession, setMessagesBySession, setPartsBySession } =
    useSessionContentStore(
      useShallow((state) => ({
        messagesBySession: state.messagesBySession,
        partsBySession: state.partsBySession,
        setMessagesBySession: state.setMessagesBySession,
        setPartsBySession: state.setPartsBySession,
      })),
    );

  // LRU cache eviction for session data
  // Intentional tiny cache: keep only current + most recent session to minimize memory
  const SESSION_CACHE_MAX = 2;
  const sessionAccessTimesRef = useRef<Map<string, number>>(new Map());
  const prevSessionKeyCountRef = useRef(0);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const chatInputRef = useRef<MessageInputHandle>(null);
  const terminalPanelRef = useRef<TerminalPanelHandle>(null);
  const sidebarRef = useRef<AppSidebarHandle>(null);
  const [connected, setConnected] = useState(false);
  const sessionsRef = useRef<Session[]>([]);

  const {
    streamingSessionIds,
    interruptedSessions,
    clearStreamingSessions,
    clearInterruptedSessions,
    addStreamingSession,
    removeStreamingSession,
    addInterruptedSession,
    removeInterruptedSession,
  } = useStreamStateStore(
    useShallow((s) => ({
      streamingSessionIds: s.streamingSessionIds,
      interruptedSessions: s.interruptedSessions,
      clearStreamingSessions: s.clearStreamingSessions,
      clearInterruptedSessions: s.clearInterruptedSessions,
      addStreamingSession: s.addStreamingSession,
      removeStreamingSession: s.removeStreamingSession,
      addInterruptedSession: s.addInterruptedSession,
      removeInterruptedSession: s.removeInterruptedSession,
    })),
  );
  const [sessionUsage, setSessionUsage] = useState<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number
  }>({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  const [currentModel, setCurrentModel] = useState<string>('gpt-4o');
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [models, setModels] = useState<Array<{
    id: string;
    name: string;
    contextWindow: number;
    tier: 'budget' | 'standard' | 'premium';
    providerId: string;
    providerName: string;
    variants?: Record<string, { providerOptions: Record<string, unknown> }>;
  }>>([]);
  const [defaultModel, setDefaultModel] = useState<string>('gpt-4o');

  // Auto-clear variant when current model doesn't support it
  useEffect(() => {
    const modelVariants = models.find(m => m.id === currentModel)?.variants;
    if (selectedVariant && modelVariants && !modelVariants[selectedVariant]) {
      setSelectedVariant(null);
    }
  }, [currentModel, selectedVariant, models]);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);

  // UI state managed by Zustand store (dialog-related only; header/panel state extracted to sub-components)
  const {
    showSettings,
    showMCPDialog,
    showAddServer,
    editServerData,
    setShowSettings,
    setShowMCPDialog,
    setShowAddServer,
    setEditServerData,
  } = useUIStore(useShallow((s) => ({
    showSettings: s.showSettings,
    showMCPDialog: s.showMCPDialog,
    showAddServer: s.showAddServer,
    editServerData: s.editServerData,
    setShowSettings: s.setShowSettings,
    setShowMCPDialog: s.setShowMCPDialog,
    setShowAddServer: s.setShowAddServer,
    setEditServerData: s.setEditServerData,
  })));

  // Notification sound settings
  const [chatFinishSoundEnabled, setChatFinishSoundEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('jean2_sound_chat_finish_enabled');
    return stored !== null ? stored === 'true' : true;
  });
  const [permissionSoundEnabled, setPermissionSoundEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('jean2_sound_permission_enabled');
    return stored !== null ? stored === 'true' : true;
  });

  const [permissions, setPermissions] = useState<ToolPermission[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);

  const {
    pendingPermissions,
    queuedMessages,
    clearPendingPermissions,
    clearQueuedMessages,
    mergePendingPermissions,
    addPendingPermission,
    removePendingPermissionByToolCallId,
    removePendingPermissionsBySessionId,
    setQueuedMessagesForSession,
    addQueuedMessage,
    removeQueuedMessageById,
  } = useSessionMetaStore(
    useShallow((s) => ({
      pendingPermissions: s.pendingPermissions,
      queuedMessages: s.queuedMessages,
      clearPendingPermissions: s.clearPendingPermissions,
      clearQueuedMessages: s.clearQueuedMessages,
      mergePendingPermissions: s.mergePendingPermissions,
      addPendingPermission: s.addPendingPermission,
      removePendingPermissionByToolCallId: s.removePendingPermissionByToolCallId,
      removePendingPermissionsBySessionId: s.removePendingPermissionsBySessionId,
      setQueuedMessagesForSession: s.setQueuedMessagesForSession,
      addQueuedMessage: s.addQueuedMessage,
      removeQueuedMessageById: s.removeQueuedMessageById,
    })),
  );

  const [authError, setAuthError] = useState<string | null>(null);

  // Connection offline handling
  const [connectionTimedOut, setConnectionTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [nextRetryIn, setNextRetryIn] = useState(0);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const isCompacting = currentSession?.compacting ?? false;
  const [compactionSuccess, setCompactionSuccess] = useState(false);

  // Track toolCallIds that have already triggered the permission sound notification
  const notifiedToolCallIdsRef = useRef<Set<string>>(new Set());

  // Epoch for stale-event protection: prevents old async events from mutating current state
  const serverEpochRef = useRef(0);

  // Index for O(1) part lookup: partId -> { sessionId, messageId, index }
  type PartIndexEntry = { sessionId: string; messageId: string; index: number };
  const partIdIndexRef = useRef<Map<string, PartIndexEntry>>(new Map());



  // Notification sound for chat completion - only on natural completion (non-null -> null transition)
  const { playChatFinishSound, playPermissionSound } = useNotificationSound();
  const hasInitializedRef = useRef(false);
  const prevStreamingSessionIdsRef = useRef<Set<string>>(new Set());
  const skipFinishSoundSessionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!hasInitializedRef.current) {
      prevStreamingSessionIdsRef.current = new Set(streamingSessionIds);
      hasInitializedRef.current = true;
      return;
    }

    const prev = prevStreamingSessionIdsRef.current;
    const completedSessionIds = [...prev].filter(id => !streamingSessionIds.has(id));

    for (const sessionId of completedSessionIds) {
      if (skipFinishSoundSessionIdsRef.current.has(sessionId)) {
        continue;
      }
      const session = sessions.find(s => s.id === sessionId);
      if (session?.parentId === null && chatFinishSoundEnabled) {
        playChatFinishSound();
        break;
      }
    }

    prevStreamingSessionIdsRef.current = new Set(streamingSessionIds);

    for (const sessionId of completedSessionIds) {
      skipFinishSoundSessionIdsRef.current.delete(sessionId);
    }
  }, [streamingSessionIds, playChatFinishSound, sessions, chatFinishSoundEnabled]);

  useEffect(() => {
    localStorage.setItem('jean2_sound_chat_finish_enabled', String(chatFinishSoundEnabled));
  }, [chatFinishSoundEnabled]);

  useEffect(() => {
    localStorage.setItem('jean2_sound_permission_enabled', String(permissionSoundEnabled));
  }, [permissionSoundEnabled]);

  // LRU eviction for session data - runs when session count increases beyond limit
  useLayoutEffect(() => {
    const currentCount = Object.keys(messagesBySession).length;
    if (currentCount <= prevSessionKeyCountRef.current) {
      prevSessionKeyCountRef.current = currentCount;
      return;
    }
    prevSessionKeyCountRef.current = currentCount;

    if (currentCount <= SESSION_CACHE_MAX) return;

    const keys = Object.keys(messagesBySession);
    while (keys.length > SESSION_CACHE_MAX) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const key of keys) {
        if (key === currentSession?.id) continue;
        const time = sessionAccessTimesRef.current.get(key);
        if (time !== undefined && time < oldestTime) {
          oldestTime = time;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      sessionAccessTimesRef.current.delete(oldestKey);
      keys.splice(keys.indexOf(oldestKey), 1);
      setMessagesBySession(prev => {
        if (!(oldestKey! in prev)) return prev;
        const next = { ...prev };
        delete next[oldestKey!];
        return next;
      });
      setPartsBySession(prev => {
        if (!(oldestKey! in prev)) return prev;
        const next = { ...prev };
        delete next[oldestKey!];
        return next;
      });
    }
  }, [messagesBySession, currentSession]);

  // Connection timeout constants
  const CONNECTION_TIMEOUT = 10000; // 10 seconds
  const MAX_RETRY_DELAY = 30000; // 30 seconds max backoff
  const INITIAL_RETRY_DELAY = 1000; // 1 second initial

  // Refs for abort controller and deferred workspace selection
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingWorkspaceIdRef = useRef<string | null>(null);

  // Track if activeServer change was triggered by addServer (for state clearing)
  // Now managed by ServerContext via isAddingServerRef
  const prevActiveServerIdRef = useRef<string | null>(null);

  // Loading state for server data fetching
  const [_isLoadingServerData, setIsLoadingServerData] = useState(false);

  // Derive connection info from activeServer
  const apiToken = activeServer?.token ?? null;
  const serverUrl = activeServer?.url ?? null;

  // Keep wsRef in sync with ws state
  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  // Keep currentSessionIdRef in sync with currentSession
  useEffect(() => {
    currentSessionIdRef.current = currentSession?.id ?? null;
  }, [currentSession]);

  // Keep sessionsRef in sync with session store
  useLayoutEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const handleServerMessageRef = useRef<((msg: ServerMessage) => void) | null>(null);
  const pendingSessionCreateRef = useRef(false);

  const handleFirstServerAdded = useCallback((server: SavedServer) => {
    // Setting flag before addServer so the effect can detect it
    prepareForServerAdd();
    addServer(server.name, server.url, server.token);
  }, [addServer, prepareForServerAdd]);

  const handleLogout = useCallback(() => {
    if (activeServer) {
      removeServer(activeServer.id);
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    setWs(null);
    setConnected(false);
    setConnectionTimedOut(false);
    setRetryCount(0);
    setNextRetryIn(0);
  }, [activeServer, removeServer]);

  const handleRetry = useCallback(() => {
    setRetryCount(c => c + 1);
    setConnectionTimedOut(false);
    setNextRetryIn(0);
  }, []);

  const handleServerSwitch = useCallback(() => {
    // Increment epoch FIRST before any state mutation or reconnect
    // This ensures any in-flight handlers from the old connection are ignored
    serverEpochRef.current += 1;

    // Close existing WebSocket connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Clear WebSocket state
    setWs(null);
    setConnected(false);
    setConnectionTimedOut(false);
    setRetryCount(0);
    setNextRetryIn(0);

    // Clear all session and message state
    clearSessionState();
    setPreconfigs([]);
    setMessagesBySession({});
    setPartsBySession({});
    sessionAccessTimesRef.current.clear();
    prevSessionKeyCountRef.current = 0;
    skipFinishSoundSessionIdsRef.current = new Set(useStreamStateStore.getState().streamingSessionIds);
    clearStreamingSessions();
    clearInterruptedSessions();
    setSessionUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    setCurrentModel('gpt-4o');
    setModels([]);
    setWorkspaces([]);
    setActiveWorkspace(null);
    setPermissions([]);
    clearPendingPermissions();
    clearQueuedMessages();

    // Clear any open popovers/sheets by forcing a re-render
    // (the callback will be called after state is cleared)

    // Clear part index on server switch
    partIdIndexRef.current.clear();

    // Force reconnection with the new server credentials
    // The reconnectTrigger will cause the useEffect to reconnect
    setReconnectTrigger(t => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect to handle state clearing when activeServer changes from addServer
  useEffect(() => {
    if (activeServer?.id !== prevActiveServerIdRef.current && isAddingServerRef.current) {
      isAddingServerRef.current = false;
      prevActiveServerIdRef.current = activeServer?.id ?? null;
      handleServerSwitch();
    }
  }, [activeServer, handleServerSwitch, isAddingServerRef]);

  const fetchWithAuth = useCallback(async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    if (!apiToken) {
      throw new Error('No API token available');
    }

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${apiToken}`);

    const response = await fetch(url, {
      ...options,
      signal: options.signal,
      headers,
    });

    // Handle authentication errors
    if (response.status === 401) {
      setAuthError('Authentication failed. Your token may have been regenerated.');
      handleLogout();
      throw new Error('Unauthorized');
    }

    return response;
  }, [apiToken, handleLogout]);

  const getMessagesWithParts = useCallback((sessionId: string): MessageWithParts[] => {
    const messages = messagesBySession[sessionId] || [];
    const partsMap = partsBySession[sessionId] || {};

    return messages.map(message => ({
      message,
      parts: (partsMap[message.id] || []).sort((a, b) => a.createdAt - b.createdAt),
    }));
  }, [messagesBySession, partsBySession]);

  useEffect(() => {
    // Don't connect if no token or server URL
    if (!apiToken || !serverUrl) {
      return;
    }

    const wsUrl = getWsUrl(apiToken, serverUrl);
    if (!wsUrl) return;

    const socket = new WebSocket(wsUrl);

    // Capture local epoch at effect start to detect stale events from previous connections
    const localEpoch = serverEpochRef.current;

    socket.onopen = () => {
      // Ignore stale events from previous connection epochs
      if (serverEpochRef.current !== localEpoch) return;
      setConnected(true);
      setAuthError(null);
      setRetryCount(0);
      setConnectionTimedOut(false);

      // Clear pending permissions — session.resume will re-send current session's,
      // and permissions.sync will fetch all other sessions' pending approvals
      clearPendingPermissions();

      // Auto-resume active session after reconnect to restore streaming
      if (currentSessionIdRef.current) {
        socket.send(JSON.stringify({
          type: 'session.resume',
          sessionId: currentSessionIdRef.current,
        }));
      }

      // Request all pending approvals across all sessions for sidebar indicators
      socket.send(JSON.stringify({ type: 'permissions.sync' }));
    };

    socket.onclose = (event) => {
      // Ignore stale events from previous connection epochs
      if (serverEpochRef.current !== localEpoch) return;
      setConnected(false);

      // Check if closed due to auth error
      if (event.code === 1008 || event.code === 401) {
        setAuthError('Authentication failed. Please check your token.');
        handleLogout();
      }
    };

    socket.onerror = (error) => {
      // Ignore stale events from previous connection epochs
      if (serverEpochRef.current !== localEpoch) return;
      console.error('WebSocket error:', error);
    };

    socket.onmessage = (event) => {
      // Ignore stale events from previous connection epochs
      if (serverEpochRef.current !== localEpoch) return;
      const msg: ServerMessage = JSON.parse(event.data);
      handleServerMessageRef.current?.(msg);
    };

    setWs(socket);

    return () => socket.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiToken, serverUrl, handleLogout, reconnectTrigger]);

  // Connection timeout detection
  useEffect(() => {
    if (apiToken && serverUrl && !connected && !connectionTimedOut) {
      const timeoutId = setTimeout(() => {
        if (!connected) {
          setConnectionTimedOut(true);
        }
      }, CONNECTION_TIMEOUT);
      
      return () => clearTimeout(timeoutId);
    }
  }, [apiToken, serverUrl, connected, connectionTimedOut]);

  // Auto-reconnect with exponential backoff
  useEffect(() => {
    // Capture local epoch to detect stale callbacks
    const localEpoch = serverEpochRef.current;

    if (connectionTimedOut && !connected && apiToken && serverUrl) {
      // Calculate delay with exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
      const delay = Math.min(
        INITIAL_RETRY_DELAY * Math.pow(2, retryCount),
        MAX_RETRY_DELAY
      );
      
      let countdown = Math.floor(delay / 1000);
      setNextRetryIn(countdown);
      
      // Countdown interval
      const countdownInterval = setInterval(() => {
        countdown -= 1;
        setNextRetryIn(Math.max(0, countdown));
      }, 1000);
      
      // Retry timeout
      const retryTimeout = setTimeout(() => {
        // Check epoch before mutating state - stale retries should be ignored
        if (serverEpochRef.current !== localEpoch) return;
        setRetryCount(c => c + 1);
        // Trigger reconnection by incrementing the trigger counter
        setReconnectTrigger(t => t + 1);
      }, delay);
      
      return () => {
        clearInterval(countdownInterval);
        clearTimeout(retryTimeout);
      };
    }
  }, [connectionTimedOut, connected, apiToken, serverUrl, retryCount, serverEpochRef]);

  // Reconnect when app returns to foreground (fixes iOS background disconnect)
  useEffect(() => {
    // Capture local epoch to detect stale callbacks
    const localEpoch = serverEpochRef.current;

    const handleVisibilityChange = () => {
      // Ignore stale callbacks from previous connection epochs
      if (serverEpochRef.current !== localEpoch) return;

      if (document.visibilityState !== 'visible') return;

      const socket = wsRef.current;
      if (!socket || !apiToken || !serverUrl) return;

      if (socket.readyState === WebSocket.OPEN) {
        // Socket claims OPEN but may be zombie (especially on iOS)
        // Force close and reconnect to be safe
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
  }, [apiToken, serverUrl, serverEpochRef]);

  // Reconnect when network comes back online
  useEffect(() => {
    // Capture local epoch to detect stale callbacks
    const localEpoch = serverEpochRef.current;

    const handleOnline = () => {
      // Ignore stale callbacks from previous connection epochs
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
  }, [apiToken, serverUrl, serverEpochRef]);

  // Consolidated effect for fetching sessions, preconfigs, models, and workspaces
  useEffect(() => {
    if (!apiToken || !serverUrl) return;

    // Abort previous requests
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const apiUrl = getApiUrl(serverUrl);
    if (!apiUrl) return;

    // Capture local epoch to detect stale fetch results
    const localEpoch = serverEpochRef.current;

    // Show loading state
    setIsLoadingServerData(true);

    Promise.all([
      fetchWithAuth(`${apiUrl}/sessions`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/preconfigs`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/prompts`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/models`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/workspaces`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/providers`, { signal }).then(r => r.json()),
    ])
      .then(([sessionsData, preconfigsData, promptsData, modelsData, workspacesData, providersData]) => {
        // Ignore stale results from previous connection epochs
        if (serverEpochRef.current !== localEpoch) return;

        setSessions(sessionsData.sessions || []);
        setPreconfigs(preconfigsData.preconfigs || []);
        setPrompts(promptsData.prompts || []);
        setModels(modelsData.models || []);
        setDefaultModel(modelsData.defaultModel || 'gpt-4o');
        setProviderStatuses(providersData.providers || []);

        // Handle workspace selection
        const workspaces = workspacesData.workspaces || [];
        setWorkspaces(workspaces);

        // Apply pending workspace selection if any
        if (pendingWorkspaceIdRef.current) {
          const saved = workspaces.find((w: Workspace) => w.id === pendingWorkspaceIdRef.current);
          if (saved) setActiveWorkspace(saved);
          pendingWorkspaceIdRef.current = null;
        } else {
          const savedId = localStorage.getItem('activeWorkspaceId');
          const saved = workspaces.find((w: Workspace) => w.id === savedId);
          setActiveWorkspace(saved || workspaces[0]);
        }

        // Clear switching state
        clearSwitchingState();
        setIsLoadingServerData(false);
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          console.log('Fetch aborted due to server switch');
          return;
        }
        console.error('Failed to load server data:', err);
        setIsLoadingServerData(false);
        if (!err.message?.includes('Unauthorized')) {
          setAuthError('Failed to connect to server');
        }
      });

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [apiToken, serverUrl, fetchWithAuth, clearSwitchingState, reconnectTrigger, setSessions]);

  useEffect(() => {
    if (activeWorkspace) {
      localStorage.setItem('activeWorkspaceId', activeWorkspace.id);
    }
  }, [activeWorkspace]);

  const createWorkspace = async (name: string, path: string, isVirtual: boolean) => {
    const apiUrl = getApiUrl(serverUrl);
    if (!apiUrl) return;

    const res = await fetchWithAuth(`${apiUrl}/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path, isVirtual }),
    });
    const data = await res.json();
    const workspace = data.workspace;
    setWorkspaces(prev => [...prev, workspace]);
    setActiveWorkspace(workspace);
    setCurrentSession(null);
    return workspace;
  };

  const selectWorkspace = (workspace: Workspace) => {
    setActiveWorkspace(workspace);
    setCurrentSession(null);
  };

  const handleQuickSwitchWorkspaceSelect = (workspaceId: string) => {
    // Store the pending selection - it will be applied when data loads
    pendingWorkspaceIdRef.current = workspaceId;
  };

  const deleteWorkspace = async (id: string) => {
    const apiUrl = getApiUrl(serverUrl);
    if (!apiUrl) return;

    const response = await fetchWithAuth(`${apiUrl}/workspaces/${id}`, { method: 'DELETE' });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete workspace' }));
      console.error('Failed to delete workspace:', error.message);
      return;
    }

    // Parse server response for the list of deleted session IDs
    const { deletedSessions }: { deletedSessions: string[] } = await response.json();

    // Remove quick connections referencing this workspace via context API
    // This updates both storage and reactive state
    removeFromQuickConnectionsByWorkspace(id);

    // Clear current session if it belonged to the deleted workspace
    if (currentSession && (currentSession.workspaceId === id || deletedSessions.includes(currentSession.id))) {
      setCurrentSession(null);
    }

    // Clean up sessions, messages, and parts for deleted sessions using server's response
    setSessions(prev => prev.filter(s => !deletedSessions.includes(s.id)));

    setMessagesBySession(prev => {
      const next = { ...prev };
      deletedSessions.forEach(sessionId => delete next[sessionId]);
      return next;
    });
    setPartsBySession(prev => {
      const next = { ...prev };
      deletedSessions.forEach(sessionId => delete next[sessionId]);
      return next;
    });
    deletedSessions.forEach(sessionId => sessionAccessTimesRef.current.delete(sessionId));

    // Clean up part index entries for deleted sessions
    for (const [partId, entry] of partIdIndexRef.current) {
      if (deletedSessions.includes(entry.sessionId)) {
        partIdIndexRef.current.delete(partId);
      }
    }

    setWorkspaces(prev => {
      const next = prev.filter(w => w.id !== id);
      if (activeWorkspace?.id === id) {
        setActiveWorkspace(next[0] || null);
      }
      return next;
    });
  };

  const handleCreateVirtualWorkspace = async () => {
    const name = `Workspace ${workspaces.length + 1}`;
    const path = `~/.jean2/workspaces/${crypto.randomUUID()}`;
    await createWorkspace(name, path, true);
  };

  const handleCreatePhysicalWorkspace = async (path: string) => {
    const name = path.split('/').pop() || path.split('\\').pop() || 'Workspace';
    await createWorkspace(name, path, false);
  };

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'session.created':
        setSessions(prev => [msg.session, ...prev]);

        if (pendingSessionCreateRef.current) {
          setCurrentSession(msg.session);
          setMessagesBySession(prev => ({
            ...prev,
            [msg.session.id]: []
          }));
          setPartsBySession(prev => ({
            ...prev,
            [msg.session.id]: {}
          }));
          setSessionUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
          setCurrentModel(msg.session.selectedModel || defaultModel);
          setSelectedVariant(msg.session.selectedVariant ?? null);
          pendingSessionCreateRef.current = false;
        }
        sessionAccessTimesRef.current.set(msg.session.id, Date.now());
        break;

      case 'session.resumed':
        setCurrentSession(msg.session);

        removeInterruptedSession(msg.session.id);

        if (msg.isRunning) {
          addStreamingSession(msg.session.id);
        } else {
          removeStreamingSession(msg.session.id);
          skipFinishSoundSessionIdsRef.current.add(msg.session.id);
        }

        if (msg.messages) {
          setMessagesBySession(prev => ({
            ...prev,
            [msg.session.id]: msg.messages.map(mwp => mwp.message)
          }));
          setPartsBySession(prev => {
            const newParts: Record<string, Record<string, Part[]>> = { ...prev };
            newParts[msg.session.id] = {};
            for (const mwp of msg.messages) {
              newParts[msg.session.id][mwp.message.id] = mwp.parts;
            }
            return newParts;
          });
          // Rebuild part index for resumed session only
          for (const [partId, entry] of partIdIndexRef.current) {
            if (entry.sessionId === msg.session.id) {
              partIdIndexRef.current.delete(partId);
            }
          }
          for (const mwp of msg.messages) {
            for (let i = 0; i < mwp.parts.length; i++) {
              partIdIndexRef.current.set(mwp.parts[i].id, {
                sessionId: msg.session.id,
                messageId: mwp.message.id,
                index: i,
              });
            }
          }
        }

        setSessionUsage(msg.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
        setCurrentModel(msg.session.selectedModel || defaultModel);
        setSelectedVariant(msg.session.selectedVariant || null);

        // Clear variant if restored model doesn't support it
        {
          const restoredModelId = msg.session.selectedModel || defaultModel;
          const restoredVariants = models.find(m => m.id === restoredModelId)?.variants;
          if (msg.session.selectedVariant && restoredVariants && !restoredVariants[msg.session.selectedVariant]) {
            setSelectedVariant(null);
          }
        }
        sessionAccessTimesRef.current.set(msg.session.id, Date.now());
        break;

      case 'message.created':
        // Only apply content updates for visible (current) session to prevent performance issues
        if (msg.message.sessionId === currentSessionIdRef.current) {
          setMessagesBySession(prev => ({
            ...prev,
            [msg.message.sessionId]: [...(prev[msg.message.sessionId] || []), msg.message]
          }));
          setPartsBySession(prev => ({
            ...prev,
            [msg.message.sessionId]: {
              ...prev[msg.message.sessionId],
              [msg.message.id]: []
            }
          }));
        }
        // Track streaming state and clear interrupted status for this session (always)
        if ('status' in msg.message && msg.message.status === 'streaming') {
          addStreamingSession(msg.message.sessionId);
          removeInterruptedSession(msg.message.sessionId);
        }
        break;

      case 'message.updated':
        // Only apply content updates for visible (current) session to prevent performance issues
        if (msg.message.sessionId === currentSessionIdRef.current) {
          setMessagesBySession(prev => ({
            ...prev,
            [msg.message.sessionId]: (prev[msg.message.sessionId] || []).map(m =>
              m.id === msg.message.id ? msg.message : m
            )
          }));
        }
        // Clear streaming state if message is no longer streaming (always)
        if ('status' in msg.message && msg.message.status !== 'streaming') {
          removeStreamingSession(msg.message.sessionId);
        }
        break;

      case 'part.created': {
        // Only apply content updates for visible (current) session to prevent performance issues
        if (msg.sessionId === currentSessionIdRef.current) {
          setPartsBySession(prev => {
            const sessionParts = prev[msg.sessionId] || {};
            const messageParts = sessionParts[msg.part.messageId] || [];
            return {
              ...prev,
              [msg.sessionId]: {
                ...sessionParts,
                [msg.part.messageId]: [...messageParts, msg.part]
              }
            };
          });
          let newIndex = 0;
          for (const entry of partIdIndexRef.current.values()) {
            if (entry.sessionId === msg.sessionId && entry.messageId === msg.part.messageId) {
              newIndex = Math.max(newIndex, entry.index + 1);
            }
          }
          partIdIndexRef.current.set(msg.part.id, {
            sessionId: msg.sessionId,
            messageId: msg.part.messageId,
            index: newIndex,
          });
        }
        break;
      }

      case 'part.updated': {
        // Only apply content updates for visible (current) session to prevent performance issues
        if (msg.sessionId === currentSessionIdRef.current) {
          const partLocation = partIdIndexRef.current.get(msg.part.id);
          if (partLocation) {
            setPartsBySession(prev => {
              const sessionParts = prev[partLocation.sessionId];
              if (!sessionParts) return prev;
              const messageParts = sessionParts[partLocation.messageId];
              if (!messageParts) return prev;
              const updatedMessageParts = [...messageParts];
              updatedMessageParts[partLocation.index] = msg.part;
              return {
                ...prev,
                [partLocation.sessionId]: {
                  ...sessionParts,
                  [partLocation.messageId]: updatedMessageParts
                }
              };
            });
          } else {
            // Fallback: search all parts (should rarely happen)
            setPartsBySession(prev => {
              const sessionParts = prev[msg.sessionId] || {};
              const messageParts = sessionParts[msg.part.messageId] || [];
              return {
                ...prev,
                [msg.sessionId]: {
                  ...sessionParts,
                  [msg.part.messageId]: messageParts.map(p => p.id === msg.part.id ? msg.part : p)
                }
              };
            });
          }
        }
        break;
      }

      case 'part.append': {
        // Track streaming state (always)
        if (!interruptedSessions.has(msg.sessionId)) {
          addStreamingSession(msg.sessionId);
        }
        // Only apply content updates for visible (current) session to prevent performance issues
        if (msg.sessionId === currentSessionIdRef.current) {
          setPartsBySession(prev => {
            const location = partIdIndexRef.current.get(msg.partId);
            if (!location) return prev;

            const sessionParts = prev[location.sessionId];
            if (!sessionParts) return prev;

            const messageParts = sessionParts[location.messageId];
            if (!messageParts) return prev;

            const part = messageParts[location.index];
            if (!part || (part.type !== 'text' && part.type !== 'reasoning')) return prev;

            const updatedMessageParts = [...messageParts];
            updatedMessageParts[location.index] = {
              ...part,
              text: part.text + msg.delta,
            };

            return {
              ...prev,
              [location.sessionId]: {
                ...sessionParts,
                [location.messageId]: updatedMessageParts,
              },
            };
          });
        }
        break;
      }

      case 'chat.usage':
        if (msg.sessionId !== currentSession?.id) return;
        setSessionUsage({
          promptTokens: msg.usage.promptTokens,
          completionTokens: msg.usage.completionTokens,
          totalTokens: msg.usage.totalTokens,
        });
        setCurrentModel(msg.model);
        break;

      case 'error':
        console.error('Server error:', msg.code, msg.message);
        break;

      case 'session.closed':
        setSessions(prev => prev.map(s =>
          s.id === msg.sessionId ? { ...s, status: 'closed' } : s
        ));
        setMessagesBySession(prev => {
          const newMap = { ...prev };
          delete newMap[msg.sessionId];
          return newMap;
        });
        setPartsBySession(prev => {
          const newMap = { ...prev };
          delete newMap[msg.sessionId];
          return newMap;
        });
        // Clean up part index for closed session
        for (const [partId, entry] of partIdIndexRef.current) {
          if (entry.sessionId === msg.sessionId) {
            partIdIndexRef.current.delete(partId);
          }
        }
        sessionAccessTimesRef.current.delete(msg.sessionId);
        if (currentSession?.id === msg.sessionId) {
          setCurrentSession(null);
        }
        break;

      case 'session.reopened':
        setSessions(prev => prev.map(s =>
          s.id === msg.session.id ? msg.session : s
        ));
        if (currentSession?.id === msg.session.id) {
          setCurrentSession(msg.session);
        }
        break;

      case 'session.deleted':
        setSessions(prev => prev.filter(s => s.id !== msg.sessionId));
        setMessagesBySession(prev => {
          const newMap = { ...prev };
          delete newMap[msg.sessionId];
          return newMap;
        });
        setPartsBySession(prev => {
          const newMap = { ...prev };
          delete newMap[msg.sessionId];
          return newMap;
        });
        removeInterruptedSession(msg.sessionId);
        // Clean up part index for deleted session
        for (const [partId, entry] of partIdIndexRef.current) {
          if (entry.sessionId === msg.sessionId) {
            partIdIndexRef.current.delete(partId);
          }
        }
        sessionAccessTimesRef.current.delete(msg.sessionId);
        if (currentSession?.id === msg.sessionId) {
          setCurrentSession(null);
        }
        break;

      case 'session.updated':
        setSessions(prev => prev.map(s =>
          s.id === msg.session.id ? msg.session : s
        ));
        if (currentSession?.id === msg.session.id) {
          setCurrentSession(msg.session);
          if (msg.session.selectedVariant !== undefined) {
            setSelectedVariant(msg.session.selectedVariant);
          }
        }
        break;

      case 'session.renamed':
        setSessions(prev => prev.map(s =>
          s.id === msg.session.id ? msg.session : s
        ));
        if (currentSession?.id === msg.session.id) {
          setCurrentSession(msg.session);
        }
        break;

      case 'permission.list':
        setPermissions(msg.permissions);
        break;

      case 'permissions.sync':
        mergePendingPermissions(
          msg.approvals.map((a) => ({
            toolCallId: a.toolCallId,
            sessionId: a.sessionId,
            toolName: a.toolName,
            args: a.args,
            permissionType: a.permissionType,
            permissionKey: a.permissionKey,
            message: a.message,
            details: a.details,
            dangerous: a.dangerous,
            childSessionId: a.childSessionId,
            subagentName: a.subagentName,
          }))
        );
        break;

      case 'permission.revoked':
        setPermissions(prev => prev.map(p =>
          p.id === msg.permissionId ? { ...p, revokedAt: new Date().toISOString() } : p
        ));
        break;

      case 'permission.all_revoked':
        setPermissions(prev => {
          const now = new Date().toISOString();
          return prev.map(p => ({ ...p, revokedAt: now }));
        });
        break;

      case 'permission.request': {
        const request: PendingPermissionRequest = {
          toolCallId: msg.toolCallId,
          sessionId: msg.sessionId,
          toolName: msg.toolName,
          args: msg.args,
          permissionType: msg.permissionType,
          permissionKey: msg.permissionKey,
          message: msg.message,
          details: msg.details,
          dangerous: msg.dangerous,
          childSessionId: msg.childSessionId,
          subagentName: msg.subagentName,
        };
        addPendingPermission(request);

        // Play permission sound only for main sessions (parentId === null)
        // Only play if this approval has not already triggered a sound (prevents replay on session resume)
        const session = sessionsRef.current.find(s => s.id === msg.sessionId);
        if (session?.parentId === null && permissionSoundEnabled && !notifiedToolCallIdsRef.current.has(msg.toolCallId)) {
          playPermissionSound();
          notifiedToolCallIdsRef.current.add(msg.toolCallId);
        }
        break;
      }

      case 'permission.granted':
        removePendingPermissionByToolCallId(msg.toolCallId);
        break;

      case 'session.interrupted':
        addInterruptedSession(msg.sessionId);
        skipFinishSoundSessionIdsRef.current.add(msg.sessionId);
        removeStreamingSession(msg.sessionId);
        if (msg.result.cascadedTo.length > 0) {
          console.log(`Session ${msg.sessionId} interrupted. Cascaded to:`, msg.result.cascadedTo);
        }
        break;

      case 'queue.list':
        setQueuedMessagesForSession(msg.sessionId, msg.messages);
        break;

      case 'queue.added':
        addQueuedMessage(msg.sessionId, msg.message);
        break;

      case 'queue.removed':
        removeQueuedMessageById(msg.sessionId, msg.queueId);
        break;

      case 'queue.sending':
        removeQueuedMessageById(msg.sessionId, msg.queueId);
        break;

      case 'session.reverted':
        console.log(`Session reverted to message ${msg.revertedTo.messageId}, removed ${msg.removed.messageIds.length} messages`);
        break;

      case 'compaction.complete':
        if (msg.sessionId === currentSession?.id) {
          setCompactionSuccess(true);
        }
        break;

      case 'session.forked': {
        const { forkedSession, messages: forkedMessages } = msg;
        setSessions(prev => [forkedSession, ...prev]);
        setMessagesBySession(prev => ({
          ...prev,
          [forkedSession.id]: forkedMessages.map(mwp => mwp.message),
        }));
        setPartsBySession(prev => {
          const newParts = { ...prev };
          newParts[forkedSession.id] = {};
          for (const mwp of forkedMessages) {
            newParts[forkedSession.id][mwp.message.id] = mwp.parts;
          }
          return newParts;
        });
        // Rebuild part index for forked session
        for (const mwp of forkedMessages) {
          for (let i = 0; i < mwp.parts.length; i++) {
            partIdIndexRef.current.set(mwp.parts[i].id, {
              sessionId: forkedSession.id,
              messageId: mwp.message.id,
              index: i,
            });
          }
        }
        setCurrentSession(forkedSession);
        setSessionUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
        sessionAccessTimesRef.current.set(forkedSession.id, Date.now());
        break;
      }

      case 'session.state':
        // Only apply content updates for visible (current) session to prevent performance issues
        if (msg.sessionId === currentSessionIdRef.current) {
          setMessagesBySession(prev => ({
            ...prev,
            [msg.sessionId]: msg.messages.map(mwp => mwp.message)
          }));
          setPartsBySession(prev => {
            const newParts = { ...prev };
            newParts[msg.sessionId] = {};
            for (const mwp of msg.messages) {
              newParts[msg.sessionId][mwp.message.id] = mwp.parts;
            }
            return newParts;
          });
          // Rebuild part index from session state
          for (const [partId, entry] of partIdIndexRef.current) {
            if (entry.sessionId === msg.sessionId) {
              partIdIndexRef.current.delete(partId);
            }
          }
          for (const mwp of msg.messages) {
            for (let i = 0; i < mwp.parts.length; i++) {
              partIdIndexRef.current.set(mwp.parts[i].id, {
                sessionId: msg.sessionId,
                messageId: mwp.message.id,
                index: i,
              });
            }
          }
        }
        skipFinishSoundSessionIdsRef.current.add(msg.sessionId);
        removeStreamingSession(msg.sessionId);
        sessionAccessTimesRef.current.set(msg.sessionId, Date.now());
        break;

      case 'provider.status': {
        setProviderStatuses(prev => {
          const existing = prev.find(s => s.provider === msg.provider);
          if (existing) {
            return prev.map(s => s.provider === msg.provider
              ? { ...s, connected: msg.connected, authorizationUrl: msg.authorizationUrl, error: msg.error }
              : s
            );
          }
          return [...prev, { provider: msg.provider, connected: msg.connected, authorizationUrl: msg.authorizationUrl, error: msg.error }];
        });
        break;
      }

      case 'provider.connected':
        setProviderStatuses(prev =>
          prev.map(s => s.provider === msg.provider
            ? { ...s, connected: msg.connected, connectedAt: msg.connectedAt, accountId: msg.accountId }
            : s
          )
        );
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession, defaultModel, models, interruptedSessions, playPermissionSound, permissionSoundEnabled]);

  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);



  const sendMessage = useCallback((type: ClientMessage['type'], payload: ClientMessagePayload) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  }, [ws]);

  const createSession = useCallback((preconfigId?: string, title?: string) => {
    pendingSessionCreateRef.current = true;
    sendMessage('session.create', { preconfigId, title, workspaceId: activeWorkspace?.id });
  }, [sendMessage, activeWorkspace]);

  const resumeSession = useCallback((sessionId: string) => {
    removePendingPermissionsBySessionId(sessionId);
    skipFinishSoundSessionIdsRef.current = new Set(useStreamStateStore.getState().streamingSessionIds);
    clearStreamingSessions();
    setCompactionSuccess(false);
    sessionAccessTimesRef.current.set(sessionId, Date.now());
    const session = sessions.find(s => s.id === sessionId);
    if (session?.workspaceId && session.workspaceId !== activeWorkspace?.id) {
      const targetWorkspace = workspaces.find(w => w.id === session.workspaceId);
      if (targetWorkspace) {
        setActiveWorkspace(targetWorkspace);
      }
    }
    // Optimistically set currentSession immediately to stop old streaming content churn
    if (session) {
      setCurrentSession(session);
      currentSessionIdRef.current = session.id;
    }
    sendMessage('session.resume', { sessionId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendMessage, sessions, workspaces, activeWorkspace]);

  const closeSession = useCallback((sessionId: string) => {
    sendMessage('session.close', { sessionId });
  }, [sendMessage]);

  const revertSession = useCallback((sessionId: string, messageId: string) => {
    sendMessage('session.revert', { sessionId, messageId });
  }, [sendMessage]);

  const forkSession = useCallback((sessionId: string, messageId: string) => {
    sendMessage('session.fork', { sessionId, messageId });
  }, [sendMessage]);

  const compactSession = useCallback((sessionId: string) => {
    sendMessage('session.compact', { sessionId });
  }, [sendMessage]);

  const reopenSession = useCallback((sessionId: string) => {
    sendMessage('session.reopen', { sessionId });
  }, [sendMessage]);

  const permanentlyDeleteSession = useCallback((sessionId: string) => {
    sendMessage('session.delete', { sessionId });
  }, [sendMessage]);

  const updateSessionPreconfig = useCallback((preconfigId: string) => {
    if (currentSession) {
      sendMessage('session.update', { sessionId: currentSession.id, preconfigId });
    }
  }, [currentSession, sendMessage]);

  const updateSessionModel = useCallback((modelId: string, providerId: string) => {
    setCurrentModel(modelId);
    setSelectedVariant(null);
    if (currentSession) {
      sendMessage('session.update_model', { sessionId: currentSession.id, modelId, providerId });
    }
  }, [currentSession, sendMessage]);

  const updateSessionVariant = useCallback((variant: string | null) => {
    if (currentSession) {
      sendMessage('session.update_model', {
        sessionId: currentSession.id,
        modelId: currentSession.selectedModel || currentModel,
        providerId: currentSession.selectedProvider || 'openai',
        variant,
      });
      setSelectedVariant(variant);
    }
  }, [currentSession, currentModel, sendMessage]);

  const handleRenameSession = useCallback((sessionId: string, title: string) => {
    sendMessage('session.rename', { sessionId, title });
  }, [sendMessage]);

  const handleNavigateBack = useCallback(() => {
    if (currentSession?.parentId) {
      resumeSession(currentSession.parentId);
    }
  }, [currentSession, resumeSession]);

  const addToQueue = useCallback((sessionId: string, content: string) => {
    sendMessage('queue.add', { sessionId, content });
  }, [sendMessage]);

  const removeFromQueue = useCallback((queueId: string) => {
    sendMessage('queue.remove', { queueId });
  }, [sendMessage]);

  const sendChatMessage = useCallback((content: string) => {
    if (!currentSession || isCompacting) return;
    if (currentSession.runningAt || streamingSessionIds.has(currentSession.id)) {
      addToQueue(currentSession.id, content);
    } else {
      sendMessage('chat.message', { sessionId: currentSession.id, content });
    }
  }, [currentSession, streamingSessionIds, isCompacting, sendMessage, addToQueue]);

  const handlePermissionResponse = useCallback((toolCallId: string, allowed: boolean, alwaysAllow: boolean) => {
    removePendingPermissionByToolCallId(toolCallId);

    sendMessage('permission.response', {
      toolCallId,
      allowed,
      alwaysAllow,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendMessage]);

  const handleInterruptSession = useCallback(() => {
    if (currentSession) {
      sendMessage('session.interrupt', { sessionId: currentSession.id });
    }
  }, [currentSession, sendMessage]);

  const refreshPermissions = useCallback(() => {
    if (activeWorkspace) {
      sendMessage('permission.list', { workspaceId: activeWorkspace.id });
    }
  }, [activeWorkspace, sendMessage]);

  const connectProvider = useCallback((provider: string) => {
    sendMessage('provider.connect', { provider });
  }, [sendMessage]);

  const disconnectProvider = useCallback((provider: string) => {
    sendMessage('provider.disconnect', { provider });
  }, [sendMessage]);

  const workspaceSessions = sessions.filter(s => s.workspaceId === activeWorkspace?.id);

  const favoritedWorkspaceIds = quickConnections
    .filter(conn => conn.serverId === activeServer?.id && conn.workspaceId)
    .map(conn => conn.workspaceId!);

  const messagesWithParts = currentSession ? getMessagesWithParts(currentSession.id) : [];

  const headerTitle = currentSession ? (activeWorkspace?.name ?? 'Jean2') : 'Jean2';

  // Filter out subagent-only preconfigs for primary sessions
  const primaryPreconfigs = preconfigs.filter(p => p.mode !== 'subagent');

  const createSessionInWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspace(workspaces.find(w => w.id === workspaceId) || null);
    pendingSessionCreateRef.current = true;
    const primary = primaryPreconfigs[0]?.id;
    sendMessage('session.create', { preconfigId: primary, workspaceId });
  }, [sendMessage, workspaces, primaryPreconfigs]);

  const setSidebarViewMode = useUIStore((s) => s.setSidebarViewMode);

  const handleSidebarViewModeChange = useCallback((
    mode: 'default' | 'overview' | ((prev: 'default' | 'overview') => 'default' | 'overview')
  ) => {
    const currentMode = useUIStore.getState().sidebarViewMode;
    const resolvedMode = typeof mode === 'function' ? mode(currentMode) : mode;
    setSidebarViewMode(resolvedMode);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sidebarRef.current?.focusSessionPanel();
      });
    });
  }, [sidebarRef, setSidebarViewMode]);

  const keyboardShortcutHandlers = useMemo(() => ({
    onCloseTerminal: () => useUIStore.getState().setShowTerminalPanel(false),
    focusChatInput: () => chatInputRef.current?.focus(),
    onNewSession: () => {
      if (activeWorkspace) {
        createSession(primaryPreconfigs[0]?.id);
      }
    },
    onNewWindow: () => {
      invoke('create_new_window').catch(() => {});
    },
    onToggleViewMode: () => handleSidebarViewModeChange(prev => prev === 'overview' ? 'default' : 'overview'),
    setTerminalOpen: useUIStore.getState().setShowTerminalPanel,
    sidebarRef,
    terminalPanelRef,
    onStopStreaming: handleInterruptSession,
  }), [activeWorkspace, createSession, primaryPreconfigs, handleSidebarViewModeChange, sidebarRef, terminalPanelRef, handleInterruptSession]);

  const isPrimarySession = !currentSession?.parentId;

  const isLoggedIn = !!(activeServer);

  // Determine main content based on auth and connection state
  const renderMainContent = () => {
    // No servers exist - show FirstServerScreen
    if (servers.length === 0) {
      return (
        <FirstServerScreen
          onServerAdded={handleFirstServerAdded}
          error={authError || undefined}
        />
      );
    }

    // Not logged in (no active server) - show FirstServerScreen
    if (!isLoggedIn) {
      return (
        <FirstServerScreen
          onServerAdded={handleFirstServerAdded}
          error={authError || undefined}
        />
      );
    }

    // Logged in but currently switching servers
    if (isSwitching) {
      return (
        <div className="flex flex-col w-full h-full items-center justify-center bg-background gap-4">
          <ConnectingState message={`Connecting to ${activeServer?.name || 'server'}...`} />
        </div>
      );
    }

    // Logged in but not connected yet
    if (!connected && sessions.length === 0) {
      if (connectionTimedOut) {
        return (
          <div className="flex w-full h-full items-center justify-center bg-background">
            <OfflineState
              serverUrl={serverUrl!}
              authError={authError}
              retryCount={retryCount}
              nextRetryIn={nextRetryIn}
              onRetry={handleRetry}
              onLogout={handleLogout}
            />
          </div>
        );
      }
      return (
        <div className="flex flex-col w-full h-full items-center justify-center bg-background gap-4">
          <ConnectingState />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-muted-foreground"
          >
            Change Server
          </Button>
        </div>
      );
    }

    // Logged in and connected - show main content
    return (
      <>
        {currentSession ? (
          <ChatView
            inputRef={chatInputRef}
            session={currentSession}
            messagesWithParts={messagesWithParts}
            queuedMessages={queuedMessages[currentSession.id] || []}
            preconfigs={isPrimarySession ? primaryPreconfigs : preconfigs}
            prompts={prompts}
            models={models}
            connectedProviderIds={new Set(providerStatuses.filter(s => s.connected).map(s => s.provider))}
            connectableProviderIds={new Set(providerStatuses.filter(s => s.connectable).map(s => s.provider))}
            defaultModel={defaultModel}
            onSendMessage={sendChatMessage}
            onRemoveFromQueue={removeFromQueue}
            onChangePreconfig={updateSessionPreconfig}
            onChangeModel={updateSessionModel}
            onChangeVariant={updateSessionVariant}
            selectedVariant={selectedVariant}
            variants={models.find(m => m.id === currentModel)?.variants}
            pendingPermissions={pendingPermissions}
            onPermissionResponse={handlePermissionResponse}
            onRename={handleRenameSession}
            usage={sessionUsage}
            modelName={currentModel}
            onNavigateToSubagent={resumeSession}
            onNavigateBack={handleNavigateBack}
            isStreaming={streamingSessionIds.has(currentSession.id) || !!currentSession.runningAt}
            onInterrupt={handleInterruptSession}
            onRevert={revertSession}
            onFork={forkSession}
            onCompact={
              (() => {
                const compactable = messagesWithParts.filter(
                  m => m.message.role !== 'system'
                );
                return compactable.length >= 4
                  ? () => compactSession(currentSession.id)
                  : undefined;
              })()
            }
            isCompacting={isCompacting}
            compactionSuccess={compactionSuccess}
            onClearCompactionSuccess={() => setCompactionSuccess(false)}
            serverUrl={serverUrl ?? undefined}
            apiToken={apiToken ?? undefined}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground px-6">
            <h2 className="mb-2">Select or create a session</h2>
            <p>Choose a session from the sidebar or create a new one to start chatting.</p>
          </div>
        )}
      </>
    );
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <KeyboardShortcutHandler {...keyboardShortcutHandlers} />
      {isLoggedIn && (
        <AppSidebar
          ref={sidebarRef}
          allSessions={sessions}
          favoritedWorkspaceIds={favoritedWorkspaceIds}
          sessions={workspaceSessions}
          currentSession={currentSession}
          currentSessionId={currentSession?.id ?? null}
          streamingSessionIds={streamingSessionIds}
          connected={connected}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onCreateSession={() => createSession(primaryPreconfigs[0]?.id)}
          onResumeSession={resumeSession}
          onCloseSession={closeSession}
          onReopenSession={reopenSession}
          onDeleteSession={permanentlyDeleteSession}
          onRenameSession={handleRenameSession}
          onSelectWorkspace={selectWorkspace}
          onCreateVirtualWorkspace={handleCreateVirtualWorkspace}
          onCreatePhysicalWorkspace={handleCreatePhysicalWorkspace}
          onDeleteWorkspace={deleteWorkspace}
          onOpenSettings={() => setShowSettings(true)}
          onOpenMCP={() => setShowMCPDialog(true)}
          onOpenAddServer={() => setShowAddServer(true)}
          onServerSwitch={handleServerSwitch}
          onEscape={() => {
            if (currentSession) {
              chatInputRef.current?.focus();
            }
          }}
          onCreateSessionInWorkspace={createSessionInWorkspace}
          pendingPermissions={pendingPermissions}
        />
      )}

      <main className="flex-1 flex flex-col overflow-hidden" style={{
        paddingTop: 'env(safe-area-inset-top, 0)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}>
        <AppHeader
          headerTitle={headerTitle}
          isLoggedIn={isLoggedIn}
          activeWorkspace={activeWorkspace}
          onServerSwitch={handleServerSwitch}
          onSelectWorkspace={handleQuickSwitchWorkspaceSelect}
          onSidebarViewModeChange={handleSidebarViewModeChange}
        />

        {renderMainContent()}

        <AppPanels
          workspaceId={activeWorkspace?.id}
          workspacePath={activeWorkspace?.path}
          workspaceName={activeWorkspace?.name}
          serverUrl={serverUrl ?? undefined}
          apiToken={apiToken ?? undefined}
          isLoggedIn={isLoggedIn}
          terminalPanelRef={terminalPanelRef}
        />
      </main>

      {isLoggedIn && (
        <>
          <SettingsDialog
            open={showSettings}
            onOpenChange={setShowSettings}
            permissions={permissions}
            onRefreshPermissions={refreshPermissions}
            onRevokePermission={(permissionId) => {
              sendMessage('permission.revoke', { permissionId });
            }}
            onRevokeAllPermissions={() => {
              sendMessage('permission.revoke_all', { workspaceId: activeWorkspace?.id });
            }}
            apiToken={apiToken}
            onLogout={handleLogout}
            providerStatuses={providerStatuses}
            onConnectProvider={connectProvider}
            onDisconnectProvider={disconnectProvider}
            chatFinishSoundEnabled={chatFinishSoundEnabled}
            onChatFinishSoundEnabledChange={setChatFinishSoundEnabled}
            permissionSoundEnabled={permissionSoundEnabled}
            onPermissionSoundEnabledChange={setPermissionSoundEnabled}
            serverUrl={serverUrl}
          />

          <MCPManagementDialog
            open={showMCPDialog}
            onOpenChange={setShowMCPDialog}
            workspaceId={activeWorkspace?.id}
            workspacePath={activeWorkspace?.path}
            serverUrl={serverUrl ?? undefined}
            apiToken={apiToken ?? undefined}
          />
        </>
      )}

      <AddServerDialog
        open={showAddServer}
        onOpenChange={(open) => {
          setShowAddServer(open);
          if (!open) setEditServerData(null);
        }}
        editServer={editServerData}
      />
    </SidebarProvider>
  );
}

function App() {
  return (
    <ServerProvider>
      <AppContent />
    </ServerProvider>
  );
}

export default App;
