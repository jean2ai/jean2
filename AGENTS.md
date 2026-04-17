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
- **External Tools**: Independent executable tool scripts, separately versioned and distributed (tools/)

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

## Project Structure

```
packages/
  server/                # Hono backend (@jean2/server)
    src/
      auth/              # Authentication middleware and token management
      config/            # Model configurations (models.json)
      configuration/     # Runtime configuration (models, preconfigs, prompts, credentials)
      core/              # Agent logic, streaming, subagents, compaction, retry
      daemon/            # Background daemon process
      mcp/               # Model Context Protocol integration (OAuth, stdio transport)
      providers/         # AI provider registry and storage
      prompts/           # Prompt registry
      services/          # Terminal sessions, file preview, file operations
      skills/            # Skill registry and tool integration
      store/             # SQLite data layer (sessions, messages, workspaces, permissions)
      tools/             # Tool execution, registry, security, installer
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

tools/                   # External tool scripts (independent from main project)
  # Each tool has bun/ and node/ variants:
  #   apply-patch, edit, glob, grep, ls, multiedit, read-file,
  #   webfetch, write-file, todoread, todowrite
  # Tavily tools (bun only): tavily-crawl, tavily-extract, tavily-map, tavily-search
  # Each tool directory contains:
  #   script.ts/.mjs      # Tool implementation
  #   security.ts/.mjs    # Security validation (optional)
  #   tool.md             # Tool description/markdown
  #   VERSION             # Semantic version
  # Tools are separately versioned and distributed via GitHub Releases

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
