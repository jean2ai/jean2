import { TerminalPanel } from '@/components/layout/TerminalPanel';
import { useChatLayoutStore } from '@/stores/chatLayoutStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { platform } from '@/platform';
import type { TerminalPanelHandle } from '@/components/layout/TerminalPanel';
import type { Jean2Client } from '@jean2/sdk';

interface AppPanelsProps {
  sdkClient: Jean2Client | null;
  terminalPanelRef: React.RefObject<TerminalPanelHandle | null>;
}

export function AppPanels({
  sdkClient,
  terminalPanelRef,
}: AppPanelsProps) {
  const showTerminalPanel = useChatLayoutStore((s) => s.showTerminalPanel);
  const setShowTerminalPanel = useChatLayoutStore((s) => s.setShowTerminalPanel);
  const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);

  const workspaceId = activeWorkspace?.id;
  const workspacePath = activeWorkspace?.path;
  const workspaceName = activeWorkspace?.name;

  if (platform.capabilities.terminal) {
    return null;
  }

  return (
    <TerminalPanel
      ref={terminalPanelRef}
      workspaceId={workspaceId}
      workspacePath={workspacePath}
      workspaceName={workspaceName}
      sdkClient={sdkClient}
      isOpen={showTerminalPanel}
      onOpen={() => setShowTerminalPanel(true)}
      onClose={() => setShowTerminalPanel(false)}
    />
  );
}
