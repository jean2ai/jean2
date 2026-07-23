import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolOutputArtifactMetadata, ToolOutputOriginalResponse } from '@jean2/sdk';
import { useSdkClient } from '@/contexts/ServerClientContext';

export interface UseToolOutputOriginalOptions {
  sessionId: string;
  retrievalId: string | null | undefined;
  enabled?: boolean;
}

export interface UseToolOutputOriginalResult {
  loading: boolean;
  error: string | null;
  data: ToolOutputOriginalResponse | null;
  reload: () => void;
}

export function useToolOutputOriginal(
  options: UseToolOutputOriginalOptions,
): UseToolOutputOriginalResult {
  const client = useSdkClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ToolOutputOriginalResponse | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const retrievalId = options.retrievalId ?? null;
  const enabled = options.enabled ?? true;

  const load = useCallback(() => {
    if (!retrievalId || !options.sessionId || !client) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    client.http.sessions.getToolOutput(options.sessionId, retrievalId, { signal: controller.signal })
      .then((response) => {
        if (requestId !== requestIdRef.current) return;
        setData(response);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setLoading(false);
      });
  }, [client, options.sessionId, retrievalId]);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current += 1;
    setData(null);
    setError(null);
    setLoading(false);

    if (enabled) load();

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, load]);

  return {
    loading,
    error,
    data,
    reload: load,
  };
}

export function describeCompressionSavings(
  metadata: Pick<ToolOutputArtifactMetadata, 'originalChars' | 'modelChars'> | undefined,
): string {
  if (!metadata) return '';
  const { originalChars, modelChars } = metadata;
  if (originalChars <= 0) return '0%';
  const reduction = 1 - modelChars / originalChars;
  const percent = Math.max(0, Math.min(100, Math.round(reduction * 100)));
  return `${percent}%`;
}
