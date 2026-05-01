import type { Meta, StoryObj } from '@storybook/react-vite';
import { PendingAttachment } from './PendingAttachment';

const meta = {
  title: 'Chat/PendingAttachment',
  component: PendingAttachment,
  parameters: {
    layout: 'centered',
  },
  args: {
    id: 'att-1',
    kind: 'file',
    filename: 'document.pdf',
    size: 245760,
    isUploading: false,
    onRemove: () => {},
  },
} satisfies Meta<typeof PendingAttachment>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FileAttachment: Story = {};

export const ImageAttachment: Story = {
  args: {
    kind: 'image',
    filename: 'screenshot.png',
    size: 1048576,
  },
};

export const ImageWithPreview: Story = {
  args: {
    kind: 'image',
    filename: 'photo.jpg',
    size: 524288,
    previewUrl: 'https://placehold.co/400x300/png',
  },
};

export const Uploading: Story = {
  args: {
    isUploading: true,
  },
};

export const SmallFile: Story = {
  args: {
    filename: 'config.json',
    size: 512,
  },
};

export const LargeFile: Story = {
  args: {
    filename: 'large-dataset.csv',
    size: 15728640,
  },
};

export const LongFilename: Story = {
  args: {
    filename: 'very-long-filename-that-should-definitely-truncate-when-displayed-in-the-ui.tsx',
    size: 4096,
  },
};

export const MultipleAttachments: Story = {
  render: () => (
    <div className="flex gap-2 flex-wrap">
      <PendingAttachment
        id="att-1"
        kind="file"
        filename="report.pdf"
        size={245760}
        onRemove={() => {}}
      />
      <PendingAttachment
        id="att-2"
        kind="image"
        filename="diagram.png"
        size={1048576}
        previewUrl="https://placehold.co/400x300/png"
        onRemove={() => {}}
      />
      <PendingAttachment
        id="att-3"
        kind="file"
        filename="data.json"
        size={2048}
        isUploading
        onRemove={() => {}}
      />
    </div>
  ),
};
