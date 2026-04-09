import { useCallback } from 'react';
import type { Session, Workspace, Preconfig } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { useChat, type ChatAttachment } from '@jean2/sdk-react';

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
  setCurrentSessionId: (id: string | null) => void;
  setActiveWorkspace: (workspace: Workspace | null) => void;
  setCompactionSuccess: (success: boolean) => void;
  setCurrentModel: (model: string) => void;
  setSelectedVariant: (variant: string | null) => void;
  clearStreamingSessions: () => void;
  pendingSessionCreateRef: React.RefObject<boolean>;
  skipFinishSoundSessionIdsRef: React.RefObject<Set<string>>;
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
  addToQueue: (sessionId: string, content: string, attachments?: ChatAttachment[]) => void;
  removeFromQueue: (queueId: string) => void;
  sendChatMessage: (content: string, attachments?: ChatAttachment[]) => void;
  handlePermissionResponse: (toolCallId: string, allowed: boolean, alwaysAllow: boolean) => void;
  handleInterruptSession: () => void;
  updateSessionPreconfig: (preconfigId: string) => void;
  updateSessionModel: (modelId: string, providerId: string) => void;
  updateSessionVariant: (variant: string | null) => void;
  handleNavigateBack: () => void;
  refreshPermissions: () => void;
  createSessionInWorkspace: (workspaceId: string) => void;
  revokePermission: (permissionId: string) => void;
  revokeAllPermissions: (workspaceId: string) => void;
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
  setCurrentSessionId,
  setActiveWorkspace,
  setCompactionSuccess,
  setCurrentModel,
  setSelectedVariant,
  clearStreamingSessions,
  pendingSessionCreateRef,
  skipFinishSoundSessionIdsRef,
}: UseSessionCommandsParams): UseSessionCommandsReturn {

  const chat = useChat(currentSession?.id ?? '', {
    isStreaming: streamingSessionIds.has(currentSession?.id ?? ''),
  });
  const { send: chatSend, interrupt: chatInterrupt } = chat;

  const createSession = useCallback((preconfigId?: string, title?: string) => {
    const client = clientRef.current;
    pendingSessionCreateRef.current = true;
    if (client && client.connected) {
      client.sessions.create({
        preconfigId,
        title,
        workspaceId: activeWorkspace?.id,
      });
    }
    setCompactionSuccess(false);
  }, [clientRef, pendingSessionCreateRef, activeWorkspace, setCompactionSuccess]);

  const resumeSession = useCallback((sessionId: string) => {
    const client = clientRef.current;
    const session = sessions.find(s => s.id === sessionId);

    skipFinishSoundSessionIdsRef.current = new Set(streamingSessionIds);
    clearStreamingSessions();
    setCompactionSuccess(false);

    if (session?.workspaceId && session.workspaceId !== activeWorkspace?.id) {
      const targetWorkspace = workspaces.find(w => w.id === session.workspaceId);
      if (targetWorkspace) {
        setActiveWorkspace(targetWorkspace);
      }
    }

    if (session) {
      setCurrentSessionId(session.id);
    }
    if (client && client.connected) {
      client.sessions.resume(sessionId);
    }
  }, [clientRef, skipFinishSoundSessionIdsRef, sessions, workspaces, activeWorkspace, setCurrentSessionId, setActiveWorkspace, clearStreamingSessions, setCompactionSuccess]);

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

  const addToQueue = useCallback((sessionId: string, content: string, attachments?: ChatAttachment[]) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.queue.add(sessionId, content, attachments);
    }
  }, [clientRef]);

  const removeFromQueue = useCallback((queueId: string) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.queue.remove(queueId);
    }
  }, [clientRef]);

  const sendChatMessage = useCallback((content: string, attachments?: ChatAttachment[]) => {
    if (!currentSession || isCompacting) return;
    if (currentSession.runningAt || streamingSessionIds.has(currentSession.id)) {
      addToQueue(currentSession.id, content, attachments);
    } else {
      chatSend(content, attachments);
    }
  }, [currentSession, streamingSessionIds, isCompacting, addToQueue, chatSend]);

  const handlePermissionResponse = useCallback((toolCallId: string, allowed: boolean, alwaysAllow: boolean) => {
    const client = clientRef.current;
    if (client && client.connected) {
      client.permissions.respond(toolCallId, allowed, alwaysAllow);
    }
  }, [clientRef]);

  const handleInterruptSession = useCallback(() => {
    if (currentSession) {
      chatInterrupt();
    }
  }, [currentSession, chatInterrupt]);

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
    const primary = primaryPreconfigs[0]?.id;
    if (client && client.connected) {
      client.sessions.create({ preconfigId: primary, workspaceId });
    }
    setCompactionSuccess(false);
  }, [clientRef, pendingSessionCreateRef, workspaces, primaryPreconfigs, setActiveWorkspace, setCompactionSuccess]);

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
    createSessionInWorkspace,
    revokePermission,
    revokeAllPermissions,
  };
}
