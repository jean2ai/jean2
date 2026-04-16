import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/server/$serverId/workspace/')({
  component: () => (
    <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground px-6">
      <h2 className="mb-2">Select or create a session</h2>
      <p>Choose a session from the sidebar or create a new one to start chatting.</p>
    </div>
  ),
});