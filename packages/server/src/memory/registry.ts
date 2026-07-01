import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const USER_FILE = 'USER.md';
const MEMORY_FILE = 'MEMORY.md';

export const USER_CHAR_LIMIT = 1500;
export const MEMORY_CHAR_LIMIT = 2500;

export type MemoryTarget = 'user' | 'memory';

export interface MemoryUsage {
  chars: number;
  limit: number;
}

export interface MemoryFile {
  path: string;
  content: string;
  entries: string[];
  charCount: number;
  charLimit: number;
}

function getFilePath(basePath: string, target: MemoryTarget): string {
  const filename = target === 'user' ? USER_FILE : MEMORY_FILE;
  return join(basePath, filename);
}

function getCharLimit(target: MemoryTarget): number {
  return target === 'user' ? USER_CHAR_LIMIT : MEMORY_CHAR_LIMIT;
}

function getRelativePath(target: MemoryTarget): string {
  const filename = target === 'user' ? USER_FILE : MEMORY_FILE;
  return filename;
}

export function parseEntries(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '));
}

export function entriesToContent(entries: string[]): string {
  return entries.join('\n');
}

export async function loadMemoryFile(
  basePath: string,
  target: MemoryTarget,
): Promise<MemoryFile | null> {
  const filePath = getFilePath(basePath, target);
  const charLimit = getCharLimit(target);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    const trimmed = content.trim();
    if (!trimmed) return null;

    const entries = parseEntries(trimmed);
    return {
      path: getRelativePath(target),
      content: trimmed,
      entries,
      charCount: trimmed.length,
      charLimit,
    };
  } catch {
    return null;
  }
}

export function formatMemorySection(
  tag: string,
  path: string,
  content: string,
  charCount: number,
  charLimit: number,
): string {
  return `<${tag} path="${path}" usage="${charCount}/${charLimit}">\n${content}\n</${tag}>`;
}

export interface MemoryActionResult {
  success: boolean;
  result?: {
    target: MemoryTarget;
    action: 'list' | 'add' | 'replace' | 'remove';
    path: string;
    usage: MemoryUsage;
    entry?: string;
    entries?: string[];
  };
  error?: string;
  entries?: string[];
  usage?: MemoryUsage;
}

export function formatEntriesForDisplay(entries: string[]): string[] {
  return entries.map((e, i) => `[${i}] ${e.replace(/^- /, '')}`);
}

async function ensureMemoryDir(basePath: string): Promise<void> {
  if (!existsSync(basePath)) {
    await mkdir(basePath, { recursive: true });
  }
}

export async function addEntry(
  basePath: string,
  target: MemoryTarget,
  content: string,
): Promise<MemoryActionResult> {
  const trimmed = content.trim();
  if (!trimmed) {
    return { success: false, error: 'Content cannot be empty.' };
  }

  const entry = `- ${trimmed}`;
  const filePath = getFilePath(basePath, target);
  const charLimit = getCharLimit(target);

  let existing: string[] = [];
  let existingContent = '';

  if (existsSync(filePath)) {
    try {
      existingContent = (await readFile(filePath, 'utf-8')).trim();
      existing = parseEntries(existingContent);
    } catch {
      existing = [];
    }
  }

  if (existing.some(e => e === entry)) {
    return { success: false, error: 'Exact duplicate entry already exists.' };
  }

  const newContent = existingContent ? `${existingContent}\n${entry}` : entry;
  const charCount = newContent.length;

  if (charCount > charLimit) {
    return {
      success: false,
      error: `Memory is full (${existingContent.length}/${charLimit} chars). Consider merging related entries to free space, or replace/remove existing ones first.`,
      entries: formatEntriesForDisplay(existing),
      usage: { chars: existingContent.length, limit: charLimit },
    };
  }

  await ensureMemoryDir(basePath);
  await writeFile(filePath, newContent, 'utf-8');

  return {
    success: true,
    result: {
      target,
      action: 'add',
      path: getRelativePath(target),
      usage: { chars: charCount, limit: charLimit },
      entry: trimmed,
    },
  };
}

