import { useShallow } from 'zustand/react/shallow';
import type { Jean2Client, PermissionGrant } from '@jean2/sdk';
import { useUIStore } from '@/stores/uiStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { MCPManagementDialog } from '@/components/modals/MCPManagementDialog';
import { ConfigurationDialog } from '@/components/modals/ConfigurationDialog';
import { ToolsDialog } from '@/components/modals/ToolsDialog';
import { WorkspacePermissionsDialog } from '@/components/modals/WorkspacePermissionsDialog';
import FilePreviewOverlay from '@/components/files/FilePreviewOverlay';

interface ServerDialogsProps {
  apiToken: string | null;
  isConnected: boolean;
  sdkClient: Jean2Client | null;
  permissions: PermissionGrant[];
  onLogout: () => void;
  onRefreshPermissions: () => void;
  onRevokePermission: (permissionId: string) => void;
  onRevokeAllPermissions: (workspaceId: string) => void;
  onConfigurationClose: () => void;
}

export function ServerDialogs({
  apiToken,
  isConnected,
  sdkClient,
  permissions,
  onLogout,
  onRefreshPermissions,
  onRevokePermission,
  onRevokeAllPermissions,
  onConfigurationClose,
}: ServerDialogsProps) {
  const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);
  const {
    showMCPDialog,
    showConfiguration,
    showTools,
    showWorkspacePermissions,
    setShowMCPDialog,
    setShowConfiguration,
    setShowTools,
    setShowWorkspacePermissions,
  } = useUIStore(
    useShallow((s) => ({
      showMCPDialog: s.showMCPDialog,
      showConfiguration: s.showConfiguration,
      showTools: s.showTools,
      showWorkspacePermissions: s.showWorkspacePermissions,
      setShowMCPDialog: s.setShowMCPDialog,
      setShowConfiguration: s.setShowConfiguration,
      setShowTools: s.setShowTools,
      setShowWorkspacePermissions: s.setShowWorkspacePermissions,
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
      <MCPManagementDialog
        open={showMCPDialog}
        onOpenChange={setShowMCPDialog}
        workspaceId={activeWorkspace?.id}
        workspacePath={activeWorkspace?.path}
        sdkClient={sdkClient}
      />

      <WorkspacePermissionsDialog
        open={showWorkspacePermissions}
        onOpenChange={setShowWorkspacePermissions}
        permissions={permissions}
        onRefreshPermissions={onRefreshPermissions}
        onRevokePermission={onRevokePermission}
        onRevokeAllPermissions={() => {
          if (activeWorkspace?.id) {
            onRevokeAllPermissions(activeWorkspace.id);
          }
        }}
        workspaceName={activeWorkspace?.name}
      />

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

      <ToolsDialog
        open={showTools}
        onOpenChange={setShowTools}
        sdkClient={sdkClient}
      />

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
