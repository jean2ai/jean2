import type { CompressedToolOutput } from '@jean2/sdk';
import type { CompressionConfig } from './types';
import { setModelChars } from './serialization';

const MIN_PATHS = 100;
const HEAD = 25;
const TAIL = 25;
const SPACED = 20;

export interface PathsCompressionInput {
  paths: string[];
  config: CompressionConfig;
  toolName: string;
  retrievalId: string;
  arrayKey: string;
  originalChars: number;
}

export interface PathsCompressionResult {
  payload: CompressedToolOutput;
}

const TOP_DIR_LIMIT = 20;
const EXT_LIMIT = 20;

interface Aggregate {
  key: string;
  count: number;
}

function aggregateByKey(paths: string[], selector: (p: string) => string | null): Aggregate[] {
  const map = new Map<string, number>();
  for (const p of paths) {
    const key = selector(p);
    if (key === null) {
      continue;
    }
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const out: Aggregate[] = [];
  for (const [key, count] of map) {
    out.push({ key, count });
  }
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return 0;
  });
  return out;
}

function topLevelDir(path: string): string {
  const idx = path.indexOf('/');
  return idx === -1 ? path : path.slice(0, idx) || '/';
}

function extension(path: string): string | null {
  const idx = path.lastIndexOf('/');
  const base = idx === -1 ? path : path.slice(idx + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1);
  return ext.length > 0 ? ext.toLowerCase() : null;
}

function spacedSampleIndices(length: number, count: number): number[] {
  if (length === 0 || count <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, index) => index);
  if (count === 1) return [0];
  const step = (length - 1) / (count - 1);
  return Array.from({ length: count }, (_, index) => Math.round(index * step));
}

export function compressPaths({
  paths,
  config,
  toolName,
  retrievalId,
  arrayKey,
  originalChars,
}: PathsCompressionInput): PathsCompressionResult | null {
  if (paths.length < MIN_PATHS) return null;
  if (!paths.every(p => typeof p === 'string')) return null;
  if (originalChars <= config.minChars) return null;

  const total = paths.length;
  const head = paths.slice(0, HEAD);
  const tail = paths.slice(total - TAIL);
  const remainingStart = head.length;
  const remainingLength = Math.max(0, total - head.length - tail.length);
  const spacedIndices = spacedSampleIndices(remainingLength, SPACED)
    .map(index => remainingStart + index);

  const dedup = new Set<number>();
  const items: Array<{ index: number; path: string; reason: string }> = [];

  for (let i = 0; i < head.length; i++) {
    if (dedup.has(i)) continue;
    dedup.add(i);
    items.push({ index: i, path: head[i], reason: 'head' });
  }
  for (let i = total - tail.length; i < total; i++) {
    if (dedup.has(i)) continue;
    dedup.add(i);
    items.push({ index: i, path: paths[i], reason: 'tail' });
  }
  for (const index of spacedIndices) {
    if (dedup.has(index)) continue;
    dedup.add(index);
    items.push({ index, path: paths[index], reason: 'spaced' });
  }
  items.sort((a, b) => a.index - b.index);

  const dirAggs = aggregateByKey(paths, topLevelDir).slice(0, TOP_DIR_LIMIT);
  const extAggs = aggregateByKey(paths, extension).slice(0, EXT_LIMIT);
  const withoutExtension = paths.reduce((acc, p) => acc + (extension(p) === null ? 1 : 0), 0);

  const omitted = total - dedup.size;

  const payload: CompressedToolOutput = {
    type: 'jean2-tool-output',
    version: 1,
    retrievalId,
    strategy: 'paths',
    toolName,
    originalChars,
    modelChars: 0,
    complete: false,
    message:
      'Incomplete tool output. Call retrieve_tool_output before making completeness claims or when exact omitted values are needed.',
    summary: {
      arrayKey,
      totalItems: total,
      shownItems: dedup.size,
      omittedItems: omitted,
      topDirs: dirAggs,
      topExtensions: extAggs,
      withoutExtensionCount: withoutExtension,
      selectionReasons: countReasons(items),
    },
    preserved: { items },
  };

  setModelChars(payload);
  return { payload };
}

function countReasons(items: Array<{ reason: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1;
  }
  return counts;
}