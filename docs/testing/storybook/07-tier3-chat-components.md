# Step 7: Tier 3 — Chat Component Stories

Stories for the 15 chat UI components. These depend on SDK types and sometimes need store state for context.

## Component List (15 total)

| Component | SDK Types | Store Deps | Key States |
|-----------|-----------|------------|------------|
| MessageBubble | `Message` | None | User, assistant, queued, with actions |
| MessageInput | None | None (props-driven) | Empty, with text, with attachments |
| ToolCall | `ToolPart`, `AnyVisualization` | `sessionStore` | Running, completed, error, with ask |
| TypingIndicator | None | None | Active streaming state |
| ChatHeader | `Session` | None (props-driven) | With model, without model |
| ModelSelector | `Model` | None (props-driven) | Single model, many models, selected |
| TokenMeter | None | None (props-driven) | Low, medium, high usage |
| FileMentionChip | None | None | File path display |
| PreconfigSelector | `Preconfig` | None (props-driven) | Selected, unselected, many options |
| PromptAutocomplete | `PromptInfo` | None (props-driven) | Matching, no match |
| VariantSelector | None | None (props-driven) | Selected variant |
| PendingAttachment | None | None (props-driven) | File, image |
| AskQuestion | `Ask` | `sessionStore` | Permission prompt |
| VirtualizedTranscript | `MessageWithParts` | None (props-driven) | Short, long, streaming |
| ChatView | All of the above | Multiple | Full chat experience |

## Strategy

Most chat components are **props-driven** — they receive data via props, not stores. This makes them straightforward to story. The exceptions are `ToolCall` (reads `sessionStore` for current session) and `AskQuestion` (reads `sessionStore` for ask handlers).

## Story Examples

### MessageBubble

```typescript
// packages/client/src/components/chat/MessageBubble.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MessageBubble } from './MessageBubble';
import { createMockMessage } from '@/mocks/sdk';

const meta: Meta<typeof MessageBubble> = {
  title: 'Chat/MessageBubble',
  component: MessageBubble,
  argTypes: {
    isQueued: { control: 'boolean' },
    canRevert: { control: 'boolean' },
    canFork: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof MessageBubble>;

export const UserMessage: Story = {
  args: {
    message: createMockMessage({ role: 'user' }),
    textContent: 'Read the file src/index.ts and tell me what it does.',
  },
};

export const AssistantMessage: Story = {
  args: {
    message: createMockMessage({ role: 'assistant', id: 'msg-2' }),
    textContent: 'I\'ll read that file for you. Let me check the contents.',
  },
};

export const LongMessage: Story = {
  args: {
    message: createMockMessage({ role: 'assistant', id: 'msg-3' }),
    textContent: 'Here is a detailed explanation of the code. '.repeat(20).trim(),
  },
};

export const Queued: Story = {
  args: {
    message: createMockMessage({ role: 'user' }),
    textContent: 'This message is waiting to be sent...',
    isQueued: true,
    onRemove: () => console.log('remove'),
  },
};

export const WithRevert: Story = {
  args: {
    message: createMockMessage({ role: 'user' }),
    textContent: 'Can you refactor this function?',
    canRevert: true,
    onRevert: () => console.log('revert'),
  },
};

export const WithFork: Story = {
  args: {
    message: createMockMessage({ role: 'user' }),
    textContent: 'What if we use a different approach?',
    canFork: true,
    onFork: () => console.log('fork'),
  },
};

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-4 max-w-2xl">
      <MessageBubble
        message={createMockMessage({ role: 'user' })}
        textContent="Hello, can you help me?"
      />
      <MessageBubble
        message={createMockMessage({ role: 'assistant', id: 'msg-2' })}
        textContent="Of course! I'd be happy to help. What do you need?"
      />
      <MessageBubble
        message={createMockMessage({ role: 'user', id: 'msg-3' })}
        textContent="This is queued..."
        isQueued={true}
        onRemove={() => {}}
      />
    </div>
  ),
};
```

### ModelSelector

