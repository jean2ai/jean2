import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useParams, useNavigate, useRouter } from '@tanstack/react-router';
import { useUIStore } from '@/stores/uiStore';
import { useSessionMetaStore } from '@/stores/sessionMetaStore';
import { useStreamStateStore } from '@/stores/streamStateStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useSessionContentStore } from '@/stores/sessionContentStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import type {
  Session,
  Message,
  MessageWithParts,
  Workspace,
  ToolPermission,
  ProviderStatus,
} from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';

import { useServerContext } from '@/contexts/ServerContext';
import { AppSidebar, type AppSidebarHandle } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/app';
import { SettingsDialog } from '@/components/modals/SettingsDialog';
import { MCPManagementDialog } from '@/components/modals/MCPManagementDialog';
import { ConfigurationDialog } from '@/components/modals/ConfigurationDialog';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AddServerDialog } from '@/components/modals/AddServerDialog';
import FilePreviewOverlay from '@/components/files/FilePreviewOverlay';
import { useNotificationSound } from '@/hooks/useNotificationSound';

import { useConnectionLifecycle } from '@/hooks/useConnectionLifecycle';
import { useSessionCommands } from '@/hooks/useSessionCommands';
import { AppKeyboardHandlersMount } from '@/hooks/useAppKeyboardHandlers';
import { FilesPanel, type FilesPanelHandle } from '@/components/layout/FilesPanel';
import type { MessageInputHandle } from '@/components/chat/MessageInput';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';
import type { SessionHandlersContext, ModelInfo } from '@/handlers/serverMessage/types';
import { ShellContent } from './ShellContent';

