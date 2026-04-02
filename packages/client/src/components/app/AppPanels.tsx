import { TerminalPanel } from '@/components/layout/TerminalPanel';
import { FilesPanel } from '@/components/layout/FilesPanel';
import { useUIStore } from '@/stores/uiStore';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';

interface AppPanelsProps {
  workspaceId?: string;
  workspacePath?: string;
  workspaceName?: string;
  serverUrl?: string;
  apiToken?: string;
  isLoggedIn: boolean;
  terminalPanelRef: React.RefObject<TerminalPanelHandle | null>;
}

export function AppPanels({
  workspaceId,
  workspacePath,
  workspaceName,
  serverUrl,
  apiToken,
  isLoggedIn,
  terminalPanelRef,
}: AppPanelsProps) {
  const showTerminalPanel = useUIStore((s) => s.showTerminalPanel);
  const setShowTerminalPanel = useUIStore((s) => s.setShowTerminalPanel);
  const showFilesPanel = useUIStore((s) => s.showFilesPanel);
  const setShowFilesPanel = useUIStore((s) => s.setShowFilesPanel);

  if (!isLoggedIn) {
    return null;
  }

  return (
    <>
      <FilesPanel
        workspaceId={workspaceId}
        serverUrl={serverUrl}
        apiToken={apiToken}
        isOpen={showFilesPanel}
        onClose={() => setShowFilesPanel(false)}
      />

      <TerminalPanel
        ref={terminalPanelRef}
        workspaceId={workspaceId}
        workspacePath={workspacePath}
        workspaceName={workspaceName}
        serverUrl={serverUrl}
        apiToken={apiToken}
        isOpen={showTerminalPanel}
        onClose={() => setShowTerminalPanel(false)}
      />
    </>
  );
}
