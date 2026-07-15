import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import type { Jean2Client } from '@jean2/sdk';
import { useSessionBoardStore, serializeOpenSessionIds } from '@/stores/sessionBoardStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { SessionPane } from './SessionPane';
import {
  SessionPaneRegistryContext,
  type SessionPaneRegistry,
  type SessionPaneHandle,
} from '@/contexts/SessionPaneRegistryContext';
import { useBoardSessionLoader } from '@/hooks/useBoardSessionLoader';
import { useConnectionStore } from '@/stores/connectionStore';
import { useBoardFocus } from '@/hooks/useBoardFocus';
import { cn } from '@/lib/utils';

export interface SessionBoardProps {
  sdkClient: Jean2Client | null;
  serverUrl: string | null;
}

const MIN_PANE_WIDTH = 380;

/**
 * Derive the viewPath from the current route.
 * Matches the logic in useBoardFocus and useServerSessionManager.
 */
function useViewPath(): string {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ from: '/server/$serverId', strict: false } as unknown as Parameters<typeof useParams>[0]);
  const agentId = params?.agentId as string | undefined;
  if (agentId) return `/agent/${agentId}`;
  if (pathname.includes('/overview')) return '/overview';
  return '/workspace';
}

export function SessionBoard({ sdkClient, serverUrl }: SessionBoardProps) {
  const { openSessionIds, focusedSessionId, removeFromBoard } = useSessionBoardStore();
  const connected = useConnectionStore(s => s.connected);
  const navigate = useNavigate();
  const params = useParams({ from: '/server/$serverId', strict: false } as unknown as Parameters<typeof useParams>[0]);
  const serverId = params?.serverId as string | undefined;
  const viewPath = useViewPath();

  useBoardSessionLoader(sdkClient, connected);

  const [paneHandles] = useState<Map<string, SessionPaneHandle>>(() => new Map());
  const registry = useMemo<SessionPaneRegistry>(() => ({
    panes: paneHandles,
    register: (sessionId, handle) => { paneHandles.set(sessionId, handle); },
    unregister: (sessionId) => { paneHandles.delete(sessionId); },
    getHandle: (sessionId) => paneHandles.get(sessionId),
  }), [paneHandles]);

  // Track container width with proper cleanup
  const [containerWidth, setContainerWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node) {
      setContainerWidth(node.clientWidth);
      observerRef.current = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      observerRef.current.observe(node);
    }
  }, []);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  const visiblePaneCount = openSessionIds.length;
  const showPaneChrome = openSessionIds.length > 1;
  const maxColumns = containerWidth > 0 ? Math.max(1, Math.floor(containerWidth / MIN_PANE_WIDTH)) : 1;

  // Render the full grid only when ALL open panes fit at minimum width.
  // Never silently omit a pane based on array position.
  const showGrid = visiblePaneCount > 1 && visiblePaneCount <= maxColumns;

  const handleRemoveFromBoard = useCallback((sessionId: string) => {
    removeFromBoard(sessionId);
    const state = useSessionBoardStore.getState();
    if (state.focusedSessionId) {
      const open = serializeOpenSessionIds(state.openSessionIds.length > 1 ? state.openSessionIds : []);
      navigate({
        to: `/server/$serverId${viewPath}/session/$sessionId`,
        params: { serverId: serverId!, sessionId: state.focusedSessionId },
        ...(open ? { search: { open } as Record<string, unknown> } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    } else {
      // No panes left: navigate to the current view root
      navigate({
        to: `/server/$serverId${viewPath}`,
        params: { serverId: serverId! },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }
  }, [removeFromBoard, navigate, serverId, viewPath]);

  if (visiblePaneCount === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground px-6">
        <h2 className="mb-2">Select or create a session</h2>
        <p>Choose a session from the sidebar or create a new one to start chatting.</p>
      </div>
    );
  }

  const renderPane = (sessionId: string) => (
    <SessionPane
      key={sessionId}
      sessionId={sessionId}
      sdkClient={sdkClient}
      serverUrl={serverUrl}
      isFocused={sessionId === focusedSessionId}
      isCompact={!showGrid && visiblePaneCount > 1}
      showPaneChrome={showPaneChrome}
      onRemoveFromBoard={handleRemoveFromBoard}
    />
  );

  // Grid mode: all panes fit
  if (showGrid) {
    return (
      <SessionPaneRegistryContext.Provider value={registry}>
        <div
          ref={containerRef}
          className="flex-1 min-h-0 grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${visiblePaneCount}, minmax(0, 1fr))`,
          }}
        >
          {openSessionIds.map(renderPane)}
        </div>
      </SessionPaneRegistryContext.Provider>
    );
  }

  // Single focused pane (possibly with compact switcher)
  const focusId = focusedSessionId ?? openSessionIds[0];
  const showSwitcher = visiblePaneCount > 1;

  return (
    <SessionPaneRegistryContext.Provider value={registry}>
      <div ref={containerRef} className="flex-1 min-h-0 flex flex-col">
        {showSwitcher && (
          <CompactBoardSwitcher
            openSessionIds={openSessionIds}
            focusedSessionId={focusId}
          />
        )}
        {renderPane(focusId)}
      </div>
    </SessionPaneRegistryContext.Provider>
  );
}

/**
 * Compact board switcher shown when there are multiple open sessions
 * but not enough width to show them all side-by-side.
 */
function CompactBoardSwitcher({
  openSessionIds,
  focusedSessionId,
}: {
  openSessionIds: string[];
  focusedSessionId: string;
}) {
  const sessions = useSessionStore(s => s.sessions);
  const workspaces = useServerDataStore(s => s.workspaces);
  const focusBoard = useBoardFocus();

  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ws of workspaces) {
      map.set(ws.id, ws.name);
    }
    return map;
  }, [workspaces]);

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-border shrink-0 overflow-x-auto">
      {openSessionIds.map((sessionId) => {
        const session = sessions.find(s => s.id === sessionId);
        const isActive = sessionId === focusedSessionId;
        const wsName = session?.workspaceId ? workspaceNameById.get(session.workspaceId) : undefined;
        const label = wsName ? `${wsName} / ${session?.title || 'Untitled'}` : (session?.title || 'Untitled');
        return (
          <button
            key={sessionId}
            onClick={() => focusBoard(sessionId)}
            className={cn(
              'px-2 py-0.5 text-xs rounded-md whitespace-nowrap transition-colors',
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted',
            )}
            title={label}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
