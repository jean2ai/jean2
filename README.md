# Jean2

**Build your own AI agent. No lock-in, no limits, no opinions about what it should do.**

Jean2 is a self-hosted AI agent platform. Run a single server, connect any LLM, define your own tools and prompts, and access your agents from any device. It's not just for coding — it's for whatever you want an AI to do.

Your code. Your keys. Your agent.

---

## Why Jean2?

Every AI agent tool tells you what to do — what prompts to use, what tools you get, what models to pick. Jean2 is different. It's a platform for building *your* agent:

- **No baked-in behavior.** System prompts, tools, and skills are all files on disk. Edit them, add them, remove them. The agent does what you tell it to.
- **No vendor lock-in.** Connect any combination of LLM providers. Use budget models for routine tasks and premium models for hard problems. Switch per-session.
- **One server, your whole system.** Jean2 uses workspaces to organize projects, but the server runs once and manages everything. Every directory on your machine is a potential workspace.
- **Remote-first.** Access your agents from anywhere. Connect from your desktop, your phone, any browser. A simple Tailscale setup means your agents are always with you — at your desk, on the couch, on the train.
- **Extensible at every level.** Write tools in any runtime. Connect MCP servers. Define agent personalities. Add skills. The agent adapts to your workflow — not the other way around.

---

## Install

See [INSTALL.md](install/INSTALL.md) for full installation instructions — server, LSP service, client, and tools.

