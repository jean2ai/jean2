// ===========================================
// Reversible Tool Output Compression Contracts
// ===========================================

export type ToolOutputStrategy = 'records' | 'paths' | 'logs' | 'preview';

export interface ToolOutputReference {
  type: 'jean2-tool-output';
  version: 1;
  retrievalId: string;
  strategy: ToolOutputStrategy;
  toolName: string;
  originalChars: number;
  modelChars: number;
  complete: false;
  message: string;
}

export interface CompressedToolOutput extends ToolOutputReference {
  summary: Record<string, unknown>;
  preserved: unknown;
}

export interface ToolOutputArtifactMetadata {
  id: string;
  sessionId: string;
  partId: string;
  callId: string;
  toolName: string;
  strategy: ToolOutputStrategy;
  sourceHash: string;
  originalChars: number;
  modelChars: number;
  createdAt: number;
  applied: boolean;
  compressionDurationMs: number;
  modelRetrievalCount: number;
  userRetrievalCount: number;
  lastRetrievedAt: number | null;
}

export interface ToolOutputOriginalResponse {
  artifact: ToolOutputArtifactMetadata;
  output: unknown;
}

export interface RetrieveToolOutputInput {
  retrievalId: string;
  query?: string;
  offset?: number;
  limit?: number;
  contextLines?: number;
}

export interface RetrieveToolOutputResponse {
  retrievalId: string;
  strategy: ToolOutputStrategy;
  query: string | null;
  offset: number;
  limit: number;
  total: number;
  returned: number;
  hasMore: boolean;
  nextOffset: number | null;
  items: unknown[];
}

// ===========================================
// Type Guard
// ===========================================

export function isToolOutputReference(value: unknown): value is ToolOutputReference {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.type !== 'jean2-tool-output') return false;
  if (record.version !== 1) return false;
  if (record.complete !== false) return false;
  if (typeof record.retrievalId !== 'string' || !/^j2out_[a-f0-9]{24}$/.test(record.retrievalId)) return false;
  if (typeof record.toolName !== 'string' || record.toolName.length === 0) return false;
  if (typeof record.originalChars !== 'number' || !Number.isFinite(record.originalChars) || record.originalChars < 0) return false;
  if (typeof record.modelChars !== 'number' || !Number.isFinite(record.modelChars) || record.modelChars < 0) return false;
  if (typeof record.message !== 'string' || record.message.length === 0) return false;
  const strategy = record.strategy;
  if (strategy !== 'records' && strategy !== 'paths' && strategy !== 'logs' && strategy !== 'preview') {
    return false;
  }
  return true;
}