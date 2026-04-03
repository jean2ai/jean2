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
    clearCompletion,
  } = ctx;

  // Clear completion state when activity happens in this session
  clearCompletion(message.sessionId);

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

  if (message.sessionId === currentSessionIdRef.current && 'status' in message && message.status === 'streaming') {
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
    partAppendTimeoutRef,
    flushPendingPartAppends,
    currentSessionIdRef,
    sessionsRef,
    setCompletion,
    chatFinishSoundEnabledRef,
    playChatFinishSound,
  } = ctx;

  if (message.sessionId === currentSessionIdRef.current) {
    if ('status' in message && message.status !== 'streaming') {
      if (partAppendRafRef.current !== null) {
        cancelAnimationFrame(partAppendRafRef.current);
        partAppendRafRef.current = null;
      }
      if (partAppendTimeoutRef.current !== null) {
        clearTimeout(partAppendTimeoutRef.current);
        partAppendTimeoutRef.current = null;
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

    const session = sessionsRef.current.find(s => s.id === message.sessionId);
    const isTopLevel = session && session.parentId === null;

    if (isTopLevel) {
      const flashStartedAt = Date.now();
      setCompletion(message.sessionId, { type: 'flash-only', flashStartedAt });
      if (chatFinishSoundEnabledRef.current) {
        playChatFinishSound();
      }
      // Only auto-switch to Free mode when the completing session is the active session
      if (message.sessionId === currentSessionIdRef.current) {
        ctx.onSessionCompleted?.();
      }
    }
  }
}

export function handlePartCreated(
  msg: { type: 'part.created'; sessionId: string; part: Part },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, part } = msg;
  const { setPartsBySession, partIdIndexRef, currentSessionIdRef, clearCompletion } = ctx;

  clearCompletion(sessionId);

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
  const { setPartsBySession, partIdIndexRef, currentSessionIdRef, clearCompletion } = ctx;

  clearCompletion(sessionId);

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
    lastPartAppendFlushAtRef,
    partAppendTimeoutRef,
    interruptedSessions,
    currentSessionIdRef,
    flushPendingPartAppends,
    clearCompletion,
  } = ctx;

  // Clear completion state when activity happens in this session
  clearCompletion(sessionId);

  if (sessionId === currentSessionIdRef.current && !interruptedSessions.has(sessionId)) {
    addStreamingSession(sessionId);
  }

  if (sessionId === currentSessionIdRef.current) {
    const existing = pendingPartAppendsRef.current.get(partId);
    pendingPartAppendsRef.current.set(partId, (existing || '') + delta);

    const now = Date.now();
    const timeSinceLastFlush = now - lastPartAppendFlushAtRef.current;
    const THROTTLE_INTERVAL = 50;

    // If within 50ms throttle window and no timeout is scheduled, schedule one
    if (timeSinceLastFlush < THROTTLE_INTERVAL) {
      if (partAppendTimeoutRef.current === null) {
        const remainingTime = THROTTLE_INTERVAL - timeSinceLastFlush;
        partAppendTimeoutRef.current = setTimeout(() => {
          partAppendTimeoutRef.current = null;
          // Only schedule RAF if none pending (avoid double-scheduling)
          if (partAppendRafRef.current === null) {
            partAppendRafRef.current = requestAnimationFrame(() => {
              flushPendingPartAppends();
            });
          }
        }, remainingTime) as unknown as number;
      }
    } else {
      // Outside throttle window, schedule RAF if none pending
      if (partAppendRafRef.current === null) {
        partAppendRafRef.current = requestAnimationFrame(() => {
          flushPendingPartAppends();
        });
      }
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
