import { createFileRoute } from '@tanstack/react-router';
import WorkspaceView from '@/components/views/WorkspaceView';
import { WorkspaceGuard } from '@/components/views/WorkspaceGuard';

export const Route = createFileRoute('/server/$serverId/workspace')({
  component: () => (
    <WorkspaceGuard>
      <WorkspaceView />
    </WorkspaceGuard>
  ),
});
