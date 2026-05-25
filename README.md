<p align="center">
  <img src="docs/promo.webp" alt="Jean2 desktop client — chat interface, workspace selector, and tool execution" width="800">
</p>

<p align="center">
  <strong>Your AI agent. One server. Any device. No baked-in behavior.</strong>
</p>

<p align="center">
  A coding assistant, a research agent, a personal automation — same binary, different configuration.
</p>

<p align="center">
  <a href="docs/getting-started.md">Get Started</a> ·
  <a href="docs/">Docs</a> ·
  <a href="https://github.com/rabbyte-tech/jean2">GitHub</a> ·
  <a href="https://chromewebstore.google.com/detail/jean2browser/jpahdfmmfmmnacapmkchljmcijoedcpj">Chrome Extension</a> ·
  <a href="https://discord.com/invite/38sUKnUNPQ">Discord</a>
</p>

---

## Quick Start

### Install

**macOS / Linux:**
```bash
curl -fsSL https://jean2.ai/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://jean2.ai/install.ps1 | iex
```

### Run

```bash
jean2 init
jean2 start
```

Connect a client:

```bash
jean2 open
```

The server automatically serves the client on `http://localhost:3774`.

> Desktop app for macOS (Electron), plus a PWA client that runs on any device — phone, tablet, or desktop. See the [Getting Started guide](docs/getting-started.md) for all options.
>
> For development from source, see [Contributing](#contributing).

---

## What Sets It Apart

### 🧠 Any LLM

Connect any combination of LLM providers — OpenAI, Anthropic, Google, OpenRouter, or any OpenAI-compatible endpoint. Switch providers and models per-session. Budget models for routine tasks, premium for hard problems. No vendor lock-in.

### 🔧 Extensible Tools

Write tools in TypeScript — a tool is just a directory with a `tool.ts` entry point and a `package.json`. Export a `definition` and an `execute` function, and the agent picks it up. Tools are compiled at install time, no manual registration needed. Tools get a full `ToolContext` with `ctx.ask()` for permissions and user interaction.

### 🛡️ Ask Protocol

Every tool interaction flows through a unified Ask protocol. Permissions, user questions, confirmations, forms — all routed through the same typed channel. Tools use `ctx.ask()` to request approval, ask questions, or query client capabilities. The client handles the UI, the tool gets a typed response.

### 🔌 MCP & Skills

Connect any MCP server (local or remote, with OAuth). Define Skills as discoverable `SKILL.md` instruction sets. Connect MCP servers per workspace and install skills to make them available to your agent sessions.

### 🧩 Browser Extension

Give your agent eyes on the web. The [Jean2Browser extension](https://chromewebstore.google.com/detail/jean2browser/jpahdfmmfmmnacapmkchljmcijoedcpj) lets the agent navigate pages, read content, and click elements — install it directly from the Chrome Web Store.

### 🤖 Subagent Orchestration

Agents spawn hierarchical subagents for complex tasks. Isolated sessions, inherited workspace context, cascading interrupts. Depth limited to 2 levels.

### 🌐 Access From Anywhere

One persistent server. REST + WebSocket under the hood. Desktop, mobile, or browser — all connect the same way. Works over Tailscale, VPN, or local network.

### 🎯 Make It Yours

System prompts, tools, and skills are all files on disk. Edit them, add them, remove them. Your agent, your rules.

---

## Use Cases

| Use Case | Description                                                                                                                               |
|----------|-------------------------------------------------------------------------------------------------------------------------------------------|
| **AI-Powered Coding** | Connect Claude, GPT-5.5, or Gemini to your codebase. Subagents explore, refactor, and implement with full workspace isolation.            |
| **Research & Analysis** | Give your agent tools to query APIs, scrape pages, and process documents. Isolated workspaces keep contexts separate.                     |
| **Deployment & Ops** | Connect MCP servers for Kubernetes, AWS, or Terraform. Multi-step deployment pipelines via subagent orchestration.                        |
| **Automation Workflows** | Create agent personalities for repetitive tasks. Skills let agents follow domain-specific workflows. Queue sessions for batch processing. |

---

## Tools

A set of built-in tools to get started with `jean2 init` — or pick what you need and write your own in TypeScript.

| Tool | Description |
|------|-------------|
| **apply-patch** | Apply unified diff patches to files atomically |
| **edit** | String replacements in files with fuzzy matching |
| **glob** | Find files matching glob patterns |
| **read-file** | Read files and directory listings |
| **write-file** | Write content to files |
| **grep** | Search files with regex patterns |
| **question** | Ask users structured questions (forms, selects, confirmations) |

[+17 more tools available](docs/tools.md) · [Explore all tools](docs/tools.md)

> Tools are TypeScript modules (`tool.ts` + `package.json`) that implement the `ToolModule` interface from `@jean2/sdk`. They can use the Ask protocol (`ctx.ask()`) for permissions and user interaction.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Client Layer                              │
│    ┌───────────────────┐  ┌─────────────────────────────────┐   │
│    │ Desktop (Electron)│  │ Web / PWA (jean2 open)          │   │
│    └────────┬──────────┘  └────────────────┬────────────────┘   │
│             └──────────────────────────────┘                    │
│                          │                                      │
│              WebSocket + REST (any network)                     │
│              local · Tailscale · VPN · public                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┴─────────────────────────────────────┐
│                    Server (@jean2/server)                      │
│                                                                │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────────┐          │
│  │ Agent Loop  │  │ Tool     │  │ MCP Manager       │          │
│  │ (AI SDK v6) │  │ Executor │  │ (stdio + remote)  │          │
│  └──────┬──────┘  └────┬─────┘  └────────┬──────────┘          │
│         └──────────────┼─────────────────┘                     │
│               ┌────────┴───────────┐                           │
│               │   ~/.jean2/tools/  │                           │
│               │   (TypeScript)     │                           │
│               └────────────────────┘                           │
│         ┌──────────────────────────────────────┐               │
│         │         Ask Protocol                  │              │
│         │  Permissions · Questions · Forms      │              │
│         │  User interaction · Client capabilities│             │
│         └──────────────────────────────────────┘               │
│                     ┌──────────────┐                           │
│                     │ Subagent     │                           │
│                     │ Orchestrator │                           │
│                     └──────┬───────┘                           │
│               ┌────────────┴────────────┐                      │
│               │     SQLite Store        │                      │
│               │ Sessions · Messages     │                      │
│               │ Permissions · History   │                      │
│               └─────────────────────────┘                      │
│                                                                │
│              Workspaces → directories on your machine          │
└──────────────────────────┴─────────────────────────────────────┘
```

### Packages

| Package | Description |
|---------|-------------|
| [`@jean2/server`](packages/server/) | Agent loop, tool execution, REST + WebSocket API, SQLite, daemon mode |
| [`@jean2/client`](packages/client/) | React 19 + Vite 8 UI — chat, file browser, permissions, multi-server |
| [`@jean2/sdk`](packages/sdk/) | Shared TypeScript types, WebSocket protocol, transport layer, REST clients |
| [`@jean2/client-electron`](packages/client-electron/) | Electron desktop app — macOS |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh/) |
| Server | [Hono](https://hono.dev/), AI SDK v6, SQLite |
| Client | React 19, Vite 8, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui, Radix UI |
| Desktop | [Electron](https://www.electronjs.org/) |
| PWA | PWA — works on any device with a browser |
| LLM | Vercel AI SDK v6, MCP SDK |

---

## Sessions

- **Compact** — LLM-powered conversation summarization
- **Fork** — Branch any session at any message
- **Revert** — Undo to any previous point
- **Interrupt** — Cancel generation with automatic cascade to subagents
- **Queue** — Queue messages while the agent is busy
- **Remote Terminal** — Full PTY terminal with multi-tab support

---

## Security & Auth

Authentication is **off by default**. No tokens are generated automatically. To enable auth, set a single environment variable:

```bash
# In ~/.jean2/.env or your shell environment
JEAN2_AUTH_TOKEN=your-secret-token
```

When set, all API and WebSocket endpoints require the token via `Authorization: Bearer <token>` header or `?token=<token>` query parameter. When not set, all requests pass through without authentication.

---

## Configuration

All configuration lives in `~/.jean2/` — model definitions, API keys, tools, preconfigs, and workspace data. See the [configuration guide](docs/configuration.md) for the full reference.

---

## Community

Join the [Jean2 Discord](https://discord.com/invite/38sUKnUNPQ) to follow development, share ideas, get help, or contribute.

---

## License

[Apache 2.0](LICENSE)
