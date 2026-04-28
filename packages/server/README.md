# @jean2/server

The AI Agent backend for Jean2. Built with **Bun**, **Hono**, and **Vercel AI SDK v6**.

Provides multi-provider LLM streaming, tool execution with security policies, subagent orchestration, MCP (Model Context Protocol) integration, and a real-time WebSocket + REST API for the Jean2 client.

## Features

- **Multi-provider LLM** — Anthropic, OpenAI, Google, OpenRouter, MiniMax, Zhipu, Codex (ChatGPT subscription via OAuth), and any OpenAI-compatible endpoint
- **Streaming agent loop** — multi-step tool execution with real-time WebSocket streaming
- **Tool system** — file-based tools with Bun/Node/Python/Bash/Go/Binary runtimes, security checks, and permission caching
- **Subagent orchestration** — hierarchical task delegation with configurable depth limits (max 2 levels)
- **MCP integration** — local (stdio) and remote (StreamableHTTP/SSE + OAuth) MCP server connectivity
- **Skills** — discoverable `SKILL.md` files in `.agents/skills/` directories
- **Preconfigs** — agent personality presets (Reader, Coder, Writer, Explore, General)
- **Session management** — compaction, revert, fork, message queueing, and interrupt with cascade
- **Token-based auth** — SHA-256 hashed API tokens with timing-safe comparison
- **SQLite storage** — sessions, messages, parts, permissions, queued messages, tool approvals
- **Daemon mode** — background server with PID file management and log tailing
- **Instructions** — global (`~/.jean2/AGENTS.md`) and project-level instructions injected into system prompts
- **Remote terminal** — PTY sessions with WebSocket binary frame protocol, multi-tab support, session reconnection, and idle cleanup

## Quick Start

```bash
# Initialize (creates ~/.jean2/ with config, database, tools dir)
jean2 init

# Start as background daemon
jean2 start

# Or run in foreground
jean2 server

# Check status
jean2 status
```

The server listens on `http://0.0.0.0:8742` by default.

## CLI Commands

```
jean2 <command> [options]

Commands:
  start                 Start server as background daemon
    -p, --port <port>   Port to listen on
    -h, --host <host>   Host to bind to

  stop                  Stop the running server daemon
  status                Check server daemon status
  restart               Restart the server daemon

  server [options]      Start server in foreground (for systemd)
  logs                  Tail server logs

  auth                  Token management
    show                Show current API token
    regenerate          Generate a new token (invalidates old one)

  init                  Initialize Jean2 (required before first use)
    --db-path <path>    Custom database path
    --tools-path <path> Custom tools path
    --force             Force re-initialization

  migrate               Run database migrations
  version               Show version
  help                  Show help
```

## Configuration

### Directory Layout

```
~/.jean2/
  config.json           # Server configuration (created by `jean2 init`)
  models.json           # LLM model definitions and defaults
  .env                  # Environment variables (API keys, settings)
  auth-token.json       # API token (SHA-256 hashed)
  AGENTS.md             # Global instructions (applied to all sessions)
  data/
    agent.db            # SQLite database (sessions, messages, etc.)
  tools/                # Tool definitions (one directory per tool)
  preconfigs/           # Agent personality presets
  prompts/              # Reusable prompt templates (*.md)
  providers/            # OAuth provider tokens (e.g. codex.json)
  server.pid            # Daemon PID file
  server.log            # Daemon log file
  workspaces/           # Virtual workspace directories
```

### Environment Variables

All settings can be placed in `~/.jean2/.env`. Process environment variables take precedence over values in `~/.jean2/.env`.

#### Server

