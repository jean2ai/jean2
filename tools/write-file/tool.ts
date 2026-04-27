import type { ToolDefinition, ToolContext, ToolResult } from '@jean2/sdk';
import type { CodeVisualization } from '@jean2/sdk';

interface Input {
  path: string;
  content: string;
}

export const definition: ToolDefinition = {
  name: 'write-file',
  description: 'Write content to a file, creating it if it doesn\'t exist or overwriting if it does.\n\nIMPORTANT: ALWAYS prefer using the edit tool to modify existing files. Only use write-file when:\n- Creating a completely new file\n- The file content is entirely replaced\n\nWarning: This tool overwrites existing files without confirmation. For targeted changes, use the edit tool instead.\n\nParameters:\n- path: Supports relative paths from workspace, absolute paths, or home paths (~/)',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file. Supports relative paths from workspace, absolute paths, or home paths.',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
  timeout: 30000,
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    py: 'python',
    go: 'go',
    rs: 'rust',
    sh: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return langMap[ext || ''] || ext || 'text';
}

export async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  try {
    const resolvedPath = ctx.resolvePath(input.path);

    if (ctx.isBlockedPath(resolvedPath)) {
      return { success: false, error: `Writing to system directories is not allowed: ${input.path}` };
    }

    if (!ctx.isWithinWorkspace(resolvedPath)) {
      const approved = await ctx.ask({
        target: 'permission',
        type: 'permission',
        question: 'Writing to files outside the workspace requires approval.',
        risk: 'medium',
        metadata: { permissionKey: 'path:outside_workspace', permissionType: 'action' }
      });
      if (!approved) return { success: false, error: 'USER_REJECTION' };
    }

    if (ctx.isSensitivePath(resolvedPath)) {
      const approved = await ctx.ask({
        target: 'permission',
        type: 'permission',
        question: 'Writing to sensitive files requires approval.',
        risk: 'medium',
        metadata: { permissionKey: 'file_pattern:sensitive', permissionType: 'action' }
      });
      if (!approved) return { success: false, error: 'USER_REJECTION' };
    }

    const existed = await ctx.fs.exists(resolvedPath);

    await ctx.fs.writeFile(resolvedPath, input.content);

    const lineCount = input.content.split('\n').length;

    const visualization: CodeVisualization = {
      type: 'code',
      path: resolvedPath,
      content: input.content,
      language: detectLanguage(resolvedPath),
      created: !existed,
      lineCount,
    };

    return {
      success: true,
      result: { path: resolvedPath, bytes: input.content.length },
      visualization,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}