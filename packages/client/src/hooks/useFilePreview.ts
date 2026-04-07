import { useState, useEffect, useRef, useCallback } from 'react';
import type { FilePreviewResponse } from '@jean2/shared';
import type { HttpClient } from '@jean2/sdk';

interface UseFilePreviewOptions {
  workspaceId: string | undefined;
  path: string | undefined;
  httpClient: HttpClient | null;
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
  httpClient,
  enabled,
}: UseFilePreviewOptions): UseFilePreviewResult {
  const [data, setData] = useState<FilePreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchFilePreview = useCallback(async () => {
    if (!enabled || !workspaceId || !path || !httpClient) {
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
      const result: FilePreviewResponse = await httpClient.get<FilePreviewResponse>(
        `/workspaces/${workspaceId}/file-preview`,
        { params: { path }, signal: abortController.signal }
      );
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
  }, [enabled, workspaceId, path, httpClient]);

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
