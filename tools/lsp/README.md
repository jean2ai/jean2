# lsp

Server tool for code intelligence via Language Server Protocol. Communicates with an external standalone LSP server over HTTP. Supports go-to-definition, find references, hover type info, symbol listing, and diagnostics.

## Requirements

- **Runtime**: `bun`
- **External**: LSP server running at `LSP_SERVER_URL` (default `http://localhost:8739`)

## Parameters

- `operation` (required): `definition` | `references` | `hover` | `symbols`
- `path` (required): Absolute path to the file
- `line` (optional): Line number (1-indexed)
- `character` (optional): Character position (1-indexed)
