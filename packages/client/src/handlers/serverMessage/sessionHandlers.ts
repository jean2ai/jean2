import type { Session, MessageWithParts } from '@jean2/shared';
import type { SessionHandlersContext, SessionUsage } from './types';

export function handleSessionCreated(
  msg: { type: 'session.created'; session: Session },
  ctx: SessionHandlersContext,
): void {
  const { session } = msg;
  const {
    setSessions,
    setCurrentSession,
    setMessagesBySession,
    setPartsBySession,
    setSessionUsage,
    setCurrentModel,
    setSelectedVariant,
    pendingSessionCreateRef,
    sessionAccessTimesRef,
    defaultModel,
  } = ctx;

  setSessions(prev => [session, ...prev]);

  if (pendingSessionCreateRef.current) {
    setCurrentSession(session);
    setMessagesBySession(prev => ({
      ...prev,
      [session.id]: [],
    }));
    setPartsBySession(prev => ({
      ...prev,
      [session.id]: {},
    }));
    setSessionUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    setCurrentModel(session.selectedModel || defaultModel);
    setSelectedVariant(session.selectedVariant ?? null);
    pendingSessionCreateRef.current = false;
  }
  sessionAccessTimesRef.current.set(session.id, Date.now());
}

export function handleSessionResumed(
  msg: { type: 'session.resumed'; session: Session; messages?: MessageWithParts[]; usage?: SessionUsage; isRunning?: boolean },
  ctx: SessionHandlersContext,
): void {
  const { session, messages, usage, isRunning } = msg;
  const {
    setCurrentSession,
    removeInterruptedSession,
    addStreamingSession,
    removeStreamingSession,
    skipFinishSoundSessionIdsRef,
    setMessagesBySession,
    setPartsBySession,
    setSessionUsage,
    setCurrentModel,
    setSelectedVariant,
    sessionAccessTimesRef,
    partIdIndexRef,
    models,
    defaultModel,
  } = ctx;

  setCurrentSession(session);
  removeInterruptedSession(session.id);

  if (isRunning) {
    addStreamingSession(session.id);
  } else {
    removeStreamingSession(session.id);
    skipFinishSoundSessionIdsRef.current.add(session.id);
  }

  if (messages) {
    setMessagesBySession(prev => ({
      ...prev,
      [session.id]: messages.map(mwp => mwp.message),
    }));
    setPartsBySession(prev => {
      const newParts: Record<string, Record<string, import('@jean2/shared').Part[]>> = { ...prev };
      newParts[session.id] = {};
      for (const mwp of messages) {
        newParts[session.id][mwp.message.id] = mwp.parts;
      }
      return newParts;
    });

    for (const [partId, entry] of partIdIndexRef.current) {
      if (entry.sessionId === session.id) {
        partIdIndexRef.current.delete(partId);
      }
    }
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
}

export function handleSessionClosed(
  msg: { type: 'session.closed'; sessionId: string },
  ctx: SessionHandlersContext,
): void {
  const { sessionId } = msg;
  const {
    setSessions,
    setMessagesBySession,
    setPartsBySession,
    setCurrentSession,
    partIdIndexRef,
    partAppendRafRef,
    pendingPartAppendsRef,
    sessionAccessTimesRef,
    currentSessionIdRef,
  } = ctx;

  setSessions(prev => prev.map(s =>
    s.id === sessionId ? { ...s, status: 'closed' } : s
  ));

  if (currentSessionIdRef.current === sessionId) {
    if (partAppendRafRef.current !== null) {
      cancelAnimationFrame(partAppendRafRef.current);
      partAppendRafRef.current = null;
    }
    pendingPartAppendsRef.current.clear();
  }

  setMessagesBySession(prev => {
    const newMap = { ...prev };
    delete newMap[sessionId];
    return newMap;
  });
  setPartsBySession(prev => {
    const newMap = { ...prev };
    delete newMap[sessionId];
    return newMap;
  });

  for (const [partId, entry] of partIdIndexRef.current) {
    if (entry.sessionId === sessionId) {
      partIdIndexRef.current.delete(partId);
    }
  }
  sessionAccessTimesRef.current.delete(sessionId);
  if (currentSessionIdRef.current === sessionId) {
    setCurrentSession(null);
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
}

export function handleSessionDeleted(
  msg: { type: 'session.deleted'; sessionId: string },
  ctx: SessionHandlersContext,
): void {
  const { sessionId } = msg;
  const {
    setSessions,
    setMessagesBySession,
    setPartsBySession,
    removeInterruptedSession,
    partIdIndexRef,
    sessionAccessTimesRef,
    setCurrentSession,
    currentSessionIdRef,
  } = ctx;

  setSessions(prev => prev.filter(s => s.id !== sessionId));
  setMessagesBySession(prev => {
    const newMap = { ...prev };
    delete newMap[sessionId];
    return newMap;
  });
  setPartsBySession(prev => {
    const newMap = { ...prev };
    delete newMap[sessionId];
    return newMap;
  });
  removeInterruptedSession(sessionId);

  for (const [partId, entry] of partIdIndexRef.current) {
    if (entry.sessionId === sessionId) {
      partIdIndexRef.current.delete(partId);
    }
  }
  sessionAccessTimesRef.current.delete(sessionId);
  if (currentSessionIdRef.current === sessionId) {
    setCurrentSession(null);
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
  if (currentSessionIdRef.current === session.id) {
    setCurrentSession(session);
  }
}

export function handleSessionInterrupted(
  msg: { type: 'session.interrupted'; sessionId: string; result: { cascadedTo: string[] } },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, result } = msg;
  const { addInterruptedSession, skipFinishSoundSessionIdsRef, removeStreamingSession } = ctx;

  addInterruptedSession(sessionId);
  skipFinishSoundSessionIdsRef.current.add(sessionId);
  removeStreamingSession(sessionId);
  if (result.cascadedTo.length > 0) {
    console.log(`Session ${sessionId} interrupted. Cascaded to:`, result.cascadedTo);
  }
}

export function handleSessionReverted(
  msg: { type: 'session.reverted'; sessionId: string; revertedTo: { messageId: string; messageCount: number }; removed: { messageIds: string[]; partCount: number } },
  _ctx: SessionHandlersContext,
): void {
  const { sessionId, revertedTo, removed } = msg;
  console.log(`Session ${sessionId} reverted to message ${revertedTo.messageId}, removed ${removed.messageIds.length} messages`);
}

export function handleSessionForked(
  msg: { type: 'session.forked'; originalSessionId: string; forkedSession: Session; messages: MessageWithParts[] },
  ctx: SessionHandlersContext,
): void {
  const { forkedSession, messages: forkedMessages } = msg;
  const {
    setSessions,
    setCurrentSession,
    setMessagesBySession,
    setPartsBySession,
    setSessionUsage,
    sessionAccessTimesRef,
    partIdIndexRef,
  } = ctx;

  setSessions(prev => [forkedSession, ...prev]);
  setMessagesBySession(prev => ({
    ...prev,
    [forkedSession.id]: forkedMessages.map(mwp => mwp.message),
  }));
  setPartsBySession(prev => {
    const newParts = { ...prev };
    newParts[forkedSession.id] = {};
    for (const mwp of forkedMessages) {
      newParts[forkedSession.id][mwp.message.id] = mwp.parts;
    }
    return newParts;
  });

  for (const mwp of forkedMessages) {
    for (let i = 0; i < mwp.parts.length; i++) {
      partIdIndexRef.current.set(mwp.parts[i].id, {
        sessionId: forkedSession.id,
        messageId: mwp.message.id,
        index: i,
      });
    }
  }
  setCurrentSession(forkedSession);
  setSessionUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  sessionAccessTimesRef.current.set(forkedSession.id, Date.now());
}

export function handleSessionState(
  msg: { type: 'session.state'; sessionId: string; messages: MessageWithParts[] },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, messages } = msg;
  const {
    setMessagesBySession,
    setPartsBySession,
    partIdIndexRef,
    partAppendRafRef,
    skipFinishSoundSessionIdsRef,
    removeStreamingSession,
    sessionAccessTimesRef,
    flushPendingPartAppends,
    currentSessionIdRef,
  } = ctx;

  if (currentSessionIdRef.current === sessionId) {
    if (partAppendRafRef.current !== null) {
      cancelAnimationFrame(partAppendRafRef.current);
      partAppendRafRef.current = null;
    }
    flushPendingPartAppends();
  }

  if (currentSessionIdRef.current === sessionId) {
    setMessagesBySession(prev => ({
      ...prev,
      [sessionId]: messages.map(mwp => mwp.message),
    }));
    setPartsBySession(prev => {
      const newParts = { ...prev };
      newParts[sessionId] = {};
      for (const mwp of messages) {
        newParts[sessionId][mwp.message.id] = mwp.parts;
      }
      return newParts;
    });

    for (const [partId, entry] of partIdIndexRef.current) {
      if (entry.sessionId === sessionId) {
        partIdIndexRef.current.delete(partId);
      }
    }
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
