# Step 3: Mock Data

Create reusable mock fixtures for all SDK types that components depend on. This avoids importing real server data and lets us simulate any state.

## Design Principles

1. **Co-located with stories** — mock data lives in `src/` alongside the stories that use it
2. **Factory functions** — return fresh objects each call, so tests can't mutate shared state
3. **Typed** — all mocks conform to SDK types, caught at compile time
4. **Layered** — simple defaults with override parameters for customization

## 1. Base SDK Type Mocks

Create a single file with factory functions for every SDK type used in the client.

```typescript
// packages/client/src/mocks/sdk.ts
import type {
  Session,
  Message,
  Part,
  ToolPart,
  TextPart,
  ModelWithStatus,
  Preconfig,
  PromptInfo,
  Workspace,
  ProviderStatus,
  AnyVisualization,
  DiffVisualization,
  CodeBlockVisualization,
  TerminalVisualization,
  FileListVisualization,
  TodoVisualization,
  SuccessVisualization,
  MessageWithParts,
  QueuedMessage,
} from '@jean2/sdk';

// --- Partial Override Pattern ---
// Each factory accepts a partial override and merges with defaults.
// This lets stories customize exactly what they need.

// --- Messages ---

export function createMockMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'user',
    createdAt: new Date('2025-01-15T10:00:00Z').toISOString(),
    ...overrides,
  };
}

export function createMockUserMessage(text: string, overrides: Partial<Message> = {}): Message {
  return createMockMessage({
    role: 'user',
    ...overrides,
  });
}

export function createMockAssistantMessage(overrides: Partial<Message> = {}): Message {
  return createMockMessage({
    id: 'msg-2',
    role: 'assistant',
    createdAt: new Date('2025-01-15T10:00:05Z').toISOString(),
    ...overrides,
  });
}

// --- Parts ---

export function createMockTextPart(text: string, overrides: Partial<TextPart> = {}): TextPart {
  return {
    type: 'text',
    text,
    ...overrides,
  } as TextPart;
}

export function createMockToolPart(overrides: Partial<ToolPart> = {}): ToolPart {
  return {
    type: 'tool',
    toolCallId: 'tc-1',
    toolName: 'read-file',
    status: 'completed',
    input: { path: '/some/file.ts' },
    output: 'file contents here',
    ...overrides,
  } as ToolPart;
}

export function createMockToolPartRunning(overrides: Partial<ToolPart> = {}): ToolPart {
  return createMockToolPart({
    status: 'running',
    output: undefined,
    ...overrides,
  });
}

export function createMockToolPartError(overrides: Partial<ToolPart> = {}): ToolPart {
  return createMockToolPart({
    status: 'error',
    error: 'File not found: /missing/file.ts',
    output: undefined,
    ...overrides,
  });
}

// --- Messages with Parts (composite) ---

export function createMockMessageWithParts(
  messageOverrides: Partial<Message> = {},
  parts: Part[] = [],
): MessageWithParts {
  const message = createMockMessage(messageOverrides);
  return {
    message,
    parts: parts.length > 0 ? parts : [createMockTextPart('Hello world')],
  };
}

export function createMockConversation(): MessageWithParts[] {
  return [
    createMockMessageWithParts(
      { id: 'msg-1', role: 'user' },
      [createMockTextPart('Read the file src/index.ts')],
    ),
    createMockMessageWithParts(
      { id: 'msg-2', role: 'assistant' },
      [
        createMockTextPart('I\'ll read that file for you.'),
        createMockToolPart(),
        createMockTextPart('Here are the contents of `src/index.ts`:\n\n```\nconsole.log("hello")\n```'),
      ],
    ),
    createMockMessageWithParts(
      { id: 'msg-3', role: 'user' },
      [createMockTextPart('Can you also check the CSS?')],
    ),
    createMockMessageWithParts(
      { id: 'msg-4', role: 'assistant' },
      [
        createMockTextPart('Sure, let me check the CSS file.'),
        createMockToolPart({
          toolCallId: 'tc-2',
          toolName: 'read-file',
          input: { path: 'src/index.css' },
        }),
        createMockTextPart('The CSS looks good. Everything uses CSS variables for theming.'),
      ],
    ),
  ];
}

// --- Sessions ---

export function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    workspaceId: 'workspace-1',
    title: 'My Chat Session',
    createdAt: new Date('2025-01-15T09:00:00Z').toISOString(),
    updatedAt: new Date('2025-01-15T10:30:00Z').toISOString(),
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    status: 'active',
    ...overrides,
  };
}

export function createMockSessions(): Session[] {
  return [
    createMockSession({ id: 'session-1', title: 'Refactor auth module' }),
    createMockSession({ id: 'session-2', title: 'Fix CSS theme bug', model: 'gpt-4o', provider: 'openai' }),
    createMockSession({ id: 'session-3', title: 'Write unit tests', model: 'claude-sonnet-4-20250514', provider: 'anthropic' }),
    createMockSession({ id: 'session-4', title: 'Database migration script', updatedAt: new Date('2025-01-10T08:00:00Z').toISOString() }),
  ];
}

// --- Workspaces ---

export function createMockWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'workspace-1',
    name: 'my-project',
    path: '/Users/dev/my-project',
    createdAt: new Date('2025-01-01T00:00:00Z').toISOString(),
    ...overrides,
  };
}

// --- Models ---

export function createMockModel(overrides: Partial<ModelWithStatus> = {}): ModelWithStatus {
  return {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    contextWindow: 200000,
    tier: 'standard',
    providerId: 'anthropic',
    providerName: 'Anthropic',
    available: true,
    ...overrides,
  };
}

export function createMockModels(): ModelWithStatus[] {
  return [
    createMockModel({ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', providerId: 'anthropic', providerName: 'Anthropic' }),
    createMockModel({ id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', providerName: 'OpenAI', contextWindow: 128000 }),
    createMockModel({ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', providerId: 'google', providerName: 'Google', tier: 'budget' }),
    createMockModel({ id: 'o3', name: 'o3', providerId: 'openai', providerName: 'OpenAI', tier: 'premium' }),
    createMockModel({ id: 'deepseek-r1', name: 'DeepSeek R1', providerId: 'openrouter', providerName: 'OpenRouter', available: false }),
  ];
}

// --- Preconfigs ---

export function createMockPreconfig(overrides: Partial<Preconfig> = {}): Preconfig {
  return {
    id: 'preconfig-1',
    name: 'Code Review',
    description: 'Review code for best practices and potential issues',
    systemPrompt: 'You are a code reviewer...',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    ...overrides,
  };
}

export function createMockPreconfigs(): Preconfig[] {
  return [
    createMockPreconfig({ id: 'preconfig-1', name: 'Code Review' }),
    createMockPreconfig({ id: 'preconfig-2', name: 'Bug Hunter', description: 'Find and fix bugs', model: 'o3', provider: 'openai' }),
    createMockPreconfig({ id: 'preconfig-3', name: 'Documentation Writer', description: 'Generate documentation' }),
  ];
}

// --- Providers ---

export function createMockProvider(overrides: Partial<ProviderStatus> = {}): ProviderStatus {
  return {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'api_key',
    configured: true,
    ...overrides,
  };
}

export function createMockProviders(): ProviderStatus[] {
  return [
    createMockProvider({ id: 'anthropic', name: 'Anthropic', configured: true }),
    createMockProvider({ id: 'openai', name: 'OpenAI', configured: true }),
    createMockProvider({ id: 'google', name: 'Google', configured: false }),
    createMockProvider({ id: 'openrouter', name: 'OpenRouter', configured: true }),
  ];
}

// --- Visualizations ---

export function createMockDiffVisualization(overrides: Partial<DiffVisualization> = {}): DiffVisualization {
  return {
    type: 'diff',
    path: 'src/components/App.tsx',
    language: 'typescript',
    additions: 5,
    deletions: 2,
    hunks: [
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 5,
        content: '@@ -1,3 +1,5 @@',
        changes: [
          { type: 'normal', content: 'import React from "react";' },
          { type: 'delete', content: 'import "./old-styles.css";' },
          { type: 'insert', content: 'import "./new-styles.css";' },
          { type: 'insert', content: 'import { ThemeProvider } from "./theme";' },
          { type: 'normal', content: '' },
        ],
      },
    ],
    ...overrides,
  } as DiffVisualization;
}

export function createMockCodeBlockVisualization(
  overrides: Partial<CodeBlockVisualization> = {},
): CodeBlockVisualization {
  return {
    type: 'code',
    path: 'src/utils/helpers.ts',
    language: 'typescript',
    content: 'export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n',
    ...overrides,
  } as CodeBlockVisualization;
}

export function createMockTerminalVisualization(
  overrides: Partial<TerminalVisualization> = {},
): TerminalVisualization {
  return {
    type: 'terminal',
    content: '$ npm test\n\nPASS  src/utils.test.ts\n  ✓ greet returns greeting (2ms)\n  ✓ handles empty string (1ms)\n\nTests: 2 passed, 2 total\nTime: 0.5s\n',
    exitCode: 0,
    ...overrides,
  } as TerminalVisualization;
}

export function createMockTodoVisualization(
  overrides: Partial<TodoVisualization> = {},
): TodoVisualization {
  return {
    type: 'todo',
    items: [
      { id: '1', content: 'Set up project structure', status: 'completed' },
      { id: '2', content: 'Implement authentication', status: 'completed' },
      { id: '3', content: 'Add theme system', status: 'in_progress' },
      { id: '4', content: 'Write documentation', status: 'pending' },
      { id: '5', content: 'Deploy to production', status: 'pending' },
    ],
    ...overrides,
  } as TodoVisualization;
}

export function createMockSuccessVisualization(
  overrides: Partial<SuccessVisualization> = {},
): SuccessVisualization {
  return {
    type: 'success',
    message: 'Operation completed successfully',
    ...overrides,
  } as SuccessVisualization;
}

export function createMockFileListVisualization(
  overrides: Partial<FileListVisualization> = {},
): FileListVisualization {
  return {
    type: 'file-list',
    files: [
      { path: 'src/App.tsx', status: 'modified' },
      { path: 'src/components/Header.tsx', status: 'added' },
      { path: 'src/styles.old.css', status: 'deleted' },
      { path: 'src/utils/format.ts', status: 'modified' },
    ],
    ...overrides,
  } as FileListVisualization;
}

// --- Queued Messages ---

export function createMockQueuedMessage(overrides: Partial<QueuedMessage> = {}): QueuedMessage {
  return {
    id: 'queue-1',
    content: 'This is a queued message waiting to be sent',
    timestamp: Date.now(),
    ...overrides,
  };
}
```

## 2. Organize by Domain

For larger fixture sets, split into separate files:

```
packages/client/src/mocks/
  sdk.ts              # All SDK type factories (shown above)
  data/
    conversations.ts  # Pre-built conversation scenarios
    sessions.ts       # Session list fixtures
    models.ts         # Model list fixtures
```

The `sdk.ts` file should be the single import point for most stories.

## 3. Usage in Stories

```typescript
import { createMockButton } from '@/components/ui/button';
import { createMockConversation, createMockSession } from '@/mocks/sdk';

export const BasicConversation: Story = {
  args: {
    messagesWithParts: createMockConversation(),
    session: createMockSession(),
  },
};
```

## Files Created

```
packages/client/src/
  mocks/
    sdk.ts              # SDK type factory functions
```
