import { createFileRoute } from '@tanstack/react-router';
import OverviewView from '@/components/views/OverviewView';
import { WorkspaceGuard } from '@/components/views/WorkspaceGuard';

export const Route = createFileRoute('/server/$serverId/overview')({
  component: () => (
    <WorkspaceGuard>
      <OverviewView />
    </WorkspaceGuard>
  ),
});
