import { createContext, useContext } from 'react';
import type { UseServerSessionManagerReturn } from '@/hooks/useServerSessionManager';

export const SessionManagerContext = createContext<UseServerSessionManagerReturn | null>(null);

export function useSessionManager(): UseServerSessionManagerReturn {
  const ctx = useContext(SessionManagerContext);
  if (!ctx) {
    throw new Error('useSessionManager must be used within a SessionManagerContext.Provider');
  }
  return ctx;
}