```typescript
// packages/client/src/components/chat/ModelSelector.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ModelSelector } from './ModelSelector';
import { createMockModels } from '@/mocks/sdk';

const meta: Meta<typeof ModelSelector> = {
  title: 'Chat/ModelSelector',
  component: ModelSelector,
};

export default meta;
type Story = StoryObj<typeof ModelSelector>;

const models = createMockModels();

export const Default: Story = {
  args: {
    models,
    selectedModelId: 'claude-sonnet-4-20250514',
    selectedProviderId: 'anthropic',
    onSelectModel: (modelId, providerId) => console.log('Selected:', modelId, providerId),
  },
};

export const NoSelection: Story = {
  args: {
    models,
    selectedModelId: null,
    selectedProviderId: null,
    onSelectModel: (modelId, providerId) => console.log('Selected:', modelId, providerId),
  },
};

export const SingleModel: Story = {
  args: {
    models: [models[0]],
    selectedModelId: 'claude-sonnet-4-20250514',
    selectedProviderId: 'anthropic',
    onSelectModel: () => {},
  },
};
```

### TokenMeter

```typescript
// packages/client/src/components/chat/TokenMeter.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { TokenMeter } from './TokenMeter';

const meta: Meta<typeof TokenMeter> = {
  title: 'Chat/TokenMeter',
  component: TokenMeter,
};

export default meta;
type Story = StoryObj<typeof TokenMeter>;

export const Low: Story = {
  args: {
    usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
    contextWindow: 200000,
  },
};

export const Medium: Story = {
  args: {
    usage: { promptTokens: 50000, completionTokens: 20000, totalTokens: 70000 },
    contextWindow: 200000,
  },
};

export const High: Story = {
  args: {
    usage: { promptTokens: 150000, completionTokens: 30000, totalTokens: 180000 },
    contextWindow: 200000,
  },
};

export const NearlyFull: Story = {
  args: {
    usage: { promptTokens: 190000, completionTokens: 8000, totalTokens: 198000 },
    contextWindow: 200000,
  },
};
```

### ToolCall (needs store)

```typescript
// packages/client/src/components/chat/ToolCall.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ToolCall } from './ToolCall';
import { withSessionStore } from '@/mocks/stores';
import {
  createMockToolPart,
  createMockToolPartRunning,
  createMockToolPartError,
  createMockDiffVisualization,
  createMockTerminalVisualization,
  createMockSession,
} from '@/mocks/sdk';

const meta: Meta<typeof ToolCall> = {
  title: 'Chat/ToolCall',
  component: ToolCall,
  decorators: [
    withSessionStore({
      currentSession: createMockSession(),
    }),
  ],
};

export default meta;
type Story = StoryObj<typeof ToolCall>;

export const Completed: Story = {
  args: {
    toolPart: createMockToolPart(),
    session: createMockSession(),
  },
};

export const Running: Story = {
  args: {
    toolPart: createMockToolPartRunning(),
    session: createMockSession(),
  },
};

export const Error: Story = {
  args: {
    toolPart: createMockToolPartError(),
    session: createMockSession(),
  },
};

export const WithDiffVisualization: Story = {
  args: {
    toolPart: createMockToolPart({
      visualization: createMockDiffVisualization(),
    }),
    session: createMockSession(),
  },
};

export const WithTerminalOutput: Story = {
  args: {
    toolPart: createMockToolPart({
      toolName: 'execute-command',
      visualization: createMockTerminalVisualization(),
    }),
    session: createMockSession(),
  },
};
```

### MessageInput

```typescript
// packages/client/src/components/chat/MessageInput.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MessageInput } from './MessageInput';

const meta: Meta<typeof MessageInput> = {
  title: 'Chat/MessageInput',
  component: MessageInput,
};

export default meta;
type Story = StoryObj<typeof MessageInput>;

export const Empty: Story = {
  args: {
    onSend: (content) => console.log('Send:', content),
    disabled: false,
  },
};

export const Disabled: Story = {
  args: {
    onSend: () => {},
    disabled: true,
  },
};

export const WithModelInfo: Story = {
  args: {
    onSend: (content) => console.log('Send:', content),
    disabled: false,
    modelName: 'Claude Sonnet 4',
  },
};
```

## Files Created

```
packages/client/src/components/chat/
  AskQuestion.stories.tsx
  ChatHeader.stories.tsx
  FileMentionChip.stories.tsx
  MessageBubble.stories.tsx
  MessageInput.stories.tsx
  ModelSelector.stories.tsx
  PendingAttachment.stories.tsx
  PreconfigSelector.stories.tsx
  PromptAutocomplete.stories.tsx
  TokenMeter.stories.tsx
  ToolCall.stories.tsx
  TypingIndicator.stories.tsx
  VariantSelector.stories.tsx
  VirtualizedTranscript.stories.tsx
```
