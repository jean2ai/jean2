import { createFileRoute } from '@tanstack/react-router';
import SessionContent from '@/components/views/SessionContent';

export const Route = createFileRoute('/server/$serverId/overview/session/$sessionId')({
  component: SessionContent,
});
