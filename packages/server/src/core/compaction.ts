import { generateText } from 'ai';
import { getModel } from './agent';
import {
  listMessagesWithParts,
  createPart,
  createMessage,
  markMessagesCompacted,
  getLatestCompactionSummary,
} from '@/store';
import type { MessageWithParts, CompactionPart, SystemMessage } from '@jean2/shared';
import { randomUUID } from 'crypto';

const COMPACTION_PROMPT_FIRST = `Summarize the following conversation for context continuity.

Structure your response with these sections:
- **Decisions**: Key choices made and rationale
- **Changes**: Files/functions created or modified (with paths)
- **Context**: Important state, configurations, or patterns established
- **Open items**: Unresolved issues or planned next steps

Be specific with file paths, function names, and technical details.

Conversation to summarize:

{CONVERSATION}`;

const COMPACTION_PROMPT_INCREMENTAL = `The following is a previous conversation summary, followed by new messages since that summary.

Produce an UPDATED summary that incorporates the new information. Keep it concise and structured.

Structure your response with these sections:
- **Decisions**: Key choices made and rationale
- **Changes**: Files/functions created or modified (with paths)
- **Context**: Important state, configurations, or patterns established
- **Open items**: Unresolved issues or planned next steps

Previous summary:
{PREVIOUS_SUMMARY}

New messages since that summary:
{CONVERSATION}`;

interface CompactionOptions {
  sessionId: string;
  messageIds: string[];
  modelId?: string;
  providerId?: string;
}

interface CompactionResult {
  message: SystemMessage;
  part: CompactionPart;
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

  const hasNestedCompaction = messagesToCompact.some(({ parts }) =>
    parts.some((p) => p.type === 'compaction'),
  );
  if (hasNestedCompaction) {
    throw new Error('Cannot compact messages that already contain a compaction');
  }

  const conversationText = buildConversationText(messagesToCompact);
  const previousSummary = getLatestCompactionSummary(sessionId);

  const prompt = previousSummary
    ? COMPACTION_PROMPT_INCREMENTAL
        .replace('{PREVIOUS_SUMMARY}', previousSummary)
        .replace('{CONVERSATION}', conversationText)
    : COMPACTION_PROMPT_FIRST.replace('{CONVERSATION}', conversationText);

  const model = await getModel(modelId, providerId);

  const result = await generateText({
    model,
    prompt,
    maxOutputTokens: 2000,
  });

  const summary = result.text;
  const now = Date.now();
  const msgId = randomUUID();

  const systemMessage: SystemMessage = {
    id: msgId,
    sessionId,
    role: 'system',
    createdAt: now,
  };

  const compactionPart: CompactionPart = {
    id: randomUUID(),
    messageId: msgId,
    createdAt: now,
    type: 'compaction',
    summary,
    compactedMessageIds: messageIds,
  };

  markMessagesCompacted(messageIds);
  createMessage(systemMessage);
  createPart(compactionPart, sessionId);

  return {
    message: systemMessage,
    part: compactionPart,
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