export default function ServerShell() {
  const router = useRouter();
  const navigate = useNavigate();
  const params = useParams({ from: '/server/$serverId', strict: false } as unknown as Parameters<typeof useParams>[0]);
  const serverId = params.serverId;

  const {
    servers,
    removeServer,
    quickConnections,
    removeFromQuickConnectionsByWorkspace,
  } = useServerContext();

  const activeServer = servers.find(s => s.id === serverId) ?? null;

  const { sessions, currentSession, setSessions, setCurrentSession } = useSessionStore(
    useShallow((s) => ({
      sessions: s.sessions,
      currentSession: s.currentSession,
      setSessions: s.setSessions,
      setCurrentSession: s.setCurrentSession,
    })),
  );

  const { setMessagesBySession, setPartsBySession } =
    useSessionContentStore(
      useShallow((state) => ({
        setMessagesBySession: state.setMessagesBySession,
        setPartsBySession: state.setPartsBySession,
      })),
    );

  const activeSessionId = currentSession?.id;
  const activeSessionMessages = useSessionContentStore(
    useShallow((state) => activeSessionId ? state.messagesBySession[activeSessionId] || [] : [])
  );
  const activeSessionPartsMap = useSessionContentStore(
    useShallow((state) => activeSessionId ? state.partsBySession[activeSessionId] || {} : {})
  );

  const messagesBySessionRef = useRef<Record<string, Message[]>>({});
  useLayoutEffect(() => {
    messagesBySessionRef.current = useSessionContentStore.getState().messagesBySession;
  });

  const SESSION_CACHE_MAX = 1;
  const sessionAccessTimesRef = useRef<Map<string, number>>(new Map());
  const prevSessionKeyCountRef = useRef(0);

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
    addStreamingSession,
    removeStreamingSession,
    addInterruptedSession,
    removeInterruptedSession,
  } = useStreamStateStore(
    useShallow((s) => ({
      streamingSessionIds: s.streamingSessionIds,
      interruptedSessions: s.interruptedSessions,
      clearStreamingSessions: s.clearStreamingSessions,
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

  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const models = storeModels as ModelInfo[];
  const defaultModel = storeDefaultModel;

  useEffect(() => {
    const modelVariants = models.find(m => m.id === currentModel)?.variants;
    if (selectedVariant && modelVariants && !modelVariants[selectedVariant]) {
      setSelectedVariant(null);
    }
  }, [currentModel, selectedVariant, models]);

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

  const [chatFinishSoundEnabled, setChatFinishSoundEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('jean2_sound_chat_finish_enabled');
    return stored !== null ? stored === 'true' : true;
  });
  const [permissionSoundEnabled, setPermissionSoundEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('jean2_sound_permission_enabled');
    return stored !== null ? stored === 'true' : true;
  });

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

  const [connectionTimedOut, setConnectionTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [nextRetryIn, setNextRetryIn] = useState(0);
  const isCompacting = currentSession?.compacting ?? false;
  const [compactionSuccess, setCompactionSuccess] = useState(false);

  const notifiedToolCallIdsRef = useRef<Set<string>>(new Set());

  type PartIndexEntry = { sessionId: string; messageId: string; index: number };
  const partIdIndexRef = useRef<Map<string, PartIndexEntry>>(new Map());

  const pendingPartAppendsRef = useRef<Map<string, string>>(new Map());
  const partAppendRafRef = useRef<number | null>(null);
  const lastPartAppendFlushAtRef = useRef<number>(0);
  const partAppendTimeoutRef = useRef<number | null>(null);

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

  const { playChatFinishSound, playPermissionSound } = useNotificationSound();
  const skipFinishSoundSessionIdsRef = useRef<Set<string>>(new Set());

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

  const apiToken = activeServer?.token ?? null;
  const serverUrl = activeServer?.url ?? null;

  const sdkClient = sdkClientRef.current; // eslint-disable-line react-hooks/refs -- sdkClientRef is intentionally accessed during render to provide a stable reference

  useEffect(() => {
    currentSessionIdRef.current = currentSession?.id ?? null;
  }, [currentSession]);

  useEffect(() => {
    notifiedToolCallIdsRef.current.clear();
  }, [currentSession?.id]);

  useLayoutEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const pendingSessionCreateRef = useRef(false);
  const handlerContextRef = useRef<SessionHandlersContext | null>(null);

  const handleLogout = useCallback(() => {
    if (activeServer) {
      removeServer(activeServer.id);
      navigate({ to: '/' });
    }
    sdkClientRef.current?.dispose();
    setConnected(false);
    setConnectionTimedOut(false);
    setRetryCount(0);
    setNextRetryIn(0);
  }, [activeServer, removeServer, navigate, sdkClientRef]);

  const handleRetry = useCallback(() => {
    setRetryCount(c => c + 1);
    setConnectionTimedOut(false);
    setNextRetryIn(0);
  }, []);

  const getMessagesWithParts = useCallback((sessionId: string): MessageWithParts[] => {
    if (sessionId !== activeSessionId) {
      return [];
    }
    return activeSessionMessages.map(message => ({
      message,
      parts: (activeSessionPartsMap[message.id] || []).sort((a, b) => a.createdAt - b.createdAt),
    }));
  }, [activeSessionId, activeSessionMessages, activeSessionPartsMap]);

  useConnectionLifecycle({
    apiToken,
    serverUrl,
    currentSessionIdRef,
    handlerContextRef,
    clearPendingPermissions,
    handleLogout,
    setConnected,
    setAuthError,
    setConnectionTimedOut,
    setRetryCount,
    setNextRetryIn,
    connected,
    connectionTimedOut,
    retryCount,
    clientRef: sdkClientRef,
  });

  const createWorkspace = async (name: string, path: string, isVirtual: boolean) => {
    const http = sdkClientRef.current?.httpClient;
    if (!http) return;

    const data = await http.post<{ workspace: Workspace }>('/workspaces', { name, path, isVirtual });
    const workspace = data.workspace;
    useServerDataStore.getState().setWorkspaces([...useServerDataStore.getState().workspaces, workspace]);
    useWorkspaceStore.getState().setActiveWorkspace(workspace);
    localStorage.setItem('activeWorkspaceId', workspace.id);
    setCurrentSession(null);
    return workspace;
  };

  const selectWorkspace = (workspace: Workspace) => {
    useWorkspaceStore.getState().setActiveWorkspace(workspace);
    localStorage.setItem('activeWorkspaceId', workspace.id);
    setCurrentSession(null);
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

    removeFromQuickConnectionsByWorkspace(id);

    if (currentSession && (currentSession.workspaceId === id || deletedSessions.includes(currentSession.id))) {
      setCurrentSession(null);
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
    const currentActive = useWorkspaceStore.getState().activeWorkspace;
    if (currentActive?.id === id) {
      const remaining = currentWorkspaces.filter(w => w.id !== id);
      const newActive = remaining[0] || null;
      useWorkspaceStore.getState().setActiveWorkspace(newActive);
      if (newActive) {
        localStorage.setItem('activeWorkspaceId', newActive.id);
      } else {
        localStorage.removeItem('activeWorkspaceId');
      }
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
      models: useServerDataStore.getState().models as ModelInfo[],
      defaultModel: useServerDataStore.getState().defaultModel,
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
    setActiveWorkspace: (ws: Workspace | null) => useWorkspaceStore.getState().setActiveWorkspace(ws),
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
    <SidebarProvider panelId="sessions" defaultOpen={true} className="flex-col" style={{ '--sidebar-width': `${sessionsPanelWidth}px`, '--header-height': '3.5rem' } as React.CSSProperties}>
      <AppHeader
        headerTitle={headerTitle}
        isLoggedIn={isLoggedIn}
        activeWorkspace={activeWorkspace}
        onSidebarViewModeChange={handleSidebarViewModeChange}
        connected={connected}
        onOpenSettings={() => setShowSettings(true)}
        onOpenMCP={() => setShowMCPDialog(true)}
        onOpenConfiguration={() => setShowConfiguration(true)}
        onOpenAddServer={() => setShowAddServer(true)}
      />

      <div className="flex flex-1 min-h-0">
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
            activeServer={activeServer}
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
            onEscape={() => {
              if (currentSession) {
                chatInputRef.current?.focus();
              }
            }}
            onCreateSessionInWorkspace={createSessionInWorkspace}
            pendingPermissions={pendingPermissions}
            sdkClient={sdkClient}
          />
        )}

        <ShellContent
          servers={servers}
          activeServer={activeServer}
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
          sdkClient={sdkClient}
          terminalPanelRef={terminalPanelRef}
          workspaceId={activeWorkspace?.id}
          workspacePath={activeWorkspace?.path}
          workspaceName={activeWorkspace?.name}
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

        {isLoggedIn && (
          <FilesPanel
            ref={filesPanelRef}
            workspaceId={activeWorkspace?.id}
            sdkClient={sdkClient}
            isOpen={showFilesPanel}
            onClose={() => setShowFilesPanel(false)}
          />
        )}

        {isLoggedIn && (
          <div
            data-panel-gap="files"
            className={`relative bg-transparent transition-[width] duration-200 ease-linear shrink-0 ${!showFilesPanel ? 'w-0' : ''}`}
            style={{ width: showFilesPanel ? filesPanelWidth : 0 }}
          />
        )}
      </div>

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
            sdkClient={sdkClient}
          />

          <MCPManagementDialog
            open={showMCPDialog}
            onOpenChange={setShowMCPDialog}
            workspaceId={activeWorkspace?.id}
            workspacePath={activeWorkspace?.path}
            sdkClient={sdkClient}
          />

          <ConfigurationDialog
            open={showConfiguration}
            onOpenChange={(open) => {
              setShowConfiguration(open);
              if (!open) {
                router.invalidate();
              }
            }}
            sdkClient={sdkClient}
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
          sdkClient={sdkClient}
          open={filePreviewTarget !== null}
          onOpenChange={(open) => {
            if (!open) closeFilePreview();
          }}
        />
      )}
    </SidebarProvider>
  );
}
