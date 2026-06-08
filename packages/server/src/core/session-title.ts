import { generateText } from 'ai';
import type { MessageWithParts } from '@jean2/sdk';
import { getModelsConfig, findModel } from '@/config';
import { getModelWithMetadata } from '@/core/model-utils';

const DEFAULT_SESSION_TITLES = new Set(['new session', 'new']);
const MAX_CONTEXT_CHARS = 12000;

export function isDefaultSessionTitle(title: string | null | undefined): boolean {
  return DEFAULT_SESSION_TITLES.has((title ?? '').trim().toLowerCase());
}

export function hasManualSessionTitle(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.titleManuallyRenamed === true;
}

export function markManualSessionTitle(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    titleManuallyRenamed: true,
  };
}

export async function generateSessionTitle(messages: MessageWithParts[]): Promise<string | null> {
  const conversation = buildConversationText(messages);
  if (!conversation) return null;

  const config = getModelsConfig();
  const providerId = config.defaultProvider || findModel(config.defaultModel)?.providerId;
  const { model, omitMaxOutputTokens, providerOptions } = await getModelWithMetadata({
    modelId: config.defaultModel,
    providerId,
  });

  const result = await generateText({
    model,
    system: [
      'You name chat sessions.',
      'Return exactly one XML tag in this format: <title>Concise Topic</title>.',
      'The title must be a 2-6 word noun phrase, not a sentence.',
      'Return one title only; do not provide examples, alternatives, lists, or numbering.',
      'Do not explain your reasoning.',
      'Do not mention the user, assistant, conversation, prompt, or title-generation task.',
      'Do not describe what happened in third person; name the topic directly.',
      'No quotes. No trailing punctuation.',
    ].join(' '),
    prompt: `Name this chat based on its actual topic. Use a direct topic label, not third-person narration.\n\n<chat>\n${conversation}\n</chat>`,
    maxOutputTokens: omitMaxOutputTokens ? undefined : 48,
    temperature: 0.2,
    providerOptions: providerOptions as Parameters<typeof generateText>[0]['providerOptions'],
  });

  const title = normalizeTitle(result.text);
  if (title) return title;

  console.warn('[session-title] Rejected generated title, using fallback if possible:', result.text.slice(0, 200));
  return fallbackTitleFromMessages(messages);
}

function buildConversationText(messages: MessageWithParts[]): string {
  const lines: string[] = [];
  for (const item of messages) {
    const text = item.parts
      .filter(part => part.type === 'text')
      .map(part => part.text.trim())
      .filter(Boolean)
      .join('\n');
    if (!text) continue;
    lines.push(`${item.message.role}: ${text}`);
  }
  return lines.join('\n\n').slice(0, MAX_CONTEXT_CHARS).trim();
}

function normalizeTitle(value: string): string | null {
  const xmlTitle = value.match(/<title>(.*?)<\/title>/is)?.[1];
  const candidates = (xmlTitle ? [xmlTitle] : value.split('\n'))
    .map(line => line.replace(/^\s*(title|answer)\s*:\s*/i, '').trim())
    .filter(Boolean);

  if (!xmlTitle && candidates.length !== 1) return null;

  for (const candidate of candidates) {
    const title = cleanTitle(candidate);
    if (title && !isMetaTitle(title)) return title;
  }
  return null;
}

function fallbackTitleFromMessages(messages: MessageWithParts[]): string | null {
  const firstUserText = messages
    .find(item => item.message.role === 'user')
    ?.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join(' ');

  if (!firstUserText) return null;

  const cleaned = firstUserText
    .replace(/[`*_#>\-[\]()]/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  const words = cleaned
    .split(' ')
    .map(word => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
    .slice(0, 6);

  const title = cleanTitle(words.join(' '));
  return title && !isMetaTitle(title) ? title : null;
}

function cleanTitle(value: string): string | null {
  const title = value
    .trim()
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/^['"`]+|['"`.]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return title || null;
}

function isMetaTitle(title: string): boolean {
  const normalized = title.toLowerCase();
  return [
    'user just',
    'user wants',
    'user asked',
    'the user wants',
    'the user asked',
    'assistant wishes',
    'assistant helps',
    'generate a short title',
    'generate a concise',
    'conversation title',
    'this conversation',
    'the prompt',
    'i need to',
    'i should',
  ].some(phrase => normalized.includes(phrase));
}
