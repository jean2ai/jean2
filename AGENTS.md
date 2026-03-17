# AGENTS.md

Guidelines for AI coding agents working in this repository.

## Project Overview

Jean2 is an AI Agent monorepo built with TypeScript, Bun, React, and Hono.

- **Runtime**: Bun
- **Monorepo**: Workspace-based with packages in `packages/`
- **Server**: Hono framework (packages/server)
- **Client**: React + Vite (packages/client)
- **Shared**: Types and utilities shared between server/client (packages/shared)

## Build Commands

```bash
# Install dependencies
bun install

# Development (runs both server and client)
bun run dev

# Development - server only
bun run dev:server

# Development - client only  
bun run dev:client

# Build all packages
bun run build

# Type check all packages
bun run typecheck
```

## Lint Commands

```bash
# Run ESLint
bun run lint

# Run ESLint with auto-fix
bun run lint:fix
```

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
import type { Session, Message } from '@jean2/shared';
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

- Use functional components with hooks
- Destructure props in function signature
- Use `export default` for page/container components
- Named exports for utility components/hooks

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

- Prefix with `LLM_` for LLM-related settings
- Access via `process.env.VAR_NAME`
- Provide defaults with `||` or `??`

```typescript
const JEAN2_LLM_MAX_TOKENS = parseInt(process.env.JEAN2_LLM_MAX_TOKENS || '4096', 10);
```

## Project Structure

```
packages/
  server/          # Hono backend
    src/
      core/        # Agent logic, preconfigs
      store/       # Data layer (SQLite)
      tools/       # Tool execution
      config/      # Model configurations
      app.ts       # Hono app setup
      index.ts     # Entry point
  client/          # React frontend
    src/
      components/  # React components
      App.tsx      # Main app component
      main.tsx     # Entry point
  shared/          # Shared types/utilities
    src/
      types/       # TypeScript interfaces
      protocol/    # WebSocket message types
      utils/       # Shared utilities
```

## Before Committing

1. Run `bun run typecheck` - must pass
2. Run `bun run lint` - must pass
3. Run `bun run build` - must succeed
