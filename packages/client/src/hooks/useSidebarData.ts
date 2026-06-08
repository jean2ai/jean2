import { useMemo, useCallback } from 'react';
import { useParams } from '@tanstack/react-router';
import type { Session, Workspace, SavedServer, QuickConnection } from '@jean2/sdk';
import { useSessionStore } from '@/stores/sessionStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useAskStore, type PendingAskRequest } from '@/stores/askStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { useServerContext } from '@/contexts/ServerContext';
import type { ChildrenMap, SessionDerivedValuesMap } from '@/components/layout/SessionMenuButton';

export interface UseSidebarDataReturn {
  // Store subscriptions
  allSessions: Session[];
  currentSession: Session | null;
  currentSessionId: string | null;
  streamingSessionIds: Set<string>;
  pendingAskRequests: PendingAskRequest[];
  connected: boolean;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;

  // Server context
  servers: SavedServer[];
  quickConnections: QuickConnection[];
  addToQuickConnections: (serverId: string, serverName: string, workspaceId?: string, workspaceName?: string) => void;
  removeFromQuickConnections: (id: string) => void;

  // Derived values
  activeServer: SavedServer | null;
  favoritedWorkspaceIds: string[];
  childrenMap: ChildrenMap;
  sessionDerivedValues: SessionDerivedValuesMap;
  sessions: Session[];
  activeSessions: Session[];
  archivedSessions: Session[];
  tagGroups: Map<string, Session[]>;
  orderedTagNames: string[];

  // Helper functions
  isWorkspaceFavorited: (workspaceId: string) => boolean;
  handleToggleWorkspaceFavorite: (workspaceId: string, workspaceName: string) => void;
}