| Variable | Default | Description |
|---|---|---|
| `JEAN2_PORT` | `8742` | Server listen port |
| `JEAN2_HOST` | `0.0.0.0` | Server bind host |
| `JEAN2_DISABLE_AUTH` | `false` | Disable authentication (for development only) |
| `JEAN2_DATABASE_PATH` | — | SQLite database path (defaults to `~/.jean2/data/agent.db`) |
| `JEAN2_TOOLS_PATH` | `~/.jean2/tools` | Tools directory path |
| `JEAN2_PRECONFIGS_PATH` | `~/.jean2/preconfigs` | Preconfigs directory path |
| `JEAN2_MODELS_PATH` | — | Models config file path (defaults to `~/.jean2/models.json`) |

#### LLM

| Variable | Default | Description |
|---|---|---|
| `JEAN2_LLM_TEMPERATURE` | `0.7` | Default LLM temperature |
| `JEAN2_LLM_MAX_TOKENS` | `32000` | Max output token cap |
| `JEAN2_LLM_MAX_STEPS` | `10` | Max agent loop steps (main agent) |
| `JEAN2_LLM_SUBAGENT_MAX_STEPS` | `50` | Max agent loop steps (subagent) |
| `JEAN2_LLM_BASE_URL` | — | Custom OpenAI-compatible base URL |
| `JEAN2_LLM_OPENAI_API_KEY` | — | OpenAI API key |
| `JEAN2_LLM_ANTHROPIC_API_KEY` | — | Anthropic API key |
| `JEAN2_LLM_GOOGLE_API_KEY` | — | Google API key |
| `JEAN2_LLM_OPENROUTER_API_KEY` | — | OpenRouter API key |
| `JEAN2_LLM_MINIMAX_API_KEY` | — | MiniMax API key |
| `JEAN2_LLM_ZHIPU_API_KEY` | — | Zhipu API key (open.bigmodel.cn) |
| `JEAN2_LLM_ZHIPU_CODING_API_KEY` | — | Zhipu Coding API key (api.z.ai) |

#### Compaction

| Variable | Default | Description |
|---|---|---|
| `JEAN2_COMPACTION_MODEL` | — | Model ID for summarization (defaults to session model) |
| `JEAN2_COMPACTION_PROVIDER` | — | Provider for summarization (defaults to session provider) |
| `JEAN2_COMPACTION_MAX_TOKENS` | `2000` | Max output tokens for summary |
| `JEAN2_COMPACTION_AUTO_THRESHOLD_RATIO` | `0.75` | Ratio for hybrid auto-compaction threshold |
| `JEAN2_COMPACTION_AUTO_RESERVE_CAP_TOKENS` | `32000` | Cap token reserve for auto-compaction formula |
| `JEAN2_COMPACTION_AUTO_SAFETY_MARGIN_TOKENS` | `20000` | Safety margin tokens for auto-compaction |
| `JEAN2_COMPACTION_PRESERVE_RECENT_TOOL_COUNT` | `3` | Recent completed tool outputs to preserve |
| `JEAN2_COMPACTION_PRESERVE_SMALL_TOOL_CHARS` | `200` | Small tool output size threshold (chars) |
| `JEAN2_COMPACTION_TOOL_CLEAR_CHARS_THRESHOLD` | `1000` | Minimum size for clearing tool outputs |
| `JEAN2_COMPACTION_MAX_PRUNED_TOOL_COUNT` | `50` | Max tools to prune per compaction |

### Compaction Configuration

Manual (`session.compact`) and automatic compaction share the same policy surface. Both flows:

1. Persist a trigger message with a `CompactionPart`
2. Generate an assistant summary message with `mode: 'compaction'`
3. Mark eligible tool outputs as compacted

**Model selection**: `JEAN2_COMPACTION_MODEL` / `JEAN2_COMPACTION_PROVIDER` override the session's model/provider for summarization. When unset, compaction uses the session's current model.

**Auto-compaction**: Uses a hybrid threshold formula (`autoThresholdRatio`, `autoReserveCapTokens`, `autoSafetyMarginTokens`) to trigger before the context window is exhausted.

**Tool pruning**: After summarization, completed tool outputs are evaluated for pruning. Protected items (skill tools, small outputs ≤200 chars, the N most recent) are preserved. Older, larger outputs exceeding `toolClearCharsThreshold` are marked as compacted and replaced with placeholders in subsequent context builds.

