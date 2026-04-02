import { create } from 'zustand';
import type { Session } from '@jean2/shared';

interface SessionState {
  sessions: Session[];
  currentSession: Session | null;
}

type SessionsUpdater = Session[] | ((prev: Session[]) => Session[]);

interface SessionActions {
  setSessions: (updater: SessionsUpdater) => void;
  addSessionToFront: (session: Session) => void;
  updateSession: (session: Session) => void;
  removeSessionById: (sessionId: string) => void;
  setCurrentSession: (session: Session | null) => void;
  clearSessionState: () => void;
}

type SessionStore = SessionState & SessionActions;

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  currentSession: null,

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

  setCurrentSession: (session) => set({ currentSession: session }),

  clearSessionState: () =>
    set({
      sessions: [],
      currentSession: null,
    }),
}));
