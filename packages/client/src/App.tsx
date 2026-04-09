import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '@/stores/uiStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type {
  Session,
  MessageWithParts,
  Preconfig,
  PromptInfo,
  Workspace,
  ToolPermission,
  ProviderStatus,
  Part,
} from '@jean2/sdk';
import type { SavedServer } from '@jean2/shared';
import type { Jean2Client } from '@jean2/sdk';
import { Jean2ClientProvider, usePermissionTracker, useMessageStore, useSessionManager } from '@jean2/sdk-react';

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
import { useEventSideEffects } from '@/hooks/useEventSideEffects';
import { useServerDataLoader, type ModelInfo } from '@/hooks/useServerDataLoader';
import { useSessionCommands } from '@/hooks/useSessionCommands';
import { AppKeyboardHandlersMount } from '@/hooks/useAppKeyboardHandlers';
import { AppHeader, AppPanels, AppMainContent } from '@/components/app';
import { FilesPanel, type FilesPanelHandle } from '@/components/layout/FilesPanel';
import type { MessageInputHandle } from '@/components/chat/MessageInput';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';

function AppContent() {
  const sdkClientRef = useRef<Jean2Client | null>(null);
  const [clientInstance, setClientInstance] = useState<Jean2Client | null>(null);
  const handleClientChange = useCallback((client: Jean2Client | null) => {
    setClientInstance(client);
  }, []);

  return (
    <Jean2ClientProvider client={clientInstance}>
      <AppInner sdkClientRef={sdkClientRef} onClientChange={handleClientChange} />
    </Jean2ClientProvider>
  );
}

