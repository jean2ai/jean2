import { readdir, stat } from "fs/promises";
import { join, relative, resolve } from "path";
import path from 'node:path';
import os from 'node:os';

interface Input {
  pattern: string;
  path?: string;
  workspacePath: string;
  sessionId?: string;
}

interface Output {
  files: string[];
  error?: string;
  _visualization?: {
    type: 'none';
    message: string;
  };
}

function resolvePath(p: string, ws: string): string {
  // Expand home directory
  if (p === '~' || p.startsWith('~/')) {
    p = p.replace('~', os.homedir());
  }
  
  // If absolute, return as-is
  if (path.isAbsolute(p)) {
    return path.resolve(p);
  }
  
  // If relative, join with workspace
  return path.resolve(ws, p);
}

/**
 * Convert a glob pattern to a regex
 */
function globToRegex(pattern: string): RegExp {
  // Split pattern into parts and convert each to regex
  const parts = pattern.split("/");
  
  // Check if the pattern starts with **
  const hasLeadingRecursive = parts[0] === "**";
  
  const regexParts = parts.map((part) => {
    if (part === "**") {
      // Matches any number of directories
      return "(?:.+/)?";
    }
    if (part === "*") {
      // Matches any number of characters except /
      return "[^/]*";
    }
    // For other parts, escape special chars and convert * and ? to regex
    return part
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
  });
  
  let regexStr: string;
  
  if (hasLeadingRecursive) {
    // For **.ts style patterns, match both with and without leading path
    // Convert **/*.ts to match both "script.ts" and "dir/script.ts"
    const remainingParts = regexParts.slice(1);
    regexStr = "^(?:" + remainingParts.join("/") + "|[^/]*/" + remainingParts.join("/") + ")$";
  } else {
    // Normal case
    regexStr = "^" + regexParts.join("/") + "$";
  }
  
  return new RegExp(regexStr);
}

/**
 * Check if a path matches the glob pattern
 */
function matchesGlob(filePath: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, "/");
  
  const regex = globToRegex(pattern);
  return regex.test(normalizedPath);
}

/**
 * Check if pattern requires recursive directory traversal
 */
function isRecursivePattern(pattern: string): boolean {
  return pattern.includes("**");
}

/**
 * Recursively walk a directory and find matching files
 */
async function walkDirectory(
  dirPath: string,
  pattern: string,
  basePath: string,
  results: string[],
  recursive: boolean
): Promise<void> {
  // Skip node_modules directories
  const dirName = dirPath.split(/[/\\]/).pop() || "";
  if (dirName === "node_modules") {
    return;
  }
  
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relativePath = relative(basePath, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        // Recurse into subdirectories only if pattern explicitly uses ** for recursive matching
        if (recursive) {
          await walkDirectory(fullPath, pattern, basePath, results, recursive);
        }
      } else if (entry.isFile()) {
        // Check if file matches the pattern
        if (matchesGlob(relativePath, pattern)) {
          results.push(relativePath);
        }
      }
    }
  } catch (error) {
    // Silently ignore permission errors or other access issues
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "EACCES" && err.code !== "EPERM" && err.code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * Simple glob implementation using Node.js built-ins
 */
async function glob(pattern: string, cwd: string): Promise<string[]> {
  const results: string[] = [];
  const resolvedCwd = resolve(cwd);
  
  const hasWildcard = pattern.includes("*") || pattern.includes("?");
  const recursive = isRecursivePattern(pattern);

  if (!hasWildcard) {
    // No wildcards - just check if the file exists
    try {
      const filePath = join(resolvedCwd, pattern);
      await stat(filePath);
      results.push(pattern);
    } catch {
      // File doesn't exist
    }
    return results;
  }

  // Walk the directory tree and match files against the pattern
  await walkDirectory(resolvedCwd, pattern, resolvedCwd, results, recursive);

  return results.sort();
}

// Main execution
async function main() {
  const inputText = await (async () => {
    // Read from stdin
    const chunks: Buffer[] = [];
    const stdin = process.stdin;
    
    return new Promise<string>((resolve, reject) => {
      stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
      stdin.on("end", () => resolve(Buffer.concat(chunks).toString()));
      stdin.on("error", reject);
    });
  })();

  let input: Input;
  try {
    input = JSON.parse(inputText);
  } catch {
    const output: Output = { files: [], error: "Invalid JSON input" };
    console.log(JSON.stringify(output));
    return;
  }

  const { pattern, path: inputPath, workspacePath, sessionId } = input;

  if (!sessionId || !workspacePath) {
    const output: Output = { files: [], error: 'Missing required sessionId or workspacePath' };
    console.log(JSON.stringify(output));
    return;
  }

  if (!pattern) {
    const output: Output = { files: [], error: "Pattern is required" };
    console.log(JSON.stringify(output));
    return;
  }

  try {
    const cwd = inputPath ? resolvePath(inputPath, workspacePath) : workspacePath;
    const files = await glob(pattern, cwd);
    const output: Output = {
      files,
      _visualization: {
        type: 'none',
        message: `Glob: "${pattern}" (${files.length} files)`,
      },
    };
    console.log(JSON.stringify(output));
  } catch (e) {
    const output: Output = { files: [], error: (e as Error).message };
    console.log(JSON.stringify(output));
  }
}

main();
