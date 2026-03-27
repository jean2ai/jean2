import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { X, Plus, Terminal } from 'lucide-react';
import { TerminalView, type TerminalViewHandle } from './TerminalView';
import type { TerminalStatus, SessionInitData } from '@/hooks/useTerminal';
import type { TerminalListResponse } from '@jean2/shared';
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
  id: string;
  serverSessionId: string | null;
  workspaceId: string;
  workspacePath: string;
  title: string;
  status: TerminalStatus;
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

const MAX_TABS_PER_WORKSPACE = 5;
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

  const [tabsByWorkspace, setTabsByWorkspace] = useState<Map<string, TerminalTab[]>>(new Map());
  const [activeTabIdByWorkspace, setActiveTabIdByWorkspace] = useState<Map<string, string>>(new Map());
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const fetchInProgressRef = useRef<Set<string>>(new Set());
  const terminalViewRefs = useRef<Map<string, TerminalViewHandle>>(new Map());

  const currentTabs = workspaceId ? (tabsByWorkspace.get(workspaceId) ?? []) : [];
  const activeTabId = workspaceId ? activeTabIdByWorkspace.get(workspaceId) : undefined;

  const tabCountForWorkspace = workspaceId ? (tabsByWorkspace.get(workspaceId)?.length ?? 0) : 0;
  const canAddTab = tabCountForWorkspace < MAX_TABS_PER_WORKSPACE;

  const fetchExistingSessions = useCallback(async (wsId: string) => {
    if (!serverUrl || !apiToken || fetchInProgressRef.current.has(wsId)) return;
    fetchInProgressRef.current.add(wsId);
    try {
      const response = await fetch(
        `http://${serverUrl}/api/workspaces/${wsId}/terminals`,
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
          },
        }
      );
      if (!response.ok) return;
      const data = await response.json() as TerminalListResponse;
      if (!data.sessions || data.sessions.length === 0) return;

      const newTabs: TerminalTab[] = data.sessions.map(session => ({
        id: crypto.randomUUID(),
        serverSessionId: session.id,
        workspaceId: wsId,
        workspacePath: session.cwd,
        title: session.title,
        status: 'disconnected' as const,
      }));

      setTabsByWorkspace(prev => {
        const currentTabs = prev.get(wsId) ?? [];
        const existingServerIds = new Set(
          currentTabs.map(t => t.serverSessionId).filter(Boolean)
        );
        const toAdd = newTabs.filter(s => !existingServerIds.has(s.serverSessionId));
        if (toAdd.length === 0) return prev;

        // If we already have tabs for this workspace, any unmatched server sessions
        // are orphans from StrictMode duplicate connections. Destroy them on the
        // server instead of creating tabs for them.
        if (currentTabs.length > 0) {
          for (const orphan of toAdd) {
            fetch(`http://${serverUrl}/api/workspaces/${wsId}/terminals/${orphan.serverSessionId}`, {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${apiToken}`,
              },
            }).catch(() => {
              // Ignore errors
            });
          }
          return prev;
        }

        const next = new Map(prev);
        next.set(wsId, [...currentTabs, ...toAdd]);
        return next;
      });

      setActiveTabIdByWorkspace(prev => {
        const next = new Map(prev);
        if (!next.has(wsId)) {
          next.set(wsId, newTabs[0].id);
        }
        return next;
      });
    } catch (error) {
      console.log(`[TerminalPanel] fetchExistingSessions FAILED`, error);
    } finally {
      fetchInProgressRef.current.delete(wsId);
    }
  }, [serverUrl, apiToken]);

  useEffect(() => {
    if (!workspaceId || !isOpen) return;
    fetchExistingSessions(workspaceId);
  }, [workspaceId, isOpen, fetchExistingSessions]);

  const updateTabStatus = useCallback((tabId: string, status: TerminalStatus) => {
    setTabsByWorkspace(prev => {
      const next = new Map(prev);
      for (const [wsId, tabs] of next.entries()) {
        const updated = tabs.map(t => t.id === tabId ? { ...t, status } : t);
        if (updated.some(t => t.id === tabId)) {
          next.set(wsId, updated);
        }
      }
      return next;
    });
  }, []);

  const updateTabSessionInit = useCallback((tabId: string, initData: SessionInitData) => {
    setTabsByWorkspace(prev => {
      const next = new Map(prev);
      for (const [wsId, tabs] of next.entries()) {
        const updated = tabs.map(t => t.id === tabId ? {
          ...t,
          serverSessionId: initData.sessionId,
          title: initData.title || t.title,
        } : t);
        if (updated.some(t => t.id === tabId)) {
          next.set(wsId, updated);
        }
      }
      return next;
    });
  }, []);

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    setTabsByWorkspace(prev => {
      const next = new Map(prev);
      for (const [wsId, tabs] of next.entries()) {
        const updated = tabs.map(t => t.id === tabId ? { ...t, title } : t);
        if (updated.some(t => t.id === tabId)) {
          next.set(wsId, updated);
        }
      }
      return next;
    });
  }, []);

  const addTab = useCallback(() => {
    if (!workspaceId || !workspacePath || !canAddTab) return;

    const newTab: TerminalTab = {
      id: crypto.randomUUID(),
      serverSessionId: null,
      workspaceId,
      workspacePath,
      title: 'main',
      status: 'connecting',
    };

    setTabsByWorkspace(prev => {
      const next = new Map(prev);
      const existing = next.get(workspaceId) ?? [];
      next.set(workspaceId, [...existing, newTab]);
      return next;
    });

    setActiveTabIdByWorkspace(prev => {
      const next = new Map(prev);
      next.set(workspaceId, newTab.id);
      return next;
    });
  }, [workspaceId, workspacePath, canAddTab]);

  const closeTab = useCallback((tabId: string) => {
    const tab = [...tabsByWorkspace.values()].flat().find(t => t.id === tabId);
    if (tab?.serverSessionId && serverUrl && apiToken) {
      fetch(`http://${serverUrl}/api/workspaces/${tab.workspaceId}/terminals/${tab.serverSessionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      }).catch(() => {
        // Ignore errors
      });
    }

    setTabsByWorkspace(prev => {
      const next = new Map(prev);
      for (const [wsId, tabs] of next.entries()) {
        const filtered = tabs.filter(t => t.id !== tabId);
        if (filtered.length < tabs.length) {
          next.set(wsId, filtered);
        }
      }
      return next;
    });

    setActiveTabIdByWorkspace(prev => {
      const next = new Map(prev);
      for (const [wsId, tabId_] of next.entries()) {
        if (tabId_ === tabId) {
          const remaining = tabsByWorkspace.get(wsId)?.filter(t => t.id !== tabId) ?? [];
          if (remaining.length > 0) {
            next.set(wsId, remaining[remaining.length - 1].id);
          } else {
            next.delete(wsId);
          }
        }
      }
      return next;
    });
  }, [tabsByWorkspace, serverUrl, apiToken]);

  useEffect(() => {
    if (!workspaceId || !workspacePath || !isOpen) return;
    const tabs = tabsByWorkspace.get(workspaceId) ?? [];
    if (tabs.length === 0) {
      addTab();
    }
  }, [isOpen, workspaceId, workspacePath, tabsByWorkspace, addTab]);

  const focusActiveTerminal = useCallback(() => {
    terminalViewRefs.current.get(activeTabId ?? '')?.focus();
  }, [activeTabId]);

  useImperativeHandle(ref, () => ({
    focus: focusActiveTerminal,
  }), [focusActiveTerminal]);

  useEffect(() => {
    if (!isOpen || currentTabs.length === 0) return;
    const timer = setTimeout(focusActiveTerminal, 300);
    return () => clearTimeout(timer);
  }, [isOpen, currentTabs.length, focusActiveTerminal]);

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
  const tabTitlePrefix = `[${shortName}]`;

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
      {currentTabs.map(tab => (
        <div
          key={tab.id}
          className={cn(
            'group flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer rounded-sm whitespace-nowrap border border-transparent',
            tab.id === activeTabId
              ? 'bg-accent text-accent-foreground border-border'
              : 'text-muted-foreground hover:bg-muted'
          )}
          onClick={() => setActiveTabIdByWorkspace(prev => {
            const next = new Map(prev);
            next.set(workspaceId, tab.id);
            return next;
          })}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusIndicator(tab.status))} />
          <span>{tabTitlePrefix} {tab.title}</span>
          <button
            className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity ml-0.5"
            onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      {canAddTab && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={addTab}
          title="New terminal tab"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );

  const renderTerminalContent = () => (
    <div className="flex-1 min-h-0 overflow-hidden relative">
      {currentTabs.map(tab => (
        <div
          key={tab.id}
          className={cn(
            'w-full h-full',
            tab.id !== activeTabId
              ? 'invisible absolute inset-0 pointer-events-none'
              : 'relative'
          )}
        >
            <TerminalViewWrapper
              key={tab.id}
              tab={tab}
              serverUrl={serverUrl}
              apiToken={apiToken}
              onStatusChange={(status) => updateTabStatus(tab.id, status)}
              onSessionInit={(initData) => updateTabSessionInit(tab.id, initData)}
              onTitleChange={(title) => updateTabTitle(tab.id, title)}
              onTerminalRef={(handle) => {
                if (handle) terminalViewRefs.current.set(tab.id, handle);
                else terminalViewRefs.current.delete(tab.id);
              }}
            />
        </div>
      ))}
      {currentTabs.length === 0 && (
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

interface TerminalViewWrapperProps {
  tab: TerminalTab;
  serverUrl: string;
  apiToken: string;
  onStatusChange: (status: TerminalStatus) => void;
  onSessionInit: (init: SessionInitData) => void;
  onTitleChange: (title: string) => void;
  onTerminalRef: (handle: TerminalViewHandle | null) => void;
}

function TerminalViewWrapper({ tab, serverUrl, apiToken, onStatusChange, onSessionInit, onTitleChange, onTerminalRef }: TerminalViewWrapperProps) {
  const onStatusChangeRef = useRef(onStatusChange);
  const onSessionInitRef = useRef(onSessionInit);
  const onTitleChangeRef = useRef(onTitleChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onSessionInitRef.current = onSessionInit;
    onTitleChangeRef.current = onTitleChange;
  });

  const stableOnStatusChange = useCallback((status: TerminalStatus) => {
    onStatusChangeRef.current(status);
  }, []);

  const stableOnSessionInit = useCallback((init: SessionInitData) => {
    onSessionInitRef.current(init);
  }, []);

  const stableOnTitleChange = useCallback((title: string) => {
    onTitleChangeRef.current(title);
  }, []);

  return (
    <TerminalView
      ref={onTerminalRef}
      serverUrl={serverUrl}
      apiToken={apiToken}
      cwd={tab.workspacePath}
      serverSessionId={tab.serverSessionId}
      onStatusChange={stableOnStatusChange}
      onSessionInit={stableOnSessionInit}
      onTitleChange={stableOnTitleChange}
    />
  );
}

export type { TerminalTab };
