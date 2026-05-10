import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useParams, useRouterState } from '@tanstack/react-router';
import type {
  Session,
  Message,
  MessageWithParts,
  Workspace,
  PermissionGrant,
  ProviderStatus,
  SavedServer,
  QuickConnection,
  QueuedMessage,
  Preconfig,
  PromptInfo,
  AttachmentKind,
  AskResponse,
} from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import type { SessionHandlersContext, ModelInfo } from '@/handlers/serverMessage/types';

import { useServerContext } from '@/contexts/ServerContext';
import { useSessionStore, type SessionUsage } from '@/stores/sessionStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { useAskStore, type PendingAskRequest } from '@/stores/askStore';
import { useCompletionStore } from '@/stores/completionStore';
import { useUIStore } from '@/stores/uiStore';
import { useConnectionStore } from '@/stores/connectionStore';

import { useConnectionLifecycle } from '@/hooks/useConnectionLifecycle';
import { useSessionCommands } from '@/hooks/useSessionCommands';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { usePermissionAutoApprove } from '@/hooks/usePermissionAutoApprove';

export interface UseServerSessionManagerParams {
  serverId: string;
  activeServer: SavedServer | null;
  navigate: (opts: { to: string; params?: Record<string, string> }) => void;
  removeFromQuickConnectionsByWorkspace: (workspaceId: string) => void;
  quickConnections: QuickConnection[];
}

export interface UseServerSessionManagerReturn {
  connected: boolean;
  authError: string | null;
  connectionTimedOut: boolean;
  retryCount: number;
  nextRetryIn: number;
  serverUrl: string | null;
  apiToken: string | null;

  sdkClient: Jean2Client | null;

  currentSession: Session | null;
  sessions: Session[];
  workspaceSessions: Session[];
  messagesWithParts: MessageWithParts[];
  pendingAskRequests: PendingAskRequest[];
  queuedMessages: Record<string, QueuedMessage[]>;
  permissions: PermissionGrant[];

  sessionUsage: SessionUsage;
  currentModel: string;
  selectedVariant: string | null;
  isCompacting: boolean;
  compactionSuccess: boolean;
  isPrimarySession: boolean;
  isSessionLoading: boolean;

  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  preconfigs: Preconfig[];
  primaryPreconfigs: Preconfig[];
  prompts: PromptInfo[];
  models: ModelInfo[];
  defaultModel: string;

  streamingSessionIds: Set<string>;

  createSession: (preconfigId?: string, title?: string) => void;
  resumeSession: (sessionId: string) => void;
  closeSession: (sessionId: string) => void;
  reopenSession: (sessionId: string) => void;
  permanentlyDeleteSession: (sessionId: string) => void;
  handleRenameSession: (sessionId: string, title: string) => void;
  revertSession: (sessionId: string, messageId: string) => void;
  forkSession: (sessionId: string, messageId: string) => void;
  compactSession: (sessionId: string) => void;
  removeFromQueue: (queueId: string) => void;
  sendChatMessage: (content: string, attachments?: Array<{ id: string; kind: AttachmentKind }>) => void;
  handleAskResponse: (toolCallId: string, response: AskResponse, requestId?: string) => void;
  handleInterruptSession: () => void;
  updateSessionPreconfig: (preconfigId: string) => void;
  updateSessionModel: (modelId: string, providerId: string) => void;
  updateSessionVariant: (variant: string | null) => void;
  handleNavigateBack: () => void;
  refreshPermissions: () => void;
  createSessionInWorkspace: (workspaceId: string) => void;
  revokePermission: (permissionId: string) => void;
  revokeAllPermissions: (workspaceId: string) => void;

  claimControl: (sessionId: string) => void;
  releaseControl: (sessionId: string) => void;
  requestTakeover: (sessionId: string) => void;
  respondTakeover: (sessionId: string, requesterClientId: string, decision: 'approve' | 'deny') => void;

