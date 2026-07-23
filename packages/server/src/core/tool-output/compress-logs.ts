import type { CompressedToolOutput } from '@jean2/sdk';
import type { CompressionConfig } from './types';
import { setModelChars } from './serialization';

const HEAD_LINES = 40;
const TAIL_LINES = 40;
const MIN_LINES = 100;
const CONTEXT_LINES = 2;
const ERROR_PATTERNS = ['ERROR', 'WARN', 'FATAL', 'FAIL', 'EXCEPTION', 'DENIED'];
const STACK_TRACE_MARKERS = ['at ', 'Traceback', 'Error:'];

export interface LogsCompressionInput {
  output: Record<string, unknown>;
  textKeys: readonly string[];
  config: CompressionConfig;
  toolName: string;
  retrievalId: string;
  originalChars: number;
}

export interface LogsCompressionResult {
  payload: CompressedToolOutput;
}

interface StreamLines {
  stream: 'stdout' | 'stderr';
  lines: string[];
}

interface PreservedLine {
  stream: 'stdout' | 'stderr';
  lineNumber: number;
  line: string;
  reason: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isImportant(line: string): boolean {
  const upper = line.toUpperCase();
  if (ERROR_PATTERNS.some(pattern => upper.includes(pattern))) return true;
  return STACK_TRACE_MARKERS.some(marker => line.includes(marker));
}

function collapseRepeated(items: PreservedLine[]): {
  items: PreservedLine[];
  collapsedCount: number;
} {
  const output: PreservedLine[] = [];
  let collapsedCount = 0;

  for (let index = 0; index < items.length; index++) {
    const first = items[index];
    let end = index;
    while (
      end + 1 < items.length
      && items[end + 1].stream === first.stream
      && items[end + 1].lineNumber === items[end].lineNumber + 1
      && items[end + 1].line === first.line
    ) {
      end += 1;
    }

    output.push(first);
    const duplicateCount = end - index;
    if (duplicateCount > 0) {
      output.push({
        stream: first.stream,
        lineNumber: first.lineNumber + 1,
        line: `... ${duplicateCount} identical line${duplicateCount === 1 ? '' : 's'} ...`,
        reason: 'repeat',
      });
      collapsedCount += duplicateCount;
    }
    index = end;
  }

  return { items: output, collapsedCount };
}

function addRange(
  selected: Map<number, string>,
  start: number,
  end: number,
  reason: string,
): void {
  for (let index = start; index <= end; index++) {
    if (!selected.has(index)) selected.set(index, reason);
  }
}

export function compressLogs({
  output,
  textKeys,
  config,
  toolName,
  retrievalId,
  originalChars,
}: LogsCompressionInput): LogsCompressionResult | null {
  if (!isPlainRecord(output)) return null;

  const streams: StreamLines[] = [];
  for (const key of textKeys) {
    if (key !== 'stdout' && key !== 'stderr') continue;
    const value = output[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') return null;
    streams.push({ stream: key, lines: value.split(/\r?\n/) });
  }

  if (streams.length === 0) return null;
  const totalLines = streams.reduce((total, stream) => total + stream.lines.length, 0);
  if (totalLines < MIN_LINES || originalChars <= config.minChars) return null;

  const preserved: PreservedLine[] = [];
  const streamSummary: Array<{
    stream: string;
    totalLines: number;
    preservedLines: number;
    omittedLines: number;
    importantLines: number;
    omittedImportant: number;
    collapsedRepeat: number;
  }> = [];

  let totalImportant = 0;
  let totalOmittedImportant = 0;
  let totalCollapsed = 0;
  let totalOmitted = 0;
  let totalPreserved = 0;

  for (const { stream, lines } of streams) {
    const selected = new Map<number, string>();
    const total = lines.length;
    addRange(selected, 0, Math.min(total - 1, HEAD_LINES - 1), 'head');
    addRange(selected, Math.max(0, total - TAIL_LINES), total - 1, 'tail');

    const importantIndices: number[] = [];
    for (let index = 0; index < total; index++) {
      if (isImportant(lines[index])) importantIndices.push(index);
    }

    let selectedChars = Array.from(selected.keys()).reduce(
      (sum, index) => sum + lines[index].length,
      0,
    );
    let omittedImportant = 0;

    for (const importantIndex of importantIndices) {
      if (!selected.has(importantIndex)) {
        const nextChars = selectedChars + lines[importantIndex].length;
        if (nextChars > config.targetChars) {
          omittedImportant += 1;
          continue;
        }
        selected.set(importantIndex, 'important');
        selectedChars = nextChars;
      }

      const start = Math.max(0, importantIndex - CONTEXT_LINES);
      const end = Math.min(total - 1, importantIndex + CONTEXT_LINES);
      for (let index = start; index <= end; index++) {
        if (selected.has(index)) continue;
        const nextChars = selectedChars + lines[index].length;
        if (nextChars > config.targetChars) continue;
        selected.set(index, 'context');
        selectedChars = nextChars;
      }
    }

    const selectedItems = Array.from(selected.entries())
      .sort(([left], [right]) => left - right)
      .map(([index, reason]): PreservedLine => ({
        stream,
        lineNumber: index + 1,
        line: lines[index],
        reason: isImportant(lines[index]) ? 'important' : reason,
      }));
    const collapsed = collapseRepeated(selectedItems);
    const omittedLines = total - selected.size;

    streamSummary.push({
      stream,
      totalLines: total,
      preservedLines: selected.size,
      omittedLines,
      importantLines: importantIndices.length,
      omittedImportant,
      collapsedRepeat: collapsed.collapsedCount,
    });
    preserved.push(...collapsed.items);

    totalImportant += importantIndices.length;
    totalOmittedImportant += omittedImportant;
    totalCollapsed += collapsed.collapsedCount;
    totalOmitted += omittedLines;
    totalPreserved += selected.size;
  }

  const exitCode = typeof output.exitCode === 'number' ? output.exitCode : undefined;
  const summary: Record<string, unknown> = {
    exitCode,
    totalLines,
    preservedLines: totalPreserved,
    omittedLines: totalOmitted,
    importantLines: totalImportant,
    omittedImportant: totalOmittedImportant,
    consecutiveCollapsed: totalCollapsed,
    streams: streamSummary,
  };

  const metaKeys: Record<string, unknown> = {};
  let metaChars = 0;
  for (const [key, value] of Object.entries(output)) {
    if (textKeys.includes(key) || key === 'exitCode') continue;
    let serialized: string;
    try {
      serialized = JSON.stringify(value) ?? '';
    } catch {
      serialized = '';
    }
    if (metaChars + serialized.length > 1000) {
      metaKeys[key] = '[omitted: metadata budget exceeded]';
      continue;
    }
    metaKeys[key] = value;
    metaChars += serialized.length;
  }
  if (Object.keys(metaKeys).length > 0) summary.topLevelMetadata = metaKeys;

  const payload: CompressedToolOutput = {
    type: 'jean2-tool-output',
    version: 1,
    retrievalId,
    strategy: 'logs',
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
