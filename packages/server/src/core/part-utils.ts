import type { TextPart, ToolPart, StepPart, Part, ImagePart, FilePart } from '@jean2/shared';
import { randomUUID } from 'crypto';

export function isTextPart(part: Part): part is TextPart {
  return part.type === 'text';
}

export function isToolPart(part: Part): part is ToolPart {
  return part.type === 'tool';
}

export function isImagePart(part: Part): part is ImagePart {
  return part.type === 'image';
}

export function isFilePart(part: Part): part is FilePart {
  return part.type === 'file';
}

export function parseToolInput(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined) {
    return {};
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof input === 'object' ? input as Record<string, unknown> : {};
}

export function createStepPart(options: {
  messageId: string;
  sessionId: string;
  number: number;
  status: 'started' | 'finished';
  finishReason?: 'stop' | 'tool-calls' | 'error' | 'length';
  tokens?: { prompt: number; completion: number };
  cost?: number;
  snapshot?: string;
}): StepPart {
  return {
    id: randomUUID(),
    messageId: options.messageId,
    createdAt: Date.now(),
    type: 'step',
    number: options.number,
    status: options.status,
    ...(options.finishReason && { finishReason: options.finishReason }),
    ...(options.tokens && { tokens: options.tokens }),
    ...(options.cost !== undefined && { cost: options.cost }),
    ...(options.snapshot && { snapshot: options.snapshot }),
  };
}
