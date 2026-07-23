import { beforeEach, describe, expect, test } from 'bun:test';
import {
  setupTestDatabase,
} from '../helpers/db';
import { seedWorkspaceWithSession } from '../helpers/seed';
import {
  createToolOutputArtifact,
  getToolOutputArtifact,
  getToolOutputArtifactByCallId,
  recordToolOutputRetrieval,
  parseArtifactJson,
} from '@/store/tool-output-artifacts';
import { createPart, deleteMessage } from '@/store/messages';
import { createTestAssistantMessage, createTestToolPart } from '../helpers/factories';
import { deleteSession } from '@/store/sessions';

function makeToolPart(messageId: string, sessionId: string, callId: string, name: string) {
  return createPart(
    {
      ...createTestToolPart(messageId, { callId, name }),
      messageId,
    },
    sessionId,
  );
}

describe('tool-output-artifacts store', () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  test('round-trips original and model JSON', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(sessionId);
    const part = makeToolPart(message.id, sessionId, 'call-1', 'grep');

    const record = createToolOutputArtifact({
      id: 'j2out_a1',
      sessionId,
      partId: part.id,
      callId: 'call-1',
      toolName: 'grep',
      strategy: 'records',
      sourceHash: 'sha256:abc',
      originalJson: JSON.stringify({ matches: [1, 2, 3] }),
      modelOutputJson: JSON.stringify({ summary: 'three matches' }),
      originalChars: 100,
      modelChars: 25,
      createdAt: 1,
      applied: true,
      compressionDurationMs: 5,
    });

    expect(record.originalJson).toBe(JSON.stringify({ matches: [1, 2, 3] }));
    expect(record.modelOutputJson).toBe(JSON.stringify({ summary: 'three matches' }));
    expect(record.applied).toBe(true);
    expect(record.strategy).toBe('records');

    const fetched = getToolOutputArtifact(sessionId, record.id);
    expect(fetched?.id).toBe(record.id);
    expect(parseArtifactJson<{ matches: number[] }>(fetched!.originalJson, 'test').matches).toEqual([1, 2, 3]);
  });

  test('retrieves by call id and rejects cross-session access', () => {
    const a = seedWorkspaceWithSession();
    const b = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(a.sessionId);
    const part = makeToolPart(message.id, a.sessionId, 'call-1', 'grep');
    createToolOutputArtifact({
      id: 'j2out_a2',
      sessionId: a.sessionId,
      partId: part.id,
      callId: 'call-1',
      toolName: 'grep',
      strategy: 'records',
      sourceHash: 'sha256:abc',
      originalJson: '{}',
      modelOutputJson: '{}',
      originalChars: 2,
      modelChars: 2,
      createdAt: 1,
      applied: true,
      compressionDurationMs: 1,
    });

    expect(getToolOutputArtifactByCallId(a.sessionId, 'call-1')?.id).toBe('j2out_a2');
    expect(getToolOutputArtifact(a.sessionId, 'j2out_a2')?.id).toBe('j2out_a2');
    expect(getToolOutputArtifact(b.sessionId, 'j2out_a2')).toBeNull();
  });

  test('counters increment independently and update last_retrieved_at', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(sessionId);
    const part = makeToolPart(message.id, sessionId, 'call-1', 'grep');
    createToolOutputArtifact({
      id: 'j2out_a3',
      sessionId,
      partId: part.id,
      callId: 'call-1',
      toolName: 'grep',
      strategy: 'records',
      sourceHash: 'sha256:abc',
      originalJson: '{}',
      modelOutputJson: '{}',
      originalChars: 2,
      modelChars: 2,
      createdAt: 1,
      applied: true,
      compressionDurationMs: 1,
    });

    recordToolOutputRetrieval(sessionId, 'j2out_a3', 'user', 100);
    recordToolOutputRetrieval(sessionId, 'j2out_a3', 'user', 110);
    recordToolOutputRetrieval(sessionId, 'j2out_a3', 'model', 120);

    const record = getToolOutputArtifact(sessionId, 'j2out_a3')!;
    expect(record.userRetrievalCount).toBe(2);
    expect(record.modelRetrievalCount).toBe(1);
    expect(record.lastRetrievedAt).toBe(120);
  });

  test('replacing same call id is transactional', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(sessionId);
    const part = makeToolPart(message.id, sessionId, 'call-1', 'grep');

    createToolOutputArtifact({
      id: 'j2out_first',
      sessionId,
      partId: part.id,
      callId: 'call-1',
      toolName: 'grep',
      strategy: 'records',
      sourceHash: 'sha256:first',
      originalJson: '{}',
      modelOutputJson: '{}',
      originalChars: 2,
      modelChars: 2,
      createdAt: 1,
      applied: true,
      compressionDurationMs: 1,
    });

    createToolOutputArtifact({
      id: 'j2out_second',
      sessionId,
      partId: part.id,
      callId: 'call-1',
      toolName: 'grep',
      strategy: 'preview',
      sourceHash: 'sha256:second',
      originalJson: '{}',
      modelOutputJson: '{}',
      originalChars: 2,
      modelChars: 2,
      createdAt: 2,
      applied: true,
      compressionDurationMs: 1,
    });

    expect(getToolOutputArtifact(sessionId, 'j2out_first')).toBeNull();
    const second = getToolOutputArtifact(sessionId, 'j2out_second');
    expect(second?.sourceHash).toBe('sha256:second');
    expect(getToolOutputArtifactByCallId(sessionId, 'call-1')?.id).toBe('j2out_second');
  });

  test('part deletion cascades the artifact', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(sessionId);
    const part = makeToolPart(message.id, sessionId, 'call-1', 'grep');
    createToolOutputArtifact({
      id: 'j2out_cascade_part',
      sessionId,
      partId: part.id,
      callId: 'call-1',
      toolName: 'grep',
      strategy: 'records',
      sourceHash: 'sha256:abc',
      originalJson: '{}',
      modelOutputJson: '{}',
      originalChars: 2,
      modelChars: 2,
      createdAt: 1,
      applied: true,
      compressionDurationMs: 1,
    });
    expect(getToolOutputArtifact(sessionId, 'j2out_cascade_part')).not.toBeNull();
    deleteMessage(message.id);
    expect(getToolOutputArtifact(sessionId, 'j2out_cascade_part')).toBeNull();
  });

  test('session deletion cascades the artifact', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(sessionId);
    const part = makeToolPart(message.id, sessionId, 'call-1', 'grep');
    createToolOutputArtifact({
      id: 'j2out_cascade_session',
      sessionId,
      partId: part.id,
      callId: 'call-1',
      toolName: 'grep',
      strategy: 'records',
      sourceHash: 'sha256:abc',
      originalJson: '{}',
      modelOutputJson: '{}',
      originalChars: 2,
      modelChars: 2,
      createdAt: 1,
      applied: true,
      compressionDurationMs: 1,
    });
    expect(getToolOutputArtifact(sessionId, 'j2out_cascade_session')).not.toBeNull();
    deleteSession(sessionId);
    expect(getToolOutputArtifact(sessionId, 'j2out_cascade_session')).toBeNull();
  });

  test('parseArtifactJson throws on corrupt JSON', () => {
    expect(() => parseArtifactJson('not-json', 'test')).toThrow(/Corrupt/);
  });
});