  selectWorkspace: (workspace: Workspace) => void;
  renameWorkspace: (id: string, name: string) => void;
  handleCreateVirtualWorkspace: () => void;
  handleCreatePhysicalWorkspace: (path: string) => void;
  deleteWorkspace: (id: string) => void;

  handleLogout: () => void;
  handleRetry: () => void;

  favoritedWorkspaceIds: string[];

  setCompactionSuccess: (success: boolean) => void;
}

export function useServerSessionManager({
  serverId: _serverId,
  activeServer,
  navigate,
  removeFromQuickConnectionsByWorkspace,
  quickConnections,
}: UseServerSessionManagerParams): UseServerSessionManagerReturn {
  const sdkClientRef = useRef<Jean2Client | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<Session[]>([]);
  const messagesBySessionRef = useRef<Record<string, Message[]>>({});
  const sessionAccessTimesRef = useRef<Map<string, number>>(new Map());
  const prevSessionKeyCountRef = useRef(0);
  const notifiedToolCallIdsRef = useRef<Set<string>>(new Set());
  const partIdIndexRef = useRef<Map<string, { sessionId: string; messageId: string; index: number }>>(new Map());
  const pendingPartAppendsRef = useRef<Map<string, string>>(new Map());
  const partAppendRafRef = useRef<number | null>(null);
  const lastPartAppendFlushAtRef = useRef<number>(0);
  const partAppendTimeoutRef = useRef<number | null>(null);
  const skipFinishSoundSessionIdsRef = useRef<Set<string>>(new Set());
  const pendingSessionCreateRef = useRef(false);
  const handlerContextRef = useRef<SessionHandlersContext | null>(null);

  const { sessions, setSessions } = useSessionStore(
    useShallow((s) => ({
      sessions: s.sessions,
      setSessions: s.setSessions,
    })),
  );

  const { setCurrentSession } = useSessionStore(
    useShallow((s) => ({
      setCurrentSession: s.setCurrentSession,
    })),
  );

  const { setMessagesBySession, setPartsBySession } = useSessionStore(
    useShallow((state) => ({
      setMessagesBySession: state.setMessagesBySession,
      setPartsBySession: state.setPartsBySession,
    })),
  );

  // Derive currentSession from URL params
  const params = useParams({ from: '/server/$serverId', strict: false } as unknown as Parameters<typeof useParams>[0]);
  const sessionIdFromUrl = params?.sessionId as string | undefined;
  const currentPathname = useRouterState({ select: (s) => s.location.pathname });
  const viewPath = currentPathname.includes('/overview') ? '/overview' as const : '/workspace' as const;
  const currentSession = useMemo(
    () => sessionIdFromUrl ? sessions.find(s => s.id === sessionIdFromUrl) ?? null : null,
    [sessionIdFromUrl, sessions],
  );

  const isSessionLoading = sessionIdFromUrl != null && currentSession == null;

  // Sync URL-derived session to the store so AppMainContent (which reads from store) stays consistent
  useEffect(() => {
    const storeSession = useSessionStore.getState().currentSession;
    if (currentSession?.id !== storeSession?.id) {
      setCurrentSession(currentSession);
    }
  }, [currentSession, setCurrentSession]);

  const activeSessionId = currentSession?.id;
  const activeSessionMessages = useSessionStore(
    useShallow((state) => activeSessionId ? state.messagesBySession[activeSessionId] || [] : []),
  );
  const activeSessionPartsMap = useSessionStore(
    useShallow((state) => activeSessionId ? state.partsBySession[activeSessionId] || {} : {}),
  );

  useLayoutEffect(() => {
    messagesBySessionRef.current = useSessionStore.getState().messagesBySession;
  });

  const SESSION_CACHE_MAX = 1;

  const {
    streamingSessionIds,
    interruptedSessions,
    addStreamingSession,
    removeStreamingSession,
    addInterruptedSession,
    removeInterruptedSession,
  } = useConnectionStore(
    useShallow((s) => ({
      streamingSessionIds: s.streamingSessionIds,
      interruptedSessions: s.interruptedSessions,
      addStreamingSession: s.addStreamingSession,
      removeStreamingSession: s.removeStreamingSession,
      addInterruptedSession: s.addInterruptedSession,
      removeInterruptedSession: s.removeInterruptedSession,
    })),
  );

  const {
    sessionUsage,
    currentModel,
    selectedVariant,
    setSessionUsage,
    setCurrentModel,
    setSelectedVariant,
  } = useSessionStore(
    useShallow((s) => ({
      sessionUsage: s.sessionUsage,
      currentModel: s.currentModel,
      selectedVariant: s.selectedVariant,
      setSessionUsage: s.setSessionUsage,
      setCurrentModel: s.setCurrentModel,
      setSelectedVariant: s.setSelectedVariant,
    })),
  );

  const {
    workspaces,
    preconfigs,
    prompts,
    models: storeModels,
    defaultModel: storeDefaultModel,
  } = useServerDataStore(useShallow((s) => ({
    workspaces: s.workspaces,
    preconfigs: s.preconfigs,
    prompts: s.prompts,
    models: s.models,
    defaultModel: s.defaultModel,
  })));

  const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);
  const models = storeModels as ModelInfo[];
  const defaultModel = storeDefaultModel;

  useEffect(() => {
    const modelVariants = models.find(m => m.id === currentModel)?.variants;
    if (selectedVariant && modelVariants && !modelVariants[selectedVariant]) {
      setSelectedVariant(null);
    }
  }, [currentModel, selectedVariant, models, setSelectedVariant]);

  const { setCompletion, clearCompletion, clearAllCompletions } = useCompletionStore(
    useShallow((s) => ({
      setCompletion: s.setCompletion,
      clearCompletion: s.clearCompletion,
      clearAllCompletions: s.clearAllCompletions,
    })),
  );

  const { chatFinishSoundEnabled, permissionSoundEnabled } = useUIStore(
    useShallow((s) => ({
      chatFinishSoundEnabled: s.chatFinishSoundEnabled,
      permissionSoundEnabled: s.permissionSoundEnabled,
    })),
  );

  const permissionSoundEnabledRef = useRef(permissionSoundEnabled);
  useLayoutEffect(() => {
    permissionSoundEnabledRef.current = permissionSoundEnabled;
  }, [permissionSoundEnabled]);

  const chatFinishSoundEnabledRef = useRef(chatFinishSoundEnabled);
  useLayoutEffect(() => {
    chatFinishSoundEnabledRef.current = chatFinishSoundEnabled;
  }, [chatFinishSoundEnabled]);

  const [permissions, setPermissions] = useState<PermissionGrant[]>([]);
  const [_providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);

  const {
    pendingRequests: pendingAskRequests,
    addPendingRequest: addPendingAskRequest,
    removePendingRequest: removePendingAskRequest,
    removePendingPermissionRequest: removePendingPermissionAskRequest,
    replacePendingPermissionRequests: replacePendingPermissionAskRequests,
    clearPendingRequests: clearPendingAskRequests,
    clearPendingRequestsBySessionId: clearPendingAskRequestsBySessionId,
  } = useAskStore(
    useShallow((s) => ({
      pendingRequests: s.pendingRequests,
      addPendingRequest: s.addPendingRequest,
      removePendingRequest: s.removePendingRequest,
      removePendingPermissionRequest: s.removePendingPermissionRequest,
      replacePendingPermissionRequests: s.replacePendingPermissionRequests,
      clearPendingRequests: s.clearPendingRequests,
      clearPendingRequestsBySessionId: s.clearPendingRequestsBySessionId,
    })),
  );

  const {
    queuedMessages,
    clearQueuedMessages,
    setQueuedMessagesForSession,
    addQueuedMessage,
    removeQueuedMessageById,
  } = useSessionStore(
    useShallow((s) => ({
      queuedMessages: s.queuedMessages,
      clearQueuedMessages: s.clearQueuedMessages,
      setQueuedMessagesForSession: s.setQueuedMessagesForSession,
      addQueuedMessage: s.addQueuedMessage,
      removeQueuedMessageById: s.removeQueuedMessageById,
    })),
  );

  const authError = useConnectionStore(s => s.authError);
  const connectionTimedOut = useConnectionStore(s => s.connectionTimedOut);
  const retryCount = useConnectionStore(s => s.retryCount);
  const nextRetryIn = useConnectionStore(s => s.nextRetryIn);
  const connected = useConnectionStore(s => s.connected);
  const isCompacting = currentSession?.compacting ?? false;
  const { compactionSuccess, setCompactionSuccess } = useSessionStore(
    useShallow((s) => ({
      compactionSuccess: s.compactionSuccess,
      setCompactionSuccess: s.setCompactionSuccess,
    })),
  );

  const { playChatFinishSound, playPermissionSound } = useNotificationSound();

  // Register permission auto-approve handler
  usePermissionAutoApprove();

  const flushPendingPartAppends = useCallback(() => {
    if (partAppendRafRef.current !== null) {
      cancelAnimationFrame(partAppendRafRef.current);
      partAppendRafRef.current = null;
    }
    if (partAppendTimeoutRef.current !== null) {
      clearTimeout(partAppendTimeoutRef.current);
      partAppendTimeoutRef.current = null;
    }

    if (pendingPartAppendsRef.current.size === 0) return;

    const pending = new Map(pendingPartAppendsRef.current);
    pendingPartAppendsRef.current.clear();
    lastPartAppendFlushAtRef.current = Date.now();

    setPartsBySession(prev => {
      const newState = { ...prev };
      let hasChanges = false;

      for (const [partId, delta] of pending) {
        const location = partIdIndexRef.current.get(partId);
        if (!location) continue;

        const sessionParts = newState[location.sessionId];
        if (!sessionParts) continue;

        const messageParts = sessionParts[location.messageId];
        if (!messageParts) continue;

        const part = messageParts[location.index];
        if (!part || (part.type !== 'text' && part.type !== 'reasoning')) continue;

        hasChanges = true;
        const updatedMessageParts = [...messageParts];
        updatedMessageParts[location.index] = {
          ...part,
          text: part.text + delta,
        };

        newState[location.sessionId] = {
          ...sessionParts,
          [location.messageId]: updatedMessageParts,
        };
      }

      return hasChanges ? newState : prev;
    });
  }, [setPartsBySession]);

  useLayoutEffect(() => {
    const currentCount = useSessionStore.getState().getMessagesBySessionKeysCount();
    if (currentCount <= prevSessionKeyCountRef.current) {
      prevSessionKeyCountRef.current = currentCount;
      return;
    }
    prevSessionKeyCountRef.current = currentCount;

    if (currentCount <= SESSION_CACHE_MAX) return;

    const messagesBySession = messagesBySessionRef.current;
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
      for (const [partId, entry] of partIdIndexRef.current) {
        if (entry.sessionId === oldestKey) {
          partIdIndexRef.current.delete(partId);
        }
      }
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
  }, [currentSession, setMessagesBySession, setPartsBySession]);

  const apiToken = activeServer?.token ?? null;
  const serverUrl = activeServer?.url ?? null;

  const sdkClient = sdkClientRef.current;

  useLayoutEffect(() => {
    currentSessionIdRef.current = currentSession?.id ?? null;
  }, [currentSession]);

  // Auto-resume session when arriving via direct URL (e.g. page refresh)
  // On refresh, WebSocket connects before sessions are loaded, so the normal
  // "resume on connect" logic in useConnectionLifecycle misses the sessionId.
  // This effect fires once sessions load and we derive currentSession from the URL.
  const hasResumedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (
      sessionIdFromUrl &&
      currentSession &&
      connected &&
      sdkClientRef.current &&
      !hasResumedRef.current.has(sessionIdFromUrl)
    ) {
      const hasMessages = activeSessionId
        ? !!useSessionStore.getState().messagesBySession[activeSessionId]?.length
        : false;
      if (!hasMessages) {
        hasResumedRef.current.add(sessionIdFromUrl);
        sdkClientRef.current.sessions.resume(sessionIdFromUrl);
      }
    }
  }, [sessionIdFromUrl, currentSession, connected, activeSessionId]);

  useEffect(() => {
    notifiedToolCallIdsRef.current.clear();
  }, [currentSession?.id]);

  useLayoutEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const getMessagesWithParts = useCallback((sessionId: string): MessageWithParts[] => {
    if (sessionId !== activeSessionId) {
      return [];
    }
    return activeSessionMessages.map(message => ({
      message,
      parts: (activeSessionPartsMap[message.id] || []).sort((a, b) => a.createdAt - b.createdAt),
    }));
  }, [activeSessionId, activeSessionMessages, activeSessionPartsMap]);

  const { removeServer } = useServerContext();

  const handleLogout = useCallback(() => {
    if (activeServer) {
      removeServer(activeServer.id);
      navigate({ to: '/' });
    }
    sdkClientRef.current?.dispose();
    useConnectionStore.getState().resetConnection();
  }, [activeServer, removeServer, navigate, sdkClientRef]);

  const { retry } = useConnectionLifecycle({
    apiToken,
    serverUrl,
    currentSessionIdRef,
    handlerContextRef,
    handleLogout,
    clientRef: sdkClientRef,
  });

  const handleRetry = useCallback(() => {
    retry();
  }, [retry]);

  const createWorkspace = async (name: string, path: string, isVirtual: boolean) => {
    const http = sdkClientRef.current?.httpClient;
    if (!http) return;

    const data = await http.post<{ workspace: Workspace }>('/workspaces', { name, path, isVirtual });
    const workspace = data.workspace;
    useServerDataStore.getState().setWorkspaces([...useServerDataStore.getState().workspaces, workspace]);
    useServerDataStore.getState().setActiveWorkspace(workspace);
    localStorage.setItem('activeWorkspaceId', workspace.id);
    setCurrentSession(null);
    navigate({ to: '/server/$serverId/workspace', params: { serverId: _serverId } });
    return workspace;
  };

  const selectWorkspace = useCallback((workspace: Workspace) => {
    useServerDataStore.getState().setActiveWorkspace(workspace);
    localStorage.setItem('activeWorkspaceId', workspace.id);
    setCurrentSession(null);
    navigate({ to: '/server/$serverId/workspace', params: { serverId: _serverId } });
  }, [setCurrentSession, navigate, _serverId]);

  const deleteWorkspace = async (id: string) => {
    const http = sdkClientRef.current?.httpClient;
    if (!http) return;

    let deletedSessions: string[] = [];
    try {
      const data = await http.delete<{ deletedSessions: string[] }>(`/workspaces/${id}`);
      deletedSessions = data.deletedSessions;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to delete workspace:', message);
      return;
    }

    removeFromQuickConnectionsByWorkspace(id);

    if (currentSession && (currentSession.workspaceId === id || deletedSessions.includes(currentSession.id))) {
      setCurrentSession(null);
      navigate({ to: '/server/$serverId/workspace', params: { serverId: _serverId } });
    }

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

    for (const [partId, entry] of partIdIndexRef.current) {
      if (deletedSessions.includes(entry.sessionId)) {
        partIdIndexRef.current.delete(partId);
      }
    }

    const currentWorkspaces = useServerDataStore.getState().workspaces;
    useServerDataStore.getState().setWorkspaces(currentWorkspaces.filter(w => w.id !== id));
    const currentActive = useServerDataStore.getState().activeWorkspace;
    if (currentActive?.id === id) {
      const remaining = currentWorkspaces.filter(w => w.id !== id);
      const newActive = remaining[0] || null;
      useServerDataStore.getState().setActiveWorkspace(newActive);
      if (newActive) {
        localStorage.setItem('activeWorkspaceId', newActive.id);
      } else {
        localStorage.removeItem('activeWorkspaceId');
      }
    }
  };

  const renameWorkspace = async (id: string, name: string) => {
    const http = sdkClientRef.current?.httpClient;
    if (!http) return;

    try {
      const data = await http.patch<{ workspace: Workspace }>(`/workspaces/${id}`, { name });
      const updatedWorkspace = data.workspace;

      const currentWorkspaces = useServerDataStore.getState().workspaces;
      useServerDataStore.getState().setWorkspaces(
        currentWorkspaces.map(w => w.id === id ? updatedWorkspace : w),
      );

      if (useServerDataStore.getState().activeWorkspace?.id === id) {
        useServerDataStore.getState().setActiveWorkspace(updatedWorkspace);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to rename workspace:', message);
      return;
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

  useLayoutEffect(() => {
    handlerContextRef.current = {
      setSessions,
      setCurrentSession,
      setMessagesBySession,
      setPartsBySession,
      setSessionUsage,
      setCurrentModel,
      setSelectedVariant,
      addStreamingSession,
      removeStreamingSession,
      addInterruptedSession,
      removeInterruptedSession,
      setQueuedMessagesForSession,
      addQueuedMessage,
      removeQueuedMessageById,
      clearQueuedMessages,
      setCompactionSuccess,
      setCompletion,
      clearCompletion,
      clearAllCompletions,
      pendingSessionCreateRef,
      sessionAccessTimesRef,
      partIdIndexRef,
      partAppendRafRef,
      pendingPartAppendsRef,
      lastPartAppendFlushAtRef,
      partAppendTimeoutRef,
      skipFinishSoundSessionIdsRef,
      currentSessionIdRef,
      models: useServerDataStore.getState().models as ModelInfo[],
      defaultModel: useServerDataStore.getState().defaultModel,
      interruptedSessions,
      sessionsRef,
      flushPendingPartAppends,
      setProviderStatuses,
      setPermissions,
      notifiedToolCallIdsRef,
      permissionSoundEnabledRef,
      playPermissionSound,
      chatFinishSoundEnabledRef,
      playChatFinishSound,
      navigateToSession: (sessionId: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigate({ to: `/server/$serverId${viewPath}/session/$sessionId` as any, params: { serverId: _serverId, sessionId } });
      },
      navigateToParent: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigate({ to: `/server/$serverId${viewPath}` as any, params: { serverId: _serverId } });
      },
      serverId: _serverId,
      // Ask handlers
      addPendingAskRequest,
      removePendingAskRequest,
      removePendingPermissionRequest: removePendingPermissionAskRequest,
      replacePendingPermissionRequests: replacePendingPermissionAskRequests,
      clearPendingAskRequests,
      clearPendingAskRequestsBySessionId,
      runAskHandlers: (target, request) => {
        const handlers = useAskStore.getState().getHandlers(target);
        if (handlers.length === 0) return undefined;

        // Run handlers sequentially, first non-undefined result wins
        return (async () => {
          for (const handler of handlers) {
            try {
              const result = await handler(request);
              if (result !== undefined) return result;
            } catch {
              continue;
            }
          }
          return undefined;
        })();
      },
      sendAskResponse: (toolCallId, response, requestId) => {
        const client = sdkClientRef.current;
        // For permission asks, use requestId as canonical identity
        if (requestId) {
          removePendingPermissionAskRequest(requestId, toolCallId);
        } else {
          removePendingAskRequest(toolCallId);
        }
        if (client && client.connected) {
          client.send({
            type: 'ask.response',
            toolCallId,
            response,
            requestId,
          });
        }
      },
      resumeSessionAfterCreate: (sessionId: string) => {
        const client = sdkClientRef.current;
        if (client && client.connected) {
          client.sessions.resume(sessionId);
        }
      },
    };
  });

  const primaryPreconfigs = preconfigs.filter(p => p.mode !== 'subagent');

  const {
    createSession,
    resumeSession,
    closeSession,
    reopenSession,
    permanentlyDeleteSession,
    handleRenameSession,
    revertSession,
    forkSession,
    compactSession,
    removeFromQueue,
    sendChatMessage,
    handleAskResponse,
    handleInterruptSession,
    updateSessionPreconfig,
    updateSessionModel,
    updateSessionVariant,
    handleNavigateBack,
    refreshPermissions,
    createSessionInWorkspace,
    revokePermission,
    revokeAllPermissions,
    claimControl,
    releaseControl,
    requestTakeover,
    respondTakeover,
  } = useSessionCommands({
    clientRef: sdkClientRef,
    currentSession,
    sessions,
    workspaces,
    activeWorkspace,
    currentModel,
    streamingSessionIds,
    isCompacting,
    primaryPreconfigs,
    setActiveWorkspace: (ws: Workspace | null) => useServerDataStore.getState().setActiveWorkspace(ws),
    setCompactionSuccess,
    setCurrentModel,
    setSelectedVariant,
    removePendingAskRequest,
    removePendingPermissionRequest: removePendingPermissionAskRequest,
    clearPendingAskRequestsBySessionId,
    clearStreamingSessions: useConnectionStore.getState().clearStreamingSessions,
    pendingSessionCreateRef,
    partAppendRafRef,
    pendingPartAppendsRef,
    skipFinishSoundSessionIdsRef,
    navigate,
    serverId: _serverId,
    viewPath,
  });

  const workspaceSessions = sessions.filter(s => s.workspaceId === activeWorkspace?.id);

  const favoritedWorkspaceIds = quickConnections
    .filter(conn => conn.serverId === activeServer?.id && conn.workspaceId)
    .map(conn => conn.workspaceId!);

  const messagesWithParts = currentSession ? getMessagesWithParts(currentSession.id) : [];

  const isPrimarySession = !currentSession?.parentId;

  return {
    connected,
    authError,
    connectionTimedOut,
    retryCount,
    nextRetryIn,
    serverUrl,
    apiToken,

    sdkClient,

    currentSession,
    sessions,
    workspaceSessions,
    messagesWithParts,
    pendingAskRequests,
    queuedMessages,

    sessionUsage,
    currentModel,
    selectedVariant,
    isCompacting,
    compactionSuccess,
    isPrimarySession,
    isSessionLoading,

    workspaces,
    activeWorkspace,
    preconfigs,
    primaryPreconfigs,
    prompts,
    models,
    defaultModel,

    streamingSessionIds,

    createSession,
    resumeSession,
    closeSession,
    reopenSession,
    permanentlyDeleteSession,
    handleRenameSession,
    revertSession,
    forkSession,
    compactSession,
    removeFromQueue,
    sendChatMessage,
    handleAskResponse,
    handleInterruptSession,
    updateSessionPreconfig,
    updateSessionModel,
    updateSessionVariant,
    handleNavigateBack,
    refreshPermissions,
    createSessionInWorkspace,
    revokePermission,
    revokeAllPermissions,

    claimControl,
    releaseControl,
    requestTakeover,
    respondTakeover,

    selectWorkspace,
    renameWorkspace,
    handleCreateVirtualWorkspace,
    handleCreatePhysicalWorkspace,
    deleteWorkspace,

    handleLogout,
    handleRetry,

    favoritedWorkspaceIds,

    setCompactionSuccess,

    permissions,
  };
}
