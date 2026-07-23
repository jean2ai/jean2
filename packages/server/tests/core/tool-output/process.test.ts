import { beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDatabase } from '../../helpers/db';
import { seedWorkspaceWithSession } from '../../helpers/seed';
import { processToolOutput, resolvePartIdForCallId } from '@/core/tool-output/process';
import { createPart } from '@/store/messages';
import { createTestAssistantMessage, createTestToolPart } from '../../helpers/factories';
import { getToolOutputArtifact } from '@/store/tool-output-artifacts';
import type { CompressionRuntimeConfig } from '@/core/tool-output/types';

const baseConfig: CompressionRuntimeConfig = {
  compression: { minChars: 100, targetChars: 1000, minSavingsRatio: 0.2 },
  retrieval: { defaultLimit: 50, maxLimit: 200, maxChars: 20000, queryMaxChars: 500, contextMaxLines: 5 },
};

describe('processToolOutput', () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  function makeContext(toolName: string, sessionId: string, callId: string) {
    return {
      sessionId,
      toolCallId: callId,
      toolName,
      mode: 'active' as const,
      config: baseConfig,
      resolvePartId: () => resolvePartIdForCallId(sessionId, callId),
      idGenerator: () => 'j2out_test',
      now: () => 100,
    };
  }

  test('passes through retrieval tool unchanged', () => {
    const original = { ok: true };
    const result = processToolOutput(original, makeContext('retrieve_tool_output', 's', 'c'));
    expect(result.output).toEqual(original);
    expect(result.artifactId).toBeNull();
    expect(result.applied).toBe(false);
  });

  test('exact tools pass through when below threshold', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const original = { content: 'short text' };
    const result = processToolOutput(original, makeContext('read-file', sessionId, 'c1'));
    expect(result.output).toEqual(original);
    expect(result.artifactId).toBeNull();
  });

  test('exact tools fall back to durable preview when oversized', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(sessionId);
    createPart(
      { ...createTestToolPart(message.id, { callId: 'c1', name: 'read-file' }), messageId: message.id },
      sessionId,
    );
    const big = 'x'.repeat(60_000);
    const original = { content: big };
    const result = processToolOutput(original, makeContext('read-file', sessionId, 'c1'));
    expect(result.artifactId).toBe('j2out_test');
    expect(result.strategy).toBe('preview');
    expect(result.applied).toBe(true);
    expect(getToolOutputArtifact(sessionId, 'j2out_test')).not.toBeNull();
  });

  test('records strategy applies when eligible', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(sessionId);
    createPart(
      { ...createTestToolPart(message.id, { callId: 'c1', name: 'grep' }), messageId: message.id },
      sessionId,
    );
    const matches = Array.from({ length: 50 }, (_, i) => ({
      file: `f${i}.ts`,
      status: 'ok',
    }));
    const original = { matches };
    const result = processToolOutput(original, makeContext('grep', sessionId, 'c1'));
    expect(result.applied).toBe(true);
    expect(result.strategy).toBe('records');
  });

  test('returns original when savings gate fails', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(sessionId);
    createPart(
      { ...createTestToolPart(message.id, { callId: 'c1', name: 'grep' }), messageId: message.id },
      sessionId,
    );
    const matches = Array.from({ length: 33 }, (_, i) => ({ file: `f${i}` }));
    const original = { matches };
    const result = processToolOutput(original, {
      ...makeContext('grep', sessionId, 'c1'),
      config: {
        compression: { minChars: 0, targetChars: 100_000, minSavingsRatio: 0.99 },
        retrieval: baseConfig.retrieval,
      },
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('no-savings');
    expect(result.output).toEqual(original);
  });

  test('observe mode persists candidate without changing model output', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(sessionId);
    createPart(
      { ...createTestToolPart(message.id, { callId: 'c1', name: 'grep' }), messageId: message.id },
      sessionId,
    );
    const matches = Array.from({ length: 50 }, (_, i) => ({ file: `f${i}.ts` }));
    const original = { matches };
    const result = processToolOutput(original, { ...makeContext('grep', sessionId, 'c1'), mode: 'observe' });
    expect(result.applied).toBe(false);
    expect(result.artifactId).not.toBeNull();
    expect(getToolOutputArtifact(sessionId, result.artifactId!)).not.toBeNull();
  });

  test('off mode never compresses but still falls back to preview for oversized exact tools', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(sessionId);
    createPart(
      { ...createTestToolPart(message.id, { callId: 'c1', name: 'read-file' }), messageId: message.id },
      sessionId,
    );
    const big = 'y'.repeat(60_000);
    const original = { content: big };
    const result = processToolOutput(original, { ...makeContext('read-file', sessionId, 'c1'), mode: 'off' });
    expect(result.artifactId).toBe('j2out_test');
    expect(result.applied).toBe(true);
  });

  test('preserves _visualization across compression', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(sessionId);
    createPart(
      { ...createTestToolPart(message.id, { callId: 'c1', name: 'grep' }), messageId: message.id },
      sessionId,
    );
    const matches = Array.from({ length: 50 }, (_, i) => ({ file: `f${i}.ts` }));
    const original = {
      matches,
      _visualization: { kind: 'table', columns: ['file'] },
    };
    const result = processToolOutput(original, makeContext('grep', sessionId, 'c1'));
    const outputRecord = result.output as Record<string, unknown>;
    expect(outputRecord._visualization).toEqual({ kind: 'table', columns: ['file'] });
  });

  test('without part id returns fallback with applied=false', () => {
    const result = processToolOutput(
      { matches: Array.from({ length: 50 }, (_, i) => ({ file: `f${i}` })) },
      { ...makeContext('grep', 's', 'c'), resolvePartId: () => null },
    );
    expect(result.artifactId).toBeNull();
    expect(result.applied).toBe(false);
    expect(result.output).toEqual({
      matches: Array.from({ length: 50 }, (_, i) => ({ file: `f${i}` })),
    });
  });

  test('active mode structurally compresses eligible oversized records', () => {
    const { sessionId } = seedWorkspaceWithSession();
    const message = createTestAssistantMessage(sessionId);
    createPart(
      { ...createTestToolPart(message.id, { callId: 'c1', name: 'grep' }), messageId: message.id },
      sessionId,
    );
    const matches = Array.from({ length: 500 }, (_, i) => ({
      file: `src/very-long-directory-name/file-${i}.ts`,
      line: i,
      text: 'matching source text '.repeat(8),
      status: 'ok',
    }));

    const result = processToolOutput({ matches }, makeContext('grep', sessionId, 'c1'));

    expect(result.strategy).toBe('records');
    expect(result.applied).toBe(true);
  });

  test('circular structures fail open and return the original output', () => {
    const obj: Record<string, unknown> = { name: 'loop' };
    obj.self = obj;
    const result = processToolOutput(obj, makeContext('grep', 's', 'c'));
    expect(result.output).toBe(obj);
    expect(result.reason).toBe('circular');
  });
});