---
name: glob
script: script.mjs
securityScript: security.mjs
runtime: node
inputSchema:
  type: object
  properties:
    pattern:
      type: string
      description: "The glob pattern to match"
    path:
      type: string
      description: "The directory to search in. Supports relative paths from workspace, absolute paths, or home paths. Defaults to workspace root."
  required:
    - pattern
outputSchema:
  type: object
  properties:
    files:
      type: array
      items:
        type: string
timeout: 30000
requireApproval: false
dangerous: false
hasSecurityCheck: true
---

Find files matching a glob pattern. Returns matching file paths sorted by modification time.

When to use:
- Finding files by name patterns (e.g., all TypeScript files)
- Locating specific file types in a project
- When you know the directory structure pattern

When NOT to use:
- Searching file contents: Use grep tool instead
- Exploring unknown structure: Use ls tool instead

Pattern examples:
- `**/*.ts` - All TypeScript files recursively
- `src/**/*.tsx` - All TSX files in src directory
- `*.{js,ts}` - All JS and TS files in current directory
- `package.json` - Specific file

Usage:
- pattern (required): The glob pattern to match
- path (optional): Directory to search in. Defaults to workspace root.
