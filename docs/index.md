# Jean2 Documentation

Jean2 is an AI agent server: one binary, any LLM, any device. It runs on your machine, connects to any LLM provider, and lets you chat, code, research, automate, and delegate through a unified interface.

The server handles the agent loop, tool execution, and session management. You connect with a web client, desktop app, browser extension, or any REST/WebSocket client.

## Getting Started

New to Jean2? Start here.

- **[Getting Started](./getting-started.md)** - Install, initialize, and run your first session
- **[Configuration](./configuration.md)** - Set up LLM providers, API keys, models, capabilities, and MCP
- **[Client Guide](./client.md)** - Connect with npx, Electron, PWA, or browser extension
- **[CLI Reference](./cli.md)** - All available commands and flags

## Core Concepts

- **[Workspaces & Sessions](./workspaces.md)** - Projects, sessions, capabilities, goal mode, MCP, skills, workflows, memory, preconfigs
- **[Tools](./tools.md)** - Available tools, capability tools, MCP tools, writing your own
- **[Security & Auth](./auth.md)** - Authentication, token management, TLS

## Key Features

| Feature | What it does |
|---|---|
| **Goal Mode** | Autonomous multi-turn loops with evaluator-verified completion. Set "all tests pass" and walk away. |
| **Persistent Memory** | The agent saves decisions and preferences across sessions in `.jean2/USER.md` and `.jean2/MEMORY.md`. |
| **Self-Programming Skills** | The agent creates `SKILL.md` files encoding workflows it notices you repeating. |
| **Parallel Workflows** | Complex tasks decompose into concurrent subagents (max 5), results synthesized into one answer. |
| **Session Search** | The agent searches past sessions to recall what was decided and discussed. |
| **MCP Integration** | Connect any MCP server. Full OAuth handled server-side. Tools appear alongside built-in tools. |
| **Browser Automation** | Jean2Browser gives the agent real hands on Chrome: read, click, fill, navigate. |
| **Preconfigs** | Bundle a model, tool set, system prompt, and skills. Switch mid-session without starting over. |
| **Server-First** | Persistent 24/7 server. PWA on any device. Close your laptop. The agent never stops. |

## Architecture

```
You (browser / desktop / PWA / browser extension)
    |
    +-- WebSocket (real-time: chat, terminal, permissions)
    +-- REST (CRUD: sessions, files, config, tools, workspaces)
    |
    v
+-------------------------------------------+
|          Jean2 Server (Bun)               |
|                                           |
|   Agent Loop (AI SDK)                     |
|   Goal Loop + Evaluator                   |
|   Tool Executor                           |
|   MCP Manager (local + remote, OAuth)     |
|   Workflow Orchestrator (decompose/fan/synth) |
|   Subagent Orchestrator                   |
|   Skills Registry                         |
|   Memory System (USER.md + MEMORY.md)     |
|   Session Search (FTS)                    |
|   Compaction Engine                       |
|   SQLite Store                            |
|                                           |
|   ~/.jean2/                               |
|   +-- data/agent.db                       |
|   +-- tools/                              |
|   +-- preconfigs/                         |
|   +-- models.json                         |
|   +-- .env                                |
|                                           |
|   <workspace>/                            |
|   +-- AGENTS.md                           |
|   +-- .jean2/USER.md, MEMORY.md           |
|   +-- .jean2/mcp.json                     |
|   +-- .agents/skills/                     |
+-------------------------------------------+
    |
    v
LLM Providers (Anthropic, OpenAI, Google, DeepSeek, OpenRouter, MiniMax, Zhipu)
```

## External Links

- [GitHub](https://github.com/jean2ai/jean2)
- [Website](https://jean2.ai)
- [Full Documentation](https://jean2.ai/docs/get-started/installation)
