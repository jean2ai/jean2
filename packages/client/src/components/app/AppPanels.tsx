import { TerminalPanel } from '@/components/layout/TerminalPanel';
import { useUIStore } from '@/stores/uiStore';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';

interface AppPanelsProps {
  workspaceId?: string;
  workspacePath?: string;
  workspaceName?: string;
  serverUrl?: string;
  apiToken?: string;
  terminalPanelRef: React.RefObject<TerminalPanelHandle | null>;
}

export function AppPanels({
  workspaceId,
  workspacePath,
  workspaceName,
  serverUrl,
  apiToken,
  terminalPanelRef,
}: AppPanelsProps) {
  const showTerminalPanel = useUIStore((s) => s.showTerminalPanel);
  const setShowTerminalPanel = useUIStore((s) => s.setShowTerminalPanel);

  return (
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
  );
}
