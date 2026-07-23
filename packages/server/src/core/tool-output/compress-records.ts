import type { CompressedToolOutput } from '@jean2/sdk';
import type { CompressionConfig } from './types';
import { setModelChars } from './serialization';

const MIN_ITEMS = 32;
const HEAD = 5;
const TAIL = 5;
const MAX_RARE_CATEGORICAL = 10;
const NUMERIC_FIELDS_LIMIT = 20;
const MAX_SPACED_SAMPLES = 20;

const ERROR_TERMS = ['error', 'exception', 'failed', 'failure', 'fatal', 'critical', 'denied'];
const STATUS_LIKE_FIELDS = ['status', 'state', 'type', 'kind', 'severity'];
const FAILURE_VALUES = new Set(['error', 'failed', 'failure', 'fatal', 'critical', 'denied', 'invalid']);

const META_BUDGET = 1000;

export interface RecordsCompressionInput {
  output: Record<string, unknown>;
  arrayKey: string;
  config: CompressionConfig;
  toolName: string;
  retrievalId: string;
  originalChars: number;
}

export interface RecordsCompressionResult {
  payload: CompressedToolOutput;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBinaryLike(value: unknown): boolean {
  if (typeof value === 'string') {
    if (value.length > 4096 && /^[A-Za-z0-9+/=]+$/.test(value)) {
      const head = value.slice(0, 128);
      const base64ish = /^[A-Za-z0-9+/=]+$/.test(head);
      if (base64ish) return true;
    }
    return /^data:[^;]+;base64,/.test(value);
  }
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return true;
  return false;
}

function findRecordArrays(output: Record<string, unknown>): Array<{ key: string; items: Array<Record<string, unknown>> }> {
  const out: Array<{ key: string; items: Array<Record<string, unknown>> }> = [];
  for (const [key, value] of Object.entries(output)) {
    if (!Array.isArray(value)) continue;
    const records: Array<Record<string, unknown>> = [];
    for (const item of value) {
      if (isPlainRecord(item)) records.push(item as Record<string, unknown>);
    }
    if (records.length > 0) out.push({ key, items: records });
  }
  return out;
}

function hasBinaryContent(records: Array<Record<string, unknown>>): boolean {
  for (const r of records) {
    for (const value of Object.values(r)) {
      if (isBinaryLike(value)) return true;
    }
  }
  return false;
}

function collectRecordKeys(records: Array<Record<string, unknown>>): string[] {
  const set = new Set<string>();
  for (const r of records) {
    for (const k of Object.keys(r)) set.add(k);
  }
  return Array.from(set).sort();
}

function hasErrorTerm(value: string): boolean {
  const lower = value.toLowerCase();
  return ERROR_TERMS.some(term => lower.includes(term));
}

function hasExplicitError(record: Record<string, unknown>): boolean {
  return Object.entries(record).some(([key, value]) => {
    const normalizedKey = key.toLowerCase();
    const isErrorField = ERROR_TERMS.some(term => normalizedKey.includes(term));
    if (!isErrorField) return false;
    if (value === null || value === undefined || value === false || value === '') return false;
    return true;
  });
}

function statusFieldNames(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter(k => STATUS_LIKE_FIELDS.includes(k));
}

function recordStatusValues(record: Record<string, unknown>): string[] {
  const names = statusFieldNames(record);
  const values: string[] = [];
  for (const name of names) {
    const v = record[name];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      values.push(String(v));
    }
  }
  return values;
}

function isFailureStatus(record: Record<string, unknown>): boolean {
  const statuses = recordStatusValues(record);
  return statuses.some((value) => {
    const normalized = value.toLowerCase();
    return FAILURE_VALUES.has(normalized) || hasErrorTerm(normalized);
  });
}

