import type { UserQuestion } from '@jean2/sdk';
import type { SessionHandlersContext } from './types';

export function handleAskUserRequest(
  msg: { type: 'ask_user.request'; sessionId: string; toolCallId: string; toolName: string; question: UserQuestion },
  ctx: SessionHandlersContext,
): void {
  const { sessionId, toolCallId, toolName, question } = msg;
  const { addPendingAskUserRequest } = ctx;

  addPendingAskUserRequest({
    toolCallId,
    sessionId,
    toolName,
    question,
  });
}

export function handleAskUserTimeout(
  msg: { type: 'ask_user.timeout'; sessionId: string; toolCallId: string },
  ctx: SessionHandlersContext,
): void {
  const { toolCallId } = msg;
  const { removePendingAskUserRequest } = ctx;
  removePendingAskUserRequest(toolCallId);
}

export const askUserHandlers = {
  'ask_user.request': handleAskUserRequest,
  'ask_user.timeout': handleAskUserTimeout,
} as const;