import type { ToolDefinition, ToolContext, ToolResult } from '@jean2/sdk';
import type { NoneVisualization } from '@jean2/sdk';
// @ts-expect-error no types available
import { convertToMarkdown } from 'filetomarkdown';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const DEFAULT_READ_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;
const MAX_LINE_SUFFIX = `... (line truncated to ${MAX_LINE_LENGTH} chars)`;
const MAX_BYTES = 50 * 1024;

interface Input {
  path: string;
  offset?: number;
  limit?: number;
}

export const definition: ToolDefinition = {
  name: 'file-to-markdown',
  description: 'Converts files to Markdown format using the `filetomarkdown` npm package. Conversion results are cached in session temp storage.\n\nWhen to use:\n- PDF documents (.pdf)\n- Microsoft Office (.docx, .xlsx, .pptx)\n- LibreOffice documents (.odt, .ods, .odp)\n- Archive files (.zip, .7z)\n\nWhen NOT to use:\n- Plain text or code files (.txt, .md, .js, .py, etc.) — use read-file instead\n- Fetching content from URLs — use webfetch instead\n\nParameters:\n- path (required): The absolute path to the file to convert\n- offset (optional): The line number to start reading from (1-indexed). Use to continue reading large outputs.\n- limit (optional): Maximum number of lines to return (defaults to 2000)\n\nBest practices:\n- For large documents, output is paginated — use offset to read subsequent sections\n- Use read-file for plain text and code files — it\'s faster and doesn\'t require conversion\n- Maximum supported file size is 50MB',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The absolute path to the file to convert to Markdown',
      },
      offset: {
        type: 'number',
        description: 'The line number to start reading from (1-indexed)',
      },
      limit: {
        type: 'number',
        description: 'The maximum number of lines to read (defaults to 2000)',
      },
    },
    required: ['path'],
  },
  timeout: 60000,
};

function computeChecksum(filePath: string, size: number, mtimeMs: number): string {
  return Bun.hash(`${filePath}:${size}:${mtimeMs}`).toString(16).padStart(8, '0');
}

export async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  try {
    const resolvedPath = ctx.resolvePath(input.path);

    if (ctx.isBlockedPath(resolvedPath)) {
      return { success: false, error: `Reading from system directories is not allowed: ${input.path}` };
    }

    const tempDir = ctx.env.get('JEAN2_TEMP_DIR') || ctx.env.get('TMPDIR') || '';
    const jean2TempPrefix = tempDir ? `${tempDir.replace(/[/\\]$/, '')}/jean2/` : '';
    const isJean2Temp = jean2TempPrefix && resolvedPath.startsWith(jean2TempPrefix);

    const isAllowedPath = ctx.allowedPaths && ctx.allowedPaths.some(p => resolvedPath.startsWith(p));

    if (!isJean2Temp && !isAllowedPath && !ctx.isWithinWorkspace(resolvedPath)) {
      const approved = await ctx.ask({
        target: 'permission',
        type: 'permission',
        question: 'Reading from files outside the workspace requires approval.',
        risk: 'medium',
        metadata: { permissionKey: 'path:outside_workspace', permissionType: 'action' }
      });
      if (!approved) return { success: false, error: 'USER_REJECTION' };
    }

    if (ctx.isSensitivePath(resolvedPath)) {
      const approved = await ctx.ask({
        target: 'permission',
        type: 'permission',
        question: 'Reading from sensitive files requires approval.',
        risk: 'medium',
        metadata: { permissionKey: 'file_pattern:sensitive', permissionType: 'action' }
      });
      if (!approved) return { success: false, error: 'USER_REJECTION' };
    }

    const stat = await ctx.fs.stat(resolvedPath);

    if (!stat) {
      return { success: false, error: `File not found: ${resolvedPath}` };
    }

    if (stat.isDirectory) {
      return { success: false, error: `Path is a directory, not a file: ${resolvedPath}` };
    }

    if (stat.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max 50MB)`,
      };
    }

    const checksum = computeChecksum(resolvedPath, stat.size, stat.modifiedAt.getTime());
    const cacheDir = `${ctx.sessionId}`;
    const cachePath = `${cacheDir}/file-to-markdown-${checksum}.md`;

    let markdown: string;
    let fromCache = false;

    if (await ctx.fs.exists(cachePath)) {
      markdown = await ctx.fs.readFile(cachePath, 'utf-8');
      fromCache = true;
    } else {
      markdown = await convertToMarkdown(resolvedPath);
      try {
        const dirExists = await ctx.fs.exists(cacheDir);
        if (!dirExists) {
          await ctx.fs.mkdir(cacheDir, { recursive: true });
        }
        await ctx.fs.writeFile(cachePath, markdown);
      } catch {
        // cache write failed, still return result
      }
    }

    const lines = markdown.split('\n');

    const readLimit = input.limit ?? DEFAULT_READ_LIMIT;
    const readOffset = input.offset ?? 1;
    const start = readOffset - 1;

    if (readOffset < 1) {
      return { success: false, error: 'offset must be greater than or equal to 1' };
    }

    const outputLines: string[] = [];
    let bytes = 0;

    for (let i = start; i < lines.length && outputLines.length < readLimit; i++) {
      let line = lines[i];

      if (line.length > MAX_LINE_LENGTH) {
        line = line.substring(0, MAX_LINE_LENGTH) + MAX_LINE_SUFFIX;
      }

      const lineWithNumber = `${i + 1}: ${line}`;
      const lineSize = new TextEncoder().encode(lineWithNumber).length + (outputLines.length > 0 ? 1 : 0);

      if (bytes + lineSize > MAX_BYTES) {
        break;
      }

      outputLines.push(lineWithNumber);
      bytes += lineSize;
    }

    const content = outputLines.join('\n');
    const totalLines = lines.length;
    const lastReadLine = start + outputLines.length;
    const nextOffset = lastReadLine + 1;
    const truncated = lastReadLine < totalLines;

    let finalContent = content;
    if (truncated) {
      finalContent += `\n\n(Showing lines ${readOffset}-${lastReadLine} of ${totalLines}. Use offset=${nextOffset} to continue.)`;
    } else {
      finalContent += `\n\n(End of converted markdown - total ${totalLines} lines)`;
    }

    const cacheInfo = fromCache ? ' (from cache)' : '';

    const visualization: NoneVisualization = {
      type: 'none',
      message: `Converted to markdown: ${resolvedPath}${cacheInfo}`,
    };

    return {
      success: true,
      result: { content: finalContent, cachePath },
      visualization,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}