Example `.env` tuning:

```bash
# Use a cheaper model for summarization
JEAN2_COMPACTION_MODEL=gpt-5.1-codex-mini
JEAN2_COMPACTION_PROVIDER=openai
JEAN2_COMPACTION_MAX_TOKENS=1500

# Tune auto-compaction aggressiveness (lower ratio = earlier trigger)
JEAN2_COMPACTION_AUTO_THRESHOLD_RATIO=0.70
JEAN2_COMPACTION_AUTO_RESERVE_CAP_TOKENS=32000
JEAN2_COMPACTION_AUTO_SAFETY_MARGIN_TOKENS=15000

# Tune tool pruning (preserve more recent tools, raise clear threshold)
JEAN2_COMPACTION_PRESERVE_RECENT_TOOL_COUNT=5
JEAN2_COMPACTION_TOOL_CLEAR_CHARS_THRESHOLD=2000
```

### Models Configuration

Models are defined in `~/.jean2/models.json`. The file declares providers, their available models with context window sizes and max output tokens, and the default model/provider pair.

```json
{
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "models": [
        { "id": "gpt-4o", "name": "GPT-4o", "contextWindow": 128000, "maxOutputTokens": 16384, "tier": "standard" }
      ]
    }
  ],
  "defaultModel": "gpt-4o",
  "defaultProvider": "openai"
}
```

Model tiers: `budget`, `standard`, `premium`.

## API

### Authentication

All `/api/*` endpoints (except `/api/health` and `/api/info`) require authentication. Provide the token via:

- `Authorization: Bearer <token>` header
- `?token=<token>` query parameter

### REST Endpoints

#### Server

| Method | Path | Description |
|---|---|---|
| GET | `/` | Health check |
| GET | `/api/info` | Server info and features |
| GET | `/api/health` | Health check |
| GET | `/api/models` | List all available models |

#### Sessions

| Method | Path | Description |
|---|---|---|
| GET | `/api/sessions` | List all sessions (optional `?status=` filter) |
| POST | `/api/sessions` | Create a session |
| GET | `/api/sessions/:id` | Get a session |
| PUT | `/api/sessions/:id` | Update a session |
| DELETE | `/api/sessions/:id` | Delete a session |
| GET | `/api/sessions/:id/messages` | Get messages for a session |

#### Workspaces

| Method | Path | Description |
|---|---|---|
| GET | `/api/workspaces` | List workspaces (auto-creates virtual default) |
| POST | `/api/workspaces` | Create a workspace |
| GET | `/api/workspaces/:id` | Get a workspace |
| PATCH | `/api/workspaces/:id` | Update workspace name |
| DELETE | `/api/workspaces/:id` | Delete a workspace |
| GET | `/api/workspaces/:id/sessions` | List sessions in workspace |
| GET | `/api/workspaces/:id/files` | Browse files (supports `?path=`, `?search=`, `?limit=`) |

#### Preconfigs

| Method | Path | Description |
|---|---|---|
| GET | `/api/preconfigs` | List all preconfigs |
| POST | `/api/preconfigs` | Create a preconfig |
| GET | `/api/preconfigs/:id` | Get a preconfig |
| PUT | `/api/preconfigs/:id` | Update a preconfig |
| DELETE | `/api/preconfigs/:id` | Delete a preconfig |

#### Tools & MCP

| Method | Path | Description |
|---|---|---|
| GET | `/api/tools` | List all available tools |
| GET | `/api/tools/:name` | Get a tool definition |
| GET | `/api/workspaces/:id/mcp/status` | MCP server statuses |
| POST | `/api/workspaces/:id/mcp/connect` | Connect to an MCP server |
| POST | `/api/workspaces/:id/mcp/disconnect` | Disconnect an MCP server |
| POST | `/api/workspaces/:id/mcp/auth` | Start OAuth flow |
| POST | `/api/workspaces/:id/mcp/auth/callback` | Handle OAuth callback |

