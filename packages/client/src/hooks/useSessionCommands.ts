import { useCallback } from 'react';
import { useStreamStateStore } from '@/stores/streamStateStore';
import type {
  Session,
  Workspace,
  Preconfig,
} from '@jean2/shared';

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

interface UseSessionCommandsParams {
  ws: WebSocket | null;
  currentSession: Session | null;
  sessions: Session[];
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  currentModel: string;
  streamingSessionIds: Set<string>;
  isCompacting: boolean;
  primaryPreconfigs: Preconfig[];
  setCurrentSession: (session: Session | null) => void;
  setActiveWorkspace: (workspace: Workspace | null) => void;
  setCompactionSuccess: (success: boolean) => void;
  setCurrentModel: (model: string) => void;
  setSelectedVariant: (variant: string | null) => void;
  removePendingPermissionByToolCallId: (toolCallId: string) => void;
  removePendingPermissionsBySessionId: (sessionId: string) => void;
  clearStreamingSessions: () => void;
  pendingSessionCreateRef: React.MutableRefObject<boolean>;
  partAppendRafRef: React.MutableRefObject<number | null>;
  pendingPartAppendsRef: React.MutableRefObject<Map<string, string>>;
  skipFinishSoundSessionIdsRef: React.MutableRefObject<Set<string>>;
}

interface UseSessionCommandsReturn {
  sendMessage: (type: string, payload: ClientMessagePayload) => void;
  createSession: (preconfigId?: string, title?: string) => void;
  resumeSession: (sessionId: string) => void;
  closeSession: (sessionId: string) => void;
  reopenSession: (sessionId: string) => void;
  permanentlyDeleteSession: (sessionId: string) => void;
  handleRenameSession: (sessionId: string, title: string) => void;
  revertSession: (sessionId: string, messageId: string) => void;
  forkSession: (sessionId: string, messageId: string) => void;
  compactSession: (sessionId: string) => void;
  addToQueue: (sessionId: string, content: string) => void;
  removeFromQueue: (queueId: string) => void;
  sendChatMessage: (content: string) => void;
  handlePermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  handleInterruptSession: () => void;
  updateSessionPreconfig: (preconfigId: string) => void;
  updateSessionModel: (modelId: string, providerId: string) => void;
  updateSessionVariant: (variant: string | null) => void;
  handleNavigateBack: () => void;
  refreshPermissions: () => void;
  connectProvider: (provider: string) => void;
  disconnectProvider: (provider: string) => void;
  createSessionInWorkspace: (workspaceId: string) => void;
}

export function useSessionCommands({
  ws,
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
}: UseSessionCommandsParams): UseSessionCommandsReturn {

  const sendMessage = useCallback((type: string, payload: ClientMessagePayload) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  }, [ws]);

  const createSession = useCallback((preconfigId?: string, title?: string) => {
    pendingSessionCreateRef.current = true;
    if (partAppendRafRef.current !== null) {
      cancelAnimationFrame(partAppendRafRef.current);
      partAppendRafRef.current = null;
    }
    pendingPartAppendsRef.current.clear();
    sendMessage('session.create', { preconfigId, title, workspaceId: activeWorkspace?.id });
  }, [partAppendRafRef, pendingPartAppendsRef, pendingSessionCreateRef, sendMessage, activeWorkspace]);

  const resumeSession = useCallback((sessionId: string) => {
    removePendingPermissionsBySessionId(sessionId);
    skipFinishSoundSessionIdsRef.current = new Set(useStreamStateStore.getState().streamingSessionIds);
    clearStreamingSessions();
    setCompactionSuccess(false);
    const session = sessions.find(s => s.id === sessionId);
    if (session?.workspaceId && session.workspaceId !== activeWorkspace?.id) {
      const targetWorkspace = workspaces.find(w => w.id === session.workspaceId);
      if (targetWorkspace) {
        setActiveWorkspace(targetWorkspace);
      }
    }
    if (partAppendRafRef.current !== null) {
      cancelAnimationFrame(partAppendRafRef.current);
      partAppendRafRef.current = null;
    }
    pendingPartAppendsRef.current.clear();

    if (session) {
      setCurrentSession(session);
    }
    sendMessage('session.resume', { sessionId });
  }, [partAppendRafRef, pendingPartAppendsRef, skipFinishSoundSessionIdsRef, sendMessage, sessions, workspaces, activeWorkspace, setCurrentSession, setActiveWorkspace, removePendingPermissionsBySessionId, clearStreamingSessions, setCompactionSuccess]);

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
  }, [currentSession, sendMessage, setCurrentModel, setSelectedVariant]);

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
  }, [currentSession, currentModel, sendMessage, setSelectedVariant]);

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
  }, [sendMessage, removePendingPermissionByToolCallId]);

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

  const createSessionInWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspace(workspaces.find(w => w.id === workspaceId) || null);
    pendingSessionCreateRef.current = true;
    if (partAppendRafRef.current !== null) {
      cancelAnimationFrame(partAppendRafRef.current);
      partAppendRafRef.current = null;
    }
    pendingPartAppendsRef.current.clear();
    const primary = primaryPreconfigs[0]?.id;
    sendMessage('session.create', { preconfigId: primary, workspaceId });
  }, [partAppendRafRef, pendingPartAppendsRef, pendingSessionCreateRef, sendMessage, workspaces, primaryPreconfigs, setActiveWorkspace]);

  return {
    sendMessage,
    createSession,
    resumeSession,
    closeSession,
    reopenSession,
    permanentlyDeleteSession,
    handleRenameSession,
    revertSession,
    forkSession,
    compactSession,
    addToQueue,
    removeFromQueue,
    sendChatMessage,
    handlePermissionResponse,
    handleInterruptSession,
    updateSessionPreconfig,
    updateSessionModel,
    updateSessionVariant,
    handleNavigateBack,
    refreshPermissions,
    connectProvider,
    disconnectProvider,
    createSessionInWorkspace,
  };
}
