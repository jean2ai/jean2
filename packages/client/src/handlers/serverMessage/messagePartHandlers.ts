import type { Message, Part, ToolPart } from '@jean2/sdk';
import type { SessionHandlersContext, SessionUsage } from './types';
import { queryClient } from '@/components/providers/QueryProvider';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';
import { usePendingOperationsStore } from '@/stores/pendingOperationsStore';

const FILE_MUTATING_TOOLS = new Set([
  'edit', 'multiedit', 'write-file', 'apply-patch', 'shell',
]);

const SCHEDULER_TOOLS = new Set(['scheduler']);

function invalidateFileQueries(): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.files.browsePrefix });
  queryClient.invalidateQueries({ queryKey: queryKeys.files.searchPrefix });
  queryClient.invalidateQueries({ queryKey: queryKeys.files.gitStatusPrefix });
}

function invalidateSchedulerQueries(): void {
  queryClient.invalidateQueries({ queryKey: ['scheduledJobs'] });
}

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
      const isError = 'error' in message && message.status === 'error';
      const flashStartedAt = Date.now();
      setCompletion(message.sessionId, { type: 'flash-only', flashStartedAt });
      if (!isError && chatFinishSoundEnabledRef.current) {
        playChatFinishSound();
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

  if (part.type === 'tool') {
    const toolPart = part as ToolPart;
    if (
      FILE_MUTATING_TOOLS.has(toolPart.name) &&
      (toolPart.state.status === 'completed' ||
        toolPart.state.status === 'error' ||
        toolPart.state.status === 'interrupted')
    ) {
      invalidateFileQueries();
    }
    if (
      SCHEDULER_TOOLS.has(toolPart.name) &&
      (toolPart.state.status === 'completed' ||
        toolPart.state.status === 'error' ||
        toolPart.state.status === 'interrupted')
    ) {
      invalidateSchedulerQueries();
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

    // Flush on next animation frame — no throttle batching.
    // Per-token updates produce smaller DOM changes, reducing visible content shift
    // during streaming in free-look mode.
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

  usePendingOperationsStore.getState().clearOperation(sessionId, 'compact');

  if (sessionId === currentSessionIdRef.current) {
    setCompactionSuccess(true);
  }
}

export function handleError(
  msg: { type: 'error'; code: string; message: string; sessionId?: string },
  _ctx: SessionHandlersContext,
): void {
  console.error('Server error:', msg.code, msg.message);

  if (msg.sessionId) {
    const pendingOps = usePendingOperationsStore.getState().getSessionPendingOperations(msg.sessionId);
    if (pendingOps.length > 0) {
      const ERROR_CODE_LABELS: Record<string, string> = {
        fork_error: 'Fork',
        revert_error: 'Revert',
        edit_error: 'Edit',
        compaction_error: 'Compact',
        title_generation_error: 'Title generation',
        delete_error: 'Delete',
        rename_error: 'Rename',
      };
      const label = ERROR_CODE_LABELS[msg.code] ?? 'Operation';
      toast.error(`${label} failed`, { description: msg.message });
      usePendingOperationsStore.getState().clearSessionOperations(msg.sessionId);
    } else {
      toast.error(msg.message);
    }
  } else {
    toast.error(msg.message);
  }
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
