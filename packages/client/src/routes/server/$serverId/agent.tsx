import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/server/$serverId/agent')({
  component: AgentLayout,
});

function AgentLayout() {
  return <Outlet />;
}
