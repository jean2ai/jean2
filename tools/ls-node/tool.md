---
name: ls
script: script.mjs
runtime: node
inputSchema:
  type: object
  properties:
    path:
      type: string
      description: "The directory to list. Supports relative paths from workspace, absolute paths, or home paths. Defaults to workspace root."
    ignore:
      type: array
      items:
        type: string
      description: "List of additional directory or file names to ignore."
    showHidden:
      type: boolean
      description: "Whether to show hidden files (starting with .). Default false."
outputSchema:
  type: object
  properties:
    content:
      type: string
    error:
      type: string
timeout: 30000
requireApproval: false
dangerous: false
hasSecurityCheck: false
---

List directory contents with tree formatting.

When to use:
- Exploring project structure for the first time
- Understanding directory layout
- Viewing file organization

When NOT to use:
- Finding specific files: Use glob tool instead
- Searching file contents: Use grep tool instead

Usage:
- path (optional): Directory to list. Defaults to workspace root.
- ignore (optional): List of additional directory or file names to ignore.
- showHidden (optional): Show hidden files (dotfiles). Default false.

Note: Output is limited to 100 entries. Common directories (node_modules, .git, dist, build, target, vendor, .venv, coverage, etc.) are automatically hidden. When truncated, a message is shown indicating the limit was reached.
