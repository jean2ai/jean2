---
name: write-file
script: script.mjs
runtime: node
securityScript: security.mjs
inputSchema:
  type: object
  properties:
    path:
      type: string
      description: "Path to the file. Supports relative paths from workspace (e.g., \"src/file.ts\"), absolute paths (e.g., \"/full/path/file.ts\"), or home paths (e.g., \"~/file.ts\")."
    content:
      type: string
      description: "The content to write to the file"
  required:
    - path
    - content
outputSchema:
  type: object
  properties:
    success:
      type: boolean
    error:
      type: string
timeout: 30000
requireApproval: false
dangerous: false
hasSecurityCheck: true
---

Write content to a file, creating it if it doesn't exist or overwriting if it does.

IMPORTANT: ALWAYS prefer using the edit tool to modify existing files. Only use write-file when:
- Creating a completely new file
- The file content is entirely replaced

Usage:
- path: Supports relative paths from workspace, absolute paths, or home paths (~/)
- content: The full content to write to the file

Warning: This tool overwrites existing files without confirmation. For existing files, use the edit tool instead to make targeted changes.
