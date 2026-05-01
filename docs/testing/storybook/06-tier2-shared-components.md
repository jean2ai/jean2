# Step 6: Tier 2 — Shared & Visualization Stories

Stories for shared utility components and visualization renderers. These need SDK type mocks but minimal store interaction.

## Component List (12 total)

### Shared Components (5)

| Component | SDK Deps | Store Deps | Key States |
|-----------|----------|------------|------------|
| EmptyState | None | None | With icon, with action, without action |
| LoadingSkeleton | None | None | Message skeleton, session list skeleton |
| MarkdownRenderer | None | None | Plain text, headings, code blocks, tables, links |
| OfflineState | None | None | Default |
| ThemeToggle | None | None | Light, dark, system |

### Visualization Components (7)

| Component | SDK Deps | Store Deps | Key States |
|-----------|----------|------------|------------|
| CodeBlock | None | `uiStore`, `serverDataStore` | Expanded, collapsed, new file |
| DiffViewer | `DiffVisualization` | None | Additions, deletions, mixed |
| FileListViewer | `FileListVisualization` | None | Added, modified, deleted files |
| SuccessIndicator | `SuccessVisualization` | None | Success state |
| TerminalOutput | `TerminalVisualization` | None | Success (exit 0), failure (exit 1) |
| TodoList | `TodoVisualization` | None | All pending, mixed, all completed |
| VisualizationRenderer | `AnyVisualization` | None | Each visualization type |

## Story Examples

### EmptyState

```typescript
// packages/client/src/components/shared/EmptyState.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState, NoSessionsState, NoWorkspaceState, NoMessagesState } from './EmptyState';
import { Inbox, FolderOpen, MessageSquare, AlertCircle } from 'lucide-react';

const meta: Meta<typeof EmptyState> = {
  title: 'Shared/EmptyState',
  component: EmptyState,
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Basic: Story = {
  args: {
    icon: <Inbox className="size-12" />,
    title: 'No items found',
    description: 'Create a new item to get started.',
  },
};

export const WithAction: Story = {
  args: {
    icon: <Inbox className="size-12" />,
    title: 'No sessions yet',
    description: 'Start a new chat to begin working with your AI agent.',
    action: { label: 'Create Session', onClick: () => alert('Create!') },
  },
};

export const WithoutIcon: Story = {
  args: {
    title: 'Nothing here',
    description: 'Check back later.',
  },
};

export const WithoutDescription: Story = {
  args: {
    icon: <AlertCircle className="size-12" />,
    title: 'Something went wrong',
  },
};

// --- Pre-built variants ---

export const NoSessions: Story = {
  render: () => <NoSessionsState onSelect={() => alert('Create session')} />,
};

export const NoWorkspace: Story = {
  render: () => <NoWorkspaceState onSelect={() => alert('Select workspace')} />,
};

export const NoMessages: Story = {
  render: () => <NoMessagesState />,
};
```

### MarkdownRenderer

```typescript
// packages/client/src/components/shared/MarkdownRenderer.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MarkdownRenderer } from './MarkdownRenderer';

const meta: Meta<typeof MarkdownRenderer> = {
  title: 'Shared/MarkdownRenderer',
  component: MarkdownRenderer,
};

export default meta;
type Story = StoryObj<typeof MarkdownRenderer>;

const markdownContent = `
## Getting Started

This is a **markdown** paragraph with *italic* and \`inline code\`.

### Code Block

\`\`\`typescript
interface User {
  id: string;
  name: string;
  email: string;
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}
\`\`\`

### List

- First item
- Second item
- Third item

### Table

| Name | Type | Description |
|------|------|-------------|
| id | string | Unique identifier |
| name | string | Display name |

### Blockquote

> This is a blockquote with some important information.

[Click here](https://example.com) for more info.
`;

export const RichContent: Story = {
  args: {
    children: markdownContent,
  },
};

export const PlainText: Story = {
  args: {
    children: 'Just a simple paragraph of text with no formatting.',
  },
};

export const Inverted: Story = {
  args: {
    children: markdownContent,
    inverted: true,
  },
  decorators: [
    (Story) => (
      <div className="bg-primary text-primary-foreground rounded-lg p-4">
        <Story />
      </div>
    ),
  ],
};

