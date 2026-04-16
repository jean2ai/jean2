import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/server/$serverId/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/server/$serverId/workspace', params });
  },
});
