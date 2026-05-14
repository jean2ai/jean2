# AGENTS.md

Guidelines for AI coding agents working in this repository.

## Project Overview

Jean2 is an AI Agent monorepo built with TypeScript, Bun, React, and Hono.

- **Runtime**: Bun
- **Monorepo**: Workspace-based with packages in `packages/`
- **Server**: Hono + AI SDK with multi-provider support (packages/server)
- **Client**: React 19 + Vite + TanStack Router + Zustand + shadcn/ui + Tailwind CSS v4 (packages/client)
- **SDK**: Shared types, protocols, transport layer, and REST clients (packages/sdk)
- **Client Electron**: Electron desktop wrapper around the client (packages/client-electron)
- **Client Tauri**: Tauri (Rust) native app for mobile and desktop (packages/client-tauri)
- **External Tools**: Language-agnostic tool modules (TypeScript/any language), separately versioned and distributed (tools/). No external runtime needed — npm is shipped in the server binary.
- **Sandbox CLI**: Interactive CLI for intercepting and simulating LLM responses in a running server, enabling end-to-end testing without real API calls (packages/sandbox-cli).

## Build Commands

```bash
# Install dependencies
bun install

# Development (runs both server and client)
bun run dev

# Development - server only
bun run dev:server
# Alias
bun run dev:be

# Development - client only
bun run dev:client

# Development - Electron desktop
bun run dev:electron

# Build all packages
bun run build

# Type check all packages
bun run typecheck

# Build server binary (current platform)
bun run build:bin

# Build server binary for specific platform
bun run build:bin:macos
bun run build:bin:linux
bun run build:bin:windows

# Build server package + binary
bun run build:all

# Build Electron desktop app
bun run electron:build
bun run electron:build:mac:local
bun run electron:build:mac:release
bun run electron:build:win

# Build Tauri native app (from client package)
bun run tauri:build:windows
```

## Lint Commands

```bash
# Run ESLint
bun run lint

# Run ESLint with auto-fix
bun run lint:fix
```

ESLint uses flat config (`eslint.config.js`) with `typescript-eslint`, `eslint-plugin-react`, and `eslint-plugin-react-hooks`. The `tools/` directory is excluded from linting.

## Test Commands

No test framework is currently configured. Tests would follow the pattern:
```bash
# Run all tests (when configured)
bun test

# Run a single test file
bun test path/to/test.file.ts
```

## Code Style

### Imports

- Use `import type` for type-only imports
- Group imports: external libraries first, then internal packages (`@jean2/*`), then local (`@/`)
- Use `@/*` path alias for relative imports within the same package

```typescript
import { useState, useEffect } from 'react';
import type { Session, Message } from '@jean2/sdk';
import { fetchMessages } from '@/store';
import './styles.css';
```

### Naming Conventions

- **Variables/Functions**: camelCase (`getUserById`, `isLoading`)
- **Components**: PascalCase (`ChatView`, `SessionList`)
- **Types/Interfaces**: PascalCase (`Session`, `ToolDefinition`)
- **Type aliases**: PascalCase (`SessionStatus`, `ToolRuntime`)
- **Constants**: SCREAMING_SNAKE_CASE for env-derived (`LLM_MAX_TOKENS`), camelCase otherwise
- **Files**: camelCase for modules (`agent.ts`), PascalCase for components (`ChatView.tsx`)

### TypeScript

- Strict mode enabled
- Prefer `interface` for object shapes, `type` for unions/primitives
- Use explicit return types for exported functions
- Avoid `any`; use `unknown` when type is uncertain
- Use `as const` for literal objects that should be immutable
- Unused vars prefixed with `_` (e.g., `_e`, `_sessionId`)

```typescript
export interface ChatOptions {
  sessionId: string;
  messages: Message[];
}

export type SessionStatus = 'active' | 'closed';

export async function getTool(name: string): Promise<DiscoveredTool | null> {
  // ...
}
```

### React

- React 19 with React Compiler (configured in Vite via `babel-plugin-react-compiler`)
- Functional components with hooks
- Destructure props in function signature
- Use `export default` for page/container components
- Named exports for utility components/hooks
- State management via Zustand stores (`packages/client/src/stores/`)
- Routing via TanStack Router with file-based code splitting
- UI components built on shadcn/ui (Radix primitives + Tailwind)

```typescript
interface Props {
  session: Session;
  onSendMessage: (content: string) => void;
}

export default function ChatView({ session, onSendMessage }: Props) {
  const [input, setInput] = useState('');
  // ...
}
```

### Error Handling

- Return error objects with `success` boolean for tool execution
- Use try/catch for async operations; type catch as `unknown`
- Log errors with context before returning

```typescript
export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

try {
  const result = await executeOperation();
  return { success: true, result };
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Operation failed:', message);
  return { success: false, error: message };
}
```

### Formatting

- No comments unless absolutely necessary for complex logic
- 2-space indentation
- Single quotes for strings (double quotes only when required)
- Trailing commas in multiline structures

### Environment Variables

