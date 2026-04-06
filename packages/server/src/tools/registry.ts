import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import matter from 'gray-matter';
import { join, resolve } from 'path';
import type { ToolDefinition } from '@jean2/shared';
import type { DiscoveredTool } from './types';
import { resolveToolsPath } from '../config';

function getDefaultToolsPath(): string {
  return resolveToolsPath();
}

function getToolMdPath(toolDir: string): string {
  return join(toolDir, 'tool.md');
}

function getToolJsonPath(toolDir: string): string {
  return join(toolDir, 'tool.json');
}

function parseToolMd(content: string): ToolDefinition {
  const { data, content: body } = matter(content);
  return {
    name: data.name || '',
    description: body.trim(),
    script: data.script || '',
    runtime: data.runtime || 'bun',
    inputSchema: data.inputSchema || { type: 'object', properties: {} },
    outputSchema: data.outputSchema || { type: 'object', properties: {} },
    timeout: data.timeout ?? 30000,
    requireApproval: data.requireApproval ?? false,
    dangerous: data.dangerous ?? false,
    ...(data.env !== undefined && { env: data.env }),
    ...(data.hasSecurityCheck !== undefined && { hasSecurityCheck: data.hasSecurityCheck }),
    ...(data.securityScript !== undefined && { securityScript: data.securityScript }),
    ...(data.securityTimeout !== undefined && { securityTimeout: data.securityTimeout }),
  };
}

const toolsCache: Map<string, DiscoveredTool> = new Map();
let lastScanTime = 0;
const CACHE_TTL = 60000; // 1 minute cache

export async function scanTools(toolsPath: string = getDefaultToolsPath()): Promise<DiscoveredTool[]> {
  const tools: DiscoveredTool[] = [];
  let skippedCount = 0;
  const runtimeFilter = process.env.JEAN2_TOOLS_RUNTIME || null;
  
  // Resolve to absolute path to ensure tool paths are absolute
  const absoluteToolsPath = resolve(toolsPath);
  
  try {
    const entries = await readdir(absoluteToolsPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const toolDir = join(absoluteToolsPath, entry.name);
      const toolMdPath = getToolMdPath(toolDir);
      const toolJsonPath = getToolJsonPath(toolDir);

      try {
        let definition: ToolDefinition;

        if (existsSync(toolMdPath)) {
          const content = await readFile(toolMdPath, 'utf-8');
          definition = parseToolMd(content);
        } else if (existsSync(toolJsonPath)) {
          const content = await readFile(toolJsonPath, 'utf-8');
          definition = JSON.parse(content) as ToolDefinition;
        } else {
          console.warn(`No tool definition found in ${entry.name} (expected tool.md or tool.json)`);
          continue;
        }

        // Validate required fields
        if (!definition.name || !definition.script || !definition.runtime) {
          console.warn(`Invalid tool definition in ${entry.name}: missing required fields`);
          continue;
        }

        if (runtimeFilter && definition.runtime !== runtimeFilter) {
          skippedCount++;
          continue;
        }

        tools.push({
          definition,
          path: toolDir,
        });
      } catch (e) {
        console.warn(`Failed to read tool definition in ${entry.name}:`, e);
      }
    }
  } catch (_e) {
    // Tools directory doesn't exist yet
    console.warn(`Tools directory not found: ${absoluteToolsPath}`);
  }

  if (skippedCount > 0) {
    console.log(`  Skipped ${skippedCount} tool(s) (runtime filter: ${runtimeFilter})`);
  }

  // Update cache
  toolsCache.clear();
  for (const tool of tools) {
    toolsCache.set(tool.definition.name, tool);
  }
  lastScanTime = Date.now();
  
  return tools;
}

export async function getTool(name: string): Promise<DiscoveredTool | null> {
  // Return cached if fresh
  if (Date.now() - lastScanTime < CACHE_TTL && toolsCache.has(name)) {
    return toolsCache.get(name) || null;
  }
  
  // Rescan
  await scanTools();
  return toolsCache.get(name) || null;
}

export async function listTools(): Promise<ToolDefinition[]> {
  if (Date.now() - lastScanTime >= CACHE_TTL) {
    await scanTools();
  }
  
  return Array.from(toolsCache.values()).map(t => t.definition);
}

export function clearCache(): void {
  toolsCache.clear();
  lastScanTime = 0;
}
