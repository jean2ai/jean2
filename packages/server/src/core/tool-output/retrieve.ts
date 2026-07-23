import type {
  RetrieveToolOutputInput,
  RetrieveToolOutputResponse,
  ToolOutputStrategy,
} from '@jean2/sdk';
import {
  getToolOutputArtifact,
  parseArtifactJson,
  recordToolOutputRetrieval,
} from '@/store/tool-output-artifacts';
import {
  getToolOutputContextMaxLines,
  getToolOutputQueryMaxChars,
  getToolOutputRetrievalDefaultLimit,
  getToolOutputRetrievalMaxChars,
  getToolOutputRetrievalMaxLimit,
} from '@/env';
import { NotFoundError } from '@/utils/http-errors';

const ARTIFACT_ID_PATTERN = /^j2out_[a-f0-9]{24}$/;

export interface RetrieveOptions {
  sessionId: string;
  input: RetrieveToolOutputInput;
}

function clampInt(value: unknown, fallback: number, max: number, min = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Math.min(max, Math.max(min, fallback));
  }
  const v = Math.floor(value);
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function clampString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function validateRetrievalId(retrievalId: unknown): string {
  if (typeof retrievalId !== 'string' || !ARTIFACT_ID_PATTERN.test(retrievalId)) {
    throw new NotFoundError('Artifact not found');
  }
  return retrievalId;
}

function paginate(items: unknown[], offset: number, limit: number): { items: unknown[]; nextOffset: number | null; hasMore: boolean } {
  if (offset >= items.length) {
    return { items: [], nextOffset: null, hasMore: false };
  }
  const slice = items.slice(offset, offset + limit);
  const next = offset + slice.length;
  const hasMore = next < items.length;
  return { items: slice, nextOffset: hasMore ? next : null, hasMore };
}

function boundByChars(
  items: unknown[],
  maxChars: number,
): { items: unknown[]; truncatedAt: number | null } {
  let total = 0;
  const out: unknown[] = [];
  for (let i = 0; i < items.length; i++) {
    const serialized = (() => { try { return JSON.stringify(items[i]).length; } catch { return 0; } })();
    if (total + serialized > maxChars && out.length > 0) {
      return { items: out, truncatedAt: i };
    }
    out.push(items[i]);
    total += serialized;
  }
  return { items: out, truncatedAt: null };
}

function arrayFromRecords(value: unknown, key: string): unknown[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const arr = (value as Record<string, unknown>)[key];
  return Array.isArray(arr) ? arr : null;
}

function recordsForArtifact(
  output: unknown,
  artifactMetadata: { toolName: string; strategy: ToolOutputStrategy },
): { arrayKey: string; records: unknown[] } | null {
  const known = {
    grep: 'matches',
    'tavily-search': 'results',
    'tavily-crawl': 'results',
    'browser-discover-elements': 'elements',
  } as const;
  if (artifactMetadata.strategy === 'records' || artifactMetadata.strategy === 'preview') {
    for (const [tool, key] of Object.entries(known)) {
      if (artifactMetadata.toolName === tool) {
        const records = arrayFromRecords(output, key);
        if (records) return { arrayKey: key, records };
      }
    }
    if (output && typeof output === 'object' && !Array.isArray(output)) {
      for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
        if (Array.isArray(v) && v.length > 0) {
          return { arrayKey: k, records: v };
        }
      }
    }
  }
  return null;
}

function pathsForArtifact(
  output: unknown,
  artifactMetadata: { toolName: string; strategy: ToolOutputStrategy },
): string[] | null {
  if (artifactMetadata.toolName === 'glob' || artifactMetadata.strategy === 'paths') {
    if (output && typeof output === 'object' && !Array.isArray(output)) {
      const arr = (output as Record<string, unknown>).files;
      if (Array.isArray(arr) && arr.every(p => typeof p === 'string')) {
        return arr as string[];
      }
    }
  }
  return null;
}

interface LogLine {
  stream: 'stdout' | 'stderr';
  lineNumber: number;
  line: string;
}

