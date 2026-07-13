import { useFilePreviewQuery } from '@/hooks/queries/useFileQueries';
import type { Jean2Client } from '@jean2/sdk';

interface UseFilePreviewOptions {
  workspaceId: string | undefined;
  path: string | undefined;
  root?: string;
  sdkClient: Jean2Client | null;
  enabled: boolean;
}

interface UseFilePreviewResult {
  data: ReturnType<typeof useFilePreviewQuery>['data'] | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => void;
}

export function useFilePreview({
  workspaceId,
  path,
  root,
  sdkClient,
  enabled,
}: UseFilePreviewOptions): UseFilePreviewResult {
  const { data, isLoading, isFetching, error, refetch } = useFilePreviewQuery(
    sdkClient,
    workspaceId,
    path,
    root,
    enabled,
  );

  return {
    data: data ?? null,
    loading: isLoading,
    refreshing: isFetching && !isLoading,
    error: error?.message ?? null,
    reload: () => { void refetch(); },
  };
}
