import type { Message, Part } from '@jean2/shared';
import type { SessionHandlersContext, SessionUsage } from './types';

export function handleMessageCreated(
  msg: { type: 'message.created'; message: Message },
  ctx: SessionHandlersContext,
): void {
  const { message } = msg;
  const {
    setMessagesBySession,
    setPartsBySession,
    addStreamingSession,
    removeInterruptedSession,
    currentSessionIdRef,
  } = ctx;

  if (message.sessionId === currentSessionIdRef.current) {
    setMessagesBySession(prev => ({
      ...prev,
      [message.sessionId]: [...(prev[message.sessionId] || []), message],
    }));
    setPartsBySession(prev => ({
      ...prev,
      [message.sessionId]: {
        ...prev[message.sessionId],
        [message.id]: [],
      },
    }));
  }

  if ('status' in message && message.status === 'streaming') {
    addStreamingSession(message.sessionId);
    removeInterruptedSession(message.sessionId);
  }
}

export function handleMessageUpdated(
  msg: { type: 'message.updated'; message: Message },
  ctx: SessionHandlersContext,
): void {
  const { message } = msg;
  const {
    setMessagesBySession,
    removeStreamingSession,
    partAppendRafRef,
    flushPendingPartAppends,
    currentSessionIdRef,
  } = ctx;

  if (message.sessionId === currentSessionIdRef.current) {
    if ('status' in message && message.status !== 'streaming') {
      if (partAppendRafRef.current !== null) {
        cancelAnimationFrame(partAppendRafRef.current);
        partAppendRafRef.current = null;
      }
      flushPendingPartAppends();
    }
    setMessagesBySession(prev => ({
      ...prev,
      [message.sessionId]: (prev[message.sessionId] || []).map(m =>
        m.id === message.id ? message : m
      ),
    }));
  }

  if ('status' in message && message.status !== 'streaming') {
    removeStreamingSession(message.sessionId);
  }
}

export function handlePartCreated(
  msg: { type: 'part.created'; sessionId: string; part: Part },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, part } = msg;
  const { setPartsBySession, partIdIndexRef, currentSessionIdRef } = ctx;

  if (sessionId === currentSessionIdRef.current) {
    setPartsBySession(prev => {
      const sessionParts = prev[sessionId] || {};
      const messageParts = sessionParts[part.messageId] || [];
      return {
        ...prev,
        [sessionId]: {
          ...sessionParts,
          [part.messageId]: [...messageParts, part],
        },
      };
    });

    let newIndex = 0;
    for (const entry of partIdIndexRef.current.values()) {
      if (entry.sessionId === sessionId && entry.messageId === part.messageId) {
        newIndex = Math.max(newIndex, entry.index + 1);
      }
    }
    partIdIndexRef.current.set(part.id, {
      sessionId,
      messageId: part.messageId,
      index: newIndex,
    });
  }
}

export function handlePartUpdated(
  msg: { type: 'part.updated'; sessionId: string; part: Part },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, part } = msg;
  const { setPartsBySession, partIdIndexRef, currentSessionIdRef } = ctx;

  if (sessionId === currentSessionIdRef.current) {
    const partLocation = partIdIndexRef.current.get(part.id);
    if (partLocation) {
      setPartsBySession(prev => {
        const sessionParts = prev[partLocation.sessionId];
        if (!sessionParts) return prev;
        const messageParts = sessionParts[partLocation.messageId];
        if (!messageParts) return prev;
        const updatedMessageParts = [...messageParts];
        updatedMessageParts[partLocation.index] = part;
        return {
          ...prev,
          [partLocation.sessionId]: {
            ...sessionParts,
            [partLocation.messageId]: updatedMessageParts,
          },
        };
      });
    } else {
      setPartsBySession(prev => {
        const sessionParts = prev[sessionId] || {};
        const messageParts = sessionParts[part.messageId] || [];
        return {
          ...prev,
          [sessionId]: {
            ...sessionParts,
            [part.messageId]: messageParts.map(p => p.id === part.id ? part : p),
          },
        };
      });
    }
  }
}

export function handlePartAppend(
  msg: { type: 'part.append'; sessionId: string; partId: string; field: 'text' | 'reasoning'; delta: string },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, partId, delta } = msg;
  const {
    addStreamingSession,
    pendingPartAppendsRef,
    partAppendRafRef,
    interruptedSessions,
    currentSessionIdRef,
    flushPendingPartAppends,
  } = ctx;

  if (!interruptedSessions.has(sessionId)) {
    addStreamingSession(sessionId);
  }

  if (sessionId === currentSessionIdRef.current) {
    const existing = pendingPartAppendsRef.current.get(partId);
    pendingPartAppendsRef.current.set(partId, (existing || '') + delta);

    if (partAppendRafRef.current === null) {
      partAppendRafRef.current = requestAnimationFrame(() => {
        flushPendingPartAppends();
      });
    }
  }
}

export function handleChatUsage(
  msg: { type: 'chat.usage'; sessionId: string; usage: SessionUsage; model: string },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, usage, model } = msg;
  const { setSessionUsage, setCurrentModel, currentSessionIdRef } = ctx;

  if (sessionId !== currentSessionIdRef.current) return;

  setSessionUsage({
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
  });
  setCurrentModel(model);
}

export function handleCompactionComplete(
  msg: { type: 'compaction.complete'; sessionId: string; tokensUsed: { prompt: number; completion: number } },
  ctx: SessionHandlersContext,
): void {
  const { sessionId } = msg;
  const { setCompactionSuccess, currentSessionIdRef } = ctx;

  if (sessionId === currentSessionIdRef.current) {
    setCompactionSuccess(true);
  }
}

export function handleError(
  msg: { type: 'error'; code: string; message: string },
  _ctx: SessionHandlersContext,
): void {
  const { code, message } = msg;
  console.error('Server error:', code, message);
}

export const messagePartHandlers = {
  'message.created': handleMessageCreated,
  'message.updated': handleMessageUpdated,
  'part.created': handlePartCreated,
  'part.updated': handlePartUpdated,
  'part.append': handlePartAppend,
  'chat.usage': handleChatUsage,
  'compaction.complete': handleCompactionComplete,
  'error': handleError,
} as const;
