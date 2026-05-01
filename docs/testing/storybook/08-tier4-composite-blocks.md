# Step 8: Tier 4 — Composite Block Stories

Stories for layouts, modals, and app-level component blocks. These are the most complex — they depend on multiple stores and rich SDK data.

## Component List

### Layout Components (12)

| Component | Store Deps | Description |
|-----------|------------|-------------|
| AppSidebar | `sessionStore`, `serverDataStore`, `chatLayoutStore` | Main sidebar with session list |
| FilesPanel | `uiStore`, `serverDataStore` | File browser panel |
| QuickSwitcher | `sessionStore`, `serverDataStore` | Command palette for switching |
| ResizablePanel | None | Generic resizable panel wrapper |
| ServerSwitcher | `serverDataStore` | Server selection dropdown |
| SessionMenuButton | `sessionStore` | Session action menu |
| SidebarLayoutToggle | `chatLayoutStore` | Toggle sidebar width |
| TerminalPanel | None (xterm) | Terminal panel with xterm.js |
| TerminalView | None | xterm.js wrapper |
| WorkspaceOverview | `serverDataStore` | Workspace cards overview |
| WorkspaceSessionContent | `sessionStore`, `serverDataStore` | Session list for a workspace |
| WorkspaceSwitcher | `serverDataStore` | Workspace selection dropdown |

### Modal Components (9 + sub-panels)

| Component | Store Deps | Description |
|-----------|------------|-------------|
| AddServerDialog | `uiStore` | Add new server connection |
| ConfigurationDialog | `uiStore`, `serverDataStore` | Models, providers, preconfigs config |
| ConfirmDialog | None | Generic confirmation dialog |
| FolderPickerDialog | `uiStore` | Folder selection browser |
| MCPManagementDialog | `uiStore` | MCP server management |
| PermissionListItem | None | Single permission item |
| SettingsDialog | `uiStore` | Theme, notifications settings |
| ToolsDialog | `uiStore` | Tool management |
| WorkspacePermissionsDialog | `uiStore` | Workspace permissions |

### Configuration Sub-Panels (5)

| Component | Store Deps |
|-----------|------------|
| ModelsPanel | `serverDataStore` |
| OAuthProvidersPanel | `serverDataStore` |
| PreconfigsPanel | `serverDataStore` |
| ProviderCredentialsPanel | `serverDataStore` |
| PromptsPanel | `serverDataStore` |

## Strategy

Composite components need a full mock environment. Use the `withAllStores()` decorator for convenience, or compose specific store decorators for targeted stories.

### Challenge: Dialog Components

Dialog components like `SettingsDialog` are controlled by `uiStore.showSettings`. To render them open in Storybook, we set the store state:

```typescript
export const Open: Story = {
  decorators: [withUIStore({ showSettings: true })],
};
```

But the dialog component itself calls `useUIStore.getState().setShowSettings(false)` when closing. This works in Storybook — the store mutation happens in the browser, and the dialog closes as expected. This is fine for interactive testing.

### Challenge: xterm.js

`TerminalPanel` and `TerminalView` use `@xterm/xterm` which attaches to a DOM element. This works in Storybook but needs a container with explicit dimensions:

```typescript
export const WithTerminal: Story = {
  decorators: [
    (Story) => (
      <div style={{ height: 400, width: '100%' }}>
        <Story />
      </div>
    ),
  ],
};
```

### Challenge: TanStack Router

Some layout components may use TanStack Router hooks (`useNavigate`, `useParams`). In Storybook there's no router context. Options:

1. **Mock the hooks** at the module level
2. **Wrap stories in a router provider** (heavier)
3. **Prefer props-driven testing** for components that accept navigation callbacks as props

## Story Examples

### SettingsDialog

```typescript
// packages/client/src/components/modals/SettingsDialog.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { SettingsDialog } from './SettingsDialog';
import { withUIStore } from '@/mocks/stores';

const meta: Meta<typeof SettingsDialog> = {
  title: 'Modals/SettingsDialog',
  component: SettingsDialog,
  decorators: [withUIStore({ showSettings: true })],
};

export default meta;
type Story = StoryObj<typeof SettingsDialog>;

export const Open: Story = {
  args: {},
};

// Settings dialog reads from ThemeProvider context,
// so we need a wrapper. For Storybook, we can mock it:
export const WithThemeContext: Story = {
  decorators: [
    withUIStore({ showSettings: true }),
    (Story) => {
      // Mock useTheme if the component uses it
      // This requires checking SettingsDialog's actual imports
      return <Story />;
    },
  ],
};
```

