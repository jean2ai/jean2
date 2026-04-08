import type { Session, SessionStatus } from '@jean2/sdk';
import { useSessionManager } from './use-session-manager';

export interface UseSessionReturn {
  session: Session | undefined;
  status: SessionStatus | undefined;
  isActive: boolean;
  isClosed: boolean;
}

export function useSession(sessionId: string): UseSessionReturn {
  const { sessions } = useSessionManager();

  const session = sessions.find((s) => s.id === sessionId);
  const status = session?.status;
  const isActive = status === 'active';
  const isClosed = status === 'closed';

  return {
    session,
    status,
    isActive,
    isClosed,
  };
}
