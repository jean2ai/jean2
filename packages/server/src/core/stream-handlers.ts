import type { TextPart, ToolPart, ReasoningPart, MessageEvent } from '@jean2/shared';
import { createPart, updatePart, getPart } from '@/store';
import { parseToolInput } from './part-utils';
import { randomUUID } from 'crypto';

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

export function createStreamHandlers(ctx: StreamHandlerContext) {
  return {
    handleTextDelta(delta: { text: string | undefined }): void {
      const textContent = delta.text || '';
      if (textContent) {
        ctx.currentText += textContent;

        if (ctx.currentTextPartId) {
          ctx.yieldFn({ type: 'part.append', sessionId: ctx.sessionId, partId: ctx.currentTextPartId, field: 'text', delta: textContent });
          updatePart(ctx.currentTextPartId, { text: ctx.currentText });
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
        }
      }
    },

    handleReasoningDelta(delta: { text: string | undefined }): void {
      const reasoningContent = delta.text || '';
      if (reasoningContent) {
        ctx.currentReasoning += reasoningContent;

        if (ctx.currentReasoningPartId) {
          ctx.yieldFn({ type: 'part.append', sessionId: ctx.sessionId, partId: ctx.currentReasoningPartId, field: 'reasoning', delta: reasoningContent });
          updatePart(ctx.currentReasoningPartId, { text: ctx.currentReasoning });
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
        }
      }
    },

    handleToolCall(delta: { toolCallId: string; toolName: string; input: unknown }): void {
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

      ctx.currentTextPartId = null;
      ctx.currentText = '';
      ctx.currentReasoningPartId = null;
      ctx.currentReasoning = '';
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
  };
}
