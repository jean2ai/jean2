import type { Meta, StoryObj } from '@storybook/react-vite';
import { VariantSelector } from './VariantSelector';

const sampleVariants = {
  low: { providerOptions: { temperature: 0.1 } },
  medium: { providerOptions: { temperature: 0.5 } },
  high: { providerOptions: { temperature: 0.9 } },
};

const meta = {
  title: 'Chat/VariantSelector',
  component: VariantSelector,
  parameters: {
    layout: 'padded',
  },
  args: {
    variants: sampleVariants,
    selectedVariant: null,
    onChangeVariant: () => {},
  },
} satisfies Meta<typeof VariantSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SelectedLow: Story = {
  args: {
    selectedVariant: 'low',
  },
};

export const SelectedHigh: Story = {
  args: {
    selectedVariant: 'high',
  },
};

export const Compact: Story = {
  args: {
    compact: true,
  },
};

export const IconOnly: Story = {
  args: {
    iconOnly: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const NoVariants: Story = {
  args: {
    variants: undefined,
  },
};

export const EmptyVariants: Story = {
  args: {
    variants: {},
  },
};

export const ManyVariants: Story = {
  args: {
    variants: {
      minimal: { providerOptions: { temperature: 0 } },
      low: { providerOptions: { temperature: 0.1 } },
      medium: { providerOptions: { temperature: 0.5 } },
      high: { providerOptions: { temperature: 0.9 } },
      xhigh: { providerOptions: { temperature: 1.0 } },
      max: { providerOptions: { temperature: 1.5 } },
    },
  },
};

export const AllDisplayModes: Story = {
  render: (args) => (
    <div className="flex items-center gap-6">
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Default</span>
        <VariantSelector {...args} compact={false} iconOnly={false} />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Compact</span>
        <VariantSelector {...args} compact iconOnly={false} />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Icon Only</span>
        <VariantSelector {...args} compact={false} iconOnly />
      </div>
    </div>
  ),
};
