import { create } from 'zustand';
import type { Session } from '@jean2/sdk';

type SessionsUpdater = Session[] | ((prev: Session[]) => Session[]);

interface SessionListState {
  sessions: Session[];
}

interface SessionListActions {
  setSessions: (updater: SessionsUpdater) => void;
  addSessionToFront: (session: Session) => void;
  updateSession: (session: Session) => void;
  removeSessionById: (sessionId: string) => void;
  clearSessions: () => void;
}

type SessionListStore = SessionListState & SessionListActions;

export const useSessionListStore = create<SessionListStore>((set) => ({
  sessions: [],

  setSessions: (updater) =>
    set((state) => ({
      sessions: typeof updater === 'function' ? updater(state.sessions) : updater,
    })),

  addSessionToFront: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
    })),

  updateSession: (session) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === session.id ? session : s)),
    })),

  removeSessionById: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
    })),

  clearSessions: () => set({ sessions: [] }),
}));