function pickCategoricalSamples(
  records: Array<Record<string, unknown>>,
  selectedIndices: Set<number>,
): number[] {
  const seenByFieldValue = new Map<string, Set<string>>();
  for (const index of selectedIndices) {
    for (const [field, value] of Object.entries(records[index])) {
      if (!STATUS_LIKE_FIELDS.includes(field)) continue;
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
      const seen = seenByFieldValue.get(field) ?? new Set<string>();
      seen.add(String(value).toLowerCase());
      seenByFieldValue.set(field, seen);
    }
  }

  const extras: number[] = [];
  for (let i = 0; i < records.length; i++) {
    if (selectedIndices.has(i)) continue;
    const rec = records[i];
    let unique = false;
    for (const [field, value] of Object.entries(rec)) {
      if (!STATUS_LIKE_FIELDS.includes(field)) continue;
      const sv = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value).toLowerCase()
        : null;
      if (sv === null) continue;
      const seen = seenByFieldValue.get(field) ?? new Set<string>();
      if (!seen.has(sv)) {
        seen.add(sv);
        seenByFieldValue.set(field, seen);
        unique = true;
      }
    }
    if (unique) {
      extras.push(i);
      selectedIndices.add(i);
      if (extras.length >= MAX_RARE_CATEGORICAL) break;
    }
  }
  return extras;
}

function spacedSamples<T>(items: T[], count: number): number[] {
  if (items.length === 0 || count <= 0) return [];
  if (count === 1) return [0];
  const out: number[] = [];
  const step = (items.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) {
    out.push(Math.round(i * step));
  }
  return out;
}

function countTopValues(records: Array<Record<string, unknown>>, field: string): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of records) {
    const v = r[field];
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
    const sv = String(v);
    counts.set(sv, (counts.get(sv) ?? 0) + 1);
  }
  const out: Array<{ value: string; count: number }> = [];
  for (const [value, count] of counts) out.push({ value, count });
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.value < b.value) return -1;
    if (a.value > b.value) return 1;
    return 0;
  });
  return out.slice(0, MAX_RARE_CATEGORICAL);
}

function numericStats(records: Array<Record<string, unknown>>): Record<string, { min: number; max: number }> {
  const stats: Record<string, { min: number; max: number }> = {};
  for (const r of records) {
    for (const [k, v] of Object.entries(r)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const cur = stats[k];
      if (!cur) {
        stats[k] = { min: v, max: v };
      } else {
        if (v < cur.min) cur.min = v;
        if (v > cur.max) cur.max = v;
      }
    }
  }
  const limited: Record<string, { min: number; max: number }> = {};
  const keys = Object.keys(stats).sort().slice(0, NUMERIC_FIELDS_LIMIT);
  for (const k of keys) limited[k] = stats[k];
  return limited;
}

