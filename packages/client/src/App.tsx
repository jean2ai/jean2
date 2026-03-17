import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen } from 'lucide-react';
import type {
  Session,
  Message,
  Part,
  MessageWithParts,
  ServerMessage,
  ClientMessage,
  Preconfig,
  Workspace,
  ToolPermission,
  QueuedMessage,
  SavedServer,
} from '@jean2/shared';
import { ServerProvider, useServerContext } from '@/contexts/ServerContext';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { FilesPanel } from '@/components/layout/FilesPanel';
import { ChatView } from '@/components/chat/ChatView';
import { SettingsDialog } from '@/components/modals/SettingsDialog';
import { MCPManagementDialog } from '@/components/modals/MCPManagementDialog';
import { ConnectingState } from '@/components/shared/LoadingSkeleton';
import { OfflineState } from '@/components/shared/OfflineState';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import FirstServerScreen from '@/components/FirstServerScreen';
import { QuickSwitcher } from '@/components/layout/QuickSwitcher';
import { AddServerDialog } from '@/components/modals/AddServerDialog';

interface PendingPermissionRequest {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  permissionType: string;
  permissionKey?: string;
  message: string;
  details?: Record<string, unknown>;
  dangerous?: boolean;
  childSessionId?: string;
  subagentName?: string;
}

const getWsUrl = (token: string | null, url: string | null) =>
  (token && url) ? `ws://${url}/ws?token=${token}` : null;

const getApiUrl = (url: string | null) => url ? `http://${url}/api` : null;

type ClientMessagePayload =
  | { preconfigId?: string; title?: string; workspaceId?: string }
  | { sessionId: string }
  | { sessionId: string; content: string }
  | { toolCallId: string; approved: boolean }
  | { sessionId: string; preconfigId?: string }
  | { sessionId: string; modelId: string; providerId: string }
  | { toolCallId: string; allowed: boolean; alwaysAllow: boolean }
  | { workspaceId: string; includeRevoked?: boolean }
  | { permissionId: string }
  | { workspaceId: string }
  | { sessionId: string; reason?: string }
  | { queueId: string };

