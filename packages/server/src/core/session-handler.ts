import type { ServerWebSocket } from 'bun';
import {
  getSession,
  listMessagesWithParts,
} from '@/store';
import { executeCompaction } from '@/core/compaction-executor';
import { revertToStep } from '@/core/revert';
import { forkSession } from '@/core/fork';
import type { RouterContext } from './router-context';

export async function handleSessionCompact(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: { sessionId: string; messageIds?: string[] },
): Promise<void> {
  const session = getSession(msg.sessionId);
  if (!session) {
    ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found', sessionId: msg.sessionId });
    return;
  }

  const execResult = await executeCompaction(msg.sessionId, 'manual');

  if (execResult.ok) {
    ctx.send(ws, {
      type: 'compaction.complete',
      sessionId: msg.sessionId,
      tokensUsed: execResult.result.tokensUsed,
    });
  } else {
    if (execResult.skipped) {
      ctx.send(ws, { type: 'error', code: 'invalid_session', message: execResult.error, sessionId: msg.sessionId });
    } else {
      ctx.send(ws, { type: 'error', code: 'compaction_error', message: execResult.error, sessionId: msg.sessionId });
    }
  }
}

export async function handleSessionRevert(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: { sessionId: string; messageId: string },
): Promise<void> {
  try {
    const session = getSession(msg.sessionId);
    if (!session) {
      ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found', sessionId: msg.sessionId });
      return;
    }

    const result = await revertToStep({
      sessionId: msg.sessionId,
      targetMessageId: msg.messageId,
    });

    ctx.broadcastToSession(msg.sessionId, {
      type: 'session.reverted',
      sessionId: msg.sessionId,
      revertedTo: result.revertedTo,
      removed: result.removed,
    });

    const currentState = listMessagesWithParts(msg.sessionId);
    ctx.broadcastToSession(msg.sessionId, {
      type: 'session.state',
      sessionId: msg.sessionId,
      messages: currentState,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Revert failed';
    ctx.send(ws, { type: 'error', code: 'revert_error', message, sessionId: msg.sessionId });
  }
}

export async function handleSessionFork(
  ctx: RouterContext,
  ws: ServerWebSocket,
  msg: { sessionId: string; messageId: string; title?: string },
): Promise<void> {
  try {
    const session = getSession(msg.sessionId);
    if (!session) {
      ctx.send(ws, { type: 'error', code: 'not_found', message: 'Session not found', sessionId: msg.sessionId });
      return;
    }

    const result = await forkSession({
      sessionId: msg.sessionId,
      targetMessageId: msg.messageId,
      title: msg.title,
    });

    ctx.broadcastToSession(msg.sessionId, {
      type: 'session.forked',
      originalSessionId: msg.sessionId,
      forkedSession: result.forkedSession,
      messages: result.messages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fork failed';
    ctx.send(ws, { type: 'error', code: 'fork_error', message, sessionId: msg.sessionId });
  }
}