function logsForArtifact(
  output: unknown,
  artifactMetadata: { toolName: string; strategy: ToolOutputStrategy },
): { streams: Record<'stdout' | 'stderr', string>; exitCode: number | undefined } | null {
  if (artifactMetadata.toolName !== 'shell' && artifactMetadata.strategy !== 'logs') return null;
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null;
  const obj = output as Record<string, unknown>;
  const stdout = typeof obj.stdout === 'string' ? obj.stdout : '';
  const stderr = typeof obj.stderr === 'string' ? obj.stderr : '';
  const exitCode = typeof obj.exitCode === 'number' ? obj.exitCode : undefined;
  return { streams: { stdout, stderr }, exitCode };
}

function linesForStream(stream: 'stdout' | 'stderr', text: string): LogLine[] {
  if (text.length === 0) return [];
  const lines = text.split(/\r?\n/);
  return lines.map((line, idx) => ({ stream, lineNumber: idx + 1, line }));
}

function filterAndPaginateLines(
  allLines: LogLine[],
  query: string | undefined,
  offset: number,
  limit: number,
  contextLines: number,
): { items: unknown[]; total: number; returned: number; nextOffset: number | null; hasMore: boolean } {
  let matched = allLines;
  if (query !== undefined) {
    const lower = query.toLowerCase();
    const matchingIndices = allLines
      .map((line, index) => line.line.toLowerCase().includes(lower) ? index : -1)
      .filter(index => index >= 0);

    if (contextLines === 0) {
      matched = matchingIndices.map(index => allLines[index]);
    } else {
      const expandedIndices = new Set<number>();
      for (const matchingIndex of matchingIndices) {
        const matchingLine = allLines[matchingIndex];
        const start = Math.max(0, matchingIndex - contextLines);
        const end = Math.min(allLines.length - 1, matchingIndex + contextLines);
        for (let index = start; index <= end; index++) {
          if (allLines[index].stream === matchingLine.stream) expandedIndices.add(index);
        }
      }
      matched = Array.from(expandedIndices)
        .sort((left, right) => left - right)
        .map(index => allLines[index]);
    }
  }

  const total = matched.length;
  const slice = matched.slice(offset, offset + limit);
  const next = offset + slice.length;
  return {
    items: slice,
    total,
    returned: slice.length,
    nextOffset: next < total ? next : null,
    hasMore: next < total,
  };
}

