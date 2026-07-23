import { createHash } from 'node:crypto';

export function serializeToolOutput(value: unknown): string {
  const ancestors: object[] = [];

  const serializer = function serializer(
    this: unknown,
    _key: string,
    current: unknown,
  ): unknown {
    if (typeof current === 'bigint') {
      throw new TypeError('Unsupported bigint value in tool output');
    }
    if (typeof current === 'function' || typeof current === 'symbol') {
      throw new TypeError(`Unsupported ${typeof current} value in tool output`);
    }
    if (current && typeof current === 'object') {
      while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
        ancestors.pop();
      }
      if (ancestors.includes(current)) {
        throw new TypeError('Converting circular structure to JSON');
      }
      ancestors.push(current);
    }
    return current;
  };

  const result = JSON.stringify(value, serializer);
  if (result === undefined) {
    return JSON.stringify({ __unserializable: String(value) });
  }
  return result;
}

export function hashToolOutput(serialized: string): string {
  const hex = createHash('sha256').update(serialized, 'utf8').digest('hex');
  return `sha256:${hex}`;
}

export function countSerializedChars(serialized: string): number {
  return serialized.length;
}

export function setModelChars(value: { modelChars: number }): void {
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = JSON.stringify(value).length;
    if (next === value.modelChars) return;
    value.modelChars = next;
  }
}
