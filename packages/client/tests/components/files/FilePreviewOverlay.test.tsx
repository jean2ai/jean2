import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Jean2Client } from '@jean2/sdk';
import FilePreviewOverlay from '@/components/files/FilePreviewOverlay';
import type { FilePreviewTarget } from '@/stores/uiStore';

vi.mock('@jean2/sdk', () => ({ Jean2Client: vi.fn() }));

const mockPreviewFn = vi.fn();
const mockGitDiffFn = vi.fn();

function makeSdkClient(): Jean2Client {
  return {
    http: {
      files: {
        preview: mockPreviewFn,
        gitDiff: mockGitDiffFn,
      },
    },
  } as unknown as Jean2Client;
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function renderOverlay(
  client: QueryClient,
  overrides?: Partial<React.ComponentProps<typeof FilePreviewOverlay>>,
) {
  const target: FilePreviewTarget = {
    workspaceId: 'ws-1',
    path: '/src/app.ts',
    name: 'app.ts',
  };
  return render(
    <FilePreviewOverlay
      workspaceId="ws-1"
      target={target}
      sdkClient={makeSdkClient()}
      open={true}
      onOpenChange={vi.fn()}
      {...overrides}
    />,
    { wrapper: makeWrapper(client) },
  );
}

describe('FilePreviewOverlay - scroll stability', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    mockPreviewFn.mockReset();
    mockGitDiffFn.mockReset();
  });

  test('shows spinner during initial load', async () => {
    mockPreviewFn.mockReturnValue(new Promise(() => {}));
    mockGitDiffFn.mockResolvedValue({ diffAvailable: false });

    renderOverlay(queryClient);

    await waitFor(() => {
      expect(screen.getByRole('status', { hidden: true }) || document.querySelector('.animate-spin')).toBeTruthy();
    });
  });

  test('renders content after initial load and keeps it mounted during refresh', async () => {
    const initialContent = 'line1\nline2\nline3';
    mockPreviewFn.mockResolvedValue({
      kind: 'code',
      content: initialContent,
      language: 'typescript',
      size: 18,
    });
    mockGitDiffFn.mockResolvedValue({ diffAvailable: false });

    renderOverlay(queryClient);

    await waitFor(() => {
      expect(screen.getByText('line1')).toBeInTheDocument();
    });

    const contentBefore = screen.queryByText('line1');
    expect(contentBefore).not.toBeNull();

    mockPreviewFn.mockResolvedValue({
      kind: 'code',
      content: 'updated1\nupdated2\nupdated3',
      language: 'typescript',
      size: 27,
    });

    const refreshButtons = screen.getAllByRole('button');
    const refreshBtn = refreshButtons.find((b) => b.querySelector('[class*="refresh" i]') || b.getAttribute('title') === 'Refresh' || b.classList.toString().includes('right-12'));
    await act(async () => {
      if (refreshBtn) await userEvent.click(refreshBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('updated1')).toBeInTheDocument();
    });

    expect(screen.queryByText('line1')).not.toBeInTheDocument();
  });

  test('refresh button is disabled while refreshing', async () => {
    mockPreviewFn.mockResolvedValue({
      kind: 'code',
      content: 'hello',
      language: 'typescript',
      size: 5,
    });
    mockGitDiffFn.mockResolvedValue({ diffAvailable: false });

    renderOverlay(queryClient);

    await waitFor(() => {
      expect(screen.getByText('hello')).toBeInTheDocument();
    });

    mockPreviewFn.mockReturnValue(new Promise(() => {}));

    const refreshButtons = screen.getAllByRole('button');
    const refreshBtn = refreshButtons.find((b) =>
      b.classList.toString().includes('right-12'),
    );
    expect(refreshBtn).toBeTruthy();
    await act(async () => {
      if (refreshBtn) await userEvent.click(refreshBtn);
    });

    await waitFor(() => {
      expect(refreshBtn).toBeDisabled();
    });
  });

  test('retry button appears on initial load error', async () => {
    mockPreviewFn.mockRejectedValue(new Error('Network error'));
    mockGitDiffFn.mockResolvedValue({ diffAvailable: false });

    renderOverlay(queryClient);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });
});
