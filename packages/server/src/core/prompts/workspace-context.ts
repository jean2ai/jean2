/**
 * Build workspace context for LLM system prompt
 * This tells the LLM where it's working and how paths work
 */
export function buildWorkspaceSystemPrompt(workspacePath: string): string {
  return `
<workspace>
## Working Directory

You are operating in: ${workspacePath}

### Path Resolution

All file operations support three path types:

1. **Relative Paths** (RECOMMENDED for workspace files)
   - Input: "packages/server/src/app.ts"
   - Resolves to: "${workspacePath}/packages/server/src/app.ts"

2. **Absolute Paths**
   - Input: "/Users/cherry/kx/jean2/packages/server/src/app.ts"
   - Used as-is

3. **Home Paths**
   - Input: "~/Documents/file.txt"
   - Expands to: "/Users/cherry/Documents/file.txt"

### Default Behaviors

- **File Operations**: Relative paths resolve from workspace root
- **Shell Commands**: Execute from workspace root by default
- **Search Operations**: Scoped to workspace by default

### Security

Operations outside the workspace directory require explicit approval:
- Writing outside workspace: Requires approval
- Reading outside workspace: Requires approval (configurable)
- System directories: Blocked

### Best Practices

1. Use relative paths for files within the workspace
2. Use the \`cwd\` parameter in shell commands instead of \`cd\`
3. When in doubt, use absolute paths

Current workspace: ${workspacePath}
</workspace>
`.trim();
}
