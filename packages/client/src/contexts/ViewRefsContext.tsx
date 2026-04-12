import { createContext, useContext, type RefObject } from 'react';

import type { MessageInputHandle } from '@/components/chat/MessageInput';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';
import type { FilesPanelHandle } from '@/components/layout/FilesPanel';
import type { AppSidebarHandle } from '@/components/layout/AppSidebar';

export interface ViewRefs {
  sidebarRef: RefObject<AppSidebarHandle | null>;
  chatInputRef: RefObject<MessageInputHandle | null>;
  terminalPanelRef: RefObject<TerminalPanelHandle | null>;
  filesPanelRef: RefObject<FilesPanelHandle | null>;
  scrollToBottomRef: RefObject<(() => void) | null>;
  autoFollowToggleRef: RefObject<{ toggle: () => void } | null>;
}

export const ViewRefsContext = createContext<ViewRefs | null>(null);

export const useViewRefs = (): ViewRefs => {
  const context = useContext(ViewRefsContext);

  if (context === null) {
    throw new Error('useViewRefs must be used within a ViewRefsProvider');
  }

  return context;
};
