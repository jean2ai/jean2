import type { Meta, StoryObj } from '@storybook/react-vite';
import { TokenMeter } from './TokenMeter';

const meta = {
  title: 'Chat/TokenMeter',
  component: TokenMeter,
  parameters: {
    layout: 'centered',
  },
  args: {
    totalTokens: 5000,
    contextWindow: 200000,
    modelName: 'Claude 3.5 Sonnet',
  },
} satisfies Meta<typeof TokenMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoUsage: Story = {
  args: {
    totalTokens: 0,
    contextWindow: 200000,
  },
};

export const LowUsage: Story = {
  args: {
    totalTokens: 5000,
    contextWindow: 200000,
  },
};

export const MediumUsage: Story = {
  args: {
    totalTokens: 40000,
    contextWindow: 100000,
  },
};

export const HighUsage: Story = {
  args: {
    totalTokens: 70000,
    contextWindow: 100000,
  },
};

export const NearLimit: Story = {
  args: {
    totalTokens: 92000,
    contextWindow: 100000,
  },
};

export const AtLimit: Story = {
  args: {
    totalTokens: 100000,
    contextWindow: 100000,
  },
};

export const NoContextWindow: Story = {
  args: {
    totalTokens: 5000,
    contextWindow: 0,
  },
};

export const LargeContext: Story = {
  args: {
    totalTokens: 150000,
    contextWindow: 1000000,
    modelName: 'Gemini 2.0 Flash',
  },
};

export const Compact: Story = {
  args: {
    totalTokens: 25000,
    contextWindow: 200000,
    compact: true,
  },
};