#### Prompts

| Method | Path | Description |
|---|---|---|
| GET | `/api/prompts` | List prompt templates |

#### Files

| Method | Path | Description |
|---|---|---|
| GET | `/api/fs/browse` | Browse any directory |
| GET | `/api/fs/parent` | Browse parent directory |

### WebSocket Protocol

Connect to `ws://<host>:<port>/ws?token=<token>&sessionId=<id>`.

**Client → Server messages:**

| Type | Description |
|---|---|
| `session.create` | Create a new session |
| `session.resume` | Resume an existing session (loads history) |
| `session.update` | Update session settings (e.g., preconfig) |
| `session.update_model` | Change model/provider for a session |
| `session.close` | Archive a session |
| `session.reopen` | Reopen an archived session |
| `session.delete` | Delete a session |
| `session.rename` | Rename a session |
| `session.compact` | Compact (summarize) messages |
| `session.revert` | Revert to a specific message |
| `session.fork` | Fork session at a message |
| `session.interrupt` | Cancel running generation (cascades to subagents) |
| `chat.message` | Send a chat message |
| `permission.response` | Approve or deny a tool permission request |
| `permission.list` | List workspace permissions |
| `permission.revoke` | Revoke a permission |
| `permission.revoke_all` | Revoke all workspace permissions |
| `queue.add` | Queue a message for later |
| `queue.remove` | Remove a queued message |

**Server → Client messages:**

| Type | Description |
|---|---|
| `session.created` | Session was created |
| `session.resumed` | Session was resumed with full state |
| `session.updated` | Session metadata changed |
| `session.renamed` | Session was renamed |
| `session.closed` | Session was archived |
| `session.reopened` | Session was reopened |
| `session.deleted` | Session was deleted |
| `session.forked` | Session was forked |
| `session.reverted` | Session was reverted |
| `session.interrupted` | Session generation was cancelled |
| `session.state` | Full message state (after revert) |
| `message.created` | New message created |
| `message.updated` | Message status/tokens updated |
| `part.created` | New part (text, tool, step, reasoning) created |
| `part.updated` | Part state updated (tool completion, step finish) |
| `part.append` | Streaming text/reasoning delta |
| `chat.usage` | Token usage for a generation step |
| `compaction.complete` | Message compaction finished |
| `permission.request` | Tool needs user approval |
| `queue.list` | Queued messages for a session |
| `queue.added` | Message was queued |
| `queue.removed` | Message was dequeued |
| `queue.sending` | Queued message is being sent |
| `error` | Error occurred |

## Architecture

