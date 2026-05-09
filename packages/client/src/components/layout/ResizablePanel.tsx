import { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  Sidebar,
  SidebarContent,
  SessionsResizeHandle,
} from '@/components/ui/sidebar';

interface ResizablePanelProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  resizable?: boolean;
  onContentKeyDown?: (e: React.KeyboardEvent) => void;
  contentRef?: React.Ref<HTMLDivElement>;
}

export interface ResizablePanelHandle {
  focusContent: () => void;
}

export const ResizablePanel = forwardRef<ResizablePanelHandle, ResizablePanelProps>(
  ({ children, header, resizable = true, onContentKeyDown, contentRef: externalContentRef }, ref) => {
    const internalContentRef = useRef<HTMLDivElement>(null);
    const contentRef: React.RefObject<HTMLDivElement | null> = externalContentRef && typeof externalContentRef === 'object'
      ? externalContentRef
      : internalContentRef;

    const focusContent = useCallback(() => {
      const container = contentRef.current;
      if (!container) return;

      const buttons = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[data-sidebar="menu-button"]')
      );

      if (buttons.length === 0) {
        container.focus();
        return;
      }

      buttons[0]?.focus();
    }, [contentRef]);

    useImperativeHandle(ref, () => ({
      focusContent,
    }), [focusContent]);

    return (
      <Sidebar collapsible="offcanvas" variant="floating">
        {resizable && <SessionsResizeHandle />}
        {header}
        <SidebarContent
          ref={contentRef}
          tabIndex={-1}
          onKeyDown={onContentKeyDown}
          className="outline-none"
        >
          {children}
        </SidebarContent>
      </Sidebar>
    );
  },
);
