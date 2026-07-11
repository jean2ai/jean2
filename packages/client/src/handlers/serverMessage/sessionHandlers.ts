import type { Session, MessageWithParts, SessionControlState } from '@jean2/sdk';
import type { SessionHandlersContext, SessionUsage } from './types';
import { useSessionControlStore } from '@/stores/sessionControlStore';
import { useSessionStore } from '@/stores/sessionStore';
import { usePendingOperationsStore } from '@/stores/pendingOperationsStore';
import { queryClient } from '@/components/providers/QueryProvider';
import { queryKeys } from '@/lib/queryKeys';
import { mark, markAndMeasure } from '@/lib/perf';

/**
 * Check whether a query key contains a given workspace ID.
 */
function queryKeyContainsWorkspace(key: readonly unknown[], workspaceId: string): boolean {
  for (const part of key) {
    if (typeof part === 'string' && part === workspaceId) return true;
    if (part && typeof part === 'object') {
      if ('workspaceId' in part && part.workspaceId === workspaceId) return true;
      if ('workspaceIds' in part && Array.isArray(part.workspaceIds) && part.workspaceIds.includes(workspaceId)) return true;
    }
  }
  return false;
}

/**
 * Invalidate session-related queries scoped to a single workspace.
 */
function invalidateSessionQueriesForWorkspace(workspaceId: string): void {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!key || !Array.isArray(key) || key[0] !== 'sessions') return false;
      return queryKeyContainsWorkspace(key, workspaceId);
    },
  });
}

/**
 * Invalidate session-related queries scoped to a single workspace and its tags.
 */
function invalidateSessionsAndTagsForWorkspace(workspaceId: string): void {
  invalidateSessionQueriesForWorkspace(workspaceId);
  queryClient.invalidateQueries({ queryKey: queryKeys.sessions.tags(workspaceId) });
}

/**
 * Find the workspace ID for a session from the sessions list.
 */
function findWorkspaceId(sessions: Session[], sessionId: string): string | null {
  return sessions.find(s => s.id === sessionId)?.workspaceId ?? null;
}

export function handleSessionCreated(
  msg: { type: 'session.created'; session: Session },
  ctx: SessionHandlersContext,
): void {
  const { session } = msg;
  const {
    setSessions,
    setCurrentSession,
    setSessionUsage,
    setCurrentModel,
    setSelectedVariant,
    pendingSessionCreateRef,
    sessionAccessTimesRef,
    partIdIndexRef,
    defaultModel,
  } = ctx;

  setSessions(prev => [session, ...prev]);

  if (pendingSessionCreateRef.current) {
    setCurrentSession(session);
    ctx.replaceSessionContent(session.id, []);
    partIdIndexRef.current.clear();
    setSessionUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    setCurrentModel(session.selectedModel || defaultModel);
    setSelectedVariant(session.selectedVariant ?? null);
    pendingSessionCreateRef.current = false;
    ctx.navigateToSession(session.id);
    ctx.resumeSessionAfterCreate(session.id);
  }
  sessionAccessTimesRef.current.set(session.id, Date.now());
  if (session.workspaceId) {
    invalidateSessionQueriesForWorkspace(session.workspaceId);
  } else {
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
  }
}

