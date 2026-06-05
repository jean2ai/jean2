import { useCallback } from 'react';
import type {
  Session,
  Workspace,
  Preconfig,
  AttachmentKind,
  AskResponse,
} from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { useConnectionStore } from '@/stores/connectionStore';

interface UseSessionCommandsParams {
  clientRef: React.RefObject<Jean2Client | null>;
  currentSession: Session | null;
  sessions: Session[];
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  currentModel: string;
  streamingSessionIds: Set<string>;
  isCompacting: boolean;
  primaryPreconfigs: Preconfig[];
  setActiveWorkspace: (workspace: Workspace | null) => void;
  setCompactionSuccess: (success: boolean) => void;
  setCurrentModel: (model: string) => void;
  setSelectedVariant: (variant: string | null) => void;
  removePendingAskRequest: (toolCallId: string) => void;
  removePendingPermissionRequest: (requestId: string, toolCallId?: string) => void;
  clearPendingAskRequestsBySessionId: (sessionId: string) => void;
  clearStreamingSessions: () => void;
  pendingSessionCreateRef: React.RefObject<boolean>;
  partAppendRafRef: React.RefObject<number | null>;
  pendingPartAppendsRef: React.RefObject<Map<string, string>>;
  skipFinishSoundSessionIdsRef: React.RefObject<Set<string>>;
  navigate: (opts: { to: string; params?: Record<string, string> }) => void;
  serverId: string;
  viewPath: '/workspace' | '/overview';
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
}

