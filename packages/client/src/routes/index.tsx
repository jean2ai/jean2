import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { SavedServer } from '@jean2/sdk';
import { Plus, Server } from 'lucide-react';
import { useServerContext } from '@/contexts/ServerContext';

function LandingPage() {
  const navigate = useNavigate();
  const { servers } = useServerContext();

  const handleSelectServer = (server: SavedServer) => {
    navigate({ to: '/server/$serverId', params: { serverId: server.id } });
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-background dark:bg-gradient-to-br dark:from-muted dark:via-background dark:to-muted p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="px-6 pt-6 pb-4 text-center border-b border-border">
            <h1 className="text-2xl font-bold text-foreground">Select a Server</h1>
            <p className="text-muted-foreground mt-1">Choose a saved server or add a new one</p>
          </div>

          <div className="p-6 space-y-4">
            {servers.map((server) => (
              <button
                key={server.id}
                onClick={() => handleSelectServer(server)}
                className="w-full flex items-center gap-4 p-4 bg-background border border-input rounded-lg hover:bg-accent hover:border-ring transition-colors text-left"
              >
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Server className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{server.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{server.url}</p>
                </div>
              </button>
            ))}

            <button
              onClick={() => navigate({ to: '/add-server' })}
              className="w-full flex items-center gap-4 p-4 bg-background border border-dashed border-input rounded-lg hover:bg-accent hover:border-ring transition-colors text-left"
            >
              <div className="p-2 bg-primary/10 rounded-lg">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-muted-foreground">Add a Server</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/')({
  component: LandingPage,
});
