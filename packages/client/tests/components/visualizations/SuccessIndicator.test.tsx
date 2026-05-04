import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SuccessIndicator } from '@/components/visualizations/SuccessIndicator';

describe('SuccessIndicator', () => {
  it('renders default message "Success"', () => {
    render(<SuccessIndicator />);
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('renders custom message', () => {
    render(<SuccessIndicator message="File saved" />);
    expect(screen.getByText('File saved')).toBeInTheDocument();
  });

  it('renders with check circle icon', () => {
    const { container } = render(<SuccessIndicator />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('applies text-muted-foreground class', () => {
    const { container } = render(<SuccessIndicator />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('text-muted-foreground');
  });
});
