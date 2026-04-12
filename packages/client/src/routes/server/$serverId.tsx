import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { fetchServerData, type ServerData } from '@/lib/fetchServerData';
import { deleteServer, getSavedServers } from '@/config/servers';
import { StoreHydrator } from '@/components/providers/StoreHydrator';
import ServerShell from '@/components/shell/ServerShell';

function ServerErrorComponent({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const router = useRouter();
  const params = Route.useParams();
  const serverId = params.serverId;

  const savedServers = getSavedServers();
  const otherServers = savedServers.filter((s) => s.id !== serverId);
  const hasOtherServers = otherServers.length > 0;

  const handleRemoveServer = () => {
    if (serverId) {
      deleteServer(serverId);
    }
    router.navigate({ to: '/', replace: true });
  };

  const handleSwitchServer = () => {
    if (otherServers.length > 0) {
      router.navigate({ to: '/server/$serverId', params: { serverId: otherServers[0].id }, replace: true });
    } else {
      router.navigate({ to: '/', replace: true });
    }
  };

  const handleGoHome = () => {
    router.navigate({ to: '/', replace: true });
  };

  return (
    <div className="flex w-full items-center justify-center min-h-screen bg-background text-foreground">
      <div className="text-center space-y-4 p-8 max-w-lg w-full">
        <h2 className="text-lg font-semibold">Server Connection Error</h2>
        <p className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : 'An unknown error occurred'}
        </p>
        <div className="space-y-2 pt-2">
          <button
            onClick={() => reset()}
            className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Retry
          </button>
          {hasOtherServers && (
            <button
              onClick={handleSwitchServer}
              className="w-full px-4 py-2 rounded-md border border-border bg-background text-foreground text-sm font-medium hover:bg-accent"
            >
              Switch Server
            </button>
          )}
          <button
            onClick={handleRemoveServer}
            className="w-full px-4 py-2 rounded-md border border-destructive/50 text-destructive text-sm font-medium hover:bg-destructive/10"
          >
            Remove This Server
          </button>
          <button
            onClick={handleGoHome}
            className="w-full px-4 py-2 rounded-md text-muted-foreground text-sm font-medium hover:text-foreground hover:bg-accent"
          >
            Go to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/server/$serverId')({
  beforeLoad: ({ params, context }) => {
    const server = context.serverRegistry.getServer(params.serverId);
    if (!server) {
      const servers = context.serverRegistry.getServers();
      if (servers.length > 0) {
        throw redirect({
          to: '/server/$serverId',
          params: { serverId: servers[0].id },
          replace: true,
          throw: true,
        });
      }
      throw redirect({ to: '/', replace: true, throw: true });
    }
    return { server };
  },
  loader: async ({ params, context, abortController }): Promise<ServerData> => {
    const server = context.serverRegistry.getServer(params.serverId);
    if (!server) {
      throw redirect({ to: '/', replace: true, throw: true });
    }
    try {
      return await fetchServerData(server.url, server.token, abortController.signal);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to connect to server: ${message}`, { cause: err });
    }
  },
  component: () => (
    <StoreHydrator>
      <ServerShell />
    </StoreHydrator>
  ),
  errorComponent: ServerErrorComponent,
  pendingComponent: () => (
    <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
      <div className="text-center space-y-2">
        <div className="h-8 w-8 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Connecting to server...</p>
      </div>
    </div>
  ),
});
