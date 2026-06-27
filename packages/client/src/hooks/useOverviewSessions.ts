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
  tagGroupsByWorkspace: Record<string, Map<string, Session[]>>;
  orderedTagNamesByWorkspace: Record<string, string[]>;
  allWorkspaceTagsByWorkspace: Record<string, string[]>;
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

  const tagGroupsByWorkspace = useMemo(() => {
    const result: Record<string, Map<string, Session[]>> = {};
    for (const id of workspaceIds) {
      const sessions = sessionsByWorkspace[id] ?? [];
      const groups = new Map<string, Session[]>();
      const ungrouped: Session[] = [];
      for (const session of sessions) {
        const primaryTag = session.tags?.[0];
        if (primaryTag) {
          const existing = groups.get(primaryTag) ?? [];
          existing.push(session);
          groups.set(primaryTag, existing);
        } else {
          ungrouped.push(session);
        }
      }
      if (ungrouped.length > 0) {
        groups.set('__ungrouped__', ungrouped);
      }
      result[id] = groups;
    }
    return result;
  }, [sessionsByWorkspace, workspaceIds]);

  const orderedTagNamesByWorkspace = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const id of workspaceIds) {
      const groups = tagGroupsByWorkspace[id] ?? new Map();
      const entries = Array.from(groups.entries())
        .filter(([tag]) => tag !== '__ungrouped__')
        .map(([tag, sessions]) => ({
          tag,
          lastUpdated: Math.max(...sessions.map(s => new Date(s.updatedAt).getTime())),
        }));
      entries.sort((a, b) => b.lastUpdated - a.lastUpdated);
      result[id] = entries.map(e => e.tag);
    }
    return result;
  }, [tagGroupsByWorkspace, workspaceIds]);

  const allWorkspaceTagsByWorkspace = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const id of workspaceIds) {
      const groups = tagGroupsByWorkspace[id] ?? new Map();
      result[id] = Array.from(groups.keys()).filter(tag => tag !== '__ungrouped__');
    }
    return result;
  }, [tagGroupsByWorkspace, workspaceIds]);

  return {
    sessionsByWorkspace,
    tagGroupsByWorkspace,
    orderedTagNamesByWorkspace,
    allWorkspaceTagsByWorkspace,
    isLoading,
    error: error?.message ?? null,
  };
}