export function useSessionCommands({
  clientRef,
  currentSession,
  sessions,
  workspaces,
  activeWorkspace,
  currentModel,
  streamingSessionIds,
  isCompacting,
  primaryPreconfigs,
  setActiveWorkspace,
  setCompactionSuccess,
  setCurrentModel,
  setSelectedVariant,
  removePendingAskRequest,
  removePendingPermissionRequest,
  clearPendingAskRequestsBySessionId: _clearPendingAskRequestsBySessionId,
  clearStreamingSessions,
  pendingSessionCreateRef,
  partAppendRafRef,
  pendingPartAppendsRef,
  skipFinishSoundSessionIdsRef,
  navigate,
  serverId,
  viewPath,
}: UseSessionCommandsParams): UseSessionCommandsReturn {

  const createSession = useCallback((preconfigId?: string, title?: string) => {
    const client = clientRef.current;
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
  }, [clientRef, partAppendRafRef, pendingPartAppendsRef, pendingSessionCreateRef, activeWorkspace, setCompactionSuccess]);

  const resumeSession = useCallback((sessionId: string) => {
    const client = clientRef.current;
    skipFinishSoundSessionIdsRef.current = new Set(useConnectionStore.getState().streamingSessionIds);
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

    if (client && client.connected) {
      client.sessions.resume(sessionId);
    }
    navigate({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to: `/server/$serverId${viewPath}/session/$sessionId` as any,
      params: { serverId, sessionId },
    });
  }, [clientRef, partAppendRafRef, pendingPartAppendsRef, skipFinishSoundSessionIdsRef, sessions, workspaces, activeWorkspace, setActiveWorkspace, clearStreamingSessions, setCompactionSuccess, navigate, serverId, viewPath]);

  const closeSession = useCallback((sessionId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.sessions.close(sessionId);
    }
  }, [clientRef]);

  const revertSession = useCallback((sessionId: string, messageId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.sessions.revert(sessionId, messageId);
    }
  }, [clientRef]);

  const forkSession = useCallback((sessionId: string, messageId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.sessions.fork(sessionId, messageId);
    }
  }, [clientRef]);

  const compactSession = useCallback((sessionId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.sessions.compact(sessionId);
    }
  }, [clientRef]);

  const reopenSession = useCallback((sessionId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.sessions.reopen(sessionId);
    }
  }, [clientRef]);

  const permanentlyDeleteSession = useCallback((sessionId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.sessions.delete(sessionId);
    }
  }, [clientRef]);

  const updateSessionPreconfig = useCallback((preconfigId: string) => {
    const client = clientRef.current;
    if (client && client.connected && currentSession) {
      client.sessions.update(currentSession.id, { preconfigId });
    }
  }, [clientRef, currentSession]);

  const updateSessionModel = useCallback((modelId: string, providerId: string) => {
    const client = clientRef.current;
    setCurrentModel(modelId);
    setSelectedVariant(null);
    if (client && client.connected && currentSession) {
      client.sessions.updateModel(currentSession.id, { modelId, providerId });
    }
  }, [clientRef, currentSession, setCurrentModel, setSelectedVariant]);

  const updateSessionVariant = useCallback((variant: string | null) => {
    const client = clientRef.current;
    if (client && client.connected && currentSession) {
      client.sessions.updateModel(currentSession.id, {
        modelId: currentSession.selectedModel || currentModel,
        providerId: currentSession.selectedProvider || 'openai',
        variant: variant ?? undefined,
      });
      setSelectedVariant(variant);
    }
  }, [clientRef, currentSession, currentModel, setSelectedVariant]);

  const handleRenameSession = useCallback((sessionId: string, title: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.sessions.rename(sessionId, title);
    }
  }, [clientRef]);

  const handleNavigateBack = useCallback(() => {
    if (currentSession?.parentId) {
      resumeSession(currentSession.parentId);
    }
  }, [currentSession, resumeSession]);

  const addToQueue = useCallback((sessionId: string, content: string, attachments?: Array<{ id: string; kind: AttachmentKind }>, responseFormatId?: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.queue.add(sessionId, content, { attachments, responseFormatId });
    }
  }, [clientRef]);

  const removeFromQueue = useCallback((queueId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.queue.remove(queueId);
    }
  }, [clientRef]);

  const sendChatMessage = useCallback((content: string, attachments?: Array<{ id: string; kind: AttachmentKind }>, responseFormatId?: string) => {
    const client = clientRef.current;
    if (!currentSession || isCompacting) return;
    if (currentSession.runningAt || streamingSessionIds.has(currentSession.id)) {
      addToQueue(currentSession.id, content, attachments, responseFormatId);
    } else {
      if (client && client.connected) {
        client.chat.send(
          currentSession.id,
          content,
          { attachments, responseFormatId },
        );
      }
    }
  }, [clientRef, currentSession, streamingSessionIds, isCompacting, addToQueue]);

  const handleAskResponse = useCallback((toolCallId: string, response: AskResponse, requestId?: string) => {
    const client = clientRef.current;
    // For permission asks, use requestId as canonical identity
    if (requestId) {
      removePendingPermissionRequest(requestId, toolCallId);
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
  }, [clientRef, removePendingAskRequest, removePendingPermissionRequest]);

  const handleInterruptSession = useCallback(() => {
    const client = clientRef.current;
    if (client && client.connected && currentSession) {
      client.sessions.interrupt(currentSession.id);
    }
  }, [clientRef, currentSession]);

  const refreshPermissions = useCallback(() => {
    const client = clientRef.current;
    if (client && client.connected && activeWorkspace) {
      client.permissions.list(activeWorkspace.id);
    }
  }, [clientRef, activeWorkspace]);

  const createSessionInWorkspace = useCallback((workspaceId: string) => {
    const client = clientRef.current;
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
  }, [clientRef, partAppendRafRef, pendingPartAppendsRef, pendingSessionCreateRef, workspaces, primaryPreconfigs, setActiveWorkspace, setCompactionSuccess]);

  const revokePermission = useCallback((permissionId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.permissions.revoke(permissionId);
    }
  }, [clientRef]);

  const revokeAllPermissions = useCallback((workspaceId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.permissions.revokeAll(workspaceId);
    }
  }, [clientRef]);

  const claimControl = useCallback((sessionId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.control.claim(sessionId);
    }
  }, [clientRef]);

  const releaseControl = useCallback((sessionId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.control.release(sessionId);
    }
  }, [clientRef]);

  const requestTakeover = useCallback((sessionId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.control.requestTakeover(sessionId);
    }
  }, [clientRef]);

  const respondTakeover = useCallback((sessionId: string, requesterClientId: string, decision: 'approve' | 'deny') => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.control.respondTakeover(sessionId, requesterClientId, decision);
    }
  }, [clientRef]);

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
  };
}
