import { Suspense, lazy } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Jean2Client, WorkspaceSettings, PermissionGrant } from '@jean2/sdk';
import { useUIStore } from '@/stores/uiStore';
import { useServerDataStore } from '@/stores/serverDataStore';

const ConfigurationDialog = lazy(() =>
  import('@/components/modals/ConfigurationDialog').then((m) => ({ default: m.ConfigurationDialog })),
);
const WorkspaceSettingsDialog = lazy(() =>
  import('@/components/modals/WorkspaceSettingsDialog').then((m) => ({ default: m.WorkspaceSettingsDialog })),
);
const SchedulerJobModal = lazy(() =>
  import('@/components/modals/SchedulerJobModal').then((m) => ({ default: m.SchedulerJobModal })),
);
const FilePreviewOverlay = lazy(() =>
  import('@/components/files/FilePreviewOverlay'),
);

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
  isUpdatingWorkspace?: Record<string, boolean>;
}

function DialogLoadingFallback() {
  return null;
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
  isUpdatingWorkspace = {},
}: ServerDialogsProps) {
  const activeWorkspace = useServerDataStore((s) => s.activeWorkspace);

  const {
    showConfiguration,
    setShowConfiguration,
    showWorkspaceSettings,
    setShowWorkspaceSettings,
    showSchedulerJob,
    editingSchedulerJob,
    setShowSchedulerJob,
  } = useUIStore(
    useShallow((s) => ({
      showConfiguration: s.showConfiguration,
      setShowConfiguration: s.setShowConfiguration,
      showWorkspaceSettings: s.showWorkspaceSettings,
      setShowWorkspaceSettings: s.setShowWorkspaceSettings,
      showSchedulerJob: s.showSchedulerJob,
      editingSchedulerJob: s.editingSchedulerJob,
      setShowSchedulerJob: s.setShowSchedulerJob,
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
      {(showConfiguration || showWorkspaceSettings || showSchedulerJob || filePreviewTarget !== null) && (
        <Suspense fallback={<DialogLoadingFallback />}>
          {showConfiguration && (
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
          )}

          {activeWorkspace && showWorkspaceSettings && (
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
              isSaving={!!isUpdatingWorkspace[activeWorkspace.id]}
            />
          )}

          {showSchedulerJob && (
            <SchedulerJobModal
              open={showSchedulerJob}
              onOpenChange={(open) => setShowSchedulerJob(open)}
              sdkClient={sdkClient}
              workspaceId={activeWorkspace?.id ?? null}
              editingJob={editingSchedulerJob}
            />
          )}

          {filePreviewTarget !== null && (
            <FilePreviewOverlay
              workspaceId={activeWorkspace?.id}
              target={filePreviewTarget}
              sdkClient={sdkClient}
              open={filePreviewTarget !== null}
              onOpenChange={(open) => {
                if (!open) closeFilePreview();
              }}
            />
          )}
        </Suspense>
      )}
    </>
  );
}