function estimateMetadataChars(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

export function compressRecords({
  output,
  arrayKey,
  config,
  toolName,
  retrievalId,
  originalChars,
}: RecordsCompressionInput): RecordsCompressionResult | null {
  if (!isPlainRecord(output)) return null;

  let items: Array<Record<string, unknown>> | null = null;
  // eslint-disable-next-line no-useless-assignment
  let rawTotal = 0;
  if (arrayKey) {
    const value = output[arrayKey];
    if (!Array.isArray(value)) return null;
    items = value.filter(isPlainRecord) as Array<Record<string, unknown>>;
    rawTotal = value.length;
  } else {
    const candidates = findRecordArrays(output);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.items.length - a.items.length);
    rawTotal = Array.isArray(output[candidates[0].key]) ? (output[candidates[0].key] as unknown[]).length : 0;
    items = candidates[0].items;
    arrayKey = candidates[0].key;
  }

  if (items.length < MIN_ITEMS) return null;
  const total = items.length;

  if (rawTotal > 0) {
    const nonObjectCount = rawTotal - items.length;
    if (nonObjectCount > rawTotal * 0.1) return null;
  }

  if (hasBinaryContent(items)) return null;

  if (originalChars <= config.minChars) return null;

  const selected = new Set<number>();
  const reasonCounts: Record<string, number> = {};
  const recordReasons = new Map<number, string>();

  for (let i = 0; i < Math.min(HEAD, total); i++) {
    selected.add(i);
    recordReasons.set(i, 'head');
  }
  for (let i = Math.max(0, total - TAIL); i < total; i++) {
    selected.add(i);
    recordReasons.set(i, 'tail');
  }

  const errorIndices: number[] = [];
  const failureIndices: number[] = [];
  for (let i = 0; i < total; i++) {
    if (selected.has(i)) continue;
    if (hasExplicitError(items[i])) {
      errorIndices.push(i);
      continue;
    }
    if (isFailureStatus(items[i])) {
      failureIndices.push(i);
    }
  }
  for (const i of errorIndices) {
    selected.add(i);
    recordReasons.set(i, 'error');
  }
  for (const i of failureIndices) {
    selected.add(i);
    recordReasons.set(i, 'failure');
  }

  const categoricalExtras = pickCategoricalSamples(items, selected);
  for (const i of categoricalExtras) recordReasons.set(i, 'rare');

  const remaining = Array.from({ length: total }, (_, i) => i).filter(i => !selected.has(i));
  const selectedChars = Array.from(selected).reduce((sum, index) => {
    try {
      return sum + JSON.stringify(items[index]).length;
    } catch {
      return sum;
    }
  }, 0);
  const averageRemainingChars = remaining.length > 0
    ? Math.max(1, Math.ceil(remaining.reduce((sum, index) => {
        try {
          return sum + JSON.stringify(items[index]).length;
        } catch {
          return sum;
        }
      }, 0) / remaining.length))
    : 1;
  const remainingBudget = Math.max(0, config.targetChars - selectedChars - META_BUDGET);
  const spacedCount = Math.min(
    MAX_SPACED_SAMPLES,
    remaining.length,
    Math.floor(remainingBudget / averageRemainingChars),
  );
  const spacedPositions = spacedSamples(remaining, spacedCount);
  for (const position of spacedPositions) {
    const index = remaining[position];
    if (index === undefined) continue;
    selected.add(index);
    recordReasons.set(index, 'spaced');
  }

  for (const reason of recordReasons.values()) {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }

  const selectedSorted = Array.from(selected).sort((a, b) => a - b);
  const preserved = selectedSorted.map(i => ({ index: i, record: items![i] }));

  const recordKeys = collectRecordKeys(items);
  const statusCounts: Record<string, Array<{ value: string; count: number }>> = {};
  for (const field of STATUS_LIKE_FIELDS) {
    const stats = countTopValues(items, field);
    if (stats.length > 0) statusCounts[field] = stats;
  }
  const numeric = numericStats(items);

  const summary: Record<string, unknown> = {
    arrayKey,
    totalItems: total,
    shownItems: selected.size,
    omittedItems: total - selected.size,
    recordKeys,
    statusCounts,
    numericStats: numeric,
    selectionReasons: reasonCounts,
  };

  const topLevelMetadata: Record<string, unknown> = {};
  let metaChars = 0;
  for (const [k, v] of Object.entries(output)) {
    if (k === arrayKey) continue;
    const size = estimateMetadataChars(v);
    if (metaChars + size > META_BUDGET) {
      topLevelMetadata[k] = '[omitted: metadata budget exceeded]';
      continue;
    }
    topLevelMetadata[k] = v;
    metaChars += size;
  }
  if (Object.keys(topLevelMetadata).length > 0) {
    summary.topLevelMetadata = topLevelMetadata;
  }

  const payload: CompressedToolOutput = {
    type: 'jean2-tool-output',
    version: 1,
    retrievalId,
    strategy: 'records',
    toolName,
    originalChars,
    modelChars: 0,
    complete: false,
    message:
      'Incomplete tool output. Call retrieve_tool_output before making completeness claims or when exact omitted values are needed.',
    summary,
    preserved: { items: preserved },
  };

  setModelChars(payload);
  return { payload };
}