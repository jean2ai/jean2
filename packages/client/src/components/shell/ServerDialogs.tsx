import { useShallow } from 'zustand/react/shallow';
import type { Jean2Client, WorkspaceSettings, PermissionGrant } from '@jean2/sdk';
import { useUIStore } from '@/stores/uiStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { ConfigurationDialog } from '@/components/modals/ConfigurationDialog';
import { WorkspaceSettingsDialog } from '@/components/modals/WorkspaceSettingsDialog';
import FilePreviewOverlay from '@/components/files/FilePreviewOverlay';

interface ServerDialogsProps {
  apiToken: string | null;
  isConnected: boolean;
  sdkClient: Jean2Client | null;
  onLogout: () => void;
  onConfigurationClose: () => void;
  permissions: PermissionGrant[];
  onRefreshPermissions: () => void;
  onRevokePermission: (permissionId: string) => void;
  onRevokeAllPermissions: (workspaceId: string) => void;
  onUpdateWorkspacePaths: (workspaceId: string, additionalPaths: string[]) => void;
  onUpdateWorkspaceSettings: (workspaceId: string, settings: WorkspaceSettings) => void;
}

export function ServerDialogs({
  apiToken,
  isConnected,
  sdkClient,
  onLogout,
  onConfigurationClose,
  permissions,
  onRefreshPermissions,
  onRevokePermission,
  onRevokeAllPermissions,
  onUpdateWorkspacePaths,
  onUpdateWorkspaceSettings,
}: ServerDialogsProps) {
  const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);

  const {
    showConfiguration,
    setShowConfiguration,
    showWorkspaceSettings,
    setShowWorkspaceSettings,
  } = useUIStore(
    useShallow((s) => ({
      showConfiguration: s.showConfiguration,
      setShowConfiguration: s.setShowConfiguration,
      showWorkspaceSettings: s.showWorkspaceSettings,
      setShowWorkspaceSettings: s.setShowWorkspaceSettings,
    })),
  );

  const { filePreviewTarget, closeFilePreview } = useUIStore(
    useShallow((s) => ({
      filePreviewTarget: s.filePreviewTarget,
      closeFilePreview: s.closeFilePreview,
    })),
  );

  return (
    <>
      <ConfigurationDialog
        open={showConfiguration}
        onOpenChange={(open) => {
          setShowConfiguration(open);
          if (!open) {
            onConfigurationClose();
          }
        }}
        sdkClient={sdkClient}
        apiToken={apiToken}
        isConnected={isConnected}
        onLogout={onLogout}
      />

      {activeWorkspace && (
        <WorkspaceSettingsDialog
          open={showWorkspaceSettings}
          onOpenChange={setShowWorkspaceSettings}
          workspace={activeWorkspace}
          onSave={onUpdateWorkspaceSettings}
          sdkClient={sdkClient}
          permissions={permissions}
          onRefreshPermissions={onRefreshPermissions}
          onRevokePermission={onRevokePermission}
          onRevokeAllPermissions={() => onRevokeAllPermissions(activeWorkspace.id)}
          onUpdateWorkspacePaths={onUpdateWorkspacePaths}
        />
      )}

      <FilePreviewOverlay
        workspaceId={activeWorkspace?.id}
        target={filePreviewTarget}
        sdkClient={sdkClient}
        open={filePreviewTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeFilePreview();
        }}
      />
    </>
  );
}
