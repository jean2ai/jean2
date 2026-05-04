import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PendingAttachment } from '@/components/chat/PendingAttachment';

describe('PendingAttachment', () => {
  it('renders filename', () => {
    render(
      <PendingAttachment
        id="1"
        kind="file"
        filename="report.pdf"
        size={2048}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
  });

  it('formats bytes correctly', () => {
    render(
      <PendingAttachment
        id="1"
        kind="file"
        filename="test.txt"
        size={512}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('512 B')).toBeInTheDocument();
  });

  it('formats kilobytes correctly', () => {
    render(
      <PendingAttachment
        id="1"
        kind="file"
        filename="doc.pdf"
        size={1536}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('1.5 KB')).toBeInTheDocument();
  });

  it('formats megabytes correctly', () => {
    render(
      <PendingAttachment
        id="1"
        kind="file"
        filename="big.zip"
        size={2 * 1024 * 1024}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('2.0 MB')).toBeInTheDocument();
  });

  it('renders file icon for file kind', () => {
    const { container } = render(
      <PendingAttachment
        id="1"
        kind="file"
        filename="doc.txt"
        size={100}
        onRemove={vi.fn()}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders image icon for image kind without preview', () => {
    const { container } = render(
      <PendingAttachment
        id="1"
        kind="image"
        filename="photo.jpg"
        size={5000}
        onRemove={vi.fn()}
      />,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders image preview when previewUrl provided', () => {
    render(
      <PendingAttachment
        id="1"
        kind="image"
        filename="photo.jpg"
        size={5000}
        previewUrl="data:image/png;base64,abc"
        onRemove={vi.fn()}
      />,
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc');
  });

  it('calls onRemove with id when remove clicked', async () => {
    const onRemove = vi.fn();
    render(
      <PendingAttachment
        id="abc-123"
        kind="file"
        filename="test.txt"
        size={100}
        onRemove={onRemove}
      />,
    );

    const removeBtn = screen.getByRole('button');
    await userEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('abc-123');
  });

  it('applies opacity-50 when uploading', () => {
    const { container } = render(
      <PendingAttachment
        id="1"
        kind="file"
        filename="uploading.txt"
        size={100}
        isUploading
        onRemove={vi.fn()}
      />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('opacity-50');
  });
});
