import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  SessionListSkeleton,
  MessageSkeleton,
  ChatLoadingState,
  WorkspaceSkeleton,
  ConnectingState,
} from './LoadingSkeleton';

const meta = {
  title: 'Shared/LoadingSkeleton',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const SessionList: Story = {
  render: () => (
    <div className="w-[300px] border rounded-lg">
      <SessionListSkeleton />
    </div>
  ),
};

export const Message: Story = {
  render: () => <MessageSkeleton />,
};

export const MultipleMessages: Story = {
  render: () => (
    <div className="flex flex-col gap-2 max-w-[600px]">
      <MessageSkeleton />
      <MessageSkeleton />
      <MessageSkeleton />
    </div>
  ),
};

export const ChatLoading: Story = {
  render: () => (
    <div className="h-[400px] w-full border rounded-lg">
      <ChatLoadingState />
    </div>
  ),
};

export const Workspace: Story = {
  render: () => (
    <div className="w-[300px] border rounded-lg">
      <WorkspaceSkeleton />
    </div>
  ),
};

export const Connecting: Story = {
  render: () => <ConnectingState />,
};

export const ConnectingWithMessage: Story = {
  render: () => <ConnectingState message="Reconnecting to server..." />,
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-8 w-[400px]">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Session List</h3>
        <div className="border rounded-lg">
          <SessionListSkeleton />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Messages</h3>
        <div className="flex flex-col gap-2">
          <MessageSkeleton />
          <MessageSkeleton />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Chat Loading</h3>
        <div className="h-[200px] border rounded-lg">
          <ChatLoadingState />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Workspace</h3>
        <div className="border rounded-lg">
          <WorkspaceSkeleton />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Connecting</h3>
        <div className="h-[100px] border rounded-lg flex items-center justify-center">
          <ConnectingState />
        </div>
      </div>
    </div>
  ),
};
