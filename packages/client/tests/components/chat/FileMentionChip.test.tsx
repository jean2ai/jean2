import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { FileMentionChip } from '@/components/chat/FileMentionChip';

describe('FileMentionChip', () => {
  it('renders filename from full path', () => {
    render(
      <FileMentionChip path="src/components/App.tsx" onRemove={vi.fn()} />,
    );
    expect(screen.getByText('App.tsx')).toBeInTheDocument();
  });

  it('renders directory portion of path', () => {
    render(
      <FileMentionChip path="src/components/App.tsx" onRemove={vi.fn()} />,
    );
    expect(screen.getByText('src/components/')).toBeInTheDocument();
  });

  it('handles filename-only path', () => {
    render(
      <FileMentionChip path="README.md" onRemove={vi.fn()} />,
    );
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('calls onRemove with path when remove button clicked', async () => {
    const onRemove = vi.fn();
    render(
      <FileMentionChip path="src/test.ts" onRemove={onRemove} />,
    );

    const removeBtn = screen.getByRole('button', { name: /remove test\.ts/i });
    await userEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('src/test.ts');
  });

  it('calls onPreview when chip body is clicked', async () => {
    const onPreview = vi.fn();
    render(
      <FileMentionChip
        path="src/file.ts"
        onRemove={vi.fn()}
        onPreview={onPreview}
      />,
    );

    const buttons = screen.getAllByRole('button');
    const previewBtn = buttons.find(b => !b.getAttribute('aria-label'));
    await userEvent.click(previewBtn!);
    expect(onPreview).toHaveBeenCalledWith('src/file.ts');
  });

  it('does not crash when onPreview is not provided', async () => {
    render(
      <FileMentionChip path="src/file.ts" onRemove={vi.fn()} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });

  it('has accessible remove button label', () => {
    render(
      <FileMentionChip path="utils/helpers.ts" onRemove={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: /remove helpers\.ts/i }),
    ).toBeInTheDocument();
  });
});
