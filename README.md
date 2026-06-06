<p align="center">
  <img src="docs/promo.webp" alt="Jean2 desktop client — chat interface, workspace selector, and tool execution" width="800">
</p>

<p align="center">
  <strong>Your AI agent. One server. Any device. No baked-in behavior.</strong>
</p>

<p align="center">
  A coding assistant, a research agent, a personal automation — same binary, different configuration.
  **One server. Any LLM. Every device. Nothing leaves your machine.**
  Run Claude, GPT, or Gemini against your codebase, your browser, your terminal — no vendor lock-in.
</p>

<p align="center">
  <a href="https://github.com/jean2ai/jean2/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/jean2ai/jean2?color=6366f1"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-6366f1"></a>
  <a href="https://bun.sh"><img alt="Bun" src="https://img.shields.io/badge/runtime-Bun-6366f1?logo=bun"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.7-6366f1?logo=typescript"></a>
  <a href="https://discord.com/invite/38sUKnUNPQ"><img alt="Discord" src="https://img.shields.io/badge/Discord-join-6366f1?logo=discord"></a>
</p>

<p align="center">
  <a href="docs/getting-started.md">Get Started</a> ·
  <a href="docs/">Docs</a> ·
  <a href="https://github.com/jean2ai/jean2">GitHub</a> ·
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

The server automatically serves the client on `http://localhost:3774`. Run `jean2 open` to open it in your browser.

> Desktop app for macOS (Electron), plus a PWA client that runs on any device — phone, tablet, or desktop. See the [Getting Started guide](docs/getting-started.md) for all options.

---

## Why Jean2?

You already have Cursor, Copilot, and Claude Code. Why run your own agent server?

**You bring the keys, you keep the data.** Jean2 runs on your machine, connects to any LLM you pay for, and stores everything locally — no telemetry, no vendor lock-in, no subscription to a single AI company. Swap models mid-conversation. Use budget models for routine tasks, premium for hard problems. Nobody sees your prompts but you.

**Tools, not prompts.** Instead of writing mega-prompts, give your agent real capabilities — file operations, shell commands, web browsing, API calls. Tools are TypeScript. You can read them, modify them, and write your own in minutes.

**One server, every device.** Desktop, phone, tablet — same sessions, same workspaces. Works over Tailscale, VPN, or local network.

---

## What Sets It Apart

### 🧠 Use any model, anytime

Connect Anthropic, OpenAI, Google, OpenRouter, DeepSeek, or any OpenAI-compatible endpoint. Switch providers and models per-session. Use GPT-5.5 for architecture, DeepSeek for routine refactors, Claude for code review. No lock-in — you're always one click away from a better model.

### 🔧 Tools in TypeScript. No ceremony.

Give your agent real capabilities. A tool is a directory with a `tool.ts` and a `package.json` — Bun compiles it on the fly, no build step. Export a `definition` and an `execute` function, and the agent discovers it automatically. Need your agent to query Jira, deploy to Vercel, or check CI status? Write it in 20 lines.

### 🛡️ You're always in control

Every tool interaction flows through a unified Ask protocol. Permissions, confirmations, questions, forms — the agent asks, you decide. Auto-approve the safe stuff, require confirmation for the rest. Workspace-level permissions mean project A can be locked down while project B runs freely.

### 🔌 Connect everything

Hook into any MCP server (local or remote, with OAuth). Define reusable Skills as `SKILL.md` instruction sets. Connect per workspace — your work project gets Kubernetes access, your side project stays sandboxed.

### 🧩 Browser Extension

Give your agent eyes on the web. The [Jean2Browser extension](https://chromewebstore.google.com/detail/jean2browser/jpahdfmmfmmnacapmkchljmcijoedcpj) lets the agent navigate pages, read content, and click elements — install it directly from the Chrome Web Store.

### 🤖 Delegate complex work

Agents spawn hierarchical subagents for complex tasks. Ask it to "audit the codebase for security issues" and it spins up researcher subagents, each exploring a different area. Isolated sessions, shared workspace context, cascading interrupts. Stop the parent, stop them all.

### 🌐 One server, every device

REST + WebSocket under the hood. Desktop, phone, tablet, browser — all connect the same way. Start a session on your laptop, pick it up on your phone. Works over localhost, Tailscale, VPN, or a reverse proxy.

### 🎯 Your rules, not ours

System prompts, tools, and skills are all files on disk. Edit them, add them, remove them. No hidden behavior, no "safety" filters you can't turn off. Your agent does what you tell it to.

---

## Use Cases

| Use Case | Description                                                                                                                               |
|----------|-------------------------------------------------------------------------------------------------------------------------------------------|
| **AI-Powered Coding** | Connect Claude, GPT-5.5, or Gemini to your codebase. Subagents explore, refactor, and implement with isolated sessions and shared workspace context.            |
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
│         ┌────────────────────────────────────────┐             │
│         │         Ask Protocol                   │             │
│         │  Permissions · Questions · Forms       │             │
│         │  User interaction · Client capabilities│             │
│         └────────────────────────────────────────┘             │
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

## Ready to try it?

**macOS / Linux:**
```bash
curl -fsSL https://jean2.ai/install.sh | bash
jean2 init
jean2 start
jean2 open
```

**Windows:**
```powershell
irm https://jean2.ai/install.ps1 | iex
jean2 init
jean2 start
jean2 open
```

Three commands to your first AI agent. [Get started →](docs/getting-started.md)

[Join the Discord](https://discord.com/invite/38sUKnUNPQ) to follow development, share what you're building, or ask for help.

---

## License

[Apache 2.0](LICENSE)
