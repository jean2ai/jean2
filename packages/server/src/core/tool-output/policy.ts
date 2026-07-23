import type { ToolOutputPolicy } from './types';

const EXACT_TOOLS: ReadonlySet<string> = new Set([
  'read-file',
  'file-to-markdown',
  'write-file',
  'edit',
  'multiedit',
  'apply-patch',
  'skill',
  'question',
  'task',
  'workflow',
  'memory',
  'agent_memory',
  'skill_manage',
  'agent_skill_manage',
  'scheduler',
]);

interface RecordsConfig { toolName: string; arrayKey: string }
interface PathsConfig { toolName: string; arrayKey: string }
interface LogsConfig { toolName: string; textKeys: readonly string[] }

const RECORDS_TOOLS: readonly RecordsConfig[] = [
  { toolName: 'grep', arrayKey: 'matches' },
  { toolName: 'tavily-search', arrayKey: 'results' },
  { toolName: 'tavily-crawl', arrayKey: 'results' },
  { toolName: 'browser-discover-elements', arrayKey: 'elements' },
];

const PATHS_TOOLS: readonly PathsConfig[] = [
  { toolName: 'glob', arrayKey: 'files' },
];

const LOGS_TOOLS: readonly LogsConfig[] = [
  { toolName: 'shell', textKeys: ['stdout', 'stderr'] },
];

export function getPolicyForTool(toolName: string): ToolOutputPolicy {
  if (EXACT_TOOLS.has(toolName)) return { mode: 'exact' };
  for (const cfg of RECORDS_TOOLS) {
    if (cfg.toolName === toolName) {
      return { mode: 'records', arrayKey: cfg.arrayKey };
    }
  }
  for (const cfg of PATHS_TOOLS) {
    if (cfg.toolName === toolName) {
      return { mode: 'paths', arrayKey: cfg.arrayKey };
    }
  }
  for (const cfg of LOGS_TOOLS) {
    if (cfg.toolName === toolName) {
      return { mode: 'logs', textKeys: cfg.textKeys };
    }
  }
  return { mode: 'detect-safe' };
}

export function isExactTool(toolName: string): boolean {
  return EXACT_TOOLS.has(toolName);
}

export function detectSafeShape(value: unknown): ToolOutputPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { mode: 'exact' };
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);

  const stdout = record.stdout;
  const stderr = record.stderr;
  const exitCode = record.exitCode;
  if ((typeof stdout === 'string' || typeof stderr === 'string') &&
      (exitCode === undefined || typeof exitCode === 'number') &&
      keys.length <= 8) {
    const extraKeys = keys.filter(k => k !== 'stdout' && k !== 'stderr' && k !== 'exitCode');
    const allSmallPrimitives = extraKeys.every(k => {
      const v = record[k];
      return v === null || ['string', 'number', 'boolean'].includes(typeof v);
    });
    if (allSmallPrimitives) {
      return { mode: 'logs', textKeys: ['stdout', 'stderr'] };
    }
  }

  for (const key of keys) {
    const arr = record[key];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    if (arr.length < 32) continue;
    const homogeneous = arr.every(item =>
      item !== null && typeof item === 'object' && !Array.isArray(item));
    if (homogeneous) {
      return { mode: 'records', arrayKey: key };
    }
  }

  return { mode: 'exact' };
}