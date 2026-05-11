import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Jean2Client } from '@jean2/sdk';
import { useSessionStore } from '@/stores/sessionStore';
import { queryKeys } from '@/lib/queryKeys';

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
  const setSessions = useSessionStore(s => s.setSessions);

  const { isLoading, error, data } = useQuery({
    queryKey: queryKeys.sessions.byWorkspace(workspaceId ?? ''),
    queryFn: () =>
      sdkClient!.http.sessions.listByWorkspace({ workspaceId: workspaceId! }),
    enabled: !!sdkClient && connected && !!workspaceId,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!workspaceId) {
      setSessions([]);
    }
  }, [workspaceId, setSessions]);

  useEffect(() => {
    if (data?.sessions) {
      setSessions(data.sessions);
    }
  }, [data, setSessions]);

  return {
    isLoading,
    error: error?.message ?? null,
  };
}
