import type { CompressedToolOutput, ToolOutputStrategy, ToolOutputReference } from '@jean2/sdk';

export interface CompressionConfig {
  minChars: number;
  targetChars: number;
  minSavingsRatio: number;
}

export interface RetrievalConfig {
  defaultLimit: number;
  maxLimit: number;
  maxChars: number;
  queryMaxChars: number;
  contextMaxLines: number;
}

export interface CompressionRuntimeConfig {
  compression: CompressionConfig;
  retrieval: RetrievalConfig;
}

export interface VisualizationInfo {
  attached: boolean;
}

export interface ParsedToolOutput {
  logical: unknown;
  visualization: unknown | undefined;
  visualizationAttached: boolean;
}

export type ToolOutputPolicy =
  | { mode: 'exact' }
  | { mode: 'records'; arrayKey: string }
  | { mode: 'paths'; arrayKey: string }
  | { mode: 'logs'; textKeys: readonly string[] }
  | { mode: 'detect-safe' };

export interface CompressionCandidate {
  strategy: ToolOutputStrategy;
  payload: CompressedToolOutput;
  /**
   * Serialized model representation bytes BEFORE the canonical envelope is wrapped.
   * Equal to `payload` serialization size; computed once.
   */
  sizeBytes: number;
}

export type CompressionFailureReason =
  | 'circular'
  | 'unserializable'
  | 'policy-miss'
  | 'below-threshold'
  | 'shape-mismatch'
  | 'no-savings';

export interface ProcessToolOutputOptions {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  mode: 'off' | 'observe' | 'active';
  config: CompressionRuntimeConfig;
  resolvePartId: () => string | null;
  idGenerator: () => string;
  now: () => number;
}

export interface ProcessToolOutputResult {
  output: unknown;
  artifactId: string | null;
  strategy: ToolOutputStrategy | null;
  applied: boolean;
  reason: CompressionFailureReason | null;
  durationMs: number;
}

export type { ToolOutputReference };