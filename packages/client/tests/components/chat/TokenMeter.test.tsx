import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { TokenMeter } from '@/components/chat/TokenMeter';

describe('TokenMeter', () => {
  it('renders with zero tokens by default', () => {
    render(<TokenMeter />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders percentage of token usage', () => {
    render(<TokenMeter totalTokens={5000} contextWindow={20000} />);
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('renders 0% when totalTokens is 0 even with contextWindow', () => {
    render(<TokenMeter totalTokens={0} contextWindow={20000} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders 0% when contextWindow is 0', () => {
    render(<TokenMeter totalTokens={5000} contextWindow={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('caps percentage at 100%', () => {
    render(<TokenMeter totalTokens={50000} contextWindow={10000} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows exact token counts when clicked', async () => {
    render(<TokenMeter totalTokens={1500} contextWindow={10000} />);
    await userEvent.click(screen.getByText('15%'));
    expect(screen.getByText('1.5k/10.0k')).toBeInTheDocument();
  });

  it('toggles back to percentage on second click', async () => {
    render(<TokenMeter totalTokens={1500} contextWindow={10000} />);
    await userEvent.click(screen.getByText('15%'));
    expect(screen.getByText('1.5k/10.0k')).toBeInTheDocument();
    await userEvent.click(screen.getByText('1.5k/10.0k'));
    expect(screen.getByText('15%')).toBeInTheDocument();
  });

  it('renders SVG ring indicator', () => {
    const { container } = render(<TokenMeter />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 20 20');
  });

  it('uses normal ring color for low usage', () => {
    const { container } = render(
      <TokenMeter totalTokens={1000} contextWindow={10000} />,
    );
    const progressRing = container.querySelectorAll('circle')[1];
    expect(progressRing?.className.baseVal ?? progressRing?.getAttribute('class') ?? '').toContain('text-primary');
  });

  it('uses warning ring color for 40%+ usage', () => {
    const { container } = render(
      <TokenMeter totalTokens={5000} contextWindow={10000} />,
    );
    const progressRing = container.querySelectorAll('circle')[1];
    const cls = progressRing?.className.baseVal ?? progressRing?.getAttribute('class') ?? '';
    expect(cls).toContain('text-warning');
  });

  it('uses critical ring color for 60%+ usage', () => {
    const { container } = render(
      <TokenMeter totalTokens={7000} contextWindow={10000} />,
    );
    const progressRing = container.querySelectorAll('circle')[1];
    const cls = progressRing?.className.baseVal ?? progressRing?.getAttribute('class') ?? '';
    expect(cls).toContain('text-destructive');
  });

  it('formats large numbers compactly', async () => {
    render(<TokenMeter totalTokens={1500000} contextWindow={2000000} />);
    await userEvent.click(screen.getByText('75%'));
    expect(screen.getByText('1.5M/2.0M')).toBeInTheDocument();
  });

  it('shows 0/0 when no context and clicked', async () => {
    render(<TokenMeter />);
    await userEvent.click(screen.getByText('0%'));
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });
});
