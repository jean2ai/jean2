import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  SessionListSkeleton,
  MessageSkeleton,
  ChatLoadingState,
  WorkspaceSkeleton,
  ConnectingState,
} from '@/components/shared/LoadingSkeleton';

describe('SessionListSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<SessionListSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders skeleton placeholders', () => {
    const { container } = render(<SessionListSkeleton />);
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('MessageSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<MessageSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders skeleton elements', () => {
    const { container } = render(<MessageSkeleton />);
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('ChatLoadingState', () => {
  it('renders loading text', () => {
    render(<ChatLoadingState />);
    expect(screen.getByText('Loading conversation...')).toBeInTheDocument();
  });

  it('renders spinner icon', () => {
    const { container } = render(<ChatLoadingState />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });
});

describe('WorkspaceSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<WorkspaceSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders skeleton element', () => {
    const { container } = render(<WorkspaceSkeleton />);
    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).toBeInTheDocument();
  });
});

describe('ConnectingState', () => {
  it('renders default message', () => {
    render(<ConnectingState />);
    expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
  });

  it('renders custom message', () => {
    render(<ConnectingState message="Reconnecting..." />);
    expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
  });

  it('renders spinner icon', () => {
    const { container } = render(<ConnectingState />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });
});
