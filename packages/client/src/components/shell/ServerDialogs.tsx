import { useShallow } from 'zustand/react/shallow';
import type { Jean2Client, ToolPermission } from '@jean2/sdk';
import { useUIStore } from '@/stores/uiStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import { SettingsDialog } from '@/components/modals/SettingsDialog';
import { MCPManagementDialog } from '@/components/modals/MCPManagementDialog';
import { ConfigurationDialog } from '@/components/modals/ConfigurationDialog';
import { ToolsDialog } from '@/components/modals/ToolsDialog';
import { WorkspacePermissionsDialog } from '@/components/modals/WorkspacePermissionsDialog';
import { AddServerDialog } from '@/components/modals/AddServerDialog';
import FilePreviewOverlay from '@/components/files/FilePreviewOverlay';

interface ServerDialogsProps {
  apiToken: string | null;
  sdkClient: Jean2Client | null;
  permissions: ToolPermission[];
  onLogout: () => void;
  onRefreshPermissions: () => void;
  onRevokePermission: (permissionId: string) => void;
  onRevokeAllPermissions: (workspaceId: string) => void;
  onConfigurationClose: () => void;
}

export function ServerDialogs({
  apiToken,
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
    showSettings,
    showMCPDialog,
    showConfiguration,
    showTools,
    showWorkspacePermissions,
    showAddServer,
    editServerData,
    setShowSettings,
    setShowMCPDialog,
    setShowConfiguration,
    setShowTools,
    setShowWorkspacePermissions,
    setShowAddServer,
    setEditServerData,
  } = useUIStore(
    useShallow((s) => ({
      showSettings: s.showSettings,
      showMCPDialog: s.showMCPDialog,
      showConfiguration: s.showConfiguration,
      showTools: s.showTools,
      showWorkspacePermissions: s.showWorkspacePermissions,
      showAddServer: s.showAddServer,
      editServerData: s.editServerData,
      setShowSettings: s.setShowSettings,
      setShowMCPDialog: s.setShowMCPDialog,
      setShowConfiguration: s.setShowConfiguration,
      setShowTools: s.setShowTools,
      setShowWorkspacePermissions: s.setShowWorkspacePermissions,
      setShowAddServer: s.setShowAddServer,
      setEditServerData: s.setEditServerData,
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
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        apiToken={apiToken}
        onLogout={onLogout}
        sdkClient={sdkClient}
      />

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
      />

      <ToolsDialog
        open={showTools}
        onOpenChange={setShowTools}
        sdkClient={sdkClient}
      />

      <AddServerDialog
        open={showAddServer}
        onOpenChange={(open) => {
          setShowAddServer(open);
          if (!open) setEditServerData(null);
        }}
        editServer={editServerData}
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