export const CodeOnly: Story = {
  args: {
    children: '```python\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n```',
  },
};
```

### VisualizationRenderer

```typescript
// packages/client/src/components/visualizations/VisualizationRenderer.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { VisualizationRenderer } from './VisualizationRenderer';
import {
  createMockDiffVisualization,
  createMockCodeBlockVisualization,
  createMockTerminalVisualization,
  createMockTodoVisualization,
  createMockSuccessVisualization,
  createMockFileListVisualization,
} from '@/mocks/sdk';

const meta: Meta<typeof VisualizationRenderer> = {
  title: 'Visualizations/VisualizationRenderer',
  component: VisualizationRenderer,
};

export default meta;
type Story = StoryObj<typeof VisualizationRenderer>;

export const Diff: Story = {
  args: {
    visualization: createMockDiffVisualization(),
  },
};

export const CodeBlock: Story = {
  args: {
    visualization: createMockCodeBlockVisualization(),
  },
};

export const Terminal: Story = {
  args: {
    visualization: createMockTerminalVisualization(),
  },
};

export const TerminalFailure: Story = {
  args: {
    visualization: createMockTerminalVisualization({
      content: '$ npm test\n\nFAIL  src/utils.test.ts\n  ✕ greet returns greeting (5ms)\n    Expected: "Hello, World!"\n    Received: "Hi, World!"\n\nTests: 1 failed, 1 total\n',
      exitCode: 1,
    }),
  },
};

export const TodoList: Story = {
  args: {
    visualization: createMockTodoVisualization(),
  },
};

export const Success: Story = {
  args: {
    visualization: createMockSuccessVisualization(),
  },
};

export const FileList: Story = {
  args: {
    visualization: createMockFileListVisualization(),
  },
};
```

### CodeBlock (needs stores)

```typescript
// packages/client/src/components/visualizations/CodeBlock.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { CodeBlock } from './CodeBlock';
import { withUIStore } from '@/mocks/stores';
import { withServerDataStore } from '@/mocks/stores';

const meta: Meta<typeof CodeBlock> = {
  title: 'Visualizations/CodeBlock',
  component: CodeBlock,
  decorators: [withUIStore(), withServerDataStore()],
};

export default meta;
type Story = StoryObj<typeof CodeBlock>;

const longCode = Array.from({ length: 50 }, (_, i) => `const line${i} = ${i};`).join('\n');

export const TypeScript: Story = {
  args: {
    content: 'export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n',
    path: 'src/utils/greet.ts',
    language: 'typescript',
  },
};

export const Python: Story = {
  args: {
    content: 'def fibonacci(n: int) -> list[int]:\n    """Generate fibonacci sequence."""\n    a, b = 0, 1\n    result = []\n    for _ in range(n):\n        result.append(a)\n        a, b = b, a + b\n    return result\n',
    path: 'src/math/fibonacci.py',
    language: 'python',
  },
};

export const NewFile: Story = {
  args: {
    content: '// New file created\nexport const VERSION = "1.0.0";\n',
    path: 'src/version.ts',
    language: 'typescript',
    created: true,
  },
};

export const LongFile: Story = {
  args: {
    content: longCode,
    path: 'src/generated/constants.ts',
    language: 'typescript',
  },
};

export const WithHighlightLines: Story = {
  args: {
    content: 'const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconst e = 5;\n',
    path: 'src/example.ts',
    language: 'typescript',
    highlightLines: [2, 4],
  },
};
```

## Files Created

```
packages/client/src/components/
  shared/
    EmptyState.stories.tsx
    LoadingSkeleton.stories.tsx
    MarkdownRenderer.stories.tsx
    OfflineState.stories.tsx
    ThemeToggle.stories.tsx
  visualizations/
    CodeBlock.stories.tsx
    DiffViewer.stories.tsx
    FileListViewer.stories.tsx
    SuccessIndicator.stories.tsx
    TerminalOutput.stories.tsx
    TodoList.stories.tsx
    VisualizationRenderer.stories.tsx
```
