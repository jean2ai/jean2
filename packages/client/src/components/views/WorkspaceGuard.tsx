import { useEffect } from 'react';
import { useServerDataStore } from '@/stores/serverDataStore';

/**
 * Prevents agent home workspaces from being active in non-agent views.
 * If the active workspace is an agent home, immediately switches to the
 * first normal workspace (or clears it if none exist).
 */
export function WorkspaceGuard({ children }: { children: React.ReactNode }) {
  const activeWorkspace = useServerDataStore(s => s.activeWorkspace);
  const workspaces = useServerDataStore(s => s.workspaces);

  useEffect(() => {
    if (activeWorkspace?.settings?.isAgentHome) {
      const normal = workspaces.find(w => !w.settings?.isAgentHome);
      if (normal) {
        useServerDataStore.getState().setActiveWorkspace(normal);
        localStorage.setItem('activeWorkspaceId', normal.id);
      } else {
        useServerDataStore.getState().setActiveWorkspace(null);
        localStorage.removeItem('activeWorkspaceId');
      }
    }
  }, [activeWorkspace, workspaces]);

  if (activeWorkspace?.settings?.isAgentHome) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
