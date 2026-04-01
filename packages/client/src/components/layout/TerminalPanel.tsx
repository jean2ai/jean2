import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { X, Plus, Terminal } from 'lucide-react';
import { TerminalView } from './TerminalView';
import {
  useTerminalConnection,
  createTerminalInstance,
  createTerminalCache,
  type CachedTerminal,
  type TerminalStatus,
  type SessionInitData,
  type TerminalCache,
} from '@/hooks/useTerminal';
import type { TerminalEvent } from '@jean2/shared';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface TerminalPanelHandle {
  focus: () => void;
}

interface TerminalTab {
  serverSessionId: string;
  title: string;
  status: TerminalStatus;
  cwd: string;
  shell: string;
}

interface TerminalPanelProps {
  workspaceId: string | undefined;
  workspacePath: string | undefined;
  workspaceName: string | undefined;
  serverUrl: string | undefined;
  apiToken: string | undefined;
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_HEIGHT = 300;
const MIN_HEIGHT = 200;
const MAX_HEIGHT_RATIO = 0.7;

export const TerminalPanel = forwardRef<TerminalPanelHandle, TerminalPanelProps>(function TerminalPanel({
  workspaceId,
  workspacePath,
  workspaceName,
  serverUrl,
  apiToken,
  isOpen,
  onClose,
}, ref) {
  const isMobile = useIsMobile();
  const viewport = useVisualViewport();

  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabServerId, setActiveTabServerId] = useState<string | null>(null);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const terminalCacheRef = useRef<TerminalCache>(createTerminalCache());
  const activeConnectionRef = useRef<{
    serverSessionId: string;
    disconnect: () => void;
    destroy: () => void;
  } | null>(null);
  const eventWsRef = useRef<WebSocket | null>(null);
  const tabsRef = useRef<TerminalTab[]>([]);
  const handleTerminalEventRef = useRef<(event: TerminalEvent) => void>(() => {});
  const autoCreateRef = useRef(false);
  const autoCreateResetRef = useRef<string | undefined>(undefined);
  const previousTabIdsRef = useRef<Set<string>>(new Set());
  const addTabRef = useRef<() => void>(() => {});

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const handleTerminalEvent = useCallback((event: TerminalEvent) => {
    switch (event.type) {
      case 'snapshot': {
        const previousIds = previousTabIdsRef.current;

        setTabs(event.sessions.map(s => ({
          serverSessionId: s.id,
          title: s.title,
          status: s.status === 'exited' ? 'exited' : 'disconnected',
          cwd: s.cwd,
          shell: s.shell,
        })));

        if (event.sessions.length > 0) {
          setActiveTabServerId(prev => {
            if (prev && event.sessions.some(s => s.id === prev)) return prev;
            return event.sessions[0].id;
          });
        } else {
          setActiveTabServerId(null);
          if (!autoCreateRef.current) {
            autoCreateRef.current = true;
            addTabRef.current();
          }
        }

        if (previousIds.size > 0) {
          const snapshotIds = new Set(event.sessions.map(s => s.id));
          const lostIds = [...previousIds].filter(id => !snapshotIds.has(id));
          for (const _lostId of lostIds) {
            addTabRef.current();
          }
        }
        break;
      }
      case 'created': {
        setTabs(prev => {
          if (prev.some(t => t.serverSessionId === event.session.id)) {
            return prev;
          }
          return [...prev, {
            serverSessionId: event.session.id,
            title: event.session.title,
            status: 'disconnected',
            cwd: event.session.cwd,
            shell: event.session.shell,
          }];
        });
        setActiveTabServerId(event.session.id);
        break;
      }
      case 'destroyed': {
        setTabs(prev => prev.filter(t => t.serverSessionId !== event.sessionId));
        terminalCacheRef.current.dispose(event.sessionId);
        setActiveTabServerId(prev => {
          if (prev !== event.sessionId) return prev;
          const remaining = tabsRef.current.filter(t => t.serverSessionId !== event.sessionId);
          return remaining.length > 0 ? remaining[0].serverSessionId : null;
        });
        break;
      }
      case 'exited': {
        setTabs(prev => prev.map(t =>
          t.serverSessionId === event.sessionId
            ? { ...t, status: 'exited' }
            : t
        ));
        break;
      }
      case 'title_changed': {
        setTabs(prev => prev.map(t =>
          t.serverSessionId === event.sessionId
            ? { ...t, title: event.title }
            : t
        ));
        break;
      }
      case 'status_changed': {
        setTabs(prev => prev.map(t =>
          t.serverSessionId === event.sessionId
            ? { ...t, status: event.status === 'exited' ? 'exited' : 'connected' }
            : t
        ));
        break;
      }
    }
  }, []);

  useEffect(() => {
    handleTerminalEventRef.current = handleTerminalEvent;
  }, [handleTerminalEvent]);

  useEffect(() => {
    if (!workspaceId || !isOpen || !serverUrl || !apiToken) {
      setTabs([]);
      setActiveTabServerId(null);
      previousTabIdsRef.current = new Set();
      autoCreateRef.current = false;

      if (activeConnectionRef.current) {
        activeConnectionRef.current.disconnect();
        activeConnectionRef.current = null;
      }
      setConnectionTarget(null);
      terminalCacheRef.current.disposeAll();

      const ws = eventWsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.close();
        eventWsRef.current = null;
      }
      return;
    }

    // Clean up previous workspace's terminals before setting up new workspace
    if (activeConnectionRef.current) {
      activeConnectionRef.current.disconnect();
      activeConnectionRef.current = null;
    }
    setConnectionTarget(null);
    terminalCacheRef.current.disposeAll();

    previousTabIdsRef.current = new Set(tabsRef.current.map(t => t.serverSessionId));

    const wsUrl = `ws://${serverUrl}/ws/terminal/events?token=${apiToken}&workspaceId=${encodeURIComponent(workspaceId)}`;
    const ws = new WebSocket(wsUrl);
    eventWsRef.current = ws;

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as TerminalEvent;
        handleTerminalEventRef.current(data);
      } catch (err) {
        console.error('[TerminalPanel] Failed to parse event:', err);
      }
    };

