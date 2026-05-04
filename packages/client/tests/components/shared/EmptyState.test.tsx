import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import {
  EmptyState,
  NoSessionsState,
  NoWorkspaceState,
  NoMessagesState,
} from '@/components/shared/EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <EmptyState title="Empty" description="Try adding some items" />,
    );
    expect(screen.getByText('Try adding some items')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    render(<EmptyState title="Empty" />);
    const desc = screen.queryByText(/try/i);
    expect(desc).not.toBeInTheDocument();
  });

  it('renders action button when action provided', () => {
    render(
      <EmptyState
        title="Empty"
        action={{ label: 'Add Item', onClick: vi.fn() }}
      />,
    );
    expect(
      screen.getByRole('button', { name: /add item/i }),
    ).toBeInTheDocument();
  });

  it('calls action.onClick when button clicked', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState title="Empty" action={{ label: 'Add', onClick }} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders custom icon when provided', () => {
    render(<EmptyState title="Empty" icon={<span data-testid="icon"> ICON</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <EmptyState title="Empty" className="custom-class" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('custom-class');
  });
});

describe('NoSessionsState', () => {
  it('renders correct title and description', () => {
    render(<NoSessionsState />);
    expect(screen.getByText('No sessions yet')).toBeInTheDocument();
    expect(
      screen.getByText('Start a new chat to begin working with your AI agent.'),
    ).toBeInTheDocument();
  });

  it('shows create button when onSelect provided', () => {
    render(<NoSessionsState onSelect={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /create session/i }),
    ).toBeInTheDocument();
  });

  it('hides create button when onSelect not provided', () => {
    render(<NoSessionsState />);
    expect(
      screen.queryByRole('button', { name: /create session/i }),
    ).not.toBeInTheDocument();
  });
});

describe('NoWorkspaceState', () => {
  it('renders correct title and description', () => {
    render(<NoWorkspaceState />);
    expect(screen.getByText('No workspace selected')).toBeInTheDocument();
    expect(
      screen.getByText('Select or create a workspace to get started.'),
    ).toBeInTheDocument();
  });

  it('shows select button when onSelect provided', () => {
    render(<NoWorkspaceState onSelect={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /select workspace/i }),
    ).toBeInTheDocument();
  });
});

describe('NoMessagesState', () => {
  it('renders correct title and description', () => {
    render(<NoMessagesState />);
    expect(screen.getByText('Start a conversation')).toBeInTheDocument();
    expect(
      screen.getByText('Send a message below to begin.'),
    ).toBeInTheDocument();
  });

  it('does not render action button', () => {
    render(<NoMessagesState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
