import { randomUUID } from 'crypto';
import type { MessageWithParts, Part, TextPart, Preconfig, UserMessage } from '@jean2/shared';
import { listMessages as storeListMessages, createPart, createMessage, updateMessage, getSession, updateSession } from '@/store';
import { broadcastEvent } from './broadcast';
import { getLLMSubagentMaxSteps } from '../env';
import { createPermissionRequestHandler } from '@/index';
import { streamChatWithRetry } from './retry';

export async function executeChildSession(options: {
  parentSessionId: string;
  childSessionId: string;
  preconfig: Preconfig;
  prompt: string;
  workspacePath?: string;
  workspaceId?: string;
  resumeFromHistory?: boolean;
  modelId?: string | null;
  providerId?: string | null;
  variant?: string | null;
}): Promise<{
  parts: Part[];
  error?: string;
}> {
  const { childSessionId, preconfig, prompt, workspacePath, workspaceId, resumeFromHistory, modelId, providerId, variant } = options;

  let messages: MessageWithParts[];

  if (resumeFromHistory) {
    const existingMessages = storeListMessages(childSessionId);
    messages = existingMessages.map((msg) => ({
      message: msg,
      parts: [],
    }));

    const newMsgId = randomUUID();
    const newMessage: UserMessage = {
      id: newMsgId,
      sessionId: childSessionId,
      role: 'user',
      createdAt: Date.now(),
    };
    const textPart: TextPart = {
      id: randomUUID(),
      messageId: newMsgId,
      createdAt: Date.now(),
      type: 'text',
      text: prompt,
    };
    messages.push({ message: newMessage, parts: [textPart] });
    createPart(textPart, childSessionId);
  } else {
    const msgId = randomUUID();
    const userMessage: UserMessage = {
      id: msgId,
      sessionId: childSessionId,
      role: 'user',
      createdAt: Date.now(),
    };
    const textPart: TextPart = {
      id: randomUUID(),
      messageId: msgId,
      createdAt: Date.now(),
      type: 'text',
      text: prompt,
    };
    messages = [{ message: userMessage, parts: [textPart] }];
    createPart(textPart, childSessionId);
  }

  const userMessage = messages[messages.length - 1].message;
  createMessage(userMessage);

  const finalParts: Part[] = [];
  let error: string | undefined;

  try {
    for await (const event of streamChatWithRetry({
      sessionId: childSessionId,
      preconfig,
      messages,
      workspacePath,
      workspaceId,
      modelId: modelId ?? undefined,
      providerId: providerId ?? undefined,
      variant: variant ?? undefined,
      maxSteps: getLLMSubagentMaxSteps(),
      onPermissionRequest: createPermissionRequestHandler(childSessionId),
    })) {
    if (event.type === 'message.created') {
      broadcastEvent(event);
    } else if (event.type === 'part.created') {
      finalParts.push(event.part);
      broadcastEvent(event);
    } else if (event.type === 'part.append' && event.field === 'text') {
      const part = finalParts.find(p => p.id === event.partId);
      if (part && part.type === 'text') {
        part.text = (part.text || '') + event.delta;
      }
      broadcastEvent(event);
    } else if (event.type === 'part.updated') {
      broadcastEvent(event);
    } else if (event.type === 'message.updated' && event.message.role === 'assistant') {
      updateMessage(event.message.id, event.message);
      broadcastEvent(event);
    } else if (event.type === 'usage') {
      const currentSession = getSession(childSessionId);
      if (currentSession) {
        updateSession(childSessionId, {
          promptTokens: event.usage.promptTokens,
          completionTokens: event.usage.completionTokens,
          totalTokens: event.usage.totalTokens,
        });
      }
      broadcastEvent({
        type: 'chat.usage',
        sessionId: childSessionId,
        usage: event.usage,
        model: event.model,
        variant: event.variant ?? undefined,
      });
    } else if (event.type === 'error.rate_limit') {
      console.warn(`[Child Session ${childSessionId}] Rate limited, retrying in ${event.retryAfterMs}ms...`);
    } else if (event.type === 'error.server') {
      console.warn(`[Child Session ${childSessionId}] Server error: ${event.message}`);
    } else if (event.type === 'error.timeout') {
      console.warn(`[Child Session ${childSessionId}] Timeout: ${event.message}`);
    } else if (event.type === 'error' || event.type === 'error.auth' || event.type === 'error.invalid_request') {
      const errMsg = event.message;
      if (!error) {
        error = errMsg;
      }
      console.error(`[Child Session ${childSessionId}] ${event.type}: ${errMsg}`);
    }
    }
  } catch (err) {
    const { classifyApiError } = await import('@/utils/errors');
    const classified = classifyApiError(err);
    error = classified.message;

    if (classified.retryable) {
      console.error(`[Child Session ${childSessionId}] Retryable error (${classified.type}): ${classified.message}`);
    } else {
      console.error(`[Child Session ${childSessionId}] Non-retryable error (${classified.type}): ${classified.message}`);
    }
  }

  return {
    parts: finalParts,
    error,
  };
}
