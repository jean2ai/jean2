import { create } from 'zustand';

interface StreamState {
  streamingSessionIds: Set<string>;
  interruptedSessions: Set<string>;
}

interface StreamStateActions {
  clearStreamingSessions: () => void;
  addStreamingSession: (sessionId: string) => void;
  removeStreamingSession: (sessionId: string) => void;
  replaceStreamingSessions: (ids: Set<string> | string[]) => void;
  addInterruptedSession: (sessionId: string) => void;
  removeInterruptedSession: (sessionId: string) => void;
  clearInterruptedSessions: () => void;
}

type StreamStateStore = StreamState & StreamStateActions;

export const useStreamStateStore = create<StreamStateStore>((set) => ({
  streamingSessionIds: new Set<string>(),
  interruptedSessions: new Set<string>(),

  clearStreamingSessions: () =>
    set({ streamingSessionIds: new Set<string>() }),

  addStreamingSession: (sessionId) =>
    set((state) => {
      if (state.streamingSessionIds.has(sessionId)) {
        return state;
      }
      const next = new Set(state.streamingSessionIds);
      next.add(sessionId);
      return { streamingSessionIds: next };
    }),

  removeStreamingSession: (sessionId) =>
    set((state) => {
      if (!state.streamingSessionIds.has(sessionId)) {
        return state;
      }
      const next = new Set(state.streamingSessionIds);
      next.delete(sessionId);
      return { streamingSessionIds: next };
    }),

  replaceStreamingSessions: (ids) =>
    set({
      streamingSessionIds: ids instanceof Set ? ids : new Set(ids),
    }),

  addInterruptedSession: (sessionId) =>
    set((state) => {
      if (state.interruptedSessions.has(sessionId)) {
        return state;
      }
      const next = new Set(state.interruptedSessions);
      next.add(sessionId);
      return { interruptedSessions: next };
    }),

  removeInterruptedSession: (sessionId) =>
    set((state) => {
      if (!state.interruptedSessions.has(sessionId)) {
        return state;
      }
      const next = new Set(state.interruptedSessions);
      next.delete(sessionId);
      return { interruptedSessions: next };
    }),

  clearInterruptedSessions: () =>
    set({ interruptedSessions: new Set<string>() }),
}));