> **Quick start:** Download the server binary from [GitHub Releases](https://github.com/rabbyte-tech/jean2/releases) and run:
>
> ```bash
> jean2 init
> jean2 start
> ```

For development from source, see [Contributing](#contributing).

---

## Features

### Multi-Provider LLM Streaming

Connect to any combination of LLM providers — OpenAI, Anthropic, Google, OpenRouter, MiniMax, Zhipu, Codex (ChatGPT subscription via OAuth), or any OpenAI-compatible endpoint. Switch providers and models per-session. Models are organized into **budget**, **standard**, and **premium** tiers. Custom base URLs supported for self-hosted or proxy setups.

Built on [Vercel AI SDK v6](https://sdk.vercel.ai/) with real-time streaming and multi-step tool execution.

### Workspaces

Organize your work by project, by machine, by whatever makes sense. Workspaces map to directories on your server and isolate sessions, tools, permissions, and MCP connections. Switch between them instantly from any client.

### Tool System

Tools are just files on disk. A tool is a directory with two files: `tool.json` (name, description, input/output schemas, runtime) and a script. Drop it in the tools directory and the agent picks it up — no build step, no registration.

When the agent calls a tool, it receives input as JSON on **stdin** and must print a JSON result to **stdout**. That's the entire protocol. Tools execute in sandboxed child processes and support any runtime — `bun`, `node`, `python`, `bash`, `go`, `binary`, `powershell`, or anything else you configure.

Tools can optionally define a security check script that runs before execution — for example, a file-write tool might ask the user to approve the target path. Dangerous operations require explicit approval. Approved permissions are cached per-workspace.

Jean2 provides a registry of default tools to get started — download the ones you need, or write your own.

### MCP (Model Context Protocol)

Connect to any MCP server — local (stdio) or remote (StreamableHTTP/SSE). Configure per-workspace in `.jean2/mcp.json`. Remote servers support OAuth. MCP tools are automatically injected into agent sessions.

### Subagent Orchestration

Agents can spawn hierarchical subagents for complex tasks. Subagents run in isolated sessions, inherit workspace context, and support cascading interrupts. Configure which preconfigs can spawn subagents and set depth limits.

### Preconfigs (Agent Personalities)

Preconfigs define what an agent *is* — its system prompt, available tools, model preferences, skills access, and capabilities. Create as many as you need: a coding agent, a research assistant, a deployment runner, whatever your workflow requires.

Create preconfigs via the REST API or drop JSON files in `~/.jean2/preconfigs/`.

### Skills

Skills are discoverable instruction sets stored as `SKILL.md` files in `.agents/skills/`. Load them at runtime to give the agent specialized workflows — writing patterns, deployment procedures, code review checklists, anything you want.

### Session Management

- **Compact** — LLM-powered conversation summarization with structured output
- **Fork** — Branch any session at any message
- **Revert** — Undo to any previous point
- **Interrupt** — Cancel running generation with automatic cascade to subagents
- **Queue** — Queue messages while the agent is busy

### LSP Code Intelligence

A standalone HTTP→LSP bridge (`@jean2/lsp`) provides go-to-definition, find-references, hover info, document symbols, and diagnostics. Supports TypeScript and PHP with an extensible language client architecture.

### Remote Terminal

Full remote terminal with PTY support. Connect to a shell in any workspace with multi-tab terminals, session reconnection with scrollback, and configurable shell. Uses xterm.js on the client and Bun's PTY support on the server.

### Clients

One server, every device:

| Client | Platform |
|--------|----------|
| **Desktop** | Tauri 2 native app (macOS, Windows) |
| **iOS** | Tauri 2 native iPhone app |
| **Web** | `npx @jean2/client` — zero-install, any browser |

Connect from anywhere. The client talks to the server over WebSocket and REST — same protocol, same experience, whether you're on your desk or on the go.

Features streaming chat with real-time deltas, file tree browser, tool permission dialogs, diff viewers, terminal output, syntax-highlighted code blocks, markdown rendering, dark/light themes, offline detection with auto-reconnect, and multi-server + multi-workspace support. Includes a built-in remote terminal and two view modes (Default and Overview) for seamless multi-workspace switching.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Client Layer                               │
│    ┌──────────┐  ┌──────────┐  ┌─────────────────────────┐     │
│    │ Desktop  │  │ iPhone   │  │ Web (npx @jean2/client) │     │
│    │ (Tauri)  │  │ (Tauri)  │  │                         │     │
│    └────┬─────┘  └────┬─────┘  └──────────┬──────────────┘     │
│         └──────────────┴───────────────────┘                     │
│                         ·                                        │
│              WebSocket + REST (any network)                      │
│              local · Tailscale · VPN · public                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│                    Server (@jean2/server)                        │
│                                                                  │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────────┐         │
│  │ Agent Loop  │  │ Tool     │  │ MCP Manager       │         │
│  │ (AI SDK v6) │  │ Executor │  │ (stdio + remote)  │         │
│  └──────┬──────┘  └────┬─────┘  └────────┬──────────┘         │
│         └───────────────┼────────────────┘                       │
│               ┌─────────┴──────────┐                            │
│               │   ~/.jean2/tools/ │                            │
│               │   (any runtime)   │                            │
│               └──────────────────┘                            │
│                     ┌──────────────┐                             │
│                     │ Subagent     │                             │
│                     │ Orchestrator │                             │
│                     └──────┬───────┘                             │
│               ┌────────────┴────────────┐                        │
│               │     SQLite Store       │                        │
│               │ Sessions · Messages    │                        │
│               │ Permissions · History  │                        │
│               └────────────────────────┘                        │
│                                                                  │
│              Workspaces → directories on your machine            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│                     Services Layer                               │
│   ┌──────────────────────────────────────────────────┐         │
│   │ LSP Service (@jean2/lsp)                         │         │
│   │ TypeScript · PHP — definitions, references,      │         │
│   │ hover, symbols, diagnostics                      │         │
│   └──────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### Packages

| Package | Description |
|---------|-------------|
| [`@jean2/server`](packages/server/README.md) | Agent loop, tool execution, REST + WebSocket API, SQLite, daemon mode |
| [`@jean2/client`](packages/client/README.md) | React 19 + Tauri 2 UI — chat, file browser, permissions, multi-server |
| [`@jean2/shared`](packages/shared/README.md) | Shared TypeScript types and WebSocket protocol definitions |
| [`@jean2/lsp`](services/lsp/README.md) | Standalone LSP HTTP bridge — code intelligence service |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh/) |
| Server | [Hono](https://hono.dev/), AI SDK v6, SQLite |
| Client | React 19, Vite 6, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui, Radix UI |
| Desktop / Mobile | [Tauri 2](https://tauri.app/) |
| LLM | Vercel AI SDK v6, MCP SDK |

---

## Configuration

All configuration lives in `~/.jean2/`:

```
~/.jean2/
  config.json        # Server settings (created by init)
  models.json        # LLM model definitions and defaults
  .env               # API keys and environment variables
  auth-token.json    # SHA-256 hashed API token
  AGENTS.md          # Global instructions (injected into every session)
  data/
    agent.db         # SQLite database
  tools/             # Tool definitions (one directory per tool)
  preconfigs/        # Agent personality presets
  prompts/           # Reusable prompt templates
  providers/         # OAuth provider tokens (e.g. codex.json)
  server.pid         # Daemon PID file
  server.log         # Daemon log file
  workspaces/        # Virtual workspace directories
```

See the [server README](packages/server/README.md) for the full environment variable reference and API documentation.

---

## Contributing

Contributions are welcome. See [AGENTS.md](AGENTS.md) for project conventions, code style, and development workflow.

## License

[Apache 2.0](LICENSE)
