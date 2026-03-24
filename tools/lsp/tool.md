---
name: lsp
script: script.ts
runtime: bun
inputSchema:
  type: object
  properties:
    operation:
      type: string
      enum:
        - definition
        - references
        - hover
        - symbols
      description: "The LSP operation to perform"
    path:
      type: string
      description: "Absolute path to the file"
    line:
      type: integer
      description: "Line number (1-indexed)"
    character:
      type: integer
      description: "Character position (1-indexed)"
  required:
    - operation
    - path
outputSchema:
  type: object
  properties:
    success:
      type: boolean
    result:
      type: object
    error:
      type: string
timeout: 30000
requireApproval: false
dangerous: false
hasSecurityCheck: false
---

Code intelligence via Language Server Protocol (LSP).

Operations:
- definition: Find where a symbol is defined
- references: Find all references to a symbol
- hover: Get type information and documentation for a symbol
- symbols: List all symbols (functions, classes, variables) in a document

Usage:
- operation (required): The LSP operation to perform
- path (required): Absolute path to the file
- line (required for definition/references/hover): Line number (1-indexed, as shown in editors)
- character (required for definition/references/hover): Character position (1-indexed)

Supported languages: TypeScript, JavaScript, TSX, JSX, PHP

Tip: Use read-file first to see line numbers, then use those positions for LSP operations.
