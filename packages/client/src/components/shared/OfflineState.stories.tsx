import type { Meta, StoryObj } from '@storybook/react-vite';
import { OfflineState } from './OfflineState';
import { action } from 'storybook/actions';

const meta = {
  title: 'Shared/OfflineState',
  component: OfflineState,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    serverUrl: { control: 'text' },
    authError: { control: 'text' },
    retryCount: { control: 'number' },
    nextRetryIn: { control: 'number' },
  },
  args: {
    serverUrl: 'http://localhost:3000',
    authError: null,
    retryCount: 0,
    nextRetryIn: 10,
    onRetry: action('retry'),
    onLogout: action('logout'),
  },
} as Meta<typeof OfflineState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAuthError: Story = {
  args: {
    authError: 'Invalid or expired authentication token.',
  },
};

export const NoServerUrl: Story = {
  args: {
    serverUrl: null,
  },
};

export const Retrying: Story = {
  args: {
    retryCount: 3,
    nextRetryIn: 5,
  },
};

export const MultipleRetries: Story = {
  args: {
    retryCount: 15,
    nextRetryIn: 30,
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-8 w-[900px]">
      <div className="border rounded-lg">
        <OfflineState
          serverUrl="http://localhost:3000"
          retryCount={0}
          nextRetryIn={10}
          onRetry={action('retry-default')}
          onLogout={action('logout-default')}
        />
      </div>
      <div className="border rounded-lg">
        <OfflineState
          serverUrl="http://localhost:3000"
          authError="Authentication failed."
          retryCount={0}
          nextRetryIn={10}
          onRetry={action('retry-auth')}
          onLogout={action('logout-auth')}
        />
      </div>
      <div className="border rounded-lg">
        <OfflineState
          serverUrl={null}
          retryCount={5}
          nextRetryIn={15}
          onRetry={action('retry-nourl')}
          onLogout={action('logout-nourl')}
        />
      </div>
      <div className="border rounded-lg">
        <OfflineState
          serverUrl="https://remote-server.example.com"
          retryCount={20}
          nextRetryIn={60}
          onRetry={action('retry-remote')}
          onLogout={action('logout-remote')}
        />
      </div>
    </div>
  ),
};