export function handleSessionResumed(
  msg: {
    type: 'session.resumed';
    session: Session;
    messages?: MessageWithParts[];
    usage?: SessionUsage;
    isRunning?: boolean;
    control?: SessionControlState;
    transcript?: {
      messages: MessageWithParts[];
      pagination: {
        hasOlder: boolean;
        oldestSequence: number | null;
        newestSequence: number | null;
        limit: number;
      };
    };
  },
  ctx: SessionHandlersContext,
): void {
  const { session, messages, transcript, usage, isRunning, control } = msg;
  mark('session-resumed:received');
  const {
    setCurrentSession,
    removeInterruptedSession,
    addStreamingSession,
    removeStreamingSession,
    skipFinishSoundSessionIdsRef,
    setSessionUsage,
    setCurrentModel,
    setSelectedVariant,
    sessionAccessTimesRef,
    partIdIndexRef,
    models,
    defaultModel,
    clearCompletion,
  } = ctx;

  setCurrentSession(session);
  removeInterruptedSession(session.id);
  // Clear completion state when session is opened
  clearCompletion(session.id);

  if (isRunning) {
    addStreamingSession(session.id);
  } else {
    removeStreamingSession(session.id);
    skipFinishSoundSessionIdsRef.current.add(session.id);
  }

  if (transcript) {
    ctx.replaceSessionContent(session.id, transcript.messages, {
      hasOlder: transcript.pagination.hasOlder,
      oldestSequence: transcript.pagination.oldestSequence,
      newestSequence: transcript.pagination.newestSequence,
    });

    partIdIndexRef.current.clear();
    for (const mwp of transcript.messages) {
      for (let i = 0; i < mwp.parts.length; i++) {
        partIdIndexRef.current.set(mwp.parts[i].id, {
          sessionId: session.id,
          messageId: mwp.message.id,
          index: i,
        });
      }
    }
  } else if (messages) {
    ctx.replaceSessionContent(session.id, messages);

    partIdIndexRef.current.clear();
    for (const mwp of messages) {
      for (let i = 0; i < mwp.parts.length; i++) {
        partIdIndexRef.current.set(mwp.parts[i].id, {
          sessionId: session.id,
          messageId: mwp.message.id,
          index: i,
        });
      }
    }
  }

  setSessionUsage(usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  setCurrentModel(session.selectedModel || defaultModel);
  setSelectedVariant(session.selectedVariant || null);

  const restoredModelId = session.selectedModel || defaultModel;
  const restoredVariants = models.find(m => m.id === restoredModelId)?.variants;
  if (session.selectedVariant && restoredVariants && !restoredVariants[session.selectedVariant]) {
    setSelectedVariant(null);
  }
  sessionAccessTimesRef.current.set(session.id, Date.now());

  if (control) {
    useSessionControlStore.getState().setControlState(session.id, control);
  }

  markAndMeasure('session-resumed:received', 'session-content:ready');
}

export function handleSessionClosed(
  msg: { type: 'session.closed'; sessionId: string },
  ctx: SessionHandlersContext,
): void {
  const { sessionId } = msg;
  const {
    setSessions,
    setCurrentSession,
    partIdIndexRef,
    partAppendRafRef,
    pendingPartAppendsRef,
    sessionAccessTimesRef,
    currentSessionIdRef,
    clearCompletion,
  } = ctx;

  setSessions(prev => prev.map(s =>
    s.id === sessionId ? { ...s, status: 'closed' } : s
  ));

  clearCompletion(sessionId);

  if (currentSessionIdRef.current === sessionId) {
    if (partAppendRafRef.current !== null) {
      cancelAnimationFrame(partAppendRafRef.current);
      partAppendRafRef.current = null;
    }
    pendingPartAppendsRef.current.clear();
  }

  useSessionStore.getState().evictSessionContent(sessionId);

  for (const [partId, entry] of partIdIndexRef.current) {
    if (entry.sessionId === sessionId) {
      partIdIndexRef.current.delete(partId);
    }
  }
  sessionAccessTimesRef.current.delete(sessionId);
  if (currentSessionIdRef.current === sessionId) {
    setCurrentSession(null);
    ctx.navigateToParent();
  }
  const wsId = findWorkspaceId(ctx.sessionsRef.current, sessionId);
  if (wsId) {
    invalidateSessionQueriesForWorkspace(wsId);
  } else {
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
  }
}

export function handleSessionReopened(
  msg: { type: 'session.reopened'; session: Session },
  ctx: SessionHandlersContext,
): void {
  const { session } = msg;
  const { setSessions, setCurrentSession, currentSessionIdRef } = ctx;

  setSessions(prev => prev.map(s =>
    s.id === session.id ? session : s
  ));
  if (currentSessionIdRef.current === session.id) {
    setCurrentSession(session);
  }
  if (session.workspaceId) {
    invalidateSessionQueriesForWorkspace(session.workspaceId);
  }
}

export function handleSessionDeleted(
  msg: { type: 'session.deleted'; sessionId: string },
  ctx: SessionHandlersContext,
): void {
  const { sessionId } = msg;
  const {
    setSessions,
    removeInterruptedSession,
    partIdIndexRef,
    sessionAccessTimesRef,
    setCurrentSession,
    currentSessionIdRef,
    clearCompletion,
  } = ctx;

  setSessions(prev => prev.filter(s => s.id !== sessionId));

  clearCompletion(sessionId);
  useSessionStore.getState().evictSessionContent(sessionId);
  removeInterruptedSession(sessionId);

  for (const [partId, entry] of partIdIndexRef.current) {
    if (entry.sessionId === sessionId) {
      partIdIndexRef.current.delete(partId);
    }
  }
  sessionAccessTimesRef.current.delete(sessionId);
  usePendingOperationsStore.getState().clearOperation(sessionId, 'delete');

  if (currentSessionIdRef.current === sessionId) {
    setCurrentSession(null);
    ctx.navigateToParent();
  }
  const wsId = findWorkspaceId(ctx.sessionsRef.current, sessionId);
  if (wsId) {
    invalidateSessionQueriesForWorkspace(wsId);
  } else {
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
  }
}

export function handleSessionUpdated(
  msg: { type: 'session.updated'; session: Session },
  ctx: SessionHandlersContext,
): void {
  const { session } = msg;
  const { setSessions, setCurrentSession, setSelectedVariant, setCurrentModel, currentSessionIdRef } = ctx;

  setSessions(prev => prev.map(s =>
    s.id === session.id ? session : s
  ));
  if (currentSessionIdRef.current === session.id) {
    setCurrentSession(session);
    if (session.selectedVariant !== undefined) {
      setSelectedVariant(session.selectedVariant);
    }
    if (session.selectedModel) {
      setCurrentModel(session.selectedModel);
    }
  }
  if (session.workspaceId) {
    invalidateSessionsAndTagsForWorkspace(session.workspaceId);
  }
}

export function handleSessionRenamed(
  msg: { type: 'session.renamed'; session: Session },
  ctx: SessionHandlersContext,
): void {
  const { session } = msg;
  const { setSessions, setCurrentSession, currentSessionIdRef } = ctx;

  setSessions(prev => prev.map(s =>
    s.id === session.id ? session : s
  ));
  usePendingOperationsStore.getState().clearOperation(session.id, 'rename');
  usePendingOperationsStore.getState().clearOperation(session.id, 'regenerate_title');

  if (currentSessionIdRef.current === session.id) {
    setCurrentSession(session);
  }
  if (session.workspaceId) {
    invalidateSessionQueriesForWorkspace(session.workspaceId);
  }
}

export function handleSessionInterrupted(
  msg: { type: 'session.interrupted'; sessionId: string; result: import('@jean2/sdk').SessionInterruptResult },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, result } = msg;
  const { addInterruptedSession, skipFinishSoundSessionIdsRef, removeStreamingSession, clearPendingAskRequestsBySessionId } = ctx;

  addInterruptedSession(sessionId);
  skipFinishSoundSessionIdsRef.current.add(sessionId);
  removeStreamingSession(sessionId);
  clearPendingAskRequestsBySessionId(sessionId);
  if (result.cascadedTo.length > 0) {
    console.log(`Session ${sessionId} interrupted. Cascaded to:`, result.cascadedTo);
  }
}

