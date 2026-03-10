import { readdir, readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { Preconfig, PreconfigMode } from '@jean2/shared';
import { randomUUID } from 'crypto';

const PRECONFIGS_DIR = process.env.PRECONFIGS_PATH || join(homedir(), '.jean2', 'preconfigs');

// Common section to append to all system prompts about handling tool rejection errors
const TOOL_REJECTION_HANDLING = `

## Tool Rejection Handling
When a tool call returns an error with "USER_REJECTION", this means the user explicitly denied permission to execute that action. Do NOT retry the same or similar tool calls. Instead:
1. Acknowledge that you cannot perform that action
2. Ask the user how they would like to proceed
3. Suggest alternative approaches if appropriate

## Guidelines for Subagents
When you are a subagent (called via the Task tool):
1. Focus only on completing the assigned task
2. Do not use the Task tool yourself (subagents should not spawn subagents)
3. Return your findings in a clear, structured format in your FINAL MESSAGE ONLY
4. Your final message will be the ONLY output returned to the calling agent
5. The calling agent will NOT see your intermediate tool calls or reasoning - only your final text response
6. If you cannot complete the task, explain why clearly in your final message`;

// Default preconfigs
const DEFAULT_PRECONFIGS: Preconfig[] = [
  {
    id: 'reader',
    name: 'Reader',
    description: 'Read-only agent for exploring codebases and documents',
    systemPrompt: 'You are a helpful assistant focused on reading and understanding files. You have access to tools for reading files, searching content, and exploring directory structures. Be thorough and precise in your analysis.' + TOOL_REJECTION_HANDLING,
    tools: ['read-file', 'glob', 'grep', 'webfetch'],
    model: null,
    provider: null,
    settings: { temperature: 0.5 },
    isDefault: true,
    mode: 'primary',
  },
  {
    id: 'coder',
    name: 'Coder',
    description: 'Full-featured agent for writing and modifying code',
    systemPrompt: 'You are a skilled software developer assistant. You can read, write, and modify files, and execute shell commands. Write clean, well-documented code. Test your changes when appropriate.' + TOOL_REJECTION_HANDLING,
    tools: ['read-file', 'write-file', 'shell', 'glob', 'grep', 'webfetch'],
    model: null,
    provider: null,
    settings: { temperature: 0.3 },
    isDefault: false,
    mode: 'primary',
  },
  {
    id: 'writer',
    name: 'Writer',
    description: 'Agent for writing documentation and content',
    systemPrompt: 'You are a helpful writing assistant. You can read and write files to help create documentation, articles, and other text content. Write clearly and concisely.' + TOOL_REJECTION_HANDLING,
    tools: ['read-file', 'write-file'],
    model: null,
    provider: null,
    settings: { temperature: 0.7 },
    isDefault: false,
    mode: 'primary',
  },
  {
    id: 'explore',
    name: 'Explore',
    description: 'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (e.g. "src/components/**/*.tsx"), search code for keywords (e.g. "API endpoints"), or answer questions about the codebase (e.g. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.',
    systemPrompt: `You are a file search specialist. You excel at thoroughly navigating and exploring codebases.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents

Guidelines:
- Use glob for broad file pattern matching
- Use grep for searching file contents with regex
- Use read-file when you know the specific file path you need to read
- Adapt your search approach based on the thoroughness level specified by the caller
- Return file paths as absolute paths in your final response
- For clear communication, avoid using emojis
- Do not create any files, or run bash commands that modify the user's system state in any way

Complete the user's search request efficiently and report your findings clearly.` + TOOL_REJECTION_HANDLING,
    tools: ['read-file', 'glob', 'grep', 'webfetch'],
    model: null,
    provider: null,
    settings: { temperature: 0.3 },
    isDefault: false,
    mode: 'subagent',
  },
  {
    id: 'general',
    name: 'General',
    description: 'General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.',
    systemPrompt: `You are a general-purpose AI assistant capable of handling complex, multi-step tasks.

When working on tasks:
1. Break down complex tasks into smaller, manageable steps
2. Execute steps in a logical order
3. Verify your work at each step
4. Report your findings clearly and concisely

Guidelines:
- Be thorough but efficient
- When searching for information, start broad then narrow down
- Always verify your findings
- Return a comprehensive summary of your work
- If you encounter errors, try alternative approaches before giving up

Complete the task assigned to you and return your findings in a clear, structured format.` + TOOL_REJECTION_HANDLING,
    tools: ['read-file', 'write-file', 'shell', 'glob', 'grep', 'webfetch'],
    model: null,
    provider: null,
    settings: { temperature: 0.5 },
    isDefault: false,
    mode: 'subagent',
  },
];

async function ensureDir(): Promise<void> {
  try {
    await mkdir(PRECONFIGS_DIR, { recursive: true });
  } catch (_e) {
    // Directory exists
  }
}

export async function initializePreconfigs(): Promise<void> {
  await ensureDir();
  
  // Check if any preconfigs exist
  const files = await readdir(PRECONFIGS_DIR).catch(() => []);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  if (jsonFiles.length === 0) {
    // Create default preconfigs
    for (const preconfig of DEFAULT_PRECONFIGS) {
      await createPreconfig(preconfig);
    }
    console.log(`Initialized ${DEFAULT_PRECONFIGS.length} default preconfigs`);
  }
}

export async function listPreconfigs(): Promise<Preconfig[]> {
  await ensureDir();
  
  const files = await readdir(PRECONFIGS_DIR).catch(() => []);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  const preconfigs: Preconfig[] = [];
  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(PRECONFIGS_DIR, file), 'utf-8');
      preconfigs.push(JSON.parse(content) as Preconfig);
    } catch (e) {
      console.error(`Failed to read preconfig ${file}:`, e);
    }
  }
  
  return preconfigs.sort((a, b) => {
    if (a.isDefault) return -1;
    if (b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function getPreconfig(id: string): Promise<Preconfig | null> {
  await ensureDir();
  
  try {
    const content = await readFile(join(PRECONFIGS_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(content) as Preconfig;
  } catch (_e) {
    return null;
  }
}

export async function createPreconfig(preconfig: Omit<Preconfig, 'id'> & { id?: string }): Promise<Preconfig> {
  await ensureDir();
  
  const newPreconfig: Preconfig = {
    ...preconfig,
    id: preconfig.id || randomUUID(),
  };
  
  await writeFile(
    join(PRECONFIGS_DIR, `${newPreconfig.id}.json`),
    JSON.stringify(newPreconfig, null, 2)
  );
  
  return newPreconfig;
}

export async function updatePreconfig(id: string, updates: Partial<Omit<Preconfig, 'id'>>): Promise<Preconfig | null> {
  const existing = await getPreconfig(id);
  if (!existing) return null;
  
  const updated: Preconfig = {
    ...existing,
    ...updates,
    id, // Ensure id is not changed
  };
  
  await writeFile(
    join(PRECONFIGS_DIR, `${id}.json`),
    JSON.stringify(updated, null, 2)
  );
  
  return updated;
}

export async function deletePreconfig(id: string): Promise<boolean> {
  try {
    await unlink(join(PRECONFIGS_DIR, `${id}.json`));
    return true;
  } catch (_e) {
    return false;
  }
}

export async function getDefaultPreconfig(): Promise<Preconfig | null> {
  const preconfigs = await listPreconfigs();
  return preconfigs.find(p => p.isDefault) || preconfigs[0] || null;
}

/**
 * List preconfigs filtered by mode
 */
export async function listPreconfigsByMode(mode?: PreconfigMode): Promise<Preconfig[]> {
  const preconfigs = await listPreconfigs();
  
  if (!mode) return preconfigs;
  
  return preconfigs.filter(p => {
    const preconfigMode = p.mode ?? 'primary';
    return preconfigMode === mode;
  });
}

/**
 * List only subagent preconfigs
 */
export async function listSubagentPreconfigs(): Promise<Preconfig[]> {
  return listPreconfigsByMode('subagent');
}

/**
 * List only primary preconfigs (user-facing)
 */
export async function listPrimaryPreconfigs(): Promise<Preconfig[]> {
  return listPreconfigsByMode('primary');
}

/**
 * Get available subagent types for Task tool
 */
export async function getAvailableSubagentTypes(): Promise<string[]> {
  const subagents = await listSubagentPreconfigs();
  return subagents.map(s => s.id);
}