export function retrieveToolOutput({ sessionId, input }: RetrieveOptions): RetrieveToolOutputResponse {
  const retrievalId = validateRetrievalId(input.retrievalId);
  const artifact = getToolOutputArtifact(sessionId, retrievalId);
  if (!artifact) {
    throw new NotFoundError('Artifact not found');
  }

  const maxChars = getToolOutputRetrievalMaxChars();
  const defaultLimit = getToolOutputRetrievalDefaultLimit();
  const maxLimit = getToolOutputRetrievalMaxLimit();
  const maxContext = getToolOutputContextMaxLines();

  const offset = clampInt(input.offset, 0, Number.MAX_SAFE_INTEGER);
  const limit = clampInt(input.limit, defaultLimit, maxLimit, 1);
  const contextLines = clampInt(input.contextLines, 0, maxContext, 0);
  const query = clampString(input.query, getToolOutputQueryMaxChars());

  const original = parseArtifactJson<unknown>(artifact.originalJson, retrievalId);
  // eslint-disable-next-line no-useless-assignment
  let items: unknown[] = [];
  // eslint-disable-next-line no-useless-assignment
  let total: number = 0;

  const recordInfo = recordsForArtifact(original, artifact);
  if (recordInfo) {
    const candidates = query === undefined
      ? recordInfo.records
      : (() => {
          const lower = query.toLowerCase();
          return recordInfo.records.filter(item => {
            try {
              return JSON.stringify(item).toLowerCase().includes(lower);
            } catch {
              return false;
            }
          });
        })();
    total = candidates.length;
    const bounded = boundByChars(candidates.slice(offset, offset + limit), maxChars);
    items = bounded.items;
    const next = offset + items.length;
    const hasMore = next < total || bounded.truncatedAt !== null;
    return {
      retrievalId,
      strategy: artifact.strategy,
      query: query ?? null,
      offset,
      limit,
      total,
      returned: items.length,
      hasMore,
      nextOffset: hasMore ? next : null,
      items,
    };
  }

  const paths = pathsForArtifact(original, artifact);
  if (paths) {
    let candidates = paths;
    if (query !== undefined) {
      const lower = query.toLowerCase();
      candidates = candidates.filter(p => p.toLowerCase().includes(lower));
    }
    total = candidates.length;
    const slice = candidates.slice(offset, offset + limit);
    const bounded = boundByChars(slice, maxChars);
    items = bounded.items;
    const next = offset + items.length;
    const hasMore = next < total || bounded.truncatedAt !== null;
    return {
      retrievalId,
      strategy: artifact.strategy,
      query: query ?? null,
      offset,
      limit,
      total,
      returned: items.length,
      hasMore,
      nextOffset: hasMore ? next : null,
      items,
    };
  }

  const logs = logsForArtifact(original, artifact);
  if (logs) {
    const allLines: LogLine[] = [
      ...linesForStream('stdout', logs.streams.stdout),
      ...linesForStream('stderr', logs.streams.stderr),
    ];
    const result = filterAndPaginateLines(allLines, query, offset, limit, contextLines);
    const bounded = boundByChars(result.items, maxChars);
    const returned = bounded.items.length;
    const hasMore = result.hasMore || bounded.truncatedAt !== null;
    return {
      retrievalId,
      strategy: artifact.strategy,
      query: query ?? null,
      offset,
      limit,
      total: result.total,
      returned,
      hasMore,
      nextOffset: hasMore ? offset + returned : null,
      items: bounded.items,
    };
  }

  if (artifact.strategy === 'preview' || typeof original === 'string') {
    const text = typeof original === 'string'
      ? original
      : (() => { try { return JSON.stringify(original); } catch { return ''; } })();
    const lines = text.split(/\r?\n/).map((line, index) => ({
      lineNumber: index + 1,
      line,
    }));
    let matched = lines;
    if (query !== undefined) {
      const lower = query.toLowerCase();
      const matchingIndices = lines
        .map((item, index) => item.line.toLowerCase().includes(lower) ? index : -1)
        .filter(index => index >= 0);
      if (contextLines === 0) {
        matched = matchingIndices.map(index => lines[index]);
      } else {
        const expandedIndices = new Set<number>();
        for (const matchingIndex of matchingIndices) {
          const start = Math.max(0, matchingIndex - contextLines);
          const end = Math.min(lines.length - 1, matchingIndex + contextLines);
          for (let index = start; index <= end; index++) expandedIndices.add(index);
        }
        matched = Array.from(expandedIndices)
          .sort((left, right) => left - right)
          .map(index => lines[index]);
      }
    }
    total = matched.length;
    const slice = matched.slice(offset, offset + limit);
    const bounded = boundByChars(slice, maxChars);
    items = bounded.items;
    const next = offset + items.length;
    const hasMore = next < total || bounded.truncatedAt !== null;
    return {
      retrievalId,
      strategy: artifact.strategy,
      query: query ?? null,
      offset,
      limit,
      total,
      returned: items.length,
      hasMore,
      nextOffset: hasMore ? next : null,
      items,
    };
  }

  total = 1;
  const result = paginate([original], offset, limit);
  const bounded = boundByChars(result.items, maxChars);
  items = bounded.items;
  const hasMore = result.hasMore || bounded.truncatedAt !== null;
  return {
    retrievalId,
    strategy: artifact.strategy,
    query: query ?? null,
    offset,
    limit,
    total,
    returned: items.length,
    hasMore,
    nextOffset: hasMore ? offset + items.length : null,
    items,
  };
}

export function recordRetrieval(
  sessionId: string,
  retrievalId: string,
  source: 'model' | 'user',
): void {
  recordToolOutputRetrieval(sessionId, retrievalId, source, Date.now());
}