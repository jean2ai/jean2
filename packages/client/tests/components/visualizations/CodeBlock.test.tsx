import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { CodeBlock } from '@/components/visualizations/CodeBlock';

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

describe('CodeBlock', () => {
  it('renders file path in header', () => {
    render(<CodeBlock content="hello" path="src/main.ts" />);
    expect(screen.getByText('src/main.ts')).toBeInTheDocument();
  });

  it('renders code content via text match', () => {
    const { container } = render(
      <CodeBlock content="console.log" path="src/main.ts" />,
    );
    expect(container.textContent).toContain('console.log');
  });

  it('shows "Created" badge by default', () => {
    render(<CodeBlock content="hello" path="src/main.ts" />);
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('shows "Overwrote" badge when created is false', () => {
    render(<CodeBlock content="hello" path="src/main.ts" created={false} />);
    expect(screen.getByText('Overwrote')).toBeInTheDocument();
  });

  it('shows line count when collapsed', () => {
    const content = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
    render(<CodeBlock content={content} path="src/main.ts" />);
    expect(screen.getByText('30 lines')).toBeInTheDocument();
  });

  it('renders line number column', () => {
    const { container } = render(
      <CodeBlock content="a\nb\nc" path="src/main.ts" />,
    );
    const lineNums = container.querySelectorAll('[class*="border-r"]');
    expect(lineNums.length).toBeGreaterThanOrEqual(1);
  });

  it('has "Open file preview" button', () => {
    render(<CodeBlock content="hello" path="src/main.ts" />);
    expect(screen.getByTitle('Open file preview')).toBeInTheDocument();
  });

  it('expands to show all lines when button clicked', async () => {
    const content = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
    render(<CodeBlock content={content} path="src/main.ts" />);

    expect(screen.getByText('30 lines')).toBeInTheDocument();

    const expandBtn = screen.getAllByRole('button')[0];
    await userEvent.click(expandBtn);

    expect(screen.queryByText('30 lines')).not.toBeInTheDocument();
  });

  it('collapses back when button clicked again', async () => {
    const content = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
    render(<CodeBlock content={content} path="src/main.ts" />);

    const expandBtn = screen.getAllByRole('button')[0];
    await userEvent.click(expandBtn);
    await userEvent.click(expandBtn);

    expect(screen.getByText('30 lines')).toBeInTheDocument();
  });

  it('renders code with syntax highlighting container', () => {
    const { container } = render(
      <CodeBlock content="const x = 1" path="src/utils.ts" />,
    );
    const codeArea = container.querySelector('[style*="background-color"]');
    expect(codeArea).toBeInTheDocument();
  });

  it('highlights specified lines', () => {
    const { container } = render(
      <CodeBlock
        content="line1\nline2\nline3"
        path="src/main.ts"
        highlightLines={[2]}
      />,
    );
    const codeArea = container.querySelector('[style*="background-color"]');
    expect(codeArea).toBeInTheDocument();
    expect(codeArea?.innerHTML).toContain('line2');
  });
});
