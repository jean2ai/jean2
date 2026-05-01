# Step 4: Store Mocking

Create patterns for overriding Zustand stores in Storybook stories so components that read from stores can be rendered with controlled state.

## The Problem

Many components use Zustand hooks like:

```typescript
const session = useSessionStore((s) => s.currentSession);
const models = useServerDataStore((s) => s.models);
const showSettings = useUIStore((s) => s.showSettings);
```

In the real app, stores are hydrated from the server. In Storybook, there's no server — we need to inject mock state.

## Approach: Decorator-Based Store Override

We create decorators that temporarily replace store state for the duration of a story. This is cleaner than mocking modules because:
- No global side effects between stories
- Each story declares exactly what state it needs
- Stores still function normally (actions work, re-renders happen)

## 1. Create Store Override Helpers

```typescript
// packages/client/src/mocks/stores.ts
import { useSessionStore } from '@/stores/sessionStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { useUIStore } from '@/stores/uiStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import type { StorybookThemeMode } from '../../.storybook/theme-addon/constants';
import {
  createMockSession,
  createMockSessions,
  createMockModels,
  createMockPreconfigs,
  createMockProviders,
  createMockWorkspace,
} from './sdk';

// --- Type helpers ---
// Zustand's setState accepts partial state, so we use Partial<State>

// --- Session Store ---

interface MockSessionStoreState {
  currentSession?: Parameters<typeof useSessionStore.getState>['0'] extends infer S
    ? Partial<S>
    : never;
}

type SessionStoreState = ReturnType<typeof useSessionStore.getState>;

export function withSessionStore(
  overrides: Partial<SessionStoreState> = {},
) {
  return function SessionStoreDecorator(Story: React.ComponentType) {
    const defaults: Partial<SessionStoreState> = {
      currentSession: createMockSession(),
      sessions: createMockSessions(),
      sessionUsage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
      currentModel: 'claude-sonnet-4-20250514',
      selectedVariant: null,
      messagesBySession: {},
      partsBySession: {},
      queuedMessages: {},
    };

    // Apply overrides
    useSessionStore.setState({ ...defaults, ...overrides });

    return <Story />;
  };
}

// --- Server Data Store ---

type ServerDataStoreState = ReturnType<typeof useServerDataStore.getState>;

export function withServerDataStore(
  overrides: Partial<ServerDataStoreState> = {},
) {
  return function ServerDataStoreDecorator(Story: React.ComponentType) {
    const defaults: Partial<ServerDataStoreState> = {
      serverId: 'server-1',
      workspaces: [createMockWorkspace()],
      activeWorkspace: createMockWorkspace(),
      preconfigs: createMockPreconfigs(),
      prompts: [],
      models: createMockModels(),
      defaultModel: 'claude-sonnet-4-20250514',
      defaultProvider: 'anthropic',
      providers: createMockProviders(),
    };

    useServerDataStore.setState({ ...defaults, ...overrides });

    return <Story />;
  };
}

// --- UI Store ---

type UIStoreState = ReturnType<typeof useUIStore.getState>;

export function withUIStore(
  overrides: Partial<UIStoreState> = {},
) {
  return function UIStoreDecorator(Story: React.ComponentType) {
    const defaults: Partial<UIStoreState> = {
      showSettings: false,
      showConfiguration: false,
      showTools: false,
      showMCPDialog: false,
      showWorkspacePermissions: false,
      showAddServer: false,
      editServerData: null,
      chatFinishSoundEnabled: true,
      permissionSoundEnabled: true,
      filePreviewTarget: null,
    };

    useUIStore.setState({ ...defaults, ...overrides });

    return <Story />;
  };
}

// --- Connection Store ---

type ConnectionStoreState = ReturnType<typeof useConnectionStore.getState>;

export function withConnectionStore(
  overrides: Partial<ConnectionStoreState> = {},
) {
  return function ConnectionStoreDecorator(Story: React.ComponentType) {
    const defaults: Partial<ConnectionStoreState> = {
      connected: true,
      authError: null,
      timeout: false,
    };

    useConnectionStore.setState({ ...defaults, ...overrides });

    return <Story />;
  };
}

// --- Chat Layout Store ---

type ChatLayoutStoreState = ReturnType<typeof useChatLayoutStore.getState>;

export function withChatLayoutStore(
  overrides: Partial<ChatLayoutStoreState> = {},
) {
  return function ChatLayoutStoreDecorator(Story: React.ComponentType) {
    const defaults: Partial<ChatLayoutStoreState> = {
      showFilesPanel: false,
      showTerminalPanel: false,
    };

    useChatLayoutStore.setState({ ...defaults, ...overrides });

    return <Story />;
  };
}

// --- Convenience: All Stores Combined ---

export function withAllStores(
  overrides: {
    session?: Partial<SessionStoreState>;
    serverData?: Partial<ServerDataStoreState>;
    ui?: Partial<UIStoreState>;
    connection?: Partial<ConnectionStoreState>;
    chatLayout?: Partial<ChatLayoutStoreState>;
  } = {},
) {
  return function AllStoresDecorator(Story: React.ComponentType) {
    const sessionDecorator = withSessionStore(overrides.session);
    const serverDataDecorator = withServerDataStore(overrides.serverData);
    const uiDecorator = withUIStore(overrides.ui);
    const connectionDecorator = withConnectionStore(overrides.connection);
    const chatLayoutDecorator = withChatLayoutStore(overrides.chatLayout);

    // Nest the decorators
    return connectionDecorator(() =>
      chatLayoutDecorator(() =>
        uiDecorator(() =>
          serverDataDecorator(() =>
            sessionDecorator(() => <Story />)
          )
        )
      )
    );
  };
}
```

