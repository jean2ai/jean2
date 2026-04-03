import { useEffect, useLayoutEffect, useRef } from 'react';

const DOUBLE_ESCAPE_WINDOW_MS = 400;

export interface KeyboardShortcutsConfig {
  onOpenSidebar: () => void;
  onOpenTerminal: () => void;
  onNewSession: () => void;
  onNewWindow: () => void;
  onToggleViewMode: () => void;
  onCloseFocusedPanel: () => void;
  onFocusChatInput: () => void;
  onStopStreaming: () => void;
  onToggleAutoFollow: () => void;
}

// Check if running in Tauri environment (v1/v2 compatible)
const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

const isMac = typeof navigator !== 'undefined' && navigator.platform?.toUpperCase().includes('MAC') === true;

function isModalDialogOpen(): boolean {
  // Check Radix/shadcn dialogs via data-slot and open state
  const openDialogSelectors = [
    '[data-slot="dialog-overlay"][data-state="open"]',
    '[data-slot="dialog-content"][data-state="open"]',
    '[role="dialog"][data-state="open"]',
  ];

  for (const selector of openDialogSelectors) {
    if (document.querySelector(selector)) {
      return true;
    }
  }

  // Fallback: check for visible dialog elements (fixed elements have null offsetParent)
  const dialogs = document.querySelectorAll('[role="dialog"]');
  for (const dialog of dialogs) {
    if (dialog instanceof HTMLElement && isElementVisible(dialog)) {
      return true;
    }
  }

  return false;
}

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    parseFloat(style.opacity) > 0 &&
    el.getBoundingClientRect().width > 0 &&
    el.getBoundingClientRect().height > 0
  );
}

function isChatInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;

  // Strict: only true when active element itself has the marker
  if (active.hasAttribute?.('data-chat-input')) {
    return true;
  }

  // Strict: or when inside an element with the marker
  if (active.closest?.('[data-chat-input="true"]')) {
    return true;
  }

  return false;
}

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig): void {
  // Keep a ref to latest config so the handler always calls current callbacks
  const configRef = useRef(config);
  useLayoutEffect(() => {
    configRef.current = config;
  });

  // Double-Escape detector state
  const escapeStateRef = useRef({ lastEscTime: 0, armed: false });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // IME composition guard: skip during composition (e.g., Chinese/Japanese input)
      if (e.isComposing) {
        return;
      }

      // Key-repeat guard: ignore held keys firing multiple events
      if (e.repeat) {
        return;
      }

      // Escape conflict guard: let dialogs handle Escape themselves
      if (e.key === 'Escape' && isModalDialogOpen()) {
        return;
      }

      const { onCloseFocusedPanel, onFocusChatInput, onStopStreaming, onOpenSidebar, onOpenTerminal, onNewWindow, onNewSession, onToggleViewMode, onToggleAutoFollow } = configRef.current;

      if (e.shiftKey && e.key === 'Escape') {
        e.preventDefault();
        onCloseFocusedPanel();
        return;
      }

      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey) {
        const chatFocused = isChatInputFocused();
        const now = Date.now();
        const { lastEscTime, armed } = escapeStateRef.current;
        const timeSinceLastEsc = now - lastEscTime;

        // Double-Escape: chat input focused + within time window
        if (chatFocused && armed && timeSinceLastEsc < DOUBLE_ESCAPE_WINDOW_MS) {
          e.preventDefault();
          escapeStateRef.current = { lastEscTime: 0, armed: false };
          onStopStreaming();
          return;
        }

        // First Escape: arm the detector if chat input is focused
        if (chatFocused) {
          escapeStateRef.current = { lastEscTime: now, armed: true };
          // Don't prevent default - allow input's own Escape behavior
          return;
        }

        // No chat input focused - standard behavior
        e.preventDefault();
        onFocusChatInput();
        return;
      }

      const target = e.target as HTMLElement;
      const isInputElement =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      const modifierPressed = e.metaKey || e.ctrlKey;

      if (isInputElement && !modifierPressed) {
        return;
      }

      // In Tauri on macOS, native accelerators handle cmd+1 (sidebar) and cmd+t (terminal)
      // via the system menu bar. Skip to prevent duplicate handling.
      // On Windows/Linux the menu bar is not visible, so JS must handle these.
      // Use e.code for layout-independent physical key matching
      if (!isTauri || !isMac) {
        if (modifierPressed && e.code === 'Digit1') {
          e.preventDefault();
          onOpenSidebar();
          return;
        }

        if (modifierPressed && e.code === 'KeyT') {
          e.preventDefault();
          onOpenTerminal();
          return;
        }
      }

      if (modifierPressed && e.shiftKey && e.code === 'KeyN') {
        e.preventDefault();
        onNewWindow();
        return;
      }

      if (modifierPressed && e.code === 'KeyN') {
        e.preventDefault();
        onNewSession();
        return;
      }

      if (modifierPressed && e.code === 'KeyO') {
        e.preventDefault();
        onToggleViewMode();
        return;
      }

      // Cmd/Ctrl+Shift+F: Toggle auto-follow (works even in input fields)
      if (modifierPressed && e.shiftKey && e.code === 'KeyF') {
        e.preventDefault();
        onToggleAutoFollow();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []); // Stable registration — handler accesses latest config via ref
}
