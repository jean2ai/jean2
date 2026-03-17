import { readdir, readFile } from 'fs/promises';
import { join, resolve } from 'path';
import type { ToolDefinition } from '@jean2/shared';
import type { DiscoveredTool } from './types';
import { getToolsPath } from '../env';

const DEFAULT_TOOLS_PATH = getToolsPath();

const toolsCache: Map<string, DiscoveredTool> = new Map();
let lastScanTime = 0;
const CACHE_TTL = 60000; // 1 minute cache

export async function scanTools(toolsPath: string = DEFAULT_TOOLS_PATH): Promise<DiscoveredTool[]> {
  const tools: DiscoveredTool[] = [];
  
  // Resolve to absolute path to ensure tool paths are absolute
  const absoluteToolsPath = resolve(toolsPath);
  
  try {
    const entries = await readdir(absoluteToolsPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const toolDir = join(absoluteToolsPath, entry.name);
      const toolJsonPath = join(toolDir, 'tool.json');
      
      try {
        const content = await readFile(toolJsonPath, 'utf-8');
        const definition = JSON.parse(content) as ToolDefinition;
        
        // Validate required fields
        if (!definition.name || !definition.script || !definition.runtime) {
          console.warn(`Invalid tool.json in ${entry.name}: missing required fields`);
          continue;
        }
        
        tools.push({
          definition,
          path: toolDir,
        });
      } catch (e) {
        console.warn(`Failed to read tool.json in ${entry.name}:`, e);
      }
    }
  } catch (_e) {
    // Tools directory doesn't exist yet
    console.warn(`Tools directory not found: ${absoluteToolsPath}`);
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
