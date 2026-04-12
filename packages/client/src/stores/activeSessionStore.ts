import { create } from 'zustand';
import type { Session } from '@jean2/sdk';

interface ActiveSessionState {
  currentSession: Session | null;
}

interface ActiveSessionActions {
  setCurrentSession: (session: Session | null) => void;
  clearActiveSession: () => void;
}

type ActiveSessionStore = ActiveSessionState & ActiveSessionActions;

export const useActiveSessionStore = create<ActiveSessionStore>((set) => ({
  currentSession: null,

  setCurrentSession: (session) => set({ currentSession: session }),

  clearActiveSession: () => set({ currentSession: null }),
}));