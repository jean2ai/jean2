import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileMentionChip } from './FileMentionChip';

const meta = {
  title: 'Chat/FileMentionChip',
  component: FileMentionChip,
  parameters: {
    layout: 'centered',
  },
  args: {
    path: 'src/components/chat/MessageBubble.tsx',
    onRemove: () => {},
    onPreview: () => {},
  },
} satisfies Meta<typeof FileMentionChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ShortPath: Story = {
  args: {
    path: 'package.json',
  },
};

export const DeepPath: Story = {
  args: {
    path: 'packages/client/src/components/chat/ChatView.tsx',
  },
};

export const NoPreview: Story = {
  args: {
    onPreview: undefined,
  },
};

export const MultipleChips: Story = {
  render: () => (
    <div className="flex gap-2 flex-wrap">
      <FileMentionChip
        path="src/index.ts"
        onRemove={() => {}}
        onPreview={() => {}}
      />
      <FileMentionChip
        path="package.json"
        onRemove={() => {}}
        onPreview={() => {}}
      />
      <FileMentionChip
        path="packages/client/src/components/chat/ChatView.tsx"
        onRemove={() => {}}
        onPreview={() => {}}
      />
    </div>
  ),
};
