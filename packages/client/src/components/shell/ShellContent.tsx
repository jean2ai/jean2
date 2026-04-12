import type { RefObject } from 'react';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';
import type { Workspace } from '@jean2/sdk';
import { AppMainContent, AppPanels, WorkspaceHeader } from '@/components/app';
import type { AppMainContentProps } from '@/components/app';

export interface ShellContentProps extends AppMainContentProps {
  terminalPanelRef: RefObject<TerminalPanelHandle | null>;
  workspaceId?: string;
  workspacePath?: string;
  workspaceName?: string;
  activeWorkspace: Workspace | null;
  onOpenMCP: () => void;
  onOpenPermissions: () => void;
}

export function ShellContent(props: ShellContentProps) {
  const {
    workspaceId,
    workspacePath,
    workspaceName,
    terminalPanelRef,
    sdkClient,
    activeWorkspace,
    onOpenMCP,
    onOpenPermissions,
    ...mainContentProps
  } = props;

  return (
    <main className="flex-1 flex flex-col overflow-hidden min-h-0" style={{
      paddingTop: 'env(safe-area-inset-top, 0)',
      paddingBottom: 'env(safe-area-inset-bottom, 0)',
    }}>
      <WorkspaceHeader activeWorkspace={activeWorkspace} onOpenMCP={onOpenMCP} onOpenPermissions={onOpenPermissions} />
      <AppMainContent {...mainContentProps} sdkClient={sdkClient} />
      <AppPanels
        workspaceId={workspaceId}
        workspacePath={workspacePath}
        workspaceName={workspaceName}
        sdkClient={sdkClient}
        terminalPanelRef={terminalPanelRef}
      />
    </main>
  );
}
