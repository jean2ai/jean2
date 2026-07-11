import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DiffViewer } from '@/components/visualizations/DiffViewer';

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ openFilePreview: vi.fn() }),
  ),
}));

vi.mock('@/stores/serverDataStore', () => ({
  useServerDataStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ activeWorkspace: { id: 'ws-1', name: 'test' } }),
  ),
}));

const sampleHunks = [
  {
    oldStart: 1,
    oldLines: 3,
    newStart: 1,
    newLines: 3,
    changes: [
      { type: 'context' as const, content: 'unchanged line', lineNumber: 1, newLineNumber: 1 },
      { type: 'removed' as const, content: 'old line', lineNumber: 2 },
      { type: 'added' as const, content: 'new line', newLineNumber: 2 },
    ],
  },
];

describe('DiffViewer', () => {
  it('renders file path in header', () => {
    render(<DiffViewer hunks={sampleHunks} path="src/app.tsx" />);
    expect(screen.getByText('src/app.tsx')).toBeInTheDocument();
  });

  it('renders diff content as text', () => {
    const { container } = render(
      <DiffViewer hunks={sampleHunks} path="src/app.tsx" />,
    );
    expect(container.textContent).toContain('old line');
    expect(container.textContent).toContain('new line');
    expect(container.textContent).toContain('unchanged line');
  });

  it('displays additions and deletions count', () => {
    render(
      <DiffViewer hunks={sampleHunks} path="src/app.tsx" additions={5} deletions={3} />,
    );
    expect(screen.getByText('+5 -3')).toBeInTheDocument();
  });

  it('hides additions/deletions when not provided', () => {
    render(<DiffViewer hunks={sampleHunks} path="src/app.tsx" />);
    expect(screen.queryByText(/^\+\d+ -\d+$/)).not.toBeInTheDocument();
  });

  it('applies green bg to added lines', () => {
    const { container } = render(
      <DiffViewer hunks={sampleHunks} path="src/app.tsx" />,
    );
    const addedLine = container.querySelector('.bg-green-500\\/15');
    expect(addedLine).toBeInTheDocument();
  });

  it('applies red bg to removed lines', () => {
    const { container } = render(
      <DiffViewer hunks={sampleHunks} path="src/app.tsx" />,
    );
    const removedLine = container.querySelector('.bg-red-500\\/15');
    expect(removedLine).toBeInTheDocument();
  });

  it('collapses diff when expand button clicked', async () => {
    const { container } = render(
      <DiffViewer hunks={sampleHunks} path="src/app.tsx" />,
    );
    const expandBtn = screen.getAllByRole('button')[0];
    await userEvent.click(expandBtn);

    const codeArea = container.querySelector('[style*="background-color"]');
    expect(codeArea).not.toBeInTheDocument();
  });

  it('expands diff again when button clicked twice', async () => {
    const { container } = render(
      <DiffViewer hunks={sampleHunks} path="src/app.tsx" />,
    );
    const expandBtn = screen.getAllByRole('button')[0];
    await userEvent.click(expandBtn);
    await userEvent.click(expandBtn);

    const codeArea = container.querySelector('[style*="background-color"]');
    expect(codeArea).toBeInTheDocument();
  });

  it('renders multiple hunks', () => {
    const multiHunks = [
      {
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 1,
        changes: [
          { type: 'added' as const, content: 'hunk1 line', newLineNumber: 1 },
        ],
      },
      {
        oldStart: 10,
        oldLines: 1,
        newStart: 10,
        newLines: 1,
        changes: [
          { type: 'added' as const, content: 'hunk2 line', newLineNumber: 10 },
        ],
      },
    ];
    const { container } = render(
      <DiffViewer hunks={multiHunks} path="src/app.tsx" />,
    );
    expect(container.textContent).toContain('hunk1 line');
    expect(container.textContent).toContain('hunk2 line');
  });

  it('renders line number columns', () => {
    const { container } = render(
      <DiffViewer hunks={sampleHunks} path="src/app.tsx" />,
    );
    const lineNumCols = container.querySelectorAll('.select-none.border-r');
    expect(lineNumCols.length).toBeGreaterThanOrEqual(2);
  });

  it('has file path button with title', () => {
    render(<DiffViewer hunks={sampleHunks} path="src/app.tsx" />);
    const pathButton = screen.getByTitle('src/app.tsx');
    expect(pathButton).toBeInTheDocument();
  });
});
