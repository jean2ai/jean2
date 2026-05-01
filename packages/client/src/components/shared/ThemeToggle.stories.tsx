import type { Meta, StoryObj } from '@storybook/react-vite';
import { ThemeToggle } from './ThemeToggle';
import { ThemeProvider } from '@/components/providers/ThemeProvider';

const meta = {
  title: 'Shared/ThemeToggle',
  component: ThemeToggle,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <ThemeProvider defaultMode="system" defaultScheme="neutral">
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ThemeToggle />,
};

export const WithBackground: Story = {
  render: () => (
    <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
      <span className="text-sm text-muted-foreground">Theme:</span>
      <ThemeToggle />
    </div>
  ),
};

export const InHeader: Story = {
  render: () => (
    <div className="flex items-center justify-between w-[400px] p-3 border rounded-lg">
      <span className="font-semibold">My App</span>
      <ThemeToggle />
    </div>
  ),
};
