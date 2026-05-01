import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState, NoSessionsState, NoWorkspaceState, NoMessagesState } from './EmptyState';
import { Inbox, FolderOpen, Search, Settings } from 'lucide-react';
import { action } from 'storybook/actions';

const meta = {
  title: 'Shared/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
  },
  args: {
    title: 'Nothing here',
    description: 'This is an empty state description.',
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    icon: <Inbox className="size-12" />,
  },
};

export const WithAction: Story = {
  args: {
    icon: <FolderOpen className="size-12" />,
    title: 'No files found',
    description: 'Upload a file or create a new one to get started.',
    action: {
      label: 'Upload File',
      onClick: action('upload-clicked'),
    },
  },
};

export const WithoutDescription: Story = {
  args: {
    title: 'No results',
    description: undefined,
  },
};

export const WithCustomIcon: Story = {
  args: {
    icon: <Search className="size-12" />,
    title: 'Search returned no results',
    description: 'Try adjusting your search terms or filters.',
    action: {
      label: 'Clear Filters',
      onClick: action('clear-filters'),
    },
  },
};

export const NoSessions: Story = {
  render: () => <NoSessionsState onSelect={action('create-session')} />,
};

export const NoSessionsWithoutAction: Story = {
  render: () => <NoSessionsState />,
};

export const NoWorkspace: Story = {
  render: () => <NoWorkspaceState onSelect={action('select-workspace')} />,
};

export const NoMessages: Story = {
  render: () => <NoMessagesState />,
};

export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-8 w-[800px]">
      <div className="border rounded-lg">
        <NoSessionsState onSelect={action('create-session')} />
      </div>
      <div className="border rounded-lg">
        <NoWorkspaceState onSelect={action('select-workspace')} />
      </div>
      <div className="border rounded-lg">
        <NoMessagesState />
      </div>
      <div className="border rounded-lg">
        <EmptyState
          icon={<Settings className="size-12" />}
          title="Custom empty state"
          description="With a custom icon and action button"
          action={{ label: 'Configure', onClick: action('configure') }}
        />
      </div>
    </div>
  ),
};
