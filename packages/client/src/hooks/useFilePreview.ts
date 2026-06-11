import { useFilePreviewQuery } from '@/hooks/queries/useFileQueries';
import type { Jean2Client } from '@jean2/sdk';

interface UseFilePreviewOptions {
  workspaceId: string | undefined;
  path: string | undefined;
  sdkClient: Jean2Client | null;
  enabled: boolean;
}

interface UseFilePreviewResult {
  data: ReturnType<typeof useFilePreviewQuery>['data'] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useFilePreview({
  workspaceId,
  path,
  sdkClient,
  enabled,
}: UseFilePreviewOptions): UseFilePreviewResult {
  const { data, isLoading, isFetching, error, refetch } = useFilePreviewQuery(
    sdkClient,
    workspaceId,
    path,
    enabled,
  );

  return {
    data: data ?? null,
    loading: isLoading || isFetching,
    error: error?.message ?? null,
    reload: () => { refetch(); },
  };
}