## 2. Cleanup Between Stories

Stores persist state globally. To prevent stories from leaking state into each other, add a cleanup mechanism.

```typescript
// packages/client/src/mocks/store-cleanup.ts
import { useSessionStore } from '@/stores/sessionStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { useUIStore } from '@/stores/uiStore';
import { useConnectionStore } from '@/stores/connectionStore';

/**
 * Call this in a story's play function or use a global decorator
 * to reset stores to their initial state between stories.
 */
export function resetAllStores() {
  // Reset to safe defaults (not undefined, to avoid crashes)
  useSessionStore.setState({
    currentSession: null,
    sessions: [],
    sessionUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    currentModel: '',
    selectedVariant: null,
    compactionSuccess: false,
    messagesBySession: {},
    partsBySession: {},
    queuedMessages: {},
  });

  useServerDataStore.setState({
    serverId: null,
    workspaces: [],
    activeWorkspace: null,
    preconfigs: [],
    prompts: [],
    models: [],
    defaultModel: '',
    defaultProvider: '',
    providers: [],
  });

  useUIStore.setState({
    showSettings: false,
    showConfiguration: false,
    showTools: false,
    showMCPDialog: false,
    showWorkspacePermissions: false,
    showAddServer: false,
    editServerData: null,
    filePreviewTarget: null,
  });
}
```

## 3. Usage in Stories

### Simple: Component with session store

```typescript
// MessageBubble.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { createMockMessage, createMockTextPart } from '@/mocks/sdk';

const meta: Meta<typeof MessageBubble> = {
  title: 'Chat/MessageBubble',
  component: MessageBubble,
};

export default meta;
type Story = StoryObj<typeof MessageBubble>;

export const UserMessage: Story = {
  args: {
    message: createMockMessage({ role: 'user' }),
    textContent: 'Read the file src/index.ts',
  },
};

export const AssistantMessage: Story = {
  args: {
    message: createMockMessage({ role: 'assistant' }),
    textContent: 'I\'ll read that file for you.',
  },
};

export const QueuedMessage: Story = {
  args: {
    message: createMockMessage({ role: 'user' }),
    textContent: 'Pending message...',
    isQueued: true,
    onRemove: () => alert('Remove clicked'),
  },
};
```

### Complex: Component needing stores

```typescript
// CodeBlock.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { CodeBlock } from '@/components/visualizations/CodeBlock';
import { withServerDataStore } from '@/mocks/stores';
import { withUIStore } from '@/mocks/stores';

const meta: Meta<typeof CodeBlock> = {
  title: 'Visualizations/CodeBlock',
  component: CodeBlock,
  decorators: [
    withUIStore(),
    withServerDataStore(),
  ],
};

export default meta;
type Story = StoryObj<typeof CodeBlock>;

export const TypeScript: Story = {
  args: {
    content: 'export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n',
    path: 'src/utils/greet.ts',
    language: 'typescript',
  },
};
```

## 4. Important Notes

### `zustand.setState` works at runtime

Zustand's `setState` merges state immediately. Our decorators call `setState` in the render phase, which means:
- State is set **before** the Story component renders
- Components reading from the store get the mock state immediately
- No async setup or waiting needed

### Action handlers still work

When we set state via `setState`, we only override the state fields — not the action functions. So `useUIStore.getState().setShowSettings(true)` still works inside stories if a component calls it (e.g., a button that opens a dialog).

### For components that use `useShallow`

Some components use `useShallow` from Zustand for selector optimization:

```typescript
const { showSettings, showConfiguration } = useUIStore(
  useShallow((s) => ({ showSettings: s.showSettings, showConfiguration: s.showConfiguration }))
);
```

This still works with our approach — `useShallow` reads from the same store, and we've set the state.

## Files Created

```
packages/client/src/
  mocks/
    sdk.ts              # (from Step 3)
    stores.ts           # Store override decorators
    store-cleanup.ts    # Reset utility between stories
```
