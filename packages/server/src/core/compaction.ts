import { generateText } from 'ai';
import { getModel } from './agent';
import {
  listMessagesWithParts,
  createPart,
} from '@/store';
import type { MessageWithParts, CompactionPart } from '@jean2/shared';
import { randomUUID } from 'crypto';

const COMPACTION_PROMPT = `Summarize the following conversation history. Focus on:
1. Key decisions made
2. Files created/modified
3. Important context for continuing the conversation
4. Any unresolved issues or next steps

Be concise but comprehensive. The summary should allow someone to continue working without reading the full history.

Conversation to summarize:

{CONVERSATION}

Provide a clear, structured summary:`;

interface CompactionOptions {
  sessionId: string;
  messageIds: string[];
  modelId?: string;
  providerId?: string;
}

interface CompactionResult {
  compactionPart: CompactionPart;
  tokensUsed: {
    prompt: number;
    completion: number;
  };
}

export async function compactMessages(
  options: CompactionOptions,
): Promise<CompactionResult> {
  const { sessionId, messageIds, modelId, providerId } = options;

  const allMessages = listMessagesWithParts(sessionId);
  const messagesToCompact = allMessages.filter((m) =>
    messageIds.includes(m.message.id),
  );

  if (messagesToCompact.length === 0) {
    throw new Error('No messages to compact');
  }

  const conversationText = buildConversationText(messagesToCompact);

  const model = await getModel(modelId || 'gpt-4o-mini', providerId);

  const result = await generateText({
    model,
    prompt: COMPACTION_PROMPT.replace('{CONVERSATION}', conversationText),
    maxOutputTokens: 2000,
  });

  const summary = result.text;

  const lastCompactedIndex = allMessages.findIndex((m) =>
    m.message.id === messageIds[messageIds.length - 1],
  );

  if (
    lastCompactedIndex === -1 ||
    lastCompactedIndex >= allMessages.length - 1
  ) {
    throw new Error(
      'Cannot compact all messages - need at least one to attach summary to',
    );
  }

  const targetMessage = allMessages[lastCompactedIndex + 1];

  const compactionPart: CompactionPart = {
    id: randomUUID(),
    messageId: targetMessage.message.id,
    createdAt: Date.now(),
    type: 'compaction',
    summary,
    compactedMessageIds: messageIds,
  };

  createPart(compactionPart, sessionId);

  return {
    compactionPart,
    tokensUsed: {
      prompt: result.usage.inputTokens ?? 0,
      completion: result.usage.outputTokens ?? 0,
    },
  };
}

function buildConversationText(messages: MessageWithParts[]): string {
  const lines: string[] = [];

  for (const { message, parts } of messages) {
    if (message.role === 'system') continue;

    lines.push(`\n--- ${message.role.toUpperCase()} ---`);

    for (const part of parts) {
      if (part.type === 'text') {
        lines.push(part.text);
      } else if (part.type === 'tool') {
        lines.push(`\n[TOOL: ${part.name}]`);
        lines.push(`Input: ${JSON.stringify(part.state.input, null, 2)}`);
        if (part.state.status === 'completed') {
          lines.push(`Output: ${formatOutput(part.state.output)}`);
        } else if (part.state.status === 'error') {
          lines.push(`Error: ${part.state.error}`);
        }
      }
    }
  }

  return lines.join('\n');
}

function formatOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output.length > 500
      ? output.slice(0, 500) + '...(truncated)'
      : output;
  }
  const str = JSON.stringify(output, null, 2);
  return str.length > 500 ? str.slice(0, 500) + '...(truncated)' : str;
}
