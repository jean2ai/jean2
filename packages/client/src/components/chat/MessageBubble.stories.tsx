import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Message } from '@jean2/sdk';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { MessageBubble } from './MessageBubble';
import {
  createUserMessage,
  createAssistantMessage,
} from '../../../.storybook/mocks/mockMessage';

const userMessage = createUserMessage({ role: 'user' });
const assistantMessage = createAssistantMessage({ role: 'assistant' });

const meta = {
  title: 'Chat/MessageBubble',
  component: MessageBubble,
  parameters: {
    layout: 'padded',
  },
  args: {
    message: userMessage,
    textContent: 'Hello, can you help me with TypeScript?',
    onRemove: () => {},
    onRevert: () => {},
    onFork: () => {},
  },
} satisfies Meta<typeof MessageBubble>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UserMessage: Story = {
  args: {
    message: userMessage,
    textContent: 'Hello, can you help me with TypeScript?',
    children: <p className="text-sm">Hello, can you help me with TypeScript?</p>,
  },
};

export const AssistantMessage: Story = {
  args: {
    message: assistantMessage,
    textContent: 'Sure! I would be happy to help. What do you need?',
    children: (
      <MarkdownRenderer>
        Sure! I would be happy to help. What do you need?
      </MarkdownRenderer>
    ),
  },
};

export const AssistantWithCode: Story = {
  args: {
    message: assistantMessage,
    textContent: 'Here is an example interface:',
    children: (
      <MarkdownRenderer>
        {`Here is an example interface:

\`\`\`typescript
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}
\`\`\`

You can use this as a starting point for your type definitions.`}
      </MarkdownRenderer>
    ),
  },
};

export const LongUserMessage: Story = {
  args: {
    message: userMessage,
    textContent: 'Long message...',
    children: (
      <p className="text-sm">
        I am working on a complex project that involves multiple microservices communicating through a message queue.
        The system needs to handle high throughput with low latency, and I am considering using a combination of
        TypeScript for the service layer and Go for performance-critical components. The main challenge is ensuring
        type safety across service boundaries while maintaining flexibility for future changes.
      </p>
    ),
  },
};

export const QueuedMessage: Story = {
  args: {
    message: userMessage,
    isQueued: true,
    children: <p className="text-sm">This message is waiting to be sent...</p>,
  },
};

export const QueuedWithRemove: Story = {
  args: {
    message: userMessage,
    isQueued: true,
    onRemove: () => {},
    children: <p className="text-sm">Click the X to remove from queue</p>,
  },
};

export const WithRevertButton: Story = {
  args: {
    message: userMessage,
    canRevert: true,
    onRevert: () => {},
    children: <p className="text-sm">You can revert the conversation to this point</p>,
  },
};

export const WithForkButton: Story = {
  args: {
    message: userMessage,
    canFork: true,
    onFork: () => {},
    children: <p className="text-sm">You can fork the conversation from this point</p>,
  },
};

export const WithBothActions: Story = {
  args: {
    message: userMessage,
    canRevert: true,
    canFork: true,
    onRevert: () => {},
    onFork: () => {},
    children: <p className="text-sm">Both revert and fork are available</p>,
  },
};

export const ClearAll: Story = {
  args: {
    message: userMessage,
    canRevert: true,
    isClearAll: true,
    onRevert: () => {},
    children: <p className="text-sm">Reverting here will clear the entire conversation</p>,
  },
};

export const ConversationThread: Story = {
  render: () => (
    <div className="max-w-2xl space-y-4">
      <MessageBubble message={createUserMessage()} textContent="Hey there!">
        <p className="text-sm">Hey there!</p>
      </MessageBubble>
      <MessageBubble message={createAssistantMessage()} textContent="Hi! How can I help?">
        <MarkdownRenderer>Hi! How can I help?</MarkdownRenderer>
      </MessageBubble>
      <MessageBubble message={createUserMessage()} textContent="Explain closures">
        <p className="text-sm">Can you explain closures in JavaScript?</p>
      </MessageBubble>
      <MessageBubble
        message={createAssistantMessage()}
        textContent="A closure is..."
      >
        <MarkdownRenderer>
          {`A **closure** is a function that has access to variables from its outer (enclosing) function scope, even after the outer function has returned.

\`\`\`javascript
function createCounter() {
  let count = 0;
  return () => ++count;
}
const counter = createCounter();
counter(); // 1
counter(); // 2
\`\`\`

The inner function "closes over" the \`count\` variable.`}
        </MarkdownRenderer>
      </MessageBubble>
    </div>
  ),
};
