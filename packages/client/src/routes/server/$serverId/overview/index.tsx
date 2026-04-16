import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/server/$serverId/overview/')({
  component: () => (
    <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground px-6">
      <h2 className="mb-2 text-lg font-medium">Overview</h2>
      <p className="text-sm">Select a session from the sidebar to start working.</p>
    </div>
  ),
});