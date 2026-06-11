import type { TextPart, ToolPart, ReasoningPart, MessageEvent } from '@jean2/sdk';
import { createPart, updatePart, getPart } from '@/store';
import { parseToolInput } from './part-utils';
import { randomUUID } from 'crypto';

const STREAM_PART_PERSIST_INTERVAL_MS = 300;

export interface StreamHandlerContext {
  messageId: string;
  sessionId: string;
  toolParts: ToolPart[];
  currentText: string;
  currentTextPartId: string | null;
  currentReasoning: string;
  currentReasoningPartId: string | null;
  yieldFn: (event: MessageEvent) => void;
}

interface StreamPersistenceState {
  persistedText: string;
  persistedReasoning: string;
  lastTextPersistedAt: number;
  lastReasoningPersistedAt: number;
}

export function createStreamHandlers(ctx: StreamHandlerContext) {
  const persistence: StreamPersistenceState = {
    persistedText: '',
    persistedReasoning: '',
    lastTextPersistedAt: 0,
    lastReasoningPersistedAt: 0,
  };

  function shouldPersist(lastPersistedAt: number): boolean {
    return Date.now() - lastPersistedAt >= STREAM_PART_PERSIST_INTERVAL_MS;
  }

  function persistText(syncFts: boolean): void {
    if (!ctx.currentTextPartId || ctx.currentText === persistence.persistedText) return;
    updatePart(ctx.currentTextPartId, { text: ctx.currentText }, { syncFts });
    persistence.persistedText = ctx.currentText;
    persistence.lastTextPersistedAt = Date.now();
  }

  function persistReasoning(syncFts: boolean): void {
    if (!ctx.currentReasoningPartId || ctx.currentReasoning === persistence.persistedReasoning) return;
    updatePart(ctx.currentReasoningPartId, { text: ctx.currentReasoning }, { syncFts });
    persistence.persistedReasoning = ctx.currentReasoning;
    persistence.lastReasoningPersistedAt = Date.now();
  }

  function resetTextState(): void {
    ctx.currentTextPartId = null;
    ctx.currentText = '';
    persistence.persistedText = '';
    persistence.lastTextPersistedAt = 0;
  }

  function resetReasoningState(): void {
    ctx.currentReasoningPartId = null;
    ctx.currentReasoning = '';
    persistence.persistedReasoning = '';
    persistence.lastReasoningPersistedAt = 0;
  }

  return {
    handleTextDelta(delta: { text: string | undefined }): void {
      const textContent = delta.text || '';
      if (textContent) {
        ctx.currentText += textContent;

        if (ctx.currentTextPartId) {
          ctx.yieldFn({ type: 'part.append', sessionId: ctx.sessionId, partId: ctx.currentTextPartId, field: 'text', delta: textContent });
          if (shouldPersist(persistence.lastTextPersistedAt)) {
            persistText(false);
          }
        } else {
          ctx.currentTextPartId = randomUUID();
          const textPart: TextPart = {
            id: ctx.currentTextPartId,
            messageId: ctx.messageId,
            createdAt: Date.now(),
            type: 'text',
            text: textContent,
          };
          ctx.yieldFn({ type: 'part.created', sessionId: ctx.sessionId, part: textPart });
          createPart(textPart, ctx.sessionId);
          persistence.persistedText = textContent;
          persistence.lastTextPersistedAt = Date.now();
        }
      }
    },

    handleReasoningDelta(delta: { text: string | undefined }): void {
      const reasoningContent = delta.text || '';
      if (reasoningContent) {
        ctx.currentReasoning += reasoningContent;

        if (ctx.currentReasoningPartId) {
          ctx.yieldFn({ type: 'part.append', sessionId: ctx.sessionId, partId: ctx.currentReasoningPartId, field: 'reasoning', delta: reasoningContent });
          if (shouldPersist(persistence.lastReasoningPersistedAt)) {
            persistReasoning(false);
          }
        } else {
          ctx.currentReasoningPartId = randomUUID();
          const reasoningPart: ReasoningPart = {
            id: ctx.currentReasoningPartId,
            messageId: ctx.messageId,
            createdAt: Date.now(),
            type: 'reasoning',
            text: reasoningContent,
          };
          ctx.yieldFn({ type: 'part.created', sessionId: ctx.sessionId, part: reasoningPart });
          createPart(reasoningPart, ctx.sessionId);
          persistence.persistedReasoning = reasoningContent;
          persistence.lastReasoningPersistedAt = Date.now();
        }
      }
    },

    handleToolCall(delta: { toolCallId: string; toolName: string; input: unknown }): void {
      this.flushPending();

      const toolPartId = randomUUID();
      const toolPart: ToolPart = {
        id: toolPartId,
        messageId: ctx.messageId,
        createdAt: Date.now(),
        type: 'tool',
        callId: delta.toolCallId,
        name: delta.toolName,
        state: {
          status: 'pending',
          input: parseToolInput(delta.input),
        },
      };
      ctx.toolParts.push(toolPart);

      ctx.yieldFn({ type: 'part.created', sessionId: ctx.sessionId, part: toolPart });
      createPart(toolPart, ctx.sessionId);

      resetTextState();
      resetReasoningState();
    },

    handleToolResult(delta: { toolCallId: string; output: unknown }): void {
      const existingToolPart = ctx.toolParts.find((tp) => tp.callId === delta.toolCallId);

      if (existingToolPart) {
        const latestPart = getPart(existingToolPart.id) as ToolPart | null;
        const latestState = latestPart?.state;

        let resultData: unknown;
        if (typeof delta.output === 'string') {
          try {
            resultData = JSON.parse(delta.output);
          } catch {
            resultData = delta.output;
          }
        } else if (delta.output && typeof delta.output === 'object' && 'value' in delta.output) {
          resultData = (delta.output as { value: unknown }).value;
        } else {
          resultData = delta.output;
        }

        const isErrorResult = !!(resultData && typeof resultData === 'object' && 'error' in resultData);

        const existingChildSessionId = latestState && 'childSessionId' in latestState
          ? latestState.childSessionId
          : undefined;

        const updatedToolPart: ToolPart = {
          ...existingToolPart,
          state: isErrorResult
            ? {
                status: 'error' as const,
                input: existingToolPart.state.input,
                error: String((resultData as { error: unknown }).error),
                startedAt: Date.now(),
                failedAt: Date.now(),
                ...(existingChildSessionId && { childSessionId: existingChildSessionId }),
              }
            : {
                status: 'completed' as const,
                input: existingToolPart.state.input,
                output: resultData,
                startedAt: Date.now(),
                completedAt: Date.now(),
                ...(existingChildSessionId && { childSessionId: existingChildSessionId }),
              },
        };

        const index = ctx.toolParts.indexOf(existingToolPart);
        if (index !== -1) {
          ctx.toolParts[index] = updatedToolPart;
        }

        ctx.yieldFn({ type: 'part.updated', sessionId: ctx.sessionId, part: updatedToolPart });
        updatePart(updatedToolPart.id, { state: updatedToolPart.state });
      }
    },

    flushPending(): void {
      persistText(true);
      persistReasoning(true);
    },
  };
}
