import { useCallback } from 'react';
import { useStreamStateStore } from '@/stores/streamStateStore';
import type {
  Session,
  Workspace,
  Preconfig,
  AttachmentKind,
} from '@jean2/shared';
import type { Jean2Client } from '@jean2/sdk';

interface UseSessionCommandsParams {
  client: Jean2Client | null;
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
  createSession: (preconfigId?: string, title?: string) => void;
  resumeSession: (sessionId: string) => void;
  closeSession: (sessionId: string) => void;
  reopenSession: (sessionId: string) => void;
  permanentlyDeleteSession: (sessionId: string) => void;
  handleRenameSession: (sessionId: string, title: string) => void;
  revertSession: (sessionId: string, messageId: string) => void;
  forkSession: (sessionId: string, messageId: string) => void;
  compactSession: (sessionId: string) => void;
  addToQueue: (sessionId: string, content: string, attachments?: Array<{ id: string; kind: AttachmentKind }>) => void;
  removeFromQueue: (queueId: string) => void;
  sendChatMessage: (content: string, attachments?: Array<{ id: string; kind: AttachmentKind }>) => void;
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
  revokePermission: (permissionId: string) => void;
  revokeAllPermissions: (workspaceId: string) => void;
}

export function useSessionCommands({
  client,
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

  const createSession = useCallback((preconfigId?: string, title?: string) => {
    pendingSessionCreateRef.current = true;
    if (partAppendRafRef.current !== null) {
      cancelAnimationFrame(partAppendRafRef.current);
      partAppendRafRef.current = null;
    }
    pendingPartAppendsRef.current.clear();
    if (client && client.connected) {
      client.sessions.create({
        preconfigId,
        title,
        workspaceId: activeWorkspace?.id,
      });
    }
    setCompactionSuccess(false);
  }, [client, partAppendRafRef, pendingPartAppendsRef, pendingSessionCreateRef, activeWorkspace, setCompactionSuccess]);

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
    if (client && client.connected) {
      client.sessions.resume(sessionId);
    }
  }, [client, partAppendRafRef, pendingPartAppendsRef, skipFinishSoundSessionIdsRef, sessions, workspaces, activeWorkspace, setCurrentSession, setActiveWorkspace, removePendingPermissionsBySessionId, clearStreamingSessions, setCompactionSuccess]);

  const closeSession = useCallback((sessionId: string) => {
    if (client && client.connected) {
      client.sessions.close(sessionId);
    }
  }, [client]);

  const revertSession = useCallback((sessionId: string, messageId: string) => {
    if (client && client.connected) {
      client.sessions.revert(sessionId, messageId);
    }
  }, [client]);

  const forkSession = useCallback((sessionId: string, messageId: string) => {
    if (client && client.connected) {
      client.sessions.fork(sessionId, messageId);
    }
  }, [client]);

  const compactSession = useCallback((sessionId: string) => {
    if (client && client.connected) {
      client.sessions.compact(sessionId);
    }
  }, [client]);

  const reopenSession = useCallback((sessionId: string) => {
    if (client && client.connected) {
      client.sessions.reopen(sessionId);
    }
  }, [client]);

  const permanentlyDeleteSession = useCallback((sessionId: string) => {
    if (client && client.connected) {
      client.sessions.delete(sessionId);
    }
  }, [client]);

  const updateSessionPreconfig = useCallback((preconfigId: string) => {
    if (client && client.connected && currentSession) {
      client.sessions.update(currentSession.id, { preconfigId });
    }
  }, [client, currentSession]);

  const updateSessionModel = useCallback((modelId: string, providerId: string) => {
    setCurrentModel(modelId);
    setSelectedVariant(null);
    if (client && client.connected && currentSession) {
      client.sessions.updateModel(currentSession.id, { modelId, providerId });
    }
  }, [client, currentSession, setCurrentModel, setSelectedVariant]);

  const updateSessionVariant = useCallback((variant: string | null) => {
    if (client && client.connected && currentSession) {
      client.sessions.updateModel(currentSession.id, {
        modelId: currentSession.selectedModel || currentModel,
        providerId: currentSession.selectedProvider || 'openai',
        variant: variant ?? undefined,
      });
      setSelectedVariant(variant);
    }
  }, [client, currentSession, currentModel, setSelectedVariant]);

  const handleRenameSession = useCallback((sessionId: string, title: string) => {
    if (client && client.connected) {
      client.sessions.rename(sessionId, title);
    }
  }, [client]);

  const handleNavigateBack = useCallback(() => {
    if (currentSession?.parentId) {
      resumeSession(currentSession.parentId);
    }
  }, [currentSession, resumeSession]);

  const addToQueue = useCallback((sessionId: string, content: string, attachments?: Array<{ id: string; kind: AttachmentKind }>) => {
    if (client && client.connected) {
      client.queue.add(sessionId, content, attachments);
    }
  }, [client]);

  const removeFromQueue = useCallback((queueId: string) => {
    if (client && client.connected) {
      client.queue.remove(queueId);
    }
  }, [client]);

  const sendChatMessage = useCallback((content: string, attachments?: Array<{ id: string; kind: AttachmentKind }>) => {
    if (!currentSession || isCompacting) return;
    if (currentSession.runningAt || streamingSessionIds.has(currentSession.id)) {
      addToQueue(currentSession.id, content, attachments);
    } else {
      if (client && client.connected) {
        client.chat.send(
          currentSession.id,
          content,
          attachments ? { attachments } : undefined,
        );
      }
    }
  }, [client, currentSession, streamingSessionIds, isCompacting, addToQueue]);

  const handlePermissionResponse = useCallback((toolCallId: string, allowed: boolean, alwaysAllow: boolean) => {
    removePendingPermissionByToolCallId(toolCallId);
    if (client && client.connected) {
      client.permissions.respond(toolCallId, allowed, alwaysAllow);
    }
  }, [client, removePendingPermissionByToolCallId]);

  const handleInterruptSession = useCallback(() => {
    if (client && client.connected && currentSession) {
      client.sessions.interrupt(currentSession.id);
    }
  }, [client, currentSession]);

  const refreshPermissions = useCallback(() => {
    if (client && client.connected && activeWorkspace) {
      client.permissions.list(activeWorkspace.id);
    }
  }, [client, activeWorkspace]);

  const connectProvider = useCallback((provider: string) => {
    if (client && client.connected) {
      client.providers.connect(provider);
    }
  }, [client]);

  const disconnectProvider = useCallback((provider: string) => {
    if (client && client.connected) {
      client.providers.disconnect(provider);
    }
  }, [client]);

  const createSessionInWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspace(workspaces.find(w => w.id === workspaceId) || null);
    pendingSessionCreateRef.current = true;
    if (partAppendRafRef.current !== null) {
      cancelAnimationFrame(partAppendRafRef.current);
      partAppendRafRef.current = null;
    }
    pendingPartAppendsRef.current.clear();
    const primary = primaryPreconfigs[0]?.id;
    if (client && client.connected) {
      client.sessions.create({ preconfigId: primary, workspaceId });
    }
    setCompactionSuccess(false);
  }, [client, partAppendRafRef, pendingPartAppendsRef, pendingSessionCreateRef, workspaces, primaryPreconfigs, setActiveWorkspace, setCompactionSuccess]);

  const revokePermission = useCallback((permissionId: string) => {
    if (client && client.connected) {
      client.permissions.revoke(permissionId);
    }
  }, [client]);

  const revokeAllPermissions = useCallback((workspaceId: string) => {
    if (client && client.connected) {
      client.permissions.revokeAll(workspaceId);
    }
  }, [client]);

  return {
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
    revokePermission,
    revokeAllPermissions,
  };
}