export async function replaceEntry(
  basePath: string,
  target: MemoryTarget,
  oldText: string,
  newContent: string,
): Promise<MemoryActionResult> {
  const trimmedNew = newContent.trim();
  if (!trimmedNew) {
    return { success: false, error: 'New content cannot be empty.' };
  }

  const filePath = getFilePath(basePath, target);
  const charLimit = getCharLimit(target);

  if (!existsSync(filePath)) {
    return { success: false, error: 'Memory file does not exist.' };
  }

  let existingContent: string;
  try {
    existingContent = (await readFile(filePath, 'utf-8')).trim();
  } catch {
    return { success: false, error: 'Failed to read memory file.' };
  }

  const entries = parseEntries(existingContent);
  const matches = entries.filter(e => e.includes(oldText));

  if (matches.length === 0) {
    return {
      success: false,
      error: `No entry found matching "${oldText}". Use the list action to see current entries.`,
      entries: formatEntriesForDisplay(entries),
      usage: { chars: existingContent.length, limit: charLimit },
    };
  }

  if (matches.length > 1) {
    return {
      success: false,
      error: `Multiple entries match "${oldText}". Be more specific.`,
      entries: formatEntriesForDisplay(matches),
      usage: { chars: existingContent.length, limit: charLimit },
    };
  }

  const newEntry = `- ${trimmedNew}`;
  const updatedContent = existingContent.replace(matches[0], newEntry);
  const charCount = updatedContent.length;

  if (charCount > charLimit) {
    return {
      success: false,
      error: `Memory is full (${existingContent.length}/${charLimit} chars). Consider merging related entries to free space, or remove existing ones first.`,
      entries: formatEntriesForDisplay(entries),
      usage: { chars: existingContent.length, limit: charLimit },
    };
  }

  await writeFile(filePath, updatedContent, 'utf-8');

  return {
    success: true,
    result: {
      target,
      action: 'replace',
      path: getRelativePath(target),
      usage: { chars: charCount, limit: charLimit },
      entry: trimmedNew,
    },
  };
}

export async function removeEntry(
  basePath: string,
  target: MemoryTarget,
  oldText: string,
): Promise<MemoryActionResult> {
  const filePath = getFilePath(basePath, target);
  const charLimit = getCharLimit(target);

  if (!existsSync(filePath)) {
    return { success: false, error: 'Memory file does not exist.' };
  }

  let existingContent: string;
  try {
    existingContent = (await readFile(filePath, 'utf-8')).trim();
  } catch {
    return { success: false, error: 'Failed to read memory file.' };
  }

  const entries = parseEntries(existingContent);
  const matches = entries.filter(e => e.includes(oldText));

  if (matches.length === 0) {
    return {
      success: false,
      error: `No entry found matching "${oldText}". Use the list action to see current entries.`,
      entries: formatEntriesForDisplay(entries),
      usage: { chars: existingContent.length, limit: charLimit },
    };
  }

  if (matches.length > 1) {
    return {
      success: false,
      error: `Multiple entries match "${oldText}". Be more specific.`,
      entries: formatEntriesForDisplay(matches),
      usage: { chars: existingContent.length, limit: charLimit },
    };
  }

  const remaining = entries.filter(e => e !== matches[0]);
  const newContent = entriesToContent(remaining);

  await writeFile(filePath, newContent, 'utf-8');

  return {
    success: true,
    result: {
      target,
      action: 'remove',
      path: getRelativePath(target),
      usage: { chars: newContent.length, limit: charLimit },
    },
  };
}

export async function listEntries(
  basePath: string,
  target: MemoryTarget,
): Promise<MemoryActionResult> {
  const charLimit = getCharLimit(target);
  const file = await loadMemoryFile(basePath, target);

  if (!file) {
    return {
      success: true,
      result: {
        target,
        action: 'list',
        path: getRelativePath(target),
        usage: { chars: 0, limit: charLimit },
        entries: [],
      },
    };
  }

  return {
    success: true,
    result: {
      target,
      action: 'list',
      path: file.path,
      usage: { chars: file.charCount, limit: file.charLimit },
      entries: formatEntriesForDisplay(file.entries),
    },
  };
}

export async function loadMemoryInstructions(
  basePath: string,
): Promise<string | null> {
  const sections: string[] = [];

  const userFile = await loadMemoryFile(basePath, 'user');
  if (userFile) {
    sections.push(
      formatMemorySection(
        'user_memory',
        userFile.path,
        userFile.content,
        userFile.charCount,
        userFile.charLimit,
      ),
    );
  }

  const memoryFile = await loadMemoryFile(basePath, 'memory');
  if (memoryFile) {
    sections.push(
      formatMemorySection(
        'workspace_memory',
        memoryFile.path,
        memoryFile.content,
        memoryFile.charCount,
        memoryFile.charLimit,
      ),
    );
  }

  return sections.length > 0 ? sections.join('\n\n') : null;
}

export const MEMORY_GUIDANCE = `You can persist durable workspace knowledge using the memory tool.
Use target="user" for user preferences and communication/workflow expectations.
Use target="memory" for workspace facts, repo conventions, commands, lessons, and non-obvious fixes.
Character limits: user=${USER_CHAR_LIMIT}, workspace=${MEMORY_CHAR_LIMIT}.
Only save compact facts that should affect future sessions.
Do not save secrets, raw logs, large code, or one-off details.
If memory is full, consolidate existing entries with replace before adding.
Use the list action to verify current entries before replacing or removing.`;
