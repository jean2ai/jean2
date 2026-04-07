import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '@/stores/uiStore';
import { useSessionMetaStore } from '@/stores/sessionMetaStore';
import { useStreamStateStore } from '@/stores/streamStateStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useSessionContentStore } from '@/stores/sessionContentStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type {
  Session,
  Message,
  MessageWithParts,
  Preconfig,
  PromptInfo,
  Workspace,
  ToolPermission,
  SavedServer,
  ProviderStatus,
} from '@jean2/shared';
import type { Jean2Client } from '@jean2/sdk';

import { ServerProvider, useServerContext } from '@/contexts/ServerContext';
import { AppSidebar, type AppSidebarHandle } from '@/components/layout/AppSidebar';
import { SettingsDialog } from '@/components/modals/SettingsDialog';
import { MCPManagementDialog } from '@/components/modals/MCPManagementDialog';
import { ConfigurationDialog } from '@/components/modals/ConfigurationDialog';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AddServerDialog } from '@/components/modals/AddServerDialog';
import FilePreviewOverlay from '@/components/files/FilePreviewOverlay';
import { useNotificationSound } from '@/hooks/useNotificationSound';

import { useConnectionLifecycle } from '@/hooks/useConnectionLifecycle';
import { useServerDataLoader, type ModelInfo } from '@/hooks/useServerDataLoader';
import { useSessionCommands } from '@/hooks/useSessionCommands';
import { AppKeyboardHandlersMount } from '@/hooks/useAppKeyboardHandlers';
import { AppHeader, AppPanels, AppMainContent } from '@/components/app';
import { FilesPanel, type FilesPanelHandle } from '@/components/layout/FilesPanel';
import type { MessageInputHandle } from '@/components/chat/MessageInput';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';
import type { SessionHandlersContext } from '@/handlers/serverMessage/types';


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
  const { setMessagesBySession, setPartsBySession } =
    useSessionContentStore(
      useShallow((state) => ({
        setMessagesBySession: state.setMessagesBySession,
        setPartsBySession: state.setPartsBySession,
      })),
    );

  // Derived state for active session only (prevents full-map subscription in render path)
  const activeSessionId = currentSession?.id;
  const activeSessionMessages = useSessionContentStore(
    useShallow((state) => activeSessionId ? state.messagesBySession[activeSessionId] || [] : [])
  );
  const activeSessionPartsMap = useSessionContentStore(
    useShallow((state) => activeSessionId ? state.partsBySession[activeSessionId] || {} : {})
  );

  // Ref for LRU eviction to access full store without render-path subscription
  const messagesBySessionRef = useRef<Record<string, Message[]>>({});
  useLayoutEffect(() => {
    messagesBySessionRef.current = useSessionContentStore.getState().messagesBySession;
  });

  // LRU cache eviction for session data
  // Only keep current session data in memory; no multi-session caching
  const SESSION_CACHE_MAX = 1;
  const sessionAccessTimesRef = useRef<Map<string, number>>(new Map());
  const prevSessionKeyCountRef = useRef(0);

  // Stable ref for SDK client - created early so it's available in callbacks
  const sdkClientRef = useRef<Jean2Client | null>(null);

  const currentSessionIdRef = useRef<string | null>(null);
  const chatInputRef = useRef<MessageInputHandle>(null);
  const terminalPanelRef = useRef<TerminalPanelHandle>(null);
  const filesPanelRef = useRef<FilesPanelHandle>(null);
  const sidebarRef = useRef<AppSidebarHandle>(null);
  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const autoFollowToggleRef = useRef<{ toggle: () => void } | null>(null);
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
    capabilities?: {
      input?: {
        text?: boolean;
        image?: boolean;
        video?: boolean;
        file?: boolean;
      };
    };
    runtimeStatus: {
      providerSupported: boolean;
      providerConfigured: boolean;
      usable: boolean;
    };
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

  const setActiveWorkspaceStore = useWorkspaceStore((s) => s.setActiveWorkspace);

  useLayoutEffect(() => {
    setActiveWorkspaceStore(activeWorkspace);
  }, [activeWorkspace, setActiveWorkspaceStore]);

  // UI state managed by Zustand store (dialog-related only; header/panel state extracted to sub-components)
  const {
    showSettings,
    showMCPDialog,
    showAddServer,
    showConfiguration,
    editServerData,
    showFilesPanel,
    setShowFilesPanel,
    filesPanelWidth,
    setShowSettings,
    setShowMCPDialog,
    setShowAddServer,
    setShowConfiguration,
    setEditServerData,
    setCompletion,
    clearCompletion,
    clearAllCompletions,
    filePreviewTarget,
    closeFilePreview,
  } = useUIStore(useShallow((s) => ({
    showSettings: s.showSettings,
    showMCPDialog: s.showMCPDialog,
    showAddServer: s.showAddServer,
    showConfiguration: s.showConfiguration,
    editServerData: s.editServerData,
    showFilesPanel: s.showFilesPanel,
    setShowFilesPanel: s.setShowFilesPanel,
    filesPanelWidth: s.filesPanelWidth,
    setShowSettings: s.setShowSettings,
    setShowMCPDialog: s.setShowMCPDialog,
    setShowAddServer: s.setShowAddServer,
    setShowConfiguration: s.setShowConfiguration,
    setEditServerData: s.setEditServerData,
    setCompletion: s.setCompletion,
    clearCompletion: s.clearCompletion,
    clearAllCompletions: s.clearAllCompletions,
    filePreviewTarget: s.filePreviewTarget,
    closeFilePreview: s.closeFilePreview,
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

  // Ref for permission sound enablement to avoid stale closures in async handlers
  const permissionSoundEnabledRef = useRef(permissionSoundEnabled);
  useLayoutEffect(() => {
    permissionSoundEnabledRef.current = permissionSoundEnabled;
  }, [permissionSoundEnabled]);

  const [permissions, setPermissions] = useState<ToolPermission[]>([]);
  const [_providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);

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

  // Batching refs for part.append updates to reduce UI thrash
  const pendingPartAppendsRef = useRef<Map<string, string>>(new Map());
  const partAppendRafRef = useRef<number | null>(null);
  const lastPartAppendFlushAtRef = useRef<number>(0);
  const partAppendTimeoutRef = useRef<number | null>(null);

  // Flush all pending part appends in a single update
  const flushPendingPartAppends = useCallback(() => {
    // Clear refs first to prevent stale callbacks from interfering
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



  // Notification sound hook
  const { playChatFinishSound, playPermissionSound } = useNotificationSound();
  const skipFinishSoundSessionIdsRef = useRef<Set<string>>(new Set());
  const pendingWorkspaceIdRef = useRef<string | null>(null);

  // Ref for chat finish sound enablement - kept for server switch logic
  const chatFinishSoundEnabledRef = useRef(chatFinishSoundEnabled);
  useLayoutEffect(() => {
    chatFinishSoundEnabledRef.current = chatFinishSoundEnabled;
  }, [chatFinishSoundEnabled]);

  useEffect(() => {
    localStorage.setItem('jean2_sound_chat_finish_enabled', String(chatFinishSoundEnabled));
  }, [chatFinishSoundEnabled]);

  useEffect(() => {
    localStorage.setItem('jean2_sound_permission_enabled', String(permissionSoundEnabled));
  }, [permissionSoundEnabled]);

  // LRU eviction for session data - runs when session count increases beyond limit
  // Uses ref-based access to avoid full-content subscription in render path
  useLayoutEffect(() => {
    const currentCount = useSessionContentStore.getState().getMessagesBySessionKeysCount();
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

  // Connection timeout constants (moved to useConnectionLifecycle hook)

  // Refs for abort controller (now handled in useServerDataLoader hook) and deferred workspace selection

  // Track if activeServer change was triggered by addServer (for state clearing)
  // Now managed by ServerContext via isAddingServerRef
  const prevActiveServerIdRef = useRef<string | null>(null);

  // Loading state for server data fetching (unused locally, passed to hook)
  const [, setIsLoadingServerData] = useState(false);

  // Derive connection info from activeServer
  const apiToken = activeServer?.token ?? null;
  const serverUrl = activeServer?.url ?? null;

  // Keep currentSessionIdRef in sync with currentSession
  useEffect(() => {
    currentSessionIdRef.current = currentSession?.id ?? null;
  }, [currentSession]);

  useEffect(() => {
    notifiedToolCallIdsRef.current.clear();
  }, [currentSession?.id]);

  // Keep sessionsRef in sync with session store
  useLayoutEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const pendingSessionCreateRef = useRef(false);
  const handlerContextRef = useRef<SessionHandlersContext | null>(null);

  const handleFirstServerAdded = useCallback((server: SavedServer) => {
    // Setting flag before addServer so the effect can detect it
    prepareForServerAdd();
    addServer(server.name, server.url, server.token);
  }, [addServer, prepareForServerAdd]);

  const handleLogout = useCallback(() => {
    if (activeServer) {
      removeServer(activeServer.id);
    }
    sdkClientRef.current?.dispose();
    setConnected(false);
    setConnectionTimedOut(false);
    setRetryCount(0);
    setNextRetryIn(0);
  }, [activeServer, removeServer, sdkClientRef]);

  const handleRetry = useCallback(() => {
    setRetryCount(c => c + 1);
    setConnectionTimedOut(false);
    setNextRetryIn(0);
  }, []);

  const handleServerSwitch = useCallback(() => {
    // Increment epoch FIRST before any state mutation or reconnect
    // This ensures any in-flight handlers from the old connection are ignored
    serverEpochRef.current += 1;

    // Close existing client connection
    sdkClientRef.current?.dispose();
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
    notifiedToolCallIdsRef.current.clear();
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
    clearAllCompletions();

    // Clear any open popovers/sheets by forcing a re-render
    // (the callback will be called after state is cleared)

    // Clear part index on server switch
    partIdIndexRef.current.clear();

    // Cancel pending RAF, timeout, and clear pending appends on server switch
    if (partAppendRafRef.current !== null) {
      cancelAnimationFrame(partAppendRafRef.current);
      partAppendRafRef.current = null;
    }
    if (partAppendTimeoutRef.current !== null) {
      clearTimeout(partAppendTimeoutRef.current);
      partAppendTimeoutRef.current = null;
    }
    pendingPartAppendsRef.current.clear();
    lastPartAppendFlushAtRef.current = 0;

    // Force reconnection with the new server credentials
    // The reconnectTrigger will cause the useEffect to reconnect
    setReconnectTrigger(t => t + 1);
  }, []);

  // Effect to handle state clearing when activeServer changes from addServer
  useEffect(() => {
    if (activeServer?.id !== prevActiveServerIdRef.current && isAddingServerRef.current) {
      isAddingServerRef.current = false;
      prevActiveServerIdRef.current = activeServer?.id ?? null;
      handleServerSwitch();
    }
  }, [activeServer, handleServerSwitch, isAddingServerRef]);

  const getMessagesWithParts = useCallback((sessionId: string): MessageWithParts[] => {
    if (sessionId !== activeSessionId) {
      return [];
    }
    return activeSessionMessages.map(message => ({
      message,
      parts: (activeSessionPartsMap[message.id] || []).sort((a, b) => a.createdAt - b.createdAt),
    }));
  }, [activeSessionId, activeSessionMessages, activeSessionPartsMap]);

  // Pass our pre-created sdkClientRef so the hook uses it directly
  useConnectionLifecycle({
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
    clientRef: sdkClientRef,
  });



  // Server data loading hook (handles fetch, abort, epoch guard, workspace persistence)
  useServerDataLoader({
    apiToken,
    serverUrl,
    reconnectTrigger,
    serverEpochRef,
    clientRef: sdkClientRef,
    clearSwitchingState,
    setSessions,
    setPreconfigs,
    setPrompts,
    setModels,
    setDefaultModel,
    setProviderStatuses,
    setWorkspaces,
    setActiveWorkspace,
    activeWorkspace,
    setIsLoadingServerData,
    setAuthError,
    pendingWorkspaceIdRef,
  });

  // Refresh models, prompts, and preconfigs when Configuration dialog closes
  useEffect(() => {
    if (!showConfiguration && apiToken && serverUrl) {
      const http = sdkClientRef.current?.httpClient;
      if (!http) return;
      Promise.all([
        http.get<{ preconfigs: Preconfig[] }>('/preconfigs'),
        http.get<{ prompts: PromptInfo[] }>('/prompts'),
        http.get<{ models: ModelInfo[]; defaultModel: string }>('/models'),
      ]).then(([preconfigsData, promptsData, modelsData]) => {
        setPreconfigs(preconfigsData.preconfigs || []);
        setPrompts(promptsData.prompts || []);
        setModels((modelsData.models || []).filter((m) => m.runtimeStatus?.usable));
        setDefaultModel(modelsData.defaultModel || 'gpt-4o');
      }).catch(() => {});
    }
  }, [showConfiguration]);

  const createWorkspace = async (name: string, path: string, isVirtual: boolean) => {
    const http = sdkClientRef.current?.httpClient;
    if (!http) return;

    const data = await http.post<{ workspace: Workspace }>('/workspaces', { name, path, isVirtual });
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
    const http = sdkClientRef.current?.httpClient;
    if (!http) return;

    let deletedSessions: string[] = [];
    try {
      const data = await http.delete<{ deletedSessions: string[] }>(`/workspaces/${id}`);
      deletedSessions = data.deletedSessions;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to delete workspace:', message);
      return;
    }

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
      clearPendingPermissions,
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
      models,
      defaultModel,
      interruptedSessions,
      sessionsRef,
      flushPendingPartAppends,
      setProviderStatuses,
      setPermissions,
      mergePendingPermissions,
      addPendingPermission,
      removePendingPermissionByToolCallId,
      notifiedToolCallIdsRef,
      permissionSoundEnabledRef,
      playPermissionSound,
      chatFinishSoundEnabledRef,
      playChatFinishSound,
    };
  });

  // Filter out subagent-only preconfigs for primary sessions
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
    handlePermissionResponse,
    handleInterruptSession,
    updateSessionPreconfig,
    updateSessionModel,
    updateSessionVariant,
    handleNavigateBack,
    refreshPermissions,
    createSessionInWorkspace,
    revokePermission,
    revokeAllPermissions,
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
    setCurrentSession,
    setActiveWorkspace,
    setCompactionSuccess,
    setCurrentModel,
    setSelectedVariant,
    removePendingPermissionByToolCallId,
    removePendingPermissionsBySessionId,
    clearStreamingSessions,
    pendingSessionCreateRef,
    partAppendRafRef,
    pendingPartAppendsRef,
    skipFinishSoundSessionIdsRef,
  });

  const workspaceSessions = sessions.filter(s => s.workspaceId === activeWorkspace?.id);

  const favoritedWorkspaceIds = quickConnections
    .filter(conn => conn.serverId === activeServer?.id && conn.workspaceId)
    .map(conn => conn.workspaceId!);

  const messagesWithParts = currentSession ? getMessagesWithParts(currentSession.id) : [];

  const headerTitle = currentSession ? (activeWorkspace?.name ?? 'Jean2') : 'Jean2';

  const setSidebarViewMode = useUIStore((s) => s.setSidebarViewMode);
  const sessionsPanelWidth = useUIStore((s) => s.sessionsPanelWidth);

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

  const isPrimarySession = !currentSession?.parentId;

  const isLoggedIn = !!(activeServer);

  return (
    <SidebarProvider panelId="sessions" defaultOpen={true} style={{ '--sidebar-width': `${sessionsPanelWidth}px` } as React.CSSProperties}>
      <AppKeyboardHandlersMount
        sidebarRef={sidebarRef}
        terminalPanelRef={terminalPanelRef}
        filesPanelRef={filesPanelRef}
        chatInputRef={chatInputRef}
        activeWorkspace={activeWorkspace}
        primaryPreconfigs={primaryPreconfigs}
        handleInterruptSession={handleInterruptSession}
        handleSidebarViewModeChange={handleSidebarViewModeChange}
        createSession={createSession}
        onToggleAutoFollow={() => autoFollowToggleRef.current?.toggle()}
      />
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
          onOpenConfiguration={() => setShowConfiguration(true)}
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

      {isLoggedIn && (
        <FilesPanel
          ref={filesPanelRef}
          workspaceId={activeWorkspace?.id}
          serverUrl={serverUrl ?? undefined}
          apiToken={apiToken ?? undefined}
          isOpen={showFilesPanel}
          onClose={() => setShowFilesPanel(false)}
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

        <AppMainContent
          servers={servers}
          activeServer={activeServer}
          isSwitching={isSwitching}
          connected={connected}
          authError={authError}
          connectionTimedOut={connectionTimedOut}
          retryCount={retryCount}
          nextRetryIn={nextRetryIn}
          serverUrl={serverUrl}
          currentSession={currentSession}
          messagesWithParts={messagesWithParts}
          queuedMessages={queuedMessages}
          preconfigs={preconfigs}
          primaryPreconfigs={primaryPreconfigs}
          prompts={prompts}
          models={models}
          defaultModel={defaultModel}
          selectedVariant={selectedVariant}
          pendingPermissions={pendingPermissions}
          sessionUsage={sessionUsage}
          currentModel={currentModel}
          streamingSessionIds={streamingSessionIds}
          isCompacting={isCompacting}
          compactionSuccess={compactionSuccess}
          isPrimarySession={isPrimarySession}
          inputRef={chatInputRef}
          apiToken={apiToken}
          onFirstServerAdded={handleFirstServerAdded}
          onRetry={handleRetry}
          onLogout={handleLogout}
          onSendMessage={sendChatMessage}
          onRemoveFromQueue={removeFromQueue}
          onChangePreconfig={updateSessionPreconfig}
          onChangeModel={updateSessionModel}
          onChangeVariant={updateSessionVariant}
          onPermissionResponse={handlePermissionResponse}
          onRename={handleRenameSession}
          onNavigateToSubagent={resumeSession}
          onNavigateBack={handleNavigateBack}
          onInterrupt={handleInterruptSession}
          onRevert={revertSession}
          onFork={forkSession}
          onCompact={compactSession}
          onClearCompactionSuccess={() => setCompactionSuccess(false)}
          scrollToBottomRef={scrollToBottomRef}
          autoFollowToggleRef={autoFollowToggleRef}
        />

        <AppPanels
          workspaceId={activeWorkspace?.id}
          workspacePath={activeWorkspace?.path}
          workspaceName={activeWorkspace?.name}
          serverUrl={serverUrl ?? undefined}
          apiToken={apiToken ?? undefined}
          terminalPanelRef={terminalPanelRef}
        />
      </main>

      {isLoggedIn && (
        <div
          data-panel-gap="files"
          className={`relative bg-transparent transition-[width] duration-200 ease-linear shrink-0 ${!showFilesPanel ? 'w-0' : ''}`}
          style={{ width: showFilesPanel ? filesPanelWidth : 0 }}
        />
      )}

      {isLoggedIn && (
        <>
          <SettingsDialog
            open={showSettings}
            onOpenChange={setShowSettings}
            permissions={permissions}
            onRefreshPermissions={refreshPermissions}
            onRevokePermission={revokePermission}
            onRevokeAllPermissions={() => {
              if (activeWorkspace?.id) {
                revokeAllPermissions(activeWorkspace?.id);
              }
            }}
            apiToken={apiToken}
            onLogout={handleLogout}
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

          <ConfigurationDialog
            open={showConfiguration}
            onOpenChange={setShowConfiguration}
            serverUrl={serverUrl}
            apiToken={apiToken}
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

      {isLoggedIn && (
        <FilePreviewOverlay
          workspaceId={activeWorkspace?.id}
          target={filePreviewTarget}
          serverUrl={serverUrl ?? undefined}
          apiToken={apiToken ?? undefined}
          open={filePreviewTarget !== null}
          onOpenChange={(open) => {
            if (!open) closeFilePreview();
          }}
        />
      )}
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
