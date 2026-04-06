---
name: grep
script: script.mjs
runtime: node
securityScript: security.mjs
inputSchema:
  type: object
  properties:
    pattern:
      type: string
      description: "The regex pattern to search for"
    path:
      type: string
      description: "The file or directory to search in. Supports relative paths from workspace, absolute paths, or home paths."
    include:
      type: string
      description: "File pattern to include"
  required:
    - pattern
    - path
outputSchema:
  type: object
  properties:
    matches:
      type: array
      items:
        type: object
        properties:
          file:
            type: string
          line:
            type: number
          content:
            type: string
timeout: 30000
requireApproval: false
dangerous: false
hasSecurityCheck: true
---

Search for text patterns in files using regular expressions.

When to use:
- Finding code containing specific patterns
- Searching for function/class definitions
- Locating usage of variables or imports

When NOT to use:
- Finding files by name: Use glob tool instead
- Simple file reading: Use read-file tool instead

Pattern examples:
- `function\\s+\\w+` - Function declarations
- `import.*from` - Import statements
- `TODO|FIXME` - Todo comments
- `class \\w+` - Class declarations

Usage:
- pattern (required): Regex pattern to search for
- path (required): File or directory to search in
- include (optional): File pattern to filter (e.g., `*.ts`, `*.{ts,tsx}`)

Returns file paths and line numbers with matching content.