export function handleSessionReverted(
  msg: { type: 'session.reverted'; sessionId: string; revertedTo: { messageId: string | null; messageCount: number }; removed: { messageIds: string[]; partCount: number } },
  _ctx: SessionHandlersContext,
): void {
  const { sessionId, revertedTo, removed } = msg;
  if (revertedTo.messageId === null) {
    console.log(`Session ${sessionId} cleared (all ${removed.messageIds.length} messages removed)`);
  } else {
    console.log(`Session ${sessionId} reverted to message ${revertedTo.messageId}, removed ${removed.messageIds.length} messages`);
  }
}

export function handleSessionForked(
  msg: { type: 'session.forked'; originalSessionId: string; forkedSession: Session; messages: MessageWithParts[] },
  ctx: SessionHandlersContext,
): void {
  const { forkedSession, messages: forkedMessages } = msg;
  const {
    setSessions,
    setCurrentSession,
    setSessionUsage,
    sessionAccessTimesRef,
    partIdIndexRef,
    clearCompletion,
  } = ctx;

  setSessions(prev => [forkedSession, ...prev]);
  ctx.replaceSessionContent(forkedSession.id, forkedMessages);

  partIdIndexRef.current.clear();
  for (const mwp of forkedMessages) {
    for (let i = 0; i < mwp.parts.length; i++) {
      partIdIndexRef.current.set(mwp.parts[i].id, {
        sessionId: forkedSession.id,
        messageId: mwp.message.id,
        index: i,
      });
    }
  }
  usePendingOperationsStore.getState().clearSessionOperations(msg.originalSessionId);

  setCurrentSession(forkedSession);
  ctx.navigateToSession(forkedSession.id);
  ctx.resumeSessionAfterCreate(forkedSession.id);
  setSessionUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  sessionAccessTimesRef.current.set(forkedSession.id, Date.now());
  clearCompletion(forkedSession.id);
  if (forkedSession.workspaceId) {
    invalidateSessionQueriesForWorkspace(forkedSession.workspaceId);
  }
}

