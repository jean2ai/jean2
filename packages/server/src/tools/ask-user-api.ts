import type { AskUserApi, UserQuestion } from '@jean2/sdk';

interface PendingAskUser {
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
  createdAt: number;
  question: UserQuestion;
}

const pendingQuestions = new Map<string, PendingAskUser>();
const ASK_USER_TIMEOUT = 5 * 60 * 1000;

export type AskUserBroadcastFn = (message: {
  type: 'ask_user.request';
  sessionId: string;
  toolCallId: string;
  toolName: string;
  question: UserQuestion;
}) => void;

export function createAskUserApi(
  sessionId: string,
  toolCallId: string,
  toolName: string,
  broadcastFn: AskUserBroadcastFn,
): AskUserApi {
  const askUser = async (question: UserQuestion): Promise<unknown> => {
    return new Promise<unknown>((resolve, reject) => {
      broadcastFn({
        type: 'ask_user.request',
        sessionId,
        toolCallId,
        toolName,
        question,
      });

      pendingQuestions.set(toolCallId, {
        resolve,
        reject,
        createdAt: Date.now(),
        question,
      });

      setTimeout(() => {
        if (pendingQuestions.has(toolCallId)) {
          pendingQuestions.delete(toolCallId);
          reject(new Error('User did not respond in time'));
        }
      }, ASK_USER_TIMEOUT);
    });
  };

  return askUser as AskUserApi;
}

export function resolveAskUser(toolCallId: string, response: unknown): boolean {
  const pending = pendingQuestions.get(toolCallId);
  if (!pending) {
    return false;
  }

  pending.resolve(response);
  pendingQuestions.delete(toolCallId);
  return true;
}

export function rejectAskUser(toolCallId: string, error: Error): boolean {
  const pending = pendingQuestions.get(toolCallId);
  if (!pending) {
    return false;
  }

  pending.reject(error);
  pendingQuestions.delete(toolCallId);
  return true;
}

export function cleanupExpiredAskUserRequests(): void {
  const now = Date.now();
  for (const [id, pending] of pendingQuestions) {
    if (now - pending.createdAt > ASK_USER_TIMEOUT) {
      pending.reject(new Error('User did not respond in time'));
      pendingQuestions.delete(id);
    }
  }
}

export function hasPendingAskUser(toolCallId: string): boolean {
  return pendingQuestions.has(toolCallId);
}
