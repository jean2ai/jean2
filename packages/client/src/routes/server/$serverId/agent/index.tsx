import { useState, useEffect } from 'react';
import { createFileRoute, useParams, useRouter } from '@tanstack/react-router';
import { useServerDataStore } from '@/stores/serverDataStore';
import { Bot, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PromoteDialog } from '@/components/agent/PromoteDialog';

export const Route = createFileRoute('/server/$serverId/agent/')({
  component: AgentIndexPage,
});

function AgentIndexPage() {
  const router = useRouter();
  const { serverId } = useParams({ from: '/server/$serverId/agent/' });
  const agents = useServerDataStore(s => s.agents);
  const [promoteOpen, setPromoteOpen] = useState(false);

  const firstAgentId = agents[0]?.id;

  useEffect(() => {
    if (firstAgentId) {
      router.navigate({
        to: `/server/$serverId/agent/$agentId` as never,
        params: { serverId, agentId: firstAgentId } as never,
      });
    }
  }, [firstAgentId, router, serverId]);

  if (firstAgentId) return null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Bot className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">No agents yet</p>
        <p className="text-sm text-muted-foreground">
          Promote a preconfig to create your first agent.
        </p>
      </div>
      <Button size="sm" onClick={() => setPromoteOpen(true)}>
        <Plus />
        Promote Preconfig
      </Button>
      <PromoteDialog open={promoteOpen} onOpenChange={setPromoteOpen} />
    </div>
  );
}