function AppInner({ sdkClientRef, onClientChange }: { sdkClientRef: React.RefObject<Jean2Client | null>; onClientChange: (client: Jean2Client | null) => void }) {
  const { servers, activeServer, addServer, removeServer, isSwitching, clearSwitchingState, quickConnections, isAddingServerRef, prepareForServerAdd, removeFromQuickConnectionsByWorkspace } = useServerContext();

  // SDK session manager (replaces sessionStore for sessions/active)
  const { sessions: sdkSessions, active: sdkActiveSession, manager: sessionManager } = useSessionManager();

  // Local state for UI selection - which session the user is viewing
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const currentSession = currentSessionId
    ? sdkSessions.find(s => s.id === currentSessionId) ?? null
    : null;

  const [preconfigs, setPreconfigs] = useState<Preconfig[]>([]);
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);

  // Message store from SDK (replaces sessionContentStore)
  const { sessionIds: streamingSessionIdsFromStore, getForSession, getPart } = useMessageStore();

  const currentSessionIdRef = useRef<string | null>(null);
  const chatInputRef = useRef<MessageInputHandle>(null);
  const terminalPanelRef = useRef<TerminalPanelHandle>(null);
  const filesPanelRef = useRef<FilesPanelHandle>(null);
  const sidebarRef = useRef<AppSidebarHandle>(null);
  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const autoFollowToggleRef = useRef<{ toggle: () => void } | null>(null);
  const [connected, setConnected] = useState(false);
  const sessionsRef = useRef<Session[]>([]);

  // Streaming state from SDK's MessageStore (replaces streamStateStore)
  const streamingSessionIds = useMemo(() => new Set(streamingSessionIdsFromStore), [streamingSessionIdsFromStore]);

  // Local state for interrupted sessions (SDK doesn't track this)
  // Track interrupted sessions locally (state maintained for callbacks)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- State maintained for clearInterruptedSessions to work
  const [interruptedSessions, setInterruptedSessions] = useState<Set<string>>(new Set());
  const addInterruptedSession = useCallback((id: string) => {
    setInterruptedSessions(prev => new Set(prev).add(id));
  }, []);
  const removeInterruptedSession = useCallback((id: string) => {
    setInterruptedSessions(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  const clearInterruptedSessions = useCallback(() => {
    setInterruptedSessions(new Set());
  }, []);

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
        file?: string[];
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

  // Permission tracker from SDK (replaces sessionMetaStore)
  const {
    pendingRequests,
    getQueue,
  } = usePermissionTracker();

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

  // Derive httpClient from sdkClientRef for use in child components
  // eslint-disable-next-line react-hooks/refs -- sdkClientRef is stable and only set once per server connection
  const httpClient = sdkClientRef.current?.httpClient ?? null;

  // Keep currentSessionIdRef in sync with currentSessionId
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Auto-set currentSessionId when a new session is created/resumed via SDK events
  useEffect(() => {
    if (sdkActiveSession && !currentSessionId) {
      setCurrentSessionId(sdkActiveSession.id);
    }
  }, [sdkActiveSession, currentSessionId]);

  useEffect(() => {
    notifiedToolCallIdsRef.current.clear();
  }, [currentSession?.id]);

  // Keep sessionsRef in sync with sdkSessions
  useLayoutEffect(() => {
    sessionsRef.current = sdkSessions;
  }, [sdkSessions]);

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
    // Close existing client connection
    sdkClientRef.current?.dispose();
    setConnected(false);
    setConnectionTimedOut(false);
    setRetryCount(0);
    setNextRetryIn(0);

    // Clear all session and message state
    sessionManager?.clear();
    setCurrentSessionId(null);
    setPreconfigs([]);
    skipFinishSoundSessionIdsRef.current = new Set(streamingSessionIdsFromStore);
    notifiedToolCallIdsRef.current.clear();
    clearInterruptedSessions();
    setSessionUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    setCurrentModel('gpt-4o');
    setModels([]);
    setWorkspaces([]);
    setActiveWorkspace(null);
    setPermissions([]);
    clearAllCompletions();

    // Force reconnection with the new server credentials
    // The reconnectTrigger will cause the useEffect to reconnect
    setReconnectTrigger(t => t + 1);
  }, [sessionManager, streamingSessionIdsFromStore, clearInterruptedSessions, clearAllCompletions]);

  // Effect to handle state clearing when activeServer changes from addServer
  useEffect(() => {
    if (activeServer?.id !== prevActiveServerIdRef.current && isAddingServerRef.current) {
      isAddingServerRef.current = false;
      prevActiveServerIdRef.current = activeServer?.id ?? null;
      handleServerSwitch();
    }
  }, [activeServer, handleServerSwitch, isAddingServerRef]);

  const getMessagesWithParts = useCallback((sessionId: string): MessageWithParts[] => {
    const messages = getForSession(sessionId);
    if (!messages) return [];
    return messages.map(message => ({
      message,
      parts: message.partIds
        .map(id => getPart(id))
        .filter((p): p is Part => p !== undefined)
        .sort((a, b) => a.createdAt - b.createdAt),
    }));
  }, [getForSession, getPart]);

  // Pass our pre-created sdkClientRef so the hook uses it directly
  useConnectionLifecycle({
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
    clientRef: sdkClientRef,
    onClientChange,
  });

  // Subscribe to server events for side effects (sounds, UI state updates)
  useEventSideEffects({
    clientRef: sdkClientRef,
    currentSessionIdRef,
    notifiedToolCallIdsRef,
    skipFinishSoundSessionIdsRef,
    permissionSoundEnabledRef,
    chatFinishSoundEnabledRef,
    playChatFinishSound,
    playPermissionSound,
    setSessionUsage,
    setCurrentModel,
    setSelectedVariant,
    setCompactionSuccess,
    setCompletion,
    clearCompletion,
    clearAllCompletions,
    setProviderStatuses,
    setPermissions,
    addInterruptedSession,
    removeInterruptedSession,
    models,
    defaultModel,
    sessions: sdkSessions,
  });



  // Wrapper to load sessions into SessionManager
  const loadSessions = useCallback((newSessions: Session[]) => {
    sessionManager?.load(newSessions);
  }, [sessionManager]);

  // Server data loading hook (handles fetch, abort, workspace persistence)
  useServerDataLoader({
    apiToken,
    serverUrl,
    reconnectTrigger,
    clientRef: sdkClientRef,
    clearSwitchingState,
    loadSessions,
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
    sessionManager,
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
    setCurrentSessionId(null);
    return workspace;
  };

  const selectWorkspace = (workspace: Workspace) => {
    setActiveWorkspace(workspace);
    setCurrentSessionId(null);
  };

  const handleQuickSwitchWorkspaceSelect = (workspaceId: string) => {
    // Store the pending selection - it will be applied when data loads
    pendingWorkspaceIdRef.current = workspaceId;
  };

  const deleteWorkspace = async (id: string) => {
    const http = sdkClientRef.current?.httpClient;
    if (!http) return;

    try {
      await http.delete(`/workspaces/${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to delete workspace:', message);
      return;
    }

    // Remove quick connections referencing this workspace via context API
    // This updates both storage and reactive state
    removeFromQuickConnectionsByWorkspace(id);

    // Clear current session if it belonged to the deleted workspace
    if (currentSessionId && currentSession?.workspaceId === id) {
      setCurrentSessionId(null);
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

  // Filter out subagent-only preconfigs for primary sessions
  const primaryPreconfigs = preconfigs.filter(p => p.mode !== 'subagent');

  // No-op for streaming sessions - SDK's MessageStore manages this internally
  const clearStreamingSessions = useCallback(() => {}, []);

  // Ref for tracking pending session creation (used by useSessionCommands for SDK session creation)
  const pendingSessionCreateRef = useRef(false);

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
    sessions: sdkSessions,
    workspaces,
    activeWorkspace,
    currentModel,
    streamingSessionIds,
    isCompacting,
    primaryPreconfigs,
    setCurrentSessionId,
    setActiveWorkspace,
    setCompactionSuccess,
    setCurrentModel,
    setSelectedVariant,
    clearStreamingSessions,
    pendingSessionCreateRef,
    skipFinishSoundSessionIdsRef,
  });

  const workspaceSessions = sdkSessions.filter(s => s.workspaceId === activeWorkspace?.id);

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
          allSessions={sdkSessions}
          favoritedWorkspaceIds={favoritedWorkspaceIds}
          sessions={workspaceSessions}
          currentSession={currentSession}
          currentSessionId={currentSessionId}
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
          pendingPermissions={pendingRequests}
          // eslint-disable-next-line react-hooks/refs -- httpClient derived from stable sdkClientRef
          httpClient={httpClient}
        />
      )}

      {isLoggedIn && (
        <FilesPanel
          ref={filesPanelRef}
          workspaceId={activeWorkspace?.id}
          // eslint-disable-next-line react-hooks/refs -- httpClient derived from stable sdkClientRef
          httpClient={httpClient}
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
          queuedMessages={currentSession ? { [currentSession.id]: getQueue(currentSession.id) } : {}}
          preconfigs={preconfigs}
          primaryPreconfigs={primaryPreconfigs}
          prompts={prompts}
          models={models}
          defaultModel={defaultModel}
          selectedVariant={selectedVariant}
          pendingPermissions={pendingRequests}
          sessionUsage={sessionUsage}
          currentModel={currentModel}
          streamingSessionIds={streamingSessionIds}
          isCompacting={isCompacting}
          compactionSuccess={compactionSuccess}
          isPrimarySession={isPrimarySession}
          inputRef={chatInputRef}
          // eslint-disable-next-line react-hooks/refs -- httpClient derived from stable sdkClientRef
          httpClient={httpClient}
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
            // eslint-disable-next-line react-hooks/refs -- httpClient derived from stable sdkClientRef
            httpClient={httpClient}
          />

          <MCPManagementDialog
            open={showMCPDialog}
            onOpenChange={setShowMCPDialog}
            workspaceId={activeWorkspace?.id}
            workspacePath={activeWorkspace?.path}
            // eslint-disable-next-line react-hooks/refs -- httpClient derived from stable sdkClientRef
            httpClient={httpClient}
          />

          <ConfigurationDialog
            open={showConfiguration}
            onOpenChange={setShowConfiguration}
            // eslint-disable-next-line react-hooks/refs -- httpClient derived from stable sdkClientRef
            httpClient={httpClient}
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
          // eslint-disable-next-line react-hooks/refs -- httpClient derived from stable sdkClientRef
          httpClient={httpClient}
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
