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
    // Build pending sets: by sessionId and by originSessionId
    const pendingBySession = new Map<string, number>();
    const pendingByOrigin = new Map<string, number>();
    for (const p of pendingAskRequests) {
      pendingBySession.set(p.sessionId, (pendingBySession.get(p.sessionId) ?? 0) + 1);
      if (p.originSessionId) {
        pendingByOrigin.set(p.originSessionId, (pendingByOrigin.get(p.originSessionId) ?? 0) + 1);
      }
    }

    const derived = new Map<string, { isStreaming: boolean; hasPendingPermission: boolean; isRunning: boolean }>();
    for (const session of allSessions) {
      const isStreaming = streamingSessionIds.has(session.id);
      // Count asks directly on this session + asks originated from this session
      let askCount = (pendingBySession.get(session.id) ?? 0) + (pendingByOrigin.get(session.id) ?? 0);
      // Also count asks from child sessions
      const children = childrenMap.get(session.id);
      if (children) {
        for (const child of children) {
          askCount += pendingByOrigin.get(child.id) ?? 0;
          askCount += pendingBySession.get(child.id) ?? 0;
        }
      }
      const hasPendingPermission = askCount > 0;
      const isCurrentSession = session.id === currentSessionId;
      const isRunning = (isCurrentSession && isStreaming) || session.subagentStatus === 'running' || !!session.runningAt;
      derived.set(session.id, { isStreaming, hasPendingPermission, isRunning });
    }
    return derived;
  }, [allSessions, streamingSessionIds, pendingAskRequests, currentSessionId, childrenMap]);

  // Separate active and archived sessions (only root sessions, no parent)
  const { activeSessions, archivedSessions } = useMemo(() => {
    const rootSessions = sessions.filter((s) => !s.parentId);
    return {
      activeSessions: rootSessions.filter((s) => s.status === 'active'),
      archivedSessions: rootSessions.filter((s) => s.status === 'closed'),
    };
  }, [sessions]);

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
    isWorkspaceFavorited,
    handleToggleWorkspaceFavorite,
  };
};
