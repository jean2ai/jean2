import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { useLoaderData, useParams } from '@tanstack/react-router';
import { clearSessionState } from '@/stores/sessionStore';
import { useServerDataStore } from '@/stores/serverDataStore';
import type { ServerData } from '@/lib/fetchServerData';

interface StoreHydratorProps {
  children: ReactNode;
}

export function StoreHydrator({ children }: StoreHydratorProps) {
  const data = useLoaderData({
    from: '/server/$serverId',
    strict: false,
    structuralSharing: true,
  } as unknown as Parameters<typeof useLoaderData>[0]) as ServerData | undefined;
  const params = useParams({ from: '/server/$serverId', strict: false } as unknown as Parameters<typeof useParams>[0]);
  const serverId = params.serverId as string | undefined;

  useLayoutEffect(() => {
    if (!data) return;

    const usableModels = (data.models || []).filter((m) => m.runtimeStatus?.usable);
    useServerDataStore.getState().hydrate(serverId ?? '', {
      workspaces: data.workspaces,
      preconfigs: data.preconfigs,
      prompts: data.prompts,
      models: usableModels,
      defaultModel: data.defaultModel || 'gpt-4o',
      defaultProvider: data.defaultProvider || 'openai',
      providers: data.providers,
    });

    const pendingWorkspaceId = localStorage.getItem('activeWorkspaceId');
    const workspaces = data.workspaces;
    if (pendingWorkspaceId) {
      const saved = workspaces.find(w => w.id === pendingWorkspaceId);
      if (saved) {
        useServerDataStore.getState().setActiveWorkspace(saved);
      } else if (workspaces.length > 0) {
        useServerDataStore.getState().setActiveWorkspace(workspaces[0]);
      }
    } else if (workspaces.length > 0) {
      useServerDataStore.getState().setActiveWorkspace(workspaces[0]);
    }
  }, [data, serverId]);

  useEffect(() => {
    return () => {
      clearSessionState();
      useServerDataStore.getState().clearAll();
    };
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading server data...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