export function handleSessionState(
  msg: { type: 'session.state'; sessionId: string; messages: MessageWithParts[] },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, messages } = msg;
  const {
    partIdIndexRef,
    partAppendRafRef,
    skipFinishSoundSessionIdsRef,
    removeStreamingSession,
    sessionAccessTimesRef,
    flushPendingPartAppends,
    currentSessionIdRef,
    clearCompletion,
  } = ctx;

  if (currentSessionIdRef.current === sessionId) {
    if (partAppendRafRef.current !== null) {
      cancelAnimationFrame(partAppendRafRef.current);
      partAppendRafRef.current = null;
    }
    flushPendingPartAppends();
  }

  if (currentSessionIdRef.current === sessionId) {
    ctx.replaceSessionContent(sessionId, messages);

    partIdIndexRef.current.clear();
    for (const mwp of messages) {
      for (let i = 0; i < mwp.parts.length; i++) {
        partIdIndexRef.current.set(mwp.parts[i].id, {
          sessionId: sessionId,
          messageId: mwp.message.id,
          index: i,
        });
      }
    }
  }
  skipFinishSoundSessionIdsRef.current.add(sessionId);
  removeStreamingSession(sessionId);
  sessionAccessTimesRef.current.set(sessionId, Date.now());
  clearCompletion(sessionId);

  usePendingOperationsStore.getState().clearOperation(sessionId, 'revert');
  usePendingOperationsStore.getState().clearOperation(sessionId, 'edit');
}

export const sessionHandlers = {
  'session.created': handleSessionCreated,
  'session.resumed': handleSessionResumed,
  'session.closed': handleSessionClosed,
  'session.reopened': handleSessionReopened,
  'session.deleted': handleSessionDeleted,
  'session.updated': handleSessionUpdated,
  'session.renamed': handleSessionRenamed,
  'session.interrupted': handleSessionInterrupted,
  'session.reverted': handleSessionReverted,
  'session.forked': handleSessionForked,
  'session.state': handleSessionState,
} as const;
