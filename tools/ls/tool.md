---
name: ls
script: script.ts
runtime: bun
inputSchema:
  type: object
  properties:
    path:
      type: string
      description: "The directory to list. Supports relative paths from workspace, absolute paths, or home paths. Defaults to workspace root."
    recursive:
      type: boolean
      description: "Whether to list recursively (show tree). Default true."
    depth:
      type: number
      description: "Maximum depth for tree. Default unlimited."
    showHidden:
      type: boolean
      description: "Whether to show hidden files (starting with .). Default false."
outputSchema:
  type: object
  properties:
    content:
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
- recursive (optional): Show tree structure. Default true.
- depth (optional): Maximum depth for tree. Default unlimited.
- showHidden (optional): Show hidden files (dotfiles). Default false.

Note: Common directories (node_modules, .git, dist) are automatically hidden.
