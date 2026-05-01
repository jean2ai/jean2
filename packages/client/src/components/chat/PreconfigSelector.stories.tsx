import type { Meta, StoryObj } from '@storybook/react-vite';
import { PreconfigSelector } from './PreconfigSelector';
import { createPreconfigList } from '../../../.storybook/mocks/mockPreconfig';

const preconfigs = createPreconfigList();

const meta = {
  title: 'Chat/PreconfigSelector',
  component: PreconfigSelector,
  parameters: {
    layout: 'padded',
  },
  args: {
    preconfigs,
    selectedPreconfigId: preconfigs[0].id,
    onChangePreconfig: () => {},
  },
} satisfies Meta<typeof PreconfigSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoSelection: Story = {
  args: {
    selectedPreconfigId: undefined,
  },
};

export const SelectedCodeReviewer: Story = {
  args: {
    selectedPreconfigId: preconfigs[1].id,
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

export const SinglePreconfig: Story = {
  args: {
    preconfigs: [preconfigs[0]],
    selectedPreconfigId: preconfigs[0].id,
  },
};

export const AllVariants: Story = {
  render: (args) => (
    <div className="flex items-center gap-6">
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Default</span>
        <PreconfigSelector {...args} compact={false} iconOnly={false} />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Compact</span>
        <PreconfigSelector {...args} compact iconOnly={false} />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Icon Only</span>
        <PreconfigSelector {...args} compact={false} iconOnly />
      </div>
    </div>
  ),
};