function AppContent() {
  const { servers, activeServer, addServer, removeServer, isSwitching, clearSwitchingState } = useServerContext();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [preconfigs, setPreconfigs] = useState<Preconfig[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, Message[]>>({});
  const [partsBySession, setPartsBySession] = useState<Record<string, Record<string, Part[]>>>({});
  const [ws, setWs] = useState<WebSocket | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [streamingSessionId, setStreamingSessionId] = useState<string | null>(null);
  const [sessionUsage, setSessionUsage] = useState<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number
  }>({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  const [currentModel, setCurrentModel] = useState<string>('gpt-4o');
  const [models, setModels] = useState<Array<{
    id: string;
    name: string;
    contextWindow: number;
    tier: 'budget' | 'standard' | 'premium';
    providerId: string;
    providerName: string;
  }>>([]);
  const [defaultModel, setDefaultModel] = useState<string>('gpt-4o');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [showMCPDialog, setShowMCPDialog] = useState(false);

  const [permissions, setPermissions] = useState<ToolPermission[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermissionRequest[]>([]);
  const [queuedMessages, setQueuedMessages] = useState<Record<string, QueuedMessage[]>>({});

  const [authError, setAuthError] = useState<string | null>(null);

  // Dialog states
  const [showAddServer, setShowAddServer] = useState(false);
  const [editServerData, setEditServerData] = useState<SavedServer | null>(null);

  // Connection offline handling
  const [connectionTimedOut, setConnectionTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [nextRetryIn, setNextRetryIn] = useState(0);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  // Connection timeout constants
  const CONNECTION_TIMEOUT = 10000; // 10 seconds
  const MAX_RETRY_DELAY = 30000; // 30 seconds max backoff
  const INITIAL_RETRY_DELAY = 1000; // 1 second initial

  // Refs for abort controller and deferred workspace selection
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingWorkspaceIdRef = useRef<string | null>(null);

  // Loading state for server data fetching
  const [_isLoadingServerData, setIsLoadingServerData] = useState(false);

  // Derive connection info from activeServer
  const apiToken = activeServer?.token ?? null;
  const serverUrl = activeServer?.url ?? null;

  // Keep wsRef in sync with ws state
  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  const handleServerMessageRef = useRef<((msg: ServerMessage) => void) | null>(null);
  const pendingSessionCreateRef = useRef(false);

  const handleFirstServerAdded = useCallback((server: SavedServer) => {
    // The addServer function from context handles setting active server
    addServer(server.name, server.url, server.token);
  }, [addServer]);

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
    setSessions([]);
    setPreconfigs([]);
    setCurrentSession(null);
    setMessagesBySession({});
    setPartsBySession({});
    setStreamingSessionId(null);
    setSessionUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    setCurrentModel('gpt-4o');
    setModels([]);
    setWorkspaces([]);
    setActiveWorkspace(null);
    setPermissions([]);
    setPendingPermissions([]);
    setQueuedMessages({});

    // Clear any open popovers/sheets by forcing a re-render
    // (the callback will be called after state is cleared)

    // Force reconnection with the new server credentials
    // The reconnectTrigger will cause the useEffect to reconnect
    setReconnectTrigger(t => t + 1);
  }, []);

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

    socket.onopen = () => {
      setConnected(true);
      setAuthError(null); // Clear auth errors on successful connection
      setRetryCount(0);
      setConnectionTimedOut(false);
    };

    socket.onclose = (event) => {
      setConnected(false);

      // Check if closed due to auth error
      if (event.code === 1008 || event.code === 401) {
        setAuthError('Authentication failed. Please check your token.');
        handleLogout();
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    socket.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      handleServerMessageRef.current?.(msg);
    };

    setWs(socket);

    return () => socket.close();
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
        setRetryCount(c => c + 1);
        // Trigger reconnection by incrementing the trigger counter
        setReconnectTrigger(t => t + 1);
      }, delay);
      
      return () => {
        clearInterval(countdownInterval);
        clearTimeout(retryTimeout);
      };
    }
  }, [connectionTimedOut, connected, apiToken, serverUrl, retryCount]);

  // Consolidated effect for fetching sessions, preconfigs, models, and workspaces
  useEffect(() => {
    if (!apiToken || !serverUrl) return;

    // Abort previous requests
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const apiUrl = getApiUrl(serverUrl);
    if (!apiUrl) return;

    // Show loading state
    setIsLoadingServerData(true);

    Promise.all([
      fetchWithAuth(`${apiUrl}/sessions`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/preconfigs`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/models`, { signal }).then(r => r.json()),
      fetchWithAuth(`${apiUrl}/workspaces`, { signal }).then(r => r.json()),
    ])
      .then(([sessionsData, preconfigsData, modelsData, workspacesData]) => {
        setSessions(sessionsData.sessions || []);
        setPreconfigs(preconfigsData.preconfigs || []);
        setModels(modelsData.models || []);
        setDefaultModel(modelsData.defaultModel || 'gpt-4o');

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
  }, [apiToken, serverUrl, fetchWithAuth, clearSwitchingState]);

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
    setWorkspaces(prev => [...prev, data.workspace]);
    return data.workspace;
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

    await fetchWithAuth(`${apiUrl}/workspaces/${id}`, { method: 'DELETE' });
    setWorkspaces(prev => prev.filter(w => w.id !== id));
    if (activeWorkspace?.id === id) {
      setActiveWorkspace(workspaces[0] || null);
    }
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
          setCurrentModel(defaultModel);
          pendingSessionCreateRef.current = false;
        }
        break;

      case 'session.resumed':
        setCurrentSession(msg.session);

        // Restore streaming state if session is running
        if (msg.isRunning) {
          setStreamingSessionId(msg.session.id);
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
        }

        setSessionUsage(msg.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
        setCurrentModel(msg.session.selectedModel || defaultModel);
        break;

      case 'message.created':
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
        // Track streaming state
        if ('status' in msg.message && msg.message.status === 'streaming') {
          setStreamingSessionId(msg.message.sessionId);
        }
        break;

      case 'message.updated':
        setMessagesBySession(prev => ({
          ...prev,
          [msg.message.sessionId]: (prev[msg.message.sessionId] || []).map(m =>
            m.id === msg.message.id ? msg.message : m
          )
        }));
        // Clear streaming state if message is no longer streaming
        if ('status' in msg.message && msg.message.status !== 'streaming') {
          setStreamingSessionId(prev => prev === msg.message.sessionId ? null : prev);
        }
        break;

      case 'part.created':
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
        break;

      case 'part.updated':
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
        break;

      case 'part.append':
        setStreamingSessionId(msg.sessionId);
        setPartsBySession(prev => {
          const sessionParts = prev[msg.sessionId] || {};

          for (const messageId of Object.keys(sessionParts)) {
            const parts = sessionParts[messageId];
            const partIndex = parts.findIndex(p => p.id === msg.partId);
            if (partIndex !== -1) {
              const existingPart = parts[partIndex];
              if (existingPart.type === 'text' || existingPart.type === 'reasoning') {
                const updatedParts = [...parts];
                updatedParts[partIndex] = {
                  ...existingPart,
                  text: existingPart.text + msg.delta
                };
                return {
                  ...prev,
                  [msg.sessionId]: {
                    ...sessionParts,
                    [messageId]: updatedParts
                  }
                };
              }
            }
          }
          return prev;
        });
        break;

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
        setPendingPermissions(prev => [...prev, request]);
        break;
      }

      case 'permission.granted':
        setPendingPermissions(prev => prev.filter(p => p.toolCallId !== msg.toolCallId));
        break;

      case 'session.interrupted':
        if (streamingSessionId === msg.sessionId) {
          setStreamingSessionId(null);
        }
        if (msg.result.cascadedTo.length > 0) {
          console.log(`Session ${msg.sessionId} interrupted. Cascaded to:`, msg.result.cascadedTo);
        }
        break;

      case 'queue.list':
        setQueuedMessages(prev => ({
          ...prev,
          [msg.sessionId]: msg.messages,
        }));
        break;

      case 'queue.added':
        setQueuedMessages(prev => ({
          ...prev,
          [msg.sessionId]: [...(prev[msg.sessionId] || []), msg.message],
        }));
        break;

      case 'queue.removed':
        setQueuedMessages(prev => ({
          ...prev,
          [msg.sessionId]: (prev[msg.sessionId] || []).filter(q => q.id !== msg.queueId),
        }));
        break;

      case 'queue.sending':
        setQueuedMessages(prev => ({
          ...prev,
          [msg.sessionId]: (prev[msg.sessionId] || []).filter(q => q.id !== msg.queueId),
        }));
        break;
    }
  }, [currentSession, defaultModel, streamingSessionId]);

  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);

  // Keyboard shortcut for new window (Cmd+N on macOS, Ctrl+N on Windows/Linux)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't trigger if focus is in an input field
      const target = e.target as HTMLElement;
      const isInputElement =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInputElement) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        try {
          await invoke('create_new_window');
        } catch (err) {
          console.error('Failed to create new window:', err);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    setPendingPermissions([]);
    setStreamingSessionId(null);
    sendMessage('session.resume', { sessionId });
  }, [sendMessage]);

  const closeSession = useCallback((sessionId: string) => {
    sendMessage('session.close', { sessionId });
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
    if (currentSession) {
      sendMessage('session.update_model', { sessionId: currentSession.id, modelId, providerId });
    }
  }, [currentSession, sendMessage]);

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
    if (currentSession) {
      if (streamingSessionId === currentSession.id) {
        addToQueue(currentSession.id, content);
      } else {
        sendMessage('chat.message', { sessionId: currentSession.id, content });
      }
    }
  }, [currentSession, streamingSessionId, sendMessage, addToQueue]);

  const handlePermissionResponse = useCallback((toolCallId: string, allowed: boolean, alwaysAllow: boolean) => {
    setPendingPermissions(prev => prev.filter(p => p.toolCallId !== toolCallId));

    sendMessage('permission.response', {
      toolCallId,
      allowed,
      alwaysAllow,
    });
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

  const workspaceSessions = sessions.filter(s => s.workspaceId === activeWorkspace?.id);

  const messagesWithParts = currentSession ? getMessagesWithParts(currentSession.id) : [];

  // Filter out subagent-only preconfigs for primary sessions
  const primaryPreconfigs = preconfigs.filter(p => p.mode !== 'subagent');
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
            session={currentSession}
            messagesWithParts={messagesWithParts}
            queuedMessages={queuedMessages[currentSession.id] || []}
            preconfigs={isPrimarySession ? primaryPreconfigs : preconfigs}
            models={models}
            defaultModel={defaultModel}
            onSendMessage={sendChatMessage}
            onRemoveFromQueue={removeFromQueue}
            onChangePreconfig={updateSessionPreconfig}
            onChangeModel={updateSessionModel}
            pendingPermissions={pendingPermissions}
            onPermissionResponse={handlePermissionResponse}
            onRename={handleRenameSession}
            usage={sessionUsage}
            modelName={currentModel}
            onNavigateToSubagent={resumeSession}
            onNavigateBack={handleNavigateBack}
            isStreaming={streamingSessionId === currentSession.id}
            onInterrupt={handleInterruptSession}
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
      {isLoggedIn && (
        <AppSidebar
          sessions={workspaceSessions}
          currentSession={currentSession}
          currentSessionId={currentSession?.id ?? null}
          streamingSessionId={streamingSessionId}
          connected={connected}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onCreateSession={() => createSession(primaryPreconfigs[0]?.id)}
          onResumeSession={resumeSession}
          onCloseSession={closeSession}
          onReopenSession={reopenSession}
          onDeleteSession={permanentlyDeleteSession}
          onSelectWorkspace={selectWorkspace}
          onCreateVirtualWorkspace={handleCreateVirtualWorkspace}
          onCreatePhysicalWorkspace={handleCreatePhysicalWorkspace}
          onDeleteWorkspace={deleteWorkspace}
          onOpenSettings={() => setShowSettings(true)}
          onOpenMCP={() => setShowMCPDialog(true)}
          onOpenAddServer={() => setShowAddServer(true)}
          onServerSwitch={handleServerSwitch}
        />
      )}

      <main className="flex-1 flex flex-col overflow-hidden" style={{
        paddingTop: 'env(safe-area-inset-top, 0)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}>
        {/* Mobile header with hamburger menu */}
        <header className="md:hidden flex items-center justify-between p-3 border-b border-border bg-background sticky top-0 z-10">
          <div className="flex items-center gap-2">
            {isLoggedIn && <SidebarTrigger />}
            <span className="font-semibold">Jean2</span>
          </div>
          <div className="flex items-center gap-1">
            <QuickSwitcher 
              onServerSwitch={handleServerSwitch}
              onSelectWorkspace={handleQuickSwitchWorkspaceSelect}
            />
            {isLoggedIn && activeWorkspace && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowFilesPanel(!showFilesPanel)}
                title={showFilesPanel ? 'Hide Files' : 'Show Files'}
              >
                <FolderOpen className="w-4 h-4" />
              </Button>
            )}
          </div>
        </header>

        {/* Desktop header with sidebar toggle */}
        <header className="hidden md:flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            {isLoggedIn && <SidebarTrigger />}
            <span className="font-semibold">Jean2</span>
          </div>
          <div className="flex items-center gap-2">
            {isLoggedIn && (
              <QuickSwitcher 
                onServerSwitch={handleServerSwitch}
                onSelectWorkspace={handleQuickSwitchWorkspaceSelect}
              />
            )}
            {isLoggedIn && activeWorkspace && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowFilesPanel(!showFilesPanel)}
                title={showFilesPanel ? 'Hide Files' : 'Show Files'}
              >
                <FolderOpen className="w-4 h-4" />
              </Button>
            )}
          </div>
        </header>

        {renderMainContent()}
      </main>

      {isLoggedIn && (
        <>
          <FilesPanel
            workspaceId={activeWorkspace?.id}
            serverUrl={serverUrl ?? undefined}
            apiToken={apiToken ?? undefined}
            isOpen={showFilesPanel}
            onClose={() => setShowFilesPanel(false)}
          />

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
