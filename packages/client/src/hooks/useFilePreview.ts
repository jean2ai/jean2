import { useState, useEffect, useRef, useCallback } from 'react';
import type { FilePreviewResponse } from '@jean2/shared';
import { useApi } from './useApi';

interface UseFilePreviewOptions {
  workspaceId: string | undefined;
  path: string | undefined;
  serverUrl: string | undefined;
  apiToken: string | undefined;
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
  serverUrl,
  apiToken,
  enabled,
}: UseFilePreviewOptions): UseFilePreviewResult {
  const { fetchWithAuth } = useApi();

  const [data, setData] = useState<FilePreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchFilePreview = useCallback(async () => {
    if (!enabled || !workspaceId || !path || !serverUrl || !apiToken) {
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
      const url = `/api/workspaces/${workspaceId}/file-preview?path=${encodeURIComponent(path)}`;
      const response = await fetchWithAuth(url, {
        signal: abortController.signal,
      }, { serverUrl, token: apiToken });

      if (!response.ok) {
        let errorMessage = 'Failed to fetch file preview';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch {
          errorMessage = response.statusText || errorMessage;
        }
        setError(errorMessage);
        setData(null);
        setLoading(false);
        return;
      }

      const result: FilePreviewResponse = await response.json();
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
  }, [enabled, workspaceId, path, serverUrl, apiToken, fetchWithAuth]);

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
