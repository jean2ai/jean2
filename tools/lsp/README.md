# lsp

Code intelligence via Language Server Protocol. Operations: definition, references, hover, symbols. Supports TypeScript, JavaScript, TSX, JSX.

## Parameters

- `operation` (required): The LSP operation to perform: 'definition' | 'references' | 'hover' | 'symbols'
- `path` (required): Absolute path to the file
- `line` (optional): Line number (1-indexed)
- `character` (optional): Character position (1-indexed)

## Installation

Download the tool bundle from GitHub releases and extract it.

## Usage

```json
{
  "name": "lsp",
  "parameters": {
    "operation": "definition",
    "path": "/workspace/src/main.ts",
    "line": 10,
    "character": 5
  }
}
```
