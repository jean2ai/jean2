import { describe, expect, test } from 'bun:test';
import {
  countSerializedChars,
  hashToolOutput,
  serializeToolOutput,
  setModelChars,
} from '@/core/tool-output/serialization';

describe('serializeToolOutput', () => {
  test('serializes plain objects deterministically', () => {
    const a = serializeToolOutput({ b: 1, a: 2 });
    expect(a).toBe('{"b":1,"a":2}');
  });

  test('throws for circular structures so callers can fail open', () => {
    const obj: Record<string, unknown> = { name: 'loop' };
    obj.self = obj;
    expect(() => serializeToolOutput(obj)).toThrow('circular');
  });

  test('allows repeated references that are not circular', () => {
    const shared = { value: 1 };
    expect(serializeToolOutput({ left: shared, right: shared })).toBe(
      '{"left":{"value":1},"right":{"value":1}}',
    );
  });

  test('rejects bigint instead of changing the original value', () => {
    expect(() => serializeToolOutput({ n: BigInt(42) })).toThrow('Unsupported bigint');
  });

  test('rejects functions and symbols instead of silently losing original data', () => {
    expect(() => serializeToolOutput({ keep: 1, drop: () => 1 })).toThrow(
      'Unsupported function',
    );
    expect(() => serializeToolOutput({ keep: 1, sym: Symbol('x') })).toThrow(
      'Unsupported symbol',
    );
  });
});

describe('setModelChars', () => {
  test('stores the size of the final serialized representation', () => {
    const value = { modelChars: 0, content: 'x'.repeat(100) };
    setModelChars(value);
    expect(value.modelChars).toBe(JSON.stringify(value).length);
  });
});

describe('hashToolOutput', () => {
  test('produces a stable sha256 prefix', () => {
    const hash = hashToolOutput('hello');
    expect(hash.startsWith('sha256:')).toBe(true);
    expect(hash).toBe(hashToolOutput('hello'));
  });

  test('changes when bytes change', () => {
    expect(hashToolOutput('hello')).not.toBe(hashToolOutput('hellp'));
  });
});

describe('countSerializedChars', () => {
  test('returns string length', () => {
    expect(countSerializedChars('hello')).toBe(5);
    expect(countSerializedChars('')).toBe(0);
  });
});