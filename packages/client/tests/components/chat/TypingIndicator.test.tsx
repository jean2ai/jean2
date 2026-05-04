import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TypingIndicator } from '@/components/chat/TypingIndicator';

describe('TypingIndicator', () => {
  it('renders without crashing', () => {
    const { container } = render(<TypingIndicator />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders three bouncing dots', () => {
    const { container } = render(<TypingIndicator />);
    const dots = container.querySelectorAll('.animate-bounce');
    expect(dots).toHaveLength(3);
  });

  it('displays "assistant" label', () => {
    render(<TypingIndicator />);
    expect(screen.getByText('assistant')).toBeInTheDocument();
  });

  it('has staggered animation delays on dots', () => {
    const { container } = render(<TypingIndicator />);
    const dots = container.querySelectorAll('.animate-bounce');
    expect(dots[0]).not.toHaveStyle('animation-delay: 0.15s');
    expect(dots[1].className).toContain('animation-delay:0.15s');
    expect(dots[2].className).toContain('animation-delay:0.3s');
  });
});
