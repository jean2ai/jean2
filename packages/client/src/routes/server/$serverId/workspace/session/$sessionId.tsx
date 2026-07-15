import { createFileRoute } from '@tanstack/react-router';
import SessionContent from '@/components/views/SessionContent';
import { validateBoardSearch } from '@/lib/boardSearch';

export const Route = createFileRoute('/server/$serverId/workspace/session/$sessionId')({
  validateSearch: validateBoardSearch,
  component: SessionContent,
});
