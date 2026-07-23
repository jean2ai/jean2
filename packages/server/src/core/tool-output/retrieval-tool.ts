import type { Tool } from 'ai';
import { jsonSchema } from 'ai';
import type { JSONSchema7 } from 'ai';
import type { RetrieveToolOutputInput, RetrieveToolOutputResponse } from '@jean2/sdk';
import { recordRetrieval, retrieveToolOutput } from './retrieve';

export interface RetrievalToolOptions {
  sessionId: string;
}

const retrievalSchema = {
  type: 'object',
  properties: {
    retrievalId: {
      type: 'string',
      description: 'Opaque artifact ID from a jean2-tool-output reference.',
    },
    query: {
      type: 'string',
      description: 'Optional case-insensitive substring filter within the exact original output.',
    },
    offset: {
      type: 'integer',
      minimum: 0,
      description: 'Zero-based item offset (after filtering). Defaults to 0.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      description: 'Maximum number of items to return.',
    },
    contextLines: {
      type: 'integer',
      minimum: 0,
      description: 'For log previews, how many context lines to keep around each match.',
    },
  },
  required: ['retrievalId'],
  additionalProperties: false,
};

export function buildRetrieveToolOutputTool(options: RetrievalToolOptions): Tool<RetrieveToolOutputInput, RetrieveToolOutputResponse> {
  return {
    description:
      'Retrieve exact omitted data from a previous Jean2 tool result. Use this before making completeness claims or when an exact omitted value is required. Returns bounded, paginated pages and supports a case-insensitive `query` filter. Read-only and bypasses compression.',
    inputSchema: jsonSchema(retrievalSchema as unknown as JSONSchema7),
    execute: async (rawInput: unknown) => {
      const input = (rawInput ?? {}) as Partial<RetrieveToolOutputInput>;
      const result = retrieveToolOutput({
        sessionId: options.sessionId,
        input: input as RetrieveToolOutputInput,
      });
      recordRetrieval(options.sessionId, result.retrievalId, 'model');
      return result;
    },
  } as Tool<RetrieveToolOutputInput, RetrieveToolOutputResponse>;
}