import {useCallback, useLayoutEffect, useRef} from 'react';
import {useRouter} from '@tanstack/react-router';
import {useSidebar} from '@/components/ui/sidebar';
import {useKeyboardShortcuts} from '@/hooks/useKeyboardShortcuts';
import {useChatLayoutStore} from '@/stores/chatLayoutStore';
import {useServerDataStore} from '@/stores/serverDataStore';
import type {AppSidebarHandle} from '@/components/layout/AppSidebar';
import type {Preconfig, Workspace} from '@jean2/sdk';
import {isElectron, isTauriMobile} from '@/lib/platform';

export interface AppKeyboardHandlersConfig {
  sidebarRef: React.RefObject<AppSidebarHandle | null>;
  terminalPanelRef: React.RefObject<{ focus: () => void } | null>;
  filesPanelRef: React.RefObject<{ focus: () => void } | null>;
  chatInputRef: React.RefObject<{ focus: () => void } | null>;
  activeWorkspace: Workspace | null;
  primaryPreconfigs: Preconfig[];
  handleInterruptSession: () => void;
  serverId: string;
  createSession: (preconfigId?: string, title?: string) => void;
  setSidebarOpen: (open: boolean) => void;
  onToggleAutoFollow?: () => void;
}

export function useAppKeyboardHandlers({
  sidebarRef,
  terminalPanelRef,
  filesPanelRef,
  chatInputRef,
  activeWorkspace,
  primaryPreconfigs,
  handleInterruptSession,
  serverId,
  createSession,
  setSidebarOpen,
  onToggleAutoFollow,
}: AppKeyboardHandlersConfig) {
  const focusSidebarSessionPanel = useCallback(() => {
    setSidebarOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sidebarRef.current?.focusSessionPanel();
      });
    });
  }, [setSidebarOpen, sidebarRef]);

  const focusTerminalPanel = useCallback(() => {
    useChatLayoutStore.getState().setShowTerminalPanel(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        terminalPanelRef.current?.focus();
      });
    });
  }, [terminalPanelRef]);

  const focusSidebarSessionPanelRef = useRef(focusSidebarSessionPanel);
  useLayoutEffect(() => {
    focusSidebarSessionPanelRef.current = focusSidebarSessionPanel;
  });

  const focusTerminalPanelRef = useRef(focusTerminalPanel);
  useLayoutEffect(() => {
    focusTerminalPanelRef.current = focusTerminalPanel;
  });

  const handleCloseTerminal = useCallback(() => {
    useChatLayoutStore.getState().setShowTerminalPanel(false);
  }, []);

  const focusFilesPanel = useCallback(() => {
    requestAnimationFrame(() => {
      filesPanelRef.current?.focus();
    });
  }, [filesPanelRef]);

  const focusFilesPanelRef = useRef(focusFilesPanel);
  useLayoutEffect(() => {
    focusFilesPanelRef.current = focusFilesPanel;
  });

  const focusChatInput = useCallback(() => {
    chatInputRef.current?.focus();
  }, [chatInputRef]);

  const handleNewSession = useCallback(() => {
    if (activeWorkspace && primaryPreconfigs[0]) {
      createSession(primaryPreconfigs[0].id);
    }
  }, [activeWorkspace, primaryPreconfigs, createSession]);

  const handleNewWindow = useCallback(async () => {
    if (isElectron()) {
      window.__JEAN2_ELECTRON__?.createWindow();
    } else if (isTauriMobile()) {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke('create_new_window').catch(() => {});
    }
  }, []);

  const router = useRouter();

  const handleToggleViewMode = useCallback(() => {
    const currentPath = router.state.location.pathname;
    if (currentPath.includes('/overview')) {
      router.navigate({ to: '/server/$serverId/workspace', params: { serverId } });
    } else {
      router.navigate({ to: '/server/$serverId/overview', params: { serverId } });
    }
  }, [router, serverId]);

  const handleCloseFocusedPanel = useCallback(() => {
    const activeEl = document.activeElement;
    if (activeEl?.closest('[data-terminal-panel]')) {
      handleCloseTerminal();
    } else if (activeEl?.closest('[data-panel-id="files"]')) {
      useChatLayoutStore.getState().setShowFilesPanel(false);
    } else if (activeEl?.closest('[data-sidebar="sidebar"]')) {
      setSidebarOpen(false);
    }
  }, [handleCloseTerminal, setSidebarOpen]);

  const handleStopStreaming = useCallback(() => {
    handleInterruptSession();
  }, [handleInterruptSession]);

  useKeyboardShortcuts({
    onOpenSidebar: () => focusSidebarSessionPanelRef.current(),
    onOpenTerminal: () => focusTerminalPanelRef.current(),
    onOpenFilesPanel: () => focusFilesPanelRef.current(),
    onNewSession: handleNewSession,
    onNewWindow: handleNewWindow,
    onToggleViewMode: handleToggleViewMode,
    onCloseFocusedPanel: handleCloseFocusedPanel,
    onFocusChatInput: focusChatInput,
    onStopStreaming: handleStopStreaming,
    onToggleAutoFollow: () => onToggleAutoFollow?.(),
  });

  useLayoutEffect(() => {
    if (isElectron()) {
      return window.__JEAN2_ELECTRON__?.onAccelerator((action) => {
        if (action === 'open-sidebar') {
          focusSidebarSessionPanelRef.current();
        } else if (action === 'open-terminal') {
          focusTerminalPanelRef.current();
        }
      });
    }

    if (!isTauriMobile()) return;

    let disposed = false;
    const unlistenFns: Array<() => void> = [];

    const registerListeners = async () => {
      const { listen } = await import('@tauri-apps/api/event');

      try {
        const unlistenSidebar = await listen('jean2://accelerator/open-sidebar', () => {
          focusSidebarSessionPanelRef.current();
        });
        if (disposed) {
          unlistenSidebar();
          return;
        }
        unlistenFns.push(unlistenSidebar);
      } catch (err) {
        console.error('Failed to register open-sidebar accelerator listener:', err);
      }

      try {
        const unlistenTerminal = await listen('jean2://accelerator/open-terminal', () => {
          focusTerminalPanelRef.current();
        });
        if (disposed) {
          unlistenTerminal();
          return;
        }
        unlistenFns.push(unlistenTerminal);
      } catch (err) {
        console.error('Failed to register open-terminal accelerator listener:', err);
      }
    };

    registerListeners();

    return () => {
      disposed = true;
      unlistenFns.forEach((fn) => fn());
    };
  }, []);
}

export interface AppKeyboardHandlersMountProps {
  sidebarRef: React.RefObject<AppSidebarHandle | null>;
  terminalPanelRef: React.RefObject<{ focus: () => void } | null>;
  filesPanelRef: React.RefObject<{ focus: () => void } | null>;
  chatInputRef: React.RefObject<{ focus: () => void } | null>;
  handleInterruptSession: () => void;
  serverId: string;
  createSession: (preconfigId?: string, title?: string) => void;
  onToggleAutoFollow?: () => void;
}

export function AppKeyboardHandlersMount(props: AppKeyboardHandlersMountProps) {
  const { setOpen } = useSidebar();
  const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);
  const preconfigs = useServerDataStore((s) => s.preconfigs);
  const primaryPreconfigs = preconfigs.filter((p) => p.mode !== 'subagent');

  useAppKeyboardHandlers({ ...props, activeWorkspace, primaryPreconfigs, setSidebarOpen: setOpen });

  return null;
}
