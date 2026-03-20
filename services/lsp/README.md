# @jean2/lsp

Standalone Language Server Protocol service that exposes code intelligence over HTTP. Manages persistent LSP client connections (typescript-language-server, intelephense) and routes operations — go-to-definition, find-references, hover, document symbols, and diagnostics — to the correct language server per workspace session.

Built with [Bun](https://bun.sh/) and [Hono](https://hono.dev/). Compiles to a single standalone binary.

## Architecture

```
HTTP (Hono)                        LSP Protocol (stdio)
    │                                     │
    ▼                                     ▼
┌─────────┐   ┌──────────────┐   ┌─────────────────┐
│  app.ts  │──▶│  manager.ts  │──▶│ workspace-      │
│  Routes  │   │  LSPManager  │   │ session.ts      │
└─────────┘   │  (singleton) │   │                 │
              └──────────────┘   └───────┬─────────┘
                                         │
                              ┌──────────┼──────────┐
                              ▼          ▼          ▼
                         base.ts    typescript.ts  php.ts
                         BaseLSP    TypeScriptLSP   PhpLSP
                         Client     Client          Client
                              │          │          │
                              ▼          ▼          ▼
                         typescript-   typescript   intelephense
                         language-     typescript
                         server
```

**Request flow:** `POST /definition` → `LSPManager` → `WorkspaceSession` (by `workspaceId`) → `BaseLSPClient` (by file extension) → LSP server process via JSON-RPC.

### Key Components

| File | Role |
|---|---|
| `src/app.ts` | Hono HTTP routes — all API endpoints |
| `src/index.ts` | Bun HTTP server bootstrap, signal handling |
| `src/cli.ts` | CLI entrypoint — `jean2-lsp init/start/stop/restart/status/server/logs` |
| `src/manager.ts` | Singleton `LSPManager` — workspace registry, idle cleanup timer |
| `src/workspace-session.ts` | Per-workspace session — LSP client lifecycle, file tracking, language detection |
| `src/clients/base.ts` | Abstract `BaseLSPClient` — raw LSP stdio protocol (JSON-RPC + Content-Length framing) |
| `src/clients/typescript.ts` | `TypeScriptLSPClient` — wraps `typescript-language-server --stdio` |
| `src/clients/php.ts` | `PhpLSPClient` — wraps `intelephense --stdio` |
| `src/diagnostics.ts` | `DiagnosticsManager` — in-memory diagnostic collection per URI |
| `src/config/index.ts` | Config file management at `~/.jean2/services/lsp/` |
| `src/env.ts` | Environment variable loading from `~/.jean2/services/lsp/.env` |
| `src/init.ts` | First-run setup — creates config directory, `.env` template, `config.json` |
| `src/validation.ts` | Path normalization and workspace boundary checks |
| `src/types.ts` | LSP primitives — `Position`, `Range`, `Location`, `Diagnostic`, `SymbolInformation`, etc. |

## Prerequisites

Install the LSP servers for the languages you need:

**TypeScript / JavaScript:**

```bash
npm install -g typescript-language-server typescript
```

**PHP:**

```bash
npm install -g intelephense
```

## Installation

From source:

```bash
cd services/lsp
bun install
bun run build
```

Compile standalone binary:

```bash
# Current platform
bun run build:bin

# macOS ARM64
bun run build:bin:macos

# Linux x64
bun run build:bin:linux
```

Output: `dist/bin/jean2-lsp`

## Configuration

### Environment Variables

Loaded from `~/.jean2/services/lsp/.env` (created on init). Also settable as process env vars.

| Variable | Default | Description |
|---|---|---|
| `JEAN2_LSP_PORT` | `8739` | HTTP server port |
| `JEAN2_LSP_HOST` | `0.0.0.0` | HTTP server bind address |
| `JEAN2_LSP_IDLE_TIMEOUT_MS` | `1800000` (30 min) | Idle workspace cleanup threshold |

### Config Directory

```
~/.jean2/services/lsp/
├── config.json    # Service config (port, host, version, initializedAt)
├── .env           # Environment variables
├── lsp.pid        # Daemon PID file
├── lsp.log        # Daemon log file
└── intelephense/  # PHP LSP server storage (auto-created)
```

## CLI

```bash
jean2-lsp init                  # First-time setup (requires `jean2 init` first)
jean2-lsp init -f               # Force re-initialization
jean2-lsp init -p 4000          # Initialize with custom port
jean2-lsp start                 # Start as background daemon
jean2-lsp start -p 4000         # Start on custom port
jean2-lsp stop                  # Stop the daemon
jean2-lsp restart               # Restart the daemon
jean2-lsp status                # Check daemon status
jean2-lsp server                # Run in foreground (for systemd/nix)
jean2-lsp logs                  # Tail daemon logs
jean2-lsp version               # Show version
jean2-lsp help                  # Show help
```

### Flags

| Flag | Description |
|---|---|
| `-p, --port <port>` | Port to listen on |
| `--host <host>` | Host to bind to |
| `-f, --force` | Force re-initialization (init only) |

## HTTP API

All endpoints accept and return JSON. Every response follows the shape:

```json
{ "success": boolean, "result"?: ..., "error"?: string }
```

### Initialize Workspace

```
POST /initialize
```

```json
{
  "workspaceId": "my-project",
  "workspaceRoot": "/path/to/project"
}
```

Initializes a workspace session. If a session already exists for the given `workspaceId`, it is shut down and replaced.

### Get Definitions

```
POST /definition
```

```json
{
  "workspaceId": "my-project",
  "uri": "/path/to/file.ts",
  "position": { "line": 10, "character": 5 }
}
```

Returns `Location[]` — the definition location(s) for the symbol at the given position.

### Get References

```
POST /references
```

```json
{
  "workspaceId": "my-project",
  "uri": "/path/to/file.ts",
  "position": { "line": 10, "character": 5 }
}
```

Returns `Location[]` — all references to the symbol at the given position.

### Get Hover

```
POST /hover
```

```json
{
  "workspaceId": "my-project",
  "uri": "/path/to/file.ts",
  "position": { "line": 10, "character": 5 }
}
```

Returns `{ content: string, range?: Range }` — type information and documentation.

### Get Document Symbols

```
POST /symbols
```

```json
{
  "workspaceId": "my-project",
  "uri": "/path/to/file.ts"
}
```

Returns `SymbolInformation[]` — all symbols (functions, classes, methods, variables) in the document.

### Get Diagnostics

```
POST /diagnostics
```

Single file:

```json
{
  "workspaceId": "my-project",
  "uri": "/path/to/file.ts"
}
```

All files (omit `uri`):

```json
{
  "workspaceId": "my-project"
}
```

Returns `Diagnostic[]` or `{ [uri: string]: Diagnostic[] }`.

### Open / Close Files

Files must be opened before LSP operations work on them.

```
POST /open
```

```json
{
  "workspaceId": "my-project",
  "uri": "/path/to/file.ts",
  "content": "file contents..."
}
```

```
POST /close
```

```json
{
  "workspaceId": "my-project",
  "uri": "/path/to/file.ts"
}
```

### Shutdown Workspace

```
POST /shutdown
```

```json
{
  "workspaceId": "my-project"
}
```

Stops all LSP clients and removes the workspace session.

### List Active Workspaces

```
GET /workspaces
```

Returns `WorkspaceSessionInfo[]` with `workspaceId`, `workspaceRoot`, `lastAccessedAt`, `createdAt`.

## Supported Languages

| Language | Extensions | LSP Server | Client |
|---|---|---|---|
| TypeScript | `.ts`, `.tsx`, `.mts`, `.cts` | `typescript-language-server` | `TypeScriptLSPClient` |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | `typescript-language-server` | `TypeScriptLSPClient` |
| PHP | `.php`, `.phtml` | `intelephense` | `PhpLSPClient` |

Language is detected from file extension when a file is opened.

## Workspace Lifecycle

1. **Initialize** — `POST /initialize` creates a `WorkspaceSession` with an empty client pool
2. **Open files** — `POST /open` triggers lazy LSP client startup for the detected language
3. **Operations** — definition, references, hover, symbols, diagnostics routed to the correct client
4. **Idle cleanup** — every 5 minutes, sessions idle beyond `JEAN2_LSP_IDLE_TIMEOUT_MS` (default 30 min) are automatically shut down
5. **Shutdown** — `POST /shutdown` or idle cleanup stops all LSP processes and clears state

## Adding a New Language

1. Create `src/clients/<language>.ts` extending `BaseLSPClient`:

```typescript
import { BaseLSPClient } from './base';

export class MyLanguageLSPClient extends BaseLSPClient {
  readonly languageId = 'myLanguage';
  readonly serverCommand = ['my-language-server', '--stdio'];

  getInitializeOptions(): Record<string, unknown> {
    return { /* language-specific options */ };
  }
}
```

2. Register in `src/clients/index.ts`:

```typescript
import { MyLanguageLSPClient } from './myLanguage';

// In createClientForLanguage:
case 'myLanguage':
  return new MyLanguageLSPClient();
```

3. Add extension mappings in `src/workspace-session.ts` → `getLanguageId()`.
