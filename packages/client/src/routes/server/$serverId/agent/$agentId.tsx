import { useEffect } from 'react';
import { createFileRoute, useParams, useRouter } from '@tanstack/react-router';
import { useServerDataStore } from '@/stores/serverDataStore';
import { useSessionManager } from '@/contexts/SessionManagerContext';
import WorkspaceView from '@/components/views/WorkspaceView';
import { AgentSwitcher } from '@/components/agent/AgentSwitcher';

export const Route = createFileRoute('/server/$serverId/agent/$agentId')({
  component: AgentWorkspaceLayout,
});

function AgentWorkspaceLayout() {
  const { agentId, serverId } = useParams({ from: '/server/$serverId/agent/$agentId' });
  const router = useRouter();
  const { sdkClient } = useSessionManager();
  const workspaces = useServerDataStore(s => s.workspaces);
  const activeWorkspace = useServerDataStore(s => s.activeWorkspace);
  const agents = useServerDataStore(s => s.agents);

  const agentHomeId = `${agentId}-home`;

  // If agent was demoted, redirect back to agent index
  useEffect(() => {
    if (agents.length > 0 && !agents.some(a => a.id === agentId)) {
      router.navigate({
        to: `/server/$serverId/agent/` as never,
        params: { serverId } as never,
      });
    }
  }, [agents, agentId, router, serverId]);

  useEffect(() => {
    if (!sdkClient || !agentId) return;
    if (activeWorkspace?.id === agentHomeId) return;

    const existing = workspaces.find(w => w.id === agentHomeId);
    if (existing) {
      useServerDataStore.getState().setActiveWorkspace(existing);
      localStorage.setItem('activeWorkspaceId', agentHomeId);
      return;
    }

    let cancelled = false;
    sdkClient.http.workspaces.get(agentHomeId).then(({ workspace }) => {
      if (cancelled) return;
      useServerDataStore.getState().setActiveWorkspace(workspace);
      localStorage.setItem('activeWorkspaceId', workspace.id);
    }).catch((err) => {
      console.error('[agent] Failed to load agent home workspace:', err);
    });

    return () => { cancelled = true; };
  }, [sdkClient, agentId, agentHomeId, activeWorkspace?.id, workspaces]);

  if (activeWorkspace?.id !== agentHomeId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      </div>
    );
  }

  return (
    <WorkspaceView
      switcher={<AgentSwitcher />}
      defaultPreconfigId={agentId}
    />
  );
}
