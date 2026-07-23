import type { CompressedToolOutput } from '@jean2/sdk';
import type { CompressionConfig } from './types';
import { setModelChars } from './serialization';

const DEFAULT_PREVIEW_MESSAGE =
  'Output was truncated by size. The full original output is stored and can be retrieved via retrieve_tool_output.';

export interface DurablePreviewInput {
  serialized: string;
  config: CompressionConfig;
  toolName: string;
  retrievalId: string;
}

export interface DurablePreviewResult {
  payload: CompressedToolOutput;
  previewChars: number;
}

export function buildDurablePreview({
  serialized,
  config,
  toolName,
  retrievalId,
}: DurablePreviewInput): DurablePreviewResult {
  const budget = Math.max(256, config.targetChars - 256);
  const previewChars = Math.min(serialized.length, budget);
  const previewText = serialized.slice(0, previewChars);

  const payload: CompressedToolOutput = {
    type: 'jean2-tool-output',
    version: 1,
    retrievalId,
    strategy: 'preview',
    toolName,
    originalChars: serialized.length,
    modelChars: 0,
    complete: false,
    message: DEFAULT_PREVIEW_MESSAGE,
    summary: {
      previewLength: previewText.length,
      totalLength: serialized.length,
    },
    preserved: {
      preview: previewText,
    },
  };

  setModelChars(payload);

  return { payload, previewChars };
}