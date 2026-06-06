# Jean2 Documentation

Jean2 is an AI agent server — one binary, any LLM, any device. It runs on your machine, connects to any LLM provider, and lets you chat, code, research, and automate through a unified interface.

The server handles the agent loop, tool execution, and session management. You connect with a web client, desktop app, or any REST/WebSocket client.

## Getting Started

New to Jean2? Start here.

- **[Getting Started](./getting-started.md)** — Install, initialize, and run your first session
- **[Configuration](./configuration.md)** — Set up LLM providers, API keys, and models
- **[Client Guide](./client.md)** — Connect with npx, Electron, or PWA
- **[CLI Reference](./cli.md)** — All available commands and flags

## Core Concepts

- **[Workspaces & Sessions](./workspaces.md)** — Projects, sessions, forking, compaction, subagents
- **[Tools](./tools.md)** — Available tools, how they work, writing your own
- **[Security & Auth](./auth.md)** — Authentication, token management, TLS

## Architecture

```
You (browser / desktop / PWA)
    │
    ├── WebSocket (real-time: chat, terminal, permissions)
    └── REST (CRUD: sessions, files, config, tools)
    │
    ▼
┌─────────────────────────┐
│   Jean2 Server (Bun)    │
│                         │
│   Agent Loop (AI SDK)   │
│   Tool Executor         │
│   MCP Manager           │
│   Subagent Orchestrator │
│   SQLite Store          │
│                         │
│   ~/.jean2/             │
│   ├── data/agent.db     │
│   ├── tools/            │
│   ├── models.json       │
│   └── .env              │
└─────────────────────────┘
    │
    ▼
LLM Providers (Anthropic, OpenAI, Google, DeepSeek, ...)
```

## External Links

- [GitHub](https://github.com/jean2ai/jean2)
- [Website](https://jean2.ai)
