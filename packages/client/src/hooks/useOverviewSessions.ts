import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Jean2Client, Session } from '@jean2/sdk';
import { useSessionStore } from '@/stores/sessionStore';
import { queryKeys } from '@/lib/queryKeys';

interface UseOverviewSessionsParams {
  sdkClient: Jean2Client | null;
  workspaceIds: string[];
  connected: boolean;
}

interface UseOverviewSessionsReturn {
  sessionsByWorkspace: Record<string, Session[]>;
  isLoading: boolean;
  error: string | null;
}

export function useOverviewSessions({
  sdkClient,
  workspaceIds,
  connected,
}: UseOverviewSessionsParams): UseOverviewSessionsReturn {
  const setSessions = useSessionStore(s => s.setSessions);
  const allSessions = useSessionStore(s => s.sessions);

  const { isLoading, error, data } = useQuery({
    queryKey: queryKeys.sessions.grouped(workspaceIds, 'active'),
    queryFn: () =>
      sdkClient!.http.sessions.listGrouped({
        workspaceIds,
        status: 'active',
      }),
    enabled: !!sdkClient && connected && workspaceIds.length > 0,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (workspaceIds.length === 0) {
      setSessions([]);
    }
  }, [workspaceIds.length, setSessions]);

  useEffect(() => {
    if (data?.sessions) {
      const flatSessions = Object.values(data.sessions).flat();
      setSessions(flatSessions);
    }
  }, [data, setSessions]);

  const sessionsByWorkspace = useMemo(() => {
    const grouped: Record<string, Session[]> = {};
    for (const id of workspaceIds) {
      grouped[id] = [];
    }
    const workspaceIdSet = new Set(workspaceIds);
    for (const session of allSessions) {
      if (workspaceIdSet.has(session.workspaceId) && !session.parentId && session.status === 'active') {
        grouped[session.workspaceId].push(session);
      }
    }
    return grouped;
  }, [allSessions, workspaceIds]);

  return { sessionsByWorkspace, isLoading, error: error?.message ?? null };
}
