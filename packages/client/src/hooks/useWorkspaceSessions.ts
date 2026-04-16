import { useEffect, useState } from 'react';
import type { Jean2Client } from '@jean2/sdk';
import { useSessionStore } from '@/stores/sessionStore';

interface UseWorkspaceSessionsParams {
  sdkClient: Jean2Client | null;
  workspaceId: string | null;
  connected: boolean;
}

interface UseWorkspaceSessionsReturn {
  isLoading: boolean;
  error: string | null;
}

export function useWorkspaceSessions({
  sdkClient,
  workspaceId,
  connected,
}: UseWorkspaceSessionsParams): UseWorkspaceSessionsReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setSessions = useSessionStore(s => s.setSessions);

  useEffect(() => {
    if (!sdkClient || !connected || !workspaceId) {
      setSessions([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    sdkClient.http.sessions.listByWorkspace({
      workspaceId,
    })
      .then((result) => {
        if (cancelled) return;
        setSessions(result.sessions);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error('Failed to load workspace sessions:', message);
        setError(message);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sdkClient, connected, workspaceId, setSessions]);

  return { isLoading, error };
}
