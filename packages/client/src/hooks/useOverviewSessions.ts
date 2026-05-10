import { useEffect, useState, useMemo } from 'react';
import type { Session } from '@jean2/sdk';
import type { Jean2Client } from '@jean2/sdk';
import { useSessionStore } from '@/stores/sessionStore';

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setSessions = useSessionStore(s => s.setSessions);
  const allSessions = useSessionStore(s => s.sessions);

  useEffect(() => {
    if (workspaceIds.length === 0) {
      setSessions([]);
      setIsLoading(false);
      return;
    }

    if (!sdkClient) {
      // During reconnection, sdkClient becomes null temporarily (dispose sets
      // clientRef.current = null).  Keep stale session data so that
      // currentSession / currentSessionIdRef remain valid for the reconnect
      // flow.  Sessions will be re-fetched once a new client is connected.
      setIsLoading(false);
      return;
    }

    if (!connected) {
      // Keep stale session data during temporary disconnects so that
      // currentSession / currentSessionIdRef remain valid for the
      // reconnection flow.  Sessions will be re-fetched once connected.
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    sdkClient.http.sessions.listGrouped({
      workspaceIds,
      status: 'active',
    })
      .then((result) => {
        if (cancelled) return;
        const flatSessions = Object.values(result.sessions).flat();
        setSessions(flatSessions);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error('Failed to load overview sessions:', message);
        setError(message);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sdkClient, connected, workspaceIds, setSessions]);

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

  return { sessionsByWorkspace, isLoading, error };
}
