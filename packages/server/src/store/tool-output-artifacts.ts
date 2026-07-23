import { getDatabase } from './index';
import type { ToolOutputArtifactMetadata, ToolOutputStrategy } from '@jean2/sdk';

export interface CreateToolOutputArtifactInput {
  id: string;
  sessionId: string;
  partId: string;
  callId: string;
  toolName: string;
  strategy: ToolOutputStrategy;
  sourceHash: string;
  originalJson: string;
  modelOutputJson: string;
  originalChars: number;
  modelChars: number;
  createdAt: number;
  applied: boolean;
  compressionDurationMs: number;
}

interface ToolOutputArtifactRow {
  id: string;
  session_id: string;
  part_id: string;
  call_id: string;
  tool_name: string;
  strategy: string;
  source_hash: string;
  original_json: string;
  model_output_json: string;
  original_chars: number;
  model_chars: number;
  created_at: number;
  applied: number;
  compression_duration_ms: number;
  model_retrieval_count: number;
  user_retrieval_count: number;
  last_retrieved_at: number | null;
}

export interface ToolOutputArtifactRecord extends ToolOutputArtifactMetadata {
  originalJson: string;
  modelOutputJson: string;
}

function parseStrategy(value: string): ToolOutputStrategy {
  if (value === 'records' || value === 'paths' || value === 'logs' || value === 'preview') {
    return value;
  }
  throw new Error(`Unknown tool output strategy in artifact row: ${value}`);
}

function rowToRecord(row: ToolOutputArtifactRow): ToolOutputArtifactRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    partId: row.part_id,
    callId: row.call_id,
    toolName: row.tool_name,
    strategy: parseStrategy(row.strategy),
    sourceHash: row.source_hash,
    originalChars: row.original_chars,
    modelChars: row.model_chars,
    createdAt: row.created_at,
    applied: row.applied === 1,
    compressionDurationMs: row.compression_duration_ms,
    modelRetrievalCount: row.model_retrieval_count,
    userRetrievalCount: row.user_retrieval_count,
    lastRetrievedAt: row.last_retrieved_at,
    originalJson: row.original_json,
    modelOutputJson: row.model_output_json,
  };
}

export function createToolOutputArtifact(input: CreateToolOutputArtifactInput): ToolOutputArtifactRecord {
  const db = getDatabase();

  const tx = db.transaction((data: CreateToolOutputArtifactInput) => {
    db.run(
      `DELETE FROM tool_output_artifacts WHERE session_id = ? AND call_id = ?`,
      [data.sessionId, data.callId],
    );
    db.run(
      `INSERT INTO tool_output_artifacts (
        id, session_id, part_id, call_id, tool_name, strategy, source_hash,
        original_json, model_output_json, original_chars, model_chars,
        created_at, applied, compression_duration_ms,
        model_retrieval_count, user_retrieval_count, last_retrieved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL)`,
      [
        data.id,
        data.sessionId,
        data.partId,
        data.callId,
        data.toolName,
        data.strategy,
        data.sourceHash,
        data.originalJson,
        data.modelOutputJson,
        data.originalChars,
        data.modelChars,
        data.createdAt,
        data.applied ? 1 : 0,
        data.compressionDurationMs,
      ],
    );
  });

  tx(input);

  const record = getToolOutputArtifact(input.sessionId, input.id);
  if (!record) {
    throw new Error(`Failed to create tool output artifact ${input.id}`);
  }
  return record;
}

export function getToolOutputArtifact(
  sessionId: string,
  retrievalId: string,
): ToolOutputArtifactRecord | null {
  const db = getDatabase();
  const row = db
    .query(
      `SELECT * FROM tool_output_artifacts WHERE session_id = ? AND id = ?`,
    )
    .get(sessionId, retrievalId) as ToolOutputArtifactRow | undefined;
  if (!row) return null;
  return rowToRecord(row);
}

export function getToolOutputArtifactByCallId(
  sessionId: string,
  callId: string,
): ToolOutputArtifactRecord | null {
  const db = getDatabase();
  const row = db
    .query(
      `SELECT * FROM tool_output_artifacts WHERE session_id = ? AND call_id = ?`,
    )
    .get(sessionId, callId) as ToolOutputArtifactRow | undefined;
  if (!row) return null;
  return rowToRecord(row);
}

export function recordToolOutputRetrieval(
  sessionId: string,
  retrievalId: string,
  source: 'model' | 'user',
  retrievedAt: number,
): void {
  const db = getDatabase();
  const column = source === 'model' ? 'model_retrieval_count' : 'user_retrieval_count';
  db.run(
    `UPDATE tool_output_artifacts
     SET ${column} = ${column} + 1,
         last_retrieved_at = ?
     WHERE session_id = ? AND id = ?`,
    [retrievedAt, sessionId, retrievalId],
  );
}

export function parseArtifactJson<T = unknown>(serialized: string, context: string): T {
  try {
    return JSON.parse(serialized) as T;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Corrupt tool output artifact JSON for ${context}: ${message}`, { cause: err });
  }
}