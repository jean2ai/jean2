<p align="center">
  <img src="docs/promo.webp" alt="Jean2 desktop client - chat interface, workspace selector, and tool execution" width="800">
</p>

<p align="center">
  <strong>Your AI agent. One server. Any device. Built to work without you.</strong>
</p>

<p align="center">
  Jean2 is a persistent AI agent server. It runs on your machine, connects to any LLM,<br>
  and works autonomously until the job is done. Close your laptop. The agent never stops.
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
  <a href="https://jean2.ai">Website</a> ·
  <a href="https://chromewebstore.google.com/detail/jean2browser/jpahdfmmfmmnacapmkchljmcijoedcpj">Chrome Extension</a> ·
  <a href="https://discord.com/invite/38sUKnUNPQ">Discord</a>
</p>

---

## Install

**macOS / Linux:**
```bash
curl -fsSL https://jean2.ai/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://jean2.ai/install.ps1 | iex
```

**Run:**
```bash
jean2 init
jean2 start
jean2 open
```

The server serves the client at `http://localhost:3774`. Desktop app (macOS Electron) and PWA (any device) also available. See the [Getting Started guide](docs/getting-started.md).

---

## Features

| | |
|---|---|
| **Goal Mode** | Set a completion condition. A separate evaluator inspects real tool output every turn. It loops until tests pass. |
| **Persistent Memory** | Tell it "we use pnpm" once. Two weeks later, in a new session, it already knows. |
| **Self-Programming Skills** | The agent notices patterns and writes its own `SKILL.md` files. It programs itself. |
| **Parallel Workflows** | Decompose, fan out 5 concurrent subagents, synthesize one answer. Minutes become seconds. |
| **Browser Automation** | Jean2Browser gives the agent real hands on Chrome: read, click, fill, navigate. Same interface as files and shell. |
| **Preconfigs** | Swap model, tools, prompt, and skills mid-session. A coder becomes a reviewer. Same thread, different brain. |
| **Any Model** | Anthropic, OpenAI, Google, DeepSeek, OpenRouter, or any OpenAI-compatible endpoint. Bring your own keys. |
| **MCP Integration** | Connect any MCP server. Full OAuth handled server-side. Tools appear alongside built-in tools. |
| **Server-First** | Persistent 24/7 server. PWA on any device. Close your laptop. Open your phone. The agent never stops. |
| **Open Source** | Apache 2.0. No telemetry. No lock-in. Prompts, tools, skills, and memory are files on disk. |

---

## Why Jean2?

You already have Cursor, Copilot, and Claude Code. Why run your own agent server?

- **You bring the keys, you keep the data.** Runs on your machine. No telemetry, no vendor lock-in, no subscription to a single AI company.
- **Tools, not prompts.** Give your agent real capabilities: file operations, shell commands, web browsing, API calls. Tools are TypeScript. Write your own in minutes.
- **Your agent, your rules.** System prompts, tools, skills, and memory are files on disk. Version control them, share them, delete them. No hidden behavior.

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                      Client Layer                         │
│   Desktop (Electron) · Web/PWA · Browser Extension        │
│              WebSocket + REST (any network)               │
└──────────────────────────┬────────────────────────────────┘
                           │
┌──────────────────────────┴────────────────────────────────┐
│                   Server (@jean2/server)                  │
│                                                           │
│   Agent Loop (AI SDK v6) · Tool Executor                  │
│   Goal Loop + Evaluator · Workflow Orchestrator           │
│   MCP Manager (stdio + OAuth) · Subagent Orchestrator     │
│   Memory · Skills Registry · Session Search (FTS)         │
│   Ask Protocol (Permissions, Questions, Forms)            │
│   SQLite Store · Compaction Engine                        │
│                                                           │
│   ~/.jean2/          (data, tools, preconfigs, models)    │
│   <workspace>/.jean2/          (memory, mcp.json)         │
│   <workspace>/.agents/skills/  (SKILL.md files)           │
└───────────────────────────────────────────────────────────┘
                           │
              LLM Providers (Anthropic, OpenAI, Google,
                DeepSeek, OpenRouter, MiniMax, Zhipu)
```

---

## Documentation

All docs live in [`docs/`](docs/). Key pages:

| | |
|---|---|
| [Getting Started](docs/getting-started.md) | Install, initialize, first session |
| [Workspaces & Sessions](docs/workspaces.md) | Capabilities, Goal Mode, MCP, Skills, Memory, Workflows |
| [Configuration](docs/configuration.md) | API keys, models, env vars, MCP config |
| [Tools](docs/tools.md) | Installed tools, capability tools, writing your own |
| [Security & Auth](docs/auth.md) | Auth tokens, TLS, permissions |

Full documentation site: [jean2.ai/docs](https://jean2.ai/docs/get-started/installation)

---

## Community

[Join the Discord](https://discord.com/invite/38sUKnUNPQ) to follow development, share what you're building, or ask for help.

---

## License

[Apache 2.0](LICENSE)
