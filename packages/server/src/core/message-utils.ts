import type { MessageWithParts, CompactionPart } from '@jean2/shared';
import type { ModelMessage } from 'ai';
import { isTextPart, isToolPart, parseToolInput } from './part-utils';
import { stripVisualization } from '../utils/strip-visualization';

type AiSdkContent = string | Array<{
  type: 'text' | 'tool-call' | 'tool-result';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  value?: unknown;
  output?: unknown;
}>;

export async function convertToAiSdkMessages(messages: MessageWithParts[]): Promise<ModelMessage[]> {
  const result: { role: 'user' | 'assistant' | 'system' | 'tool'; content: AiSdkContent }[] = [];

  for (const msgWithParts of messages) {
    const msg = msgWithParts.message;
    const parts = msgWithParts.parts;

    const textBlocks: string[] = [];
    const toolCallBlocks: Array<{
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      input: unknown;
    }> = [];
    const toolResultBlocks: Array<{
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      output: unknown;
    }> = [];

    const hasCompactionTrigger = parts.some(p => p.type === 'compaction');

    if (msg.role === 'assistant' && msg.mode === 'compact_failed') {
      continue;
    }

    for (const part of parts) {
      if (isTextPart(part)) {
        textBlocks.push(part.text);
      } else if (part.type === 'compaction') {
        const compactionPart = part as CompactionPart;
        if (compactionPart.overflow) {
          textBlocks.push('Continue from where we left off, summarizing what we did so far.');
        } else {
          textBlocks.push('What did we do so far?');
        }
      } else if (isToolPart(part)) {
        const toolPart = part;

        toolCallBlocks.push({
          type: 'tool-call' as const,
          toolCallId: toolPart.callId,
          toolName: toolPart.name,
          input: parseToolInput(toolPart.state.input),
        });

        if (toolPart.state.status === 'completed') {
          const isCompacted = !!(toolPart.state as { compactedAt?: number }).compactedAt;
          const isSkillTool = toolPart.name === 'skill';

          if (isCompacted && !isSkillTool) {
            toolResultBlocks.push({
              type: 'tool-result' as const,
              toolCallId: toolPart.callId,
              toolName: toolPart.name,
              output: { type: 'text' as const, value: '[Old tool result content cleared]' },
            });
          } else {
            toolResultBlocks.push({
              type: 'tool-result' as const,
              toolCallId: toolPart.callId,
              toolName: toolPart.name,
              output: { type: 'json' as const, value: stripVisualization(toolPart.state.output) },
            });
          }
        } else if (toolPart.state.status === 'error') {
          toolResultBlocks.push({
            type: 'tool-result' as const,
            toolCallId: toolPart.callId,
            toolName: toolPart.name,
            output: { type: 'text' as const, value: JSON.stringify(stripVisualization({ error: toolPart.state.error })) },
          });
        }
      }
    }

    const hasText = textBlocks.length > 0;
    const hasToolCalls = toolCallBlocks.length > 0;

    const contentParts: Array<{ type: 'text' | 'tool-call'; text?: string; toolCallId?: string; toolName?: string; input?: unknown }> = [];

    if (hasText) {
      contentParts.push({ type: 'text', text: textBlocks.join('\n\n') });
    }

    for (const toolCall of toolCallBlocks) {
      contentParts.push({
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
      });
    }

    if (!hasToolCalls) {
      const content = textBlocks.join('\n\n');
      result.push({
        role: hasCompactionTrigger ? 'user' : (msg.role as 'user' | 'assistant' | 'system'),
        content,
      });
      continue;
    }

    result.push({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: contentParts,
    });

    for (const toolResult of toolResultBlocks) {
      result.push({
        role: 'tool' as const,
        content: [toolResult],
      });
    }
  }

  return result as unknown as ModelMessage[];
}
