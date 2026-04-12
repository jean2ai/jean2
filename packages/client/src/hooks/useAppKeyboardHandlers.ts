import { useCallback, useLayoutEffect, useRef } from 'react';
import { useSidebar } from '@/components/ui/sidebar';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import type { AppSidebarHandle } from '@/components/layout/AppSidebar';
import type { Preconfig, Workspace } from '@jean2/sdk';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface AppKeyboardHandlersConfig {
  sidebarRef: React.RefObject<AppSidebarHandle | null>;
  terminalPanelRef: React.RefObject<{ focus: () => void } | null>;
  filesPanelRef: React.RefObject<{ focus: () => void } | null>;
  chatInputRef: React.RefObject<{ focus: () => void } | null>;
  activeWorkspace: Workspace | null;
  primaryPreconfigs: Preconfig[];
  handleInterruptSession: () => void;
  handleSidebarViewModeChange: (
    mode: 'default' | 'overview' | ((prev: 'default' | 'overview') => 'default' | 'overview')
  ) => void;
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
  handleSidebarViewModeChange,
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

  const handleNewWindow = useCallback(() => {
    invoke('create_new_window').catch(() => {});
  }, []);

  const handleToggleViewMode = useCallback(() => {
    handleSidebarViewModeChange((prev) => (prev === 'overview' ? 'default' : 'overview'));
  }, [handleSidebarViewModeChange]);

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

  // Listen for native Tauri accelerator events
  useLayoutEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
    if (!isTauri) return;

    let disposed = false;
    const unlistenFns: UnlistenFn[] = [];

    const registerListeners = async () => {
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
  }, []); // Stable registration — handlers accessed via refs
}

export interface AppKeyboardHandlersMountProps {
  sidebarRef: React.RefObject<AppSidebarHandle | null>;
  terminalPanelRef: React.RefObject<{ focus: () => void } | null>;
  filesPanelRef: React.RefObject<{ focus: () => void } | null>;
  chatInputRef: React.RefObject<{ focus: () => void } | null>;
  handleInterruptSession: () => void;
  handleSidebarViewModeChange: (
    mode: 'default' | 'overview' | ((prev: 'default' | 'overview') => 'default' | 'overview')
  ) => void;
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
