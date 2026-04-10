import { TerminalPanel } from '@/components/layout/TerminalPanel';
import { useUIStore } from '@/stores/uiStore';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';
import type { Jean2Client } from '@jean2/sdk';

interface AppPanelsProps {
  workspaceId?: string;
  workspacePath?: string;
  workspaceName?: string;
  sdkClient: Jean2Client | null;
  terminalPanelRef: React.RefObject<TerminalPanelHandle | null>;
}

export function AppPanels({
  workspaceId,
  workspacePath,
  workspaceName,
  sdkClient,
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
      sdkClient={sdkClient}
      isOpen={showTerminalPanel}
      onClose={() => setShowTerminalPanel(false)}
    />
  );
}
