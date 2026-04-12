import { useMemo, useCallback } from 'react';
import { useParams } from '@tanstack/react-router';
import type { Session, Workspace, SavedServer, QuickConnection } from '@jean2/sdk';
import { useSessionStore } from '@/stores/sessionStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { usePermissionStore, type PendingPermissionRequest } from '@/stores/permissionStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { useServerContext } from '@/contexts/ServerContext';
import type { ChildrenMap, SessionDerivedValuesMap } from '@/components/layout/SessionMenuButton';

export interface UseSidebarDataReturn {
  // Store subscriptions
  allSessions: Session[];
  currentSession: Session | null;
  currentSessionId: string | null;
  streamingSessionIds: Set<string>;
  pendingPermissions: PendingPermissionRequest[];
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
  const currentSession = useSessionStore(s => s.currentSession);
  const currentSessionId = currentSession?.id ?? null;
  const streamingSessionIds = useConnectionStore(s => s.streamingSessionIds);
  const pendingPermissions = usePermissionStore(s => s.pendingPermissions);
  const connected = useConnectionStore(s => s.connected);
  const workspaces = useServerDataStore(s => s.workspaces);
  const activeWorkspace = useServerDataStore(s => s.activeWorkspace);

  // Derive activeServer from ServerContext and URL params
  const { servers, quickConnections, addToQuickConnections, removeFromQuickConnections } = useServerContext();
  const params = useParams({ from: '/server/$serverId', strict: false } as unknown as Parameters<typeof useParams>[0]);
  const serverId = params?.serverId as string | undefined;
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
    const pendingSet = new Set(pendingPermissions.map(p => p.sessionId));
    const derived = new Map<string, { isStreaming: boolean; hasPendingPermission: boolean; isRunning: boolean }>();
    for (const session of allSessions) {
      const isStreaming = streamingSessionIds.has(session.id);
      const hasPendingPermission = pendingSet.has(session.id);
      const isCurrentSession = session.id === currentSessionId;
      const isRunning = (isCurrentSession && isStreaming) || session.subagentStatus === 'running' || !!session.runningAt;
      derived.set(session.id, { isStreaming, hasPendingPermission, isRunning });
    }
    return derived;
  }, [allSessions, streamingSessionIds, pendingPermissions, currentSessionId]);

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
    pendingPermissions,
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