- Prefix with `JEAN2_` for application settings
- Access via `process.env.VAR_NAME`
- Provide defaults with `||` or `??`

```typescript
const JEAN2_LLM_MAX_TOKENS = parseInt(process.env.JEAN2_LLM_MAX_TOKENS || '4096', 10);
```

### AI SDK (Server)

- Server uses Vercel AI SDK (`ai` package) for all LLM interactions
- Supported providers: Anthropic (`@ai-sdk/anthropic`), OpenAI (`@ai-sdk/openai`), Google (`@ai-sdk/google`), OpenRouter (`@openrouter/ai-sdk-provider`), MiniMax (`vercel-minimax-ai-provider`), Zhipu (`zhipu-ai-provider`)
- Provider registry pattern in `packages/server/src/providers/`

### Testing with the Sandbox CLI

The sandbox CLI (`packages/sandbox-cli`) is an interactive tool that intercepts all LLM calls in a running server and lets you manually or automatically respond — enabling full end-to-end testing of agent flows, tool execution, permissions, subagents, compaction, and error handling **without real API calls**.

**How it works:**

1. Server registers a `SandboxProvider` that intercepts all LLM calls
2. Each call creates an `LlmCallContext` (callId, sessionId, depth, mode, messages, tools)
3. The sandbox either auto-matches a rule or queues the call for manual response
4. The CLI connects via WebSocket for real-time notifications and REST for responding

**Running the sandbox:**

```bash
# Terminal 1: start the server with sandbox active
bun run dev:server

# Terminal 2: start the sandbox CLI
bun packages/sandbox-cli/src/cli.ts [--host localhost] [--port 3000] [--token <token>]
```

**CLI commands (interactive prompt: `sandbox> `):**

```
respond [callId|index] <type> [args...]   # Respond to a pending call (alias: r)
pending                                    # List pending calls (alias: p)
history                                    # Show response history (alias: h)
call <callId|index>                        # Show full call context
auto-respond [match...] <response>         # Add auto-responder rule
auto-respond list                          # List rules
auto-respond clear                         # Clear all rules
status                                     # Show sandbox status (alias: s)
clear                                      # Clear history
exit / quit                                # Exit
```

**Response types:**

```
text|t <message>                           # Plain text response
tool-call|tc <toolName> <jsonArgs>          # Tool call response
error|e <message> [--type rate_limit|server|timeout|auth|invalid_request]  # Error response
reasoning <reasoning> --text <message>     # Reasoning + text response
```

**Auto-responder match tokens:**

```
mode:stream|generate                       # Match by call mode
depth:N                                    # Match by sub-agent depth (0 = main, 1 = subagent)
session:<id>                               # Match by session ID
hasToolResults:true|false                  # Match if tool results in messages
maxUses:N                                  # Auto-disable after N uses
label:<name>                               # Descriptive label
```

**Examples:**

```
# Manually respond to the first pending call with text
respond 1 text "I'll help you with that."

# Respond with a tool call
respond tool-call read-file "{\"path\":\"/project/src/index.ts\"}"

# Auto-respond all stream-mode calls with text
auto-respond mode:stream text "Done!" label:"Always say done"

# Auto-respond subagent (depth:1) calls differently
auto-respond mode:generate depth:1 text "Sub-agent result" maxUses:10

# Simulate a tool call loop
auto-respond mode:stream hasToolResults:true tc read-file "{\"path\":\"/foo\"}" maxUses:3
```

**Server-side sandbox files** (`packages/server/src/sandbox/`):
- `provider.ts` — `SandboxProvider` (registers as AI SDK provider, intercepts `createModel()`)
- `model.ts` — `SandboxLanguageModel` (implements `doStream`/`doGenerate`, computes call depth via parent chain)
- `controller.ts` — `SandboxController` (pending queue, auto-responder rule matching, history)
- `routes.ts` — REST endpoints (`/api/sandbox/*`) + WebSocket broadcast
- `types.ts` — Shared types (`LlmCallContext`, `SandboxResponse`, `AutoResponderRule`)
- `index.ts` — `activateSandbox()` entry point

**When to use it:**
- Testing tool execution flows and permission ask/response cycles
- Testing subagent orchestration (use `depth:` matchers to control responses per depth)
- Testing error recovery (rate limits, timeouts, auth errors)
- Testing compaction triggers and behavior
- Verifying message queue, interrupt cascade, and session state transitions

## Project Structure

