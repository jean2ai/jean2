import { useState, useEffect, useRef, useCallback } from 'react';
import type { FilePreviewResponse } from '@jean2/shared';
import type { Jean2Client } from '@jean2/sdk';

interface UseFilePreviewOptions {
  workspaceId: string | undefined;
  path: string | undefined;
  sdkClient: Jean2Client | null;
  enabled: boolean;
}

interface UseFilePreviewResult {
  data: FilePreviewResponse | null;
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
  const [data, setData] = useState<FilePreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchFilePreview = useCallback(async () => {
    if (!enabled || !workspaceId || !path || !sdkClient) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);

    try {
      const result = await sdkClient.http.files.preview(workspaceId, path, { signal: abortController.signal });
      setData(result);
      setLoading(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(message);
      setData(null);
      setLoading(false);
    }
  }, [enabled, workspaceId, path, sdkClient]);

  const reload = useCallback(() => {
    fetchFilePreview();
  }, [fetchFilePreview]);

  useEffect(() => {
    fetchFilePreview();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchFilePreview]);

  return {
    data,
    loading,
    error,
    reload,
  };
}