```
src/
  index.ts              # Entry point — WebSocket server, message routing, chat handler
  app.ts                # Hono app — REST API routes, middleware
  cli.ts                # CLI binary — all jean2 commands
  init.ts               # First-run initialization wizard
  env.ts                # Environment variable loading (~/.jean2/.env)
  
  core/
    agent.ts            # LLM streaming, tool binding, AI SDK integration
    subagent.ts         # Hierarchical task delegation (Task tool)
    interrupt.ts        # Session/tool abort with parent-child cascade
    broadcast.ts        # WebSocket broadcast abstraction
    preconfig.ts        # Agent personality presets (file-based JSON)
    compaction.ts       # LLM-powered conversation summarization
    fork.ts             # Session branching at a message
    revert.ts           # Undo to a specific message
    approvals.ts        # In-memory pending approval tracking
    instructions.ts     # AGENTS.md loading (global + project)
    prompts/
      workspace-context.ts  # Workspace path context for system prompts
  
  store/
    index.ts            # SQLite database setup and schema
    sessions.ts         # Session CRUD
    messages.ts         # Message and part CRUD
    workspaces.ts       # Workspace CRUD
    permissions.ts      # Tool permission grant/revoke/query
    tool-approvals.ts   # Pending tool approval persistence
    queued-messages.ts  # Message queue persistence
    tool-executions.ts  # Tool execution history
  
  tools/
    registry.ts         # File-system tool scanning and caching
    executor.ts         # Tool execution via child process (stdin JSON)
    security-executor.ts # Security check script runner
    enhanced-executor.ts # Security + permission flow orchestration
    types.ts            # DiscoveredTool, ToolResult types
  
  mcp/
    manager.ts          # MCP client lifecycle (connect/disconnect/list tools)
    config.ts           # .jean2/mcp.json loader
    converter.ts        # MCP tool → AI SDK Tool adapter
    auth.ts             # MCP auth token storage
    oauth-provider.ts   # OAuth redirect flow for remote MCP
  
  providers/
    codex.ts            # Codex OAuth provider (ChatGPT subscription)
    registry.ts         # Provider registration and model factory
    storage.ts          # OAuth token persistence (~/.jean2/providers/)
  
  skills/
    registry.ts         # SKILL.md discovery from .agents/skills/
    skill-tool.ts       # AI SDK tool for loading skills at runtime
  
  auth/
    token.ts            # Token generation, hashing, validation
    middleware.ts       # Hono auth middleware (Bearer + query param)
  
  services/
    files.ts            # Directory listing and file search
    terminal/
      manager.ts        # PTY session lifecycle management
      frames.ts         # Binary frame protocol (opcodes)
  
  daemon/
    index.ts            # Background daemon start/stop/status/logs
  
  prompts/
    registry.ts         # Prompt template discovery (~/.jean2/prompts/*.md)
  
  utils/
    strip-visualization.ts  # Strip _visualization from tool output for LLM context
  
  config/
    index.ts            # Config loading, models config, path resolution
    models.json         # Default model definitions
```

## Tools

Tools are file-system based. Each tool is a directory under `~/.jean2/tools/` (or custom path) containing:

```
tools/
  my-tool/
    tool.json           # Tool definition (name, description, inputSchema, runtime)
    index.ts            # Tool implementation script
    security.ts         # (optional) Security check script
```

### tool.json Schema

```json
{
  "name": "my-tool",
  "description": "Does something useful",
  "script": "index.ts",
  "runtime": "bun",
  "timeout": 30000,
  "hasSecurityCheck": false,
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "File path" }
    },
    "required": ["path"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "content": { "type": "string" }
    }
  }
}
```

Supported runtimes: `bun`, `node`, `python`, `bash`, `go`, `binary`, `powershell`.

### Tool Execution

Tools receive input via **stdin** as JSON:

```json
{
  "path": "src/index.ts",
  "workspacePath": "/home/user/project",
  "sessionId": "abc-123"
}
```

Tools must print a JSON result to **stdout** and exit with code 0. Non-zero exits or invalid JSON are treated as errors.

### Security Checks

Tools with `"hasSecurityCheck": true` run a `security.ts` script before execution. The script receives the same stdin format and must output:

```json
{
  "allowed": true,
  "requiresApproval": true,
  "permissionType": "file_write",
  "permissionKey": "/home/user/project/src/index.ts",
  "message": "This tool wants to write to src/index.ts"
}
```

If `requiresApproval` is true, the permission request is sent to the client via WebSocket. Approved permissions with "always allow" are cached per workspace.

## MCP (Model Context Protocol)

MCP servers are configured per-workspace in `.jean2/mcp.json`:

```json
{
  "servers": {
    "my-local-server": {
      "type": "local",
      "command": ["npx", "my-mcp-server"],
      "env": { "API_KEY": "..." }
    },
    "my-remote-server": {
      "type": "remote",
      "url": "https://mcp.example.com/sse",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}
```

- **Local servers** use stdio transport
- **Remote servers** try StreamableHTTP first, fall back to SSE
- Remote servers support OAuth authentication flows
- MCP tools are automatically injected into agent sessions with `servername_toolname` naming

## Skills

Skills are discoverable instruction sets stored in `.agents/skills/<name>/SKILL.md` within a workspace:

