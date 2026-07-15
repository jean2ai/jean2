import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/server/$serverId/overview/')({
  component: () => null,
});