export const useSidebarData = (): UseSidebarDataReturn => {
  // Read from stores
  const allSessions = useSessionStore(s => s.sessions);
  const streamingSessionIds = useConnectionStore(s => s.streamingSessionIds);
  const pendingAskRequests = useAskStore(s => s.pendingRequests);
  const connected = useConnectionStore(s => s.connected);
  const workspaces = useServerDataStore(s => s.workspaces);
  const activeWorkspace = useServerDataStore(s => s.activeWorkspace);

  // Derive currentSession from URL params (sessionId from nested route)
  const params = useParams({ from: '/server/$serverId', strict: false } as unknown as Parameters<typeof useParams>[0]);
  const serverId = params?.serverId as string | undefined;
  const sessionIdFromUrl = params?.sessionId as string | undefined;

  const currentSession = useMemo(
    () => sessionIdFromUrl ? allSessions.find(s => s.id === sessionIdFromUrl) ?? null : null,
    [sessionIdFromUrl, allSessions],
  );
  const currentSessionId = currentSession?.id ?? null;

  // Derive activeServer from ServerContext and URL params
  const { servers, quickConnections, addToQuickConnections, removeFromQuickConnections } = useServerContext();
  const activeServer = serverId ? servers.find(s => s.id === serverId) ?? null : null;

  // Derive favoritedWorkspaceIds
  const favoritedWorkspaceIds = useMemo(
    () =>
      quickConnections
        .filter(conn => conn.serverId === activeServer?.id && conn.workspaceId)
        .map(conn => conn.workspaceId!),
    [quickConnections, activeServer?.id],
  );

  // Derive workspaceSessions (was the old `sessions` prop)
  const sessions = useMemo(
    () => allSessions.filter(s => s.workspaceId === activeWorkspace?.id),
    [allSessions, activeWorkspace?.id],
  );

  // Precompute childrenMap from allSessions for overview mode compatibility
  const childrenMap = useMemo((): ChildrenMap => {
    const map = new Map<string, Session[]>();
    for (const session of allSessions) {
      if (session.parentId) {
        const existing = map.get(session.parentId) ?? [];
        existing.push(session);
        map.set(session.parentId, existing);
      }
    }
    return map;
  }, [allSessions]);

  // Precompute derived values from allSessions for overview mode compatibility
  const sessionDerivedValues = useMemo((): SessionDerivedValuesMap => {
    // Build a parent lookup for walking up to root ancestors
    const parentMap = new Map<string, string>();
    for (const session of allSessions) {
      if (session.parentId) {
        parentMap.set(session.id, session.parentId);
      }
    }

    const pendingPermissionSessionIds = new Set<string>();
    for (const p of pendingAskRequests) {
      if (p.ask.type !== 'permission') {
        continue;
      }
      // Add the sessionId and originSessionId directly
      pendingPermissionSessionIds.add(p.sessionId);
      if (p.originSessionId) {
        pendingPermissionSessionIds.add(p.originSessionId);
      }
      // Walk up to root ancestor and ensure root also has the badge
      for (const sid of [p.sessionId, p.originSessionId]) {
        if (!sid) continue;
        let current = parentMap.get(sid);
        while (current) {
          pendingPermissionSessionIds.add(current);
          current = parentMap.get(current);
        }
      }
    }

    const derived = new Map<string, { isStreaming: boolean; hasPendingPermission: boolean; isRunning: boolean }>();
    for (const session of allSessions) {
      const isStreaming = streamingSessionIds.has(session.id);
      const hasPendingPermission = pendingPermissionSessionIds.has(session.id);
      const isCurrentSession = session.id === currentSessionId;
      const isRunning = (isCurrentSession && isStreaming) || session.subagentStatus === 'running' || !!session.runningAt;
      derived.set(session.id, { isStreaming, hasPendingPermission, isRunning });
    }
    return derived;
  }, [allSessions, streamingSessionIds, pendingAskRequests, currentSessionId]);

  // Separate active and archived sessions (only root sessions, no parent)
  const { activeSessions, archivedSessions } = useMemo(() => {
    const rootSessions = sessions.filter((s) => !s.parentId);
    return {
      activeSessions: rootSessions.filter((s) => s.status === 'active'),
      archivedSessions: rootSessions.filter((s) => s.status === 'closed'),
    };
  }, [sessions]);

  // Derive tag groups from activeSessions
  const tagGroups = useMemo((): Map<string, Session[]> => {
    const groups = new Map<string, Session[]>();
    const ungrouped: Session[] = [];

    for (const session of activeSessions) {
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

    return groups;
  }, [activeSessions]);

  // Derive ordered tag names (sorted by most recently updated session in group)
  const orderedTagNames = useMemo((): string[] => {
    const entries = Array.from(tagGroups.entries())
      .filter(([tag]) => tag !== '__ungrouped__')
      .map(([tag, sessions]) => ({
        tag,
        lastUpdated: Math.max(...sessions.map(s => new Date(s.updatedAt).getTime())),
      }));

    entries.sort((a, b) => b.lastUpdated - a.lastUpdated);
    return entries.map(e => e.tag);
  }, [tagGroups]);

  const isWorkspaceFavorited = useCallback(
    (workspaceId: string) => {
      return quickConnections.some(
        conn => conn.workspaceId === workspaceId && conn.serverId === activeServer?.id,
      );
    },
    [quickConnections, activeServer?.id],
  );

  const handleToggleWorkspaceFavorite = useCallback(
    (workspaceId: string, workspaceName: string) => {
      if (!activeServer) return;

      const existing = quickConnections.find(
        conn => conn.workspaceId === workspaceId && conn.serverId === activeServer.id,
      );

      if (existing) {
        removeFromQuickConnections(existing.id);
      } else {
        addToQuickConnections(activeServer.id, activeServer.name, workspaceId, workspaceName);
      }
    },
    [activeServer, quickConnections, removeFromQuickConnections, addToQuickConnections],
  );

  return {
    allSessions,
    currentSession,
    currentSessionId,
    streamingSessionIds,
    pendingAskRequests,
    connected,
    workspaces,
    activeWorkspace,
    servers,
    quickConnections,
    addToQuickConnections,
    removeFromQuickConnections,
    activeServer,
    favoritedWorkspaceIds,
    childrenMap,
    sessionDerivedValues,
    sessions,
    activeSessions,
    archivedSessions,
    tagGroups,
    orderedTagNames,
    isWorkspaceFavorited,
    handleToggleWorkspaceFavorite,
  };
};