### AppSidebar

```typescript
// packages/client/src/components/layout/AppSidebar.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { AppSidebar } from './AppSidebar';
import { withAllStores } from '@/mocks/stores';
import { createMockSessions, createMockWorkspace } from '@/mocks/sdk';

const meta: Meta<typeof AppSidebar> = {
  title: 'Layout/AppSidebar',
  component: AppSidebar,
  decorators: [
    withAllStores({
      session: {
        sessions: createMockSessions(),
        currentSession: createMockSessions()[0],
      },
      serverData: {
        activeWorkspace: createMockWorkspace(),
      },
    }),
  ],
};

export default meta;
type Story = StoryObj<typeof AppSidebar>;

export const WithSessions: Story = {};

export const EmptySessions: Story = {
  decorators: [
    withAllStores({
      session: {
        sessions: [],
        currentSession: null,
      },
    }),
  ],
};
```

### EmptyState (Composite Chat Block)

For composite blocks, it's often useful to show multiple states in a single story:

```typescript
// Example: ChatStates.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ToolCall } from '@/components/chat/ToolCall';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { createMockConversation, createMockToolPart, createMockSession } from '@/mocks/sdk';
import { withSessionStore } from '@/mocks/stores';

const meta: Meta = {
  title: 'Composite/ChatStates',
};

export default meta;

export const StreamingConversation: Story = {
  decorators: [
    withSessionStore({ currentSession: createMockSession() }),
  ],
  render: () => (
    <div className="flex flex-col gap-4 max-w-2xl p-4">
      {/* User message */}
      <MessageBubble
        message={createMockConversation()[0].message}
        textContent="Read the file src/index.ts"
      />
      {/* Assistant with tool call */}
      <MessageBubble
        message={createMockConversation()[1].message}
        textContent="Let me read that file."
      />
      {/* Tool call */}
      <ToolCall
        toolPart={createMockToolPart()}
        session={createMockSession()}
      />
      {/* Typing indicator */}
      <TypingIndicator />
    </div>
  ),
};
```

## Handling ThemeProvider Context

Some components (like `SettingsDialog`) use `useTheme()` which requires `ThemeProvider` context. For Storybook, we have two options:

### Option A: Mock the hook (recommended)

```typescript
// In the story file or a shared mock
jest.mock('@/components/providers/ThemeProvider', () => ({
  useTheme: () => ({
    mode: 'dark',
    scheme: 'neutral',
    setMode: () => {},
    setScheme: () => {},
    resolvedMode: 'dark',
  }),
}));
```

> Note: This uses Jest-style mocking. For Vite-based Storybook without Jest, use `vi.mock()` from Vitest or restructure the component to accept theme as props.

### Option B: Wrap in ThemeProvider

```typescript
import { ThemeProvider } from '@/components/providers/ThemeProvider';

export const WithProvider: Story = {
  decorators: [
    (Story) => (
      <ThemeProvider defaultMode="dark" defaultScheme="neutral">
        <Story />
      </ThemeProvider>
    ),
  ],
};
```

**Option B is simpler** and recommended for most cases. The Storybook theme toolbar (from Step 2) sets CSS classes on `<html>`, which overrides the ThemeProvider's class application anyway.

## Files Created

```
packages/client/src/components/
  layout/
    AppSidebar.stories.tsx
    FilesPanel.stories.tsx
    QuickSwitcher.stories.tsx
    ResizablePanel.stories.tsx
    ServerSwitcher.stories.tsx
    SessionMenuButton.stories.tsx
    SidebarLayoutToggle.stories.tsx
    TerminalPanel.stories.tsx
    TerminalView.stories.tsx
    WorkspaceOverview.stories.tsx
    WorkspaceSessionContent.stories.tsx
    WorkspaceSwitcher.stories.tsx
  modals/
    AddServerDialog.stories.tsx
    ConfigurationDialog.stories.tsx
    ConfirmDialog.stories.tsx
    FolderPickerDialog.stories.tsx
    MCPManagementDialog.stories.tsx
    PermissionListItem.stories.tsx
    SettingsDialog.stories.tsx
    ToolsDialog.stories.tsx
    WorkspacePermissionsDialog.stories.tsx
    configuration/
      ModelsPanel.stories.tsx
      OAuthProvidersPanel.stories.tsx
      PreconfigsPanel.stories.tsx
      ProviderCredentialsPanel.stories.tsx
      PromptsPanel.stories.tsx
```