    return () => {
      const currentWs = eventWsRef.current;
      if (currentWs) {
        currentWs.onopen = null;
        currentWs.onclose = null;
        currentWs.onmessage = null;
        currentWs.onerror = null;
        currentWs.close();
        eventWsRef.current = null;
      }
    };
  }, [workspaceId, isOpen, serverUrl, apiToken]);

  const onOutput = useCallback((serverSessionId: string) => (data: string) => {
    const cached = terminalCacheRef.current.get(serverSessionId);
    cached?.terminal.write(data);
  }, []);

  const onStatusChange = useCallback((serverSessionId: string) => (status: TerminalStatus) => {
    setTabs(prev => prev.map(t =>
      t.serverSessionId === serverSessionId
        ? { ...t, status }
        : t
    ));
  }, []);

  const onSessionInit = useCallback((serverSessionId: string) => (init: SessionInitData) => {
    const cached = terminalCacheRef.current.get(serverSessionId);
    if (cached) {
      cached.serverSessionId = init.sessionId;
    }
    setTabs(prev => prev.map(t =>
      t.serverSessionId === serverSessionId
        ? { ...t, title: init.title || t.title }
        : t
    ));
  }, []);

  const onTitleChange = useCallback((serverSessionId: string) => (title: string) => {
    setTabs(prev => prev.map(t =>
      t.serverSessionId === serverSessionId
        ? { ...t, title }
        : t
    ));
  }, []);

  const [connectionTarget, setConnectionTarget] = useState<CachedTerminal | null>(null);

  const { connect, disconnect, destroy } = useTerminalConnection(
    connectionTarget?.terminal ?? null,
    connectionTarget && serverUrl && apiToken && workspacePath && connectionTarget.serverSessionId ? {
      terminal: connectionTarget.terminal,
      serverUrl,
      apiToken,
      cwd: tabs.find(t => t.serverSessionId === connectionTarget.serverSessionId)?.cwd ?? workspacePath,
      serverSessionId: connectionTarget.serverSessionId,
      onOutput: onOutput(connectionTarget.serverSessionId),
      onStatusChange: onStatusChange(connectionTarget.serverSessionId),
      onSessionInit: onSessionInit(connectionTarget.serverSessionId),
      onTitleChange: onTitleChange(connectionTarget.serverSessionId),
    } : {
      terminal: null,
      serverUrl: '',
      apiToken: '',
      cwd: '',
      onOutput: () => {},
      onStatusChange: () => {},
    }
  );

  useEffect(() => {
    if (connectionTarget && connectionTarget.serverSessionId) {
      activeConnectionRef.current = {
        serverSessionId: connectionTarget.serverSessionId,
        disconnect,
        destroy,
      };
      connect(connectionTarget.serverSessionId);
    }
  }, [connectionTarget, connect, disconnect, destroy]);

  const attachActiveTerminal = useCallback(() => {
    if (!activeTabServerId || !serverUrl || !apiToken || !workspacePath) return;

    const cached = terminalCacheRef.current.get(activeTabServerId);

    let terminalEntry: CachedTerminal;
    if (cached) {
      terminalEntry = cached;
    } else {
      const { terminal, fitAddon } = createTerminalInstance();
      terminalEntry = {
        terminal,
        fitAddon,
        serverSessionId: activeTabServerId,
        status: 'connecting',
        isOpened: false,
      };
      terminalCacheRef.current.set(activeTabServerId, terminalEntry);
    }

    if (activeConnectionRef.current) {
      activeConnectionRef.current.disconnect();
      activeConnectionRef.current = null;
    }

    setConnectionTarget(terminalEntry);
  }, [activeTabServerId, serverUrl, apiToken, workspacePath]);

  useEffect(() => {
    if (!isOpen || !activeTabServerId) return;
    attachActiveTerminal();
  }, [isOpen, activeTabServerId, attachActiveTerminal]);

  const addTab = useCallback(async () => {
    if (!workspaceId || !workspacePath || !serverUrl || !apiToken) return;

    try {
      const response = await fetch(
        `http://${serverUrl}/api/workspaces/${workspaceId}/terminals`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify({ cwd: workspacePath }),
        }
      );
      if (!response.ok) {
        console.error('[TerminalPanel] Failed to create terminal:', response.statusText);
      }
    } catch (err) {
      console.error('[TerminalPanel] Failed to create terminal:', err);
    }
  }, [workspaceId, workspacePath, serverUrl, apiToken]);

  useEffect(() => {
    addTabRef.current = addTab;
  }, [addTab]);

  const closeTab = useCallback(async (serverSessionId: string) => {
    if (!workspaceId || !serverUrl || !apiToken) return;

    if (activeConnectionRef.current?.serverSessionId === serverSessionId) {
      activeConnectionRef.current.destroy();
      activeConnectionRef.current = null;
      setConnectionTarget(null);
    }

    terminalCacheRef.current.dispose(serverSessionId);

    try {
      await fetch(
        `http://${serverUrl}/api/workspaces/${workspaceId}/terminals/${serverSessionId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${apiToken}` },
        }
      );
    } catch (err) {
      console.error('[TerminalPanel] Failed to destroy terminal:', err);
    }
  }, [workspaceId, serverUrl, apiToken]);

  useEffect(() => {
    if (autoCreateResetRef.current !== workspaceId) {
      autoCreateResetRef.current = workspaceId;
      autoCreateRef.current = false;
    }
  }, [workspaceId]);

  useEffect(() => {
    previousTabIdsRef.current = new Set();
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const cache = terminalCacheRef.current;
      cache.disposeAll();
    };
  }, []);

  const focusActiveTerminal = useCallback(() => {
    if (activeTabServerId) {
      const cached = terminalCacheRef.current.get(activeTabServerId);
      cached?.terminal.focus();
    }
  }, [activeTabServerId]);

  useImperativeHandle(ref, () => ({
    focus: focusActiveTerminal,
  }), [focusActiveTerminal]);

  useEffect(() => {
    if (!isOpen || !activeTabServerId) return;
    const timer = setTimeout(focusActiveTerminal, 300);
    return () => clearTimeout(timer);
  }, [isOpen, activeTabServerId, focusActiveTerminal]);

  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    startYRef.current = clientY;
    startHeightRef.current = panelHeight;

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return;
      const clientY = 'touches' in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY;
      const delta = startYRef.current - clientY;
      const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
      const newHeight = Math.min(Math.max(startHeightRef.current + delta, MIN_HEIGHT), maxH);
      setPanelHeight(newHeight);
    };

    const handleUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleUp);
  }, [panelHeight]);


  if (!workspaceId || !workspacePath || !serverUrl || !apiToken) {
    return (
      <div className="flex items-center justify-center h-[300px] border-t border-border bg-background text-muted-foreground text-sm">
        Select a workspace to use the terminal.
      </div>
    );
  }

  const shortName = workspaceName || workspacePath.split('/').pop() || 'ws';
  const activeTab = tabs.find(t => t.serverSessionId === activeTabServerId);
   
  const activeCached = activeTabServerId ? terminalCacheRef.current.get(activeTabServerId) : null;

  const statusIndicator = (status: TerminalStatus) => {
    switch (status) {
      case 'connecting': return 'bg-warning';
      case 'connected': return 'bg-success';
      case 'disconnected': return 'bg-muted-foreground';
      case 'exited': return 'bg-error';
    }
  };

  const renderTabs = () => (
    <div className="flex items-center gap-0.5 overflow-x-auto px-1 min-h-[32px]">
      {tabs.map(tab => (
        <div
          key={tab.serverSessionId}
          className={cn(
            'group flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer rounded-sm whitespace-nowrap border border-transparent',
            tab.serverSessionId === activeTabServerId
              ? 'bg-accent text-accent-foreground border-border'
              : 'text-muted-foreground hover:bg-muted'
          )}
          onClick={() => setActiveTabServerId(tab.serverSessionId)}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusIndicator(tab.status))} />
          <span>{shortName} {tab.title}</span>
          <button
            className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity ml-0.5"
            onClick={(e) => { e.stopPropagation(); closeTab(tab.serverSessionId); }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        onClick={addTab}
        title="New terminal tab"
      >
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  const renderTerminalContent = () => (
    <div className="flex-1 min-h-0 overflow-hidden relative">
      {activeCached && activeTab ? (
        <TerminalView
          key={activeTabServerId}
          cachedTerminal={activeCached}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          No terminal sessions
        </div>
      )}
    </div>
  );

  if (isMobile) {
    const keyboardOpen = viewport.height < window.innerHeight * 0.85;
    const sheetHeight = keyboardOpen
      ? `calc(${viewport.height}px - env(safe-area-inset-top, 0px))`
      : Math.min(window.innerHeight * 0.7, viewport.height);

    return isOpen ? (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="top"
          className="p-0 bg-background [&>button]:hidden flex flex-col"
          style={{ height: sheetHeight }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Terminal</SheetTitle>
          </SheetHeader>

          <div className="flex items-center justify-between p-2 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              <span className="font-semibold text-sm">Terminal</span>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {renderTabs()}
          {renderTerminalContent()}
        </SheetContent>
      </Sheet>
    ) : null;
  }

  return (
    <div className={cn(!isOpen && 'hidden')} data-terminal-panel="">
      <div
        className="w-full cursor-ns-resize flex items-center justify-center border-t border-border bg-background select-none shrink-0"
        style={{ height: 4 }}
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeStart}
      >
        <div className="w-10 h-0.5 bg-muted-foreground/30 rounded-full" />
      </div>
      <div
        className="flex flex-col border-t border-border bg-background overflow-hidden shrink-0"
        style={{ height: panelHeight }}
      >
        <div className="flex items-center justify-between px-2 py-1 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-medium text-xs text-muted-foreground">Terminal</span>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
        {renderTabs()}
        {renderTerminalContent()}
      </div>
    </div>
  );
});
