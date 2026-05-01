import type { Meta, StoryObj } from '@storybook/react-vite';
import { TypingIndicator } from './TypingIndicator';

const meta = {
  title: 'Chat/TypingIndicator',
  component: TypingIndicator,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof TypingIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const InConversation: Story = {
  decorators: [
    (Story) => (
      <div className="max-w-2xl space-y-4">
        <div className="flex justify-end">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3 max-w-[90%]">
            <p className="text-sm">Can you explain how React Server Components work?</p>
          </div>
        </div>
        <Story />
      </div>
    ),
  ],
};

export const DarkBackground: Story = {
  decorators: [
    (Story) => (
      <div className="bg-background p-6 rounded-lg">
        <Story />
      </div>
    ),
  ],
};