```markdown
---
name: my-skill
description: A specialized workflow for X
---
# Detailed instructions here...

When performing this task, follow these steps...
```

Skills are loaded at runtime via the `skill` tool, which injects the full skill content into the agent's context. Preconfigs can restrict which skills are available via the `skills` field.

## Remote Terminal

The server provides a WebSocket endpoint for remote terminal (PTY) access within workspaces.

### WebSocket Endpoint

Connect to `ws://<host>:<port>/ws/terminal?token=<token>&workspaceId=<id>&sessionId=<optional-existing-session>`.

Messages use a binary frame protocol with typed opcodes:

| Opcode | Value | Direction | Description |
|--------|-------|-----------|-------------|
| INPUT | 0x01 | Client → Server | Send keystrokes/input to PTY |
| RESIZE | 0x02 | Client → Server | Resize terminal (columns, rows) |
| CLOSE | 0x03 | Client → Server | Destroy PTY session |
| OUTPUT | 0x04 | Server → Client | PTY output data |
| EXIT | 0x05 | Server → Client | Process exited (exit code) |
| ERROR | 0x06 | Server → Client | Error occurred |
| INIT_ACK | 0x07 | Server → Client | Session initialization acknowledgment |
| TITLE | 0x08 | Server → Client | Terminal title change |

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/workspaces/:id/terminals/:sessionId` | Get terminal session info |
| DELETE | `/api/workspaces/:id/terminals/:sessionId` | Kill a terminal session |

### Session Management

- Terminal sessions are workspace-isolated
- Supports session reconnection with scrollback buffer
- Idle sessions are automatically cleaned up after 30 minutes
- Shell defaults to `$SHELL` environment variable

## Preconfigs

Preconfigs define agent personalities with system prompts, tool sets, model preferences, and capabilities:

| ID | Description | Tools | Can Spawn Subagents |
|---|---|---|---|
| `coder` | Full code editing (default) | read-file, write-file, shell, glob, grep, webfetch | Yes |
| `reader` | Read-only exploration | read-file, glob, grep, webfetch | Yes |
| `writer` | Documentation/content | read-file, write-file | Yes |
| `explore` | Fast codebase search | read-file, glob, grep, webfetch | No |
| `general` | Multi-step task execution | read-file, write-file, shell, glob, grep, webfetch | Yes |

Preconfigs have a `mode` field: `primary` (user-facing), `subagent` (Task tool only), or `both`.

Custom preconfigs can be created via the REST API or by placing JSON files in `~/.jean2/preconfigs/`.

## Session Features

### Compaction

LLM-powered conversation summarization using an append-only message history. Compaction persists a trigger message with a `CompactionPart` and an assistant summary message with `mode: 'compaction'`. Incremental compaction builds on previous summaries. Tool outputs are marked as compacted when they exceed size thresholds.

### Revert

Undo to any previous message in the conversation. All messages and parts after the target are deleted from the database.

### Fork

Branch a session at any message. Creates a new session with a copy of all messages up to the fork point. Inherits model/provider selection and token counts.

### Interrupt

Cancel a running generation. Aborts the LLM stream and all in-progress tool executions. Cascades to child subagent sessions automatically.

### Message Queue

Queue messages while the agent is running. Queued messages are sent sequentially after each generation completes.

## Development

```bash
# Install dependencies
bun install

# Run in development (watch mode)
bun run dev

# Type check
bun run typecheck

# Build
bun run build

# Build standalone binary
bun run build:bin

# Build platform-specific binaries
bun run build:bin:macos
bun run build:bin:linux
```

## Building Standalone Binary

```bash
# Build all
bun run build:all

# Platform-specific
bun run build:bin:macos      # macOS ARM64
bun run build:bin:linux      # Linux x64
```

The resulting binary is self-contained and includes the Bun runtime. The CLI (`jean2 init`, `jean2 server`, etc.) works without a separate Bun installation.