```
packages/
  server/                # Hono backend (@jean2/server)
    src/
      auth/              # Authentication middleware (env-var based, off by default)
      config/            # Model configurations (models.json)
      configuration/     # Runtime configuration (models, preconfigs, prompts, credentials)
      core/              # Agent logic, streaming, subagents, compaction, retry
      daemon/            # Background daemon process
      mcp/               # Model Context Protocol integration (OAuth, stdio transport)
      providers/         # AI provider registry and storage
      prompts/           # Prompt registry
      sandbox/           # Sandbox provider, model, controller, routes (simulated LLM)
      services/          # Terminal sessions, file preview, file operations
      skills/            # Skill registry and tool integration
      store/             # SQLite data layer (sessions, messages, workspaces, permissions)
      tools/             # Tool execution, registry, installer, Ask protocol
      utils/             # Binary detection, error handling, truncation utilities
      app.ts             # Hono app setup
      cli.ts             # CLI entry point
      index.ts           # Server entry point
      env.ts             # Environment configuration
      init.ts            # Server initialization

  client/                # React frontend (@jean2/client)
    src/
      components/
        app/             # App-level layout (header, main content, panels)
        chat/            # Chat UI (messages, input, model selector, tool calls)
        layout/          # Sidebar, terminal, workspace switching, file panels
        modals/          # Dialogs (settings, configuration, MCP, permissions)
        providers/       # Store hydration, theme provider
        shared/          # Shared UI (markdown renderer, loading states)
        shell/           # Server connection shell
        ui/              # shadcn/ui primitives (button, dialog, tabs, etc.)
      config/            # Auth, server URLs, draft/panel storage
      contexts/          # React contexts (server, session manager, view refs)
      stores/            # Zustand stores (session, connection, chat layout, UI state)
      types/             # Client-specific type definitions
      utils/             # Utilities (diff, version)
      main.tsx           # Entry point
      index.css          # Global styles (Tailwind)

  sdk/                   # Shared SDK (@jean2/sdk)
    src/
      namespaces/        # WebSocket namespace clients (chat, sessions, terminal, etc.)
      rest/              # REST API clients (attachments, config, files, tools, etc.)
      shared-protocol/   # Shared protocol definitions (client, server, terminal)
      shared-types/      # Shared TypeScript types (message, session, tool, workspace, etc.)
      shared-utils/      # Shared utilities (model context helpers)
      transport/         # Transport layer (HTTP, WebSocket)
      types/             # SDK-level types (REST responses, server messages, SDK types)
      client.ts          # Main SDK client class
      emitter.ts         # Event emitter
      errors.ts          # Error types
      index.ts           # Public API entry point

  client-electron/       # Electron desktop app (@jean2/client-electron)
    src/
      main.ts            # Electron main process
      preload.ts         # Preload script
      ipc-handlers.ts    # IPC communication handlers
      server-manager.ts  # Embedded server lifecycle management
      updater.ts         # Auto-update via electron-updater
      menu.ts            # Application menu
      webview-manager.ts # WebView management

  client-tauri/          # Tauri native app (@jean2/client-tauri)
    src/
      lib.rs             # Tauri library entry (Rust)
      main.rs            # Tauri main entry (Rust)
      audio.rs           # Audio support (Rust)
      mobile.rs          # Mobile-specific handlers (Rust)
    tauri.conf.json      # Tauri configuration
    Cargo.toml           # Rust dependencies

  sandbox-cli/           # Sandbox CLI for simulating LLM responses (@jean2/sandbox-cli)
    src/
      cli.ts             # CLI entry point, readline interactive loop
      commands.ts        # Command parsing and dispatch (respond, auto-respond, pending, etc.)
      api-client.ts      # HTTP + WebSocket client for /api/sandbox/* endpoints
      display.ts         # Terminal display formatting (colors, tables, call details)
      types.ts           # CLI-specific type definitions

tools/                   # External tool modules (independent from main project)
  # Each tool is a single directory (no bun/node variants):
  #   apply-patch, edit, glob, grep, ls, multiedit, read-file,
  #   write-file, webfetch, todoread, todowrite, question,
  #   file-to-markdown, browser-read-active-tab
  # Tavily tools: tavily-crawl, tavily-extract, tavily-map, tavily-search
  # Each tool directory contains:
  #   tool.ts              # Tool implementation (TypeScript, compiled at install)
  #   package.json         # Dependencies (npm installed via shipped npm)
  #   tool.md              # Tool description/markdown
  #   VERSION              # Semantic version
  # Tools are separately versioned and distributed via GitHub Releases
  # Tools use @jean2/sdk ToolModule interface with ctx.ask() for the Ask protocol

changelogs/              # Version changelogs
  client/                # Client release notes
  server/                # Server release notes
  tools/                 # Per-tool release notes

.agents/                 # Agent skill definitions
  skills/
    agent-browser/       # Browser automation skill (references + templates)
    shadcn/              # shadcn/ui skill (rules, evals, assets)

.github/                 # CI/CD workflows
  workflows/
    release.yml          # Server + tools release (cross-platform binaries)
    release-electron.yml # Electron desktop release (macOS + Windows)
    publish-client.yml   # NPM publish for @jean2/client
    cleanup-releases.yml # Weekly cleanup of old releases

install/                 # Installation scripts and documentation
  install-jean2.sh       # Unix installer
  install-jean2.ps1      # Windows installer
  INSTALL.md             # Installation instructions
  TOOLS.md               # Tool download instructions
```

## Before Committing

1. Run `bun run typecheck` - must pass
2. Run `bun run lint` - must pass
3. Run `bun run build` - must succeed
