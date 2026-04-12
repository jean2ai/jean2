import { create } from 'zustand';

export type CompletionRecord = {
  type: 'flash-only' | 'flash-then-sticky';
  flashStartedAt: number;
};

const FLASH_DURATION_MS = 5000;

interface CompletionState {
  completionState: Map<string, CompletionRecord>;
}

interface CompletionActions {
  setCompletion: (sessionId: string, record: CompletionRecord) => void;
  clearCompletion: (sessionId: string) => void;
  clearAllCompletions: () => void;
}

type CompletionStore = CompletionState & CompletionActions;

export const useCompletionStore = create<CompletionStore>((set) => ({
  completionState: new Map<string, CompletionRecord>(),

  setCompletion: (sessionId, record) => set((state) => {
    const newMap = new Map(state.completionState);
    newMap.set(sessionId, record);
    return { completionState: newMap };
  }),
  clearCompletion: (sessionId) => set((state) => {
    const newMap = new Map(state.completionState);
    newMap.delete(sessionId);
    return { completionState: newMap };
  }),
  clearAllCompletions: () => set({ completionState: new Map<string, CompletionRecord>() }),
}));

// Selector: get completion record for a session
export const selectCompletionRecord = (sessionId: string) => (state: CompletionStore) =>
  state.completionState.get(sessionId);

// Selector: is session in flash phase (within flash duration)
export const selectIsFlashing = (sessionId: string) => (state: CompletionStore) => {
  const record = state.completionState.get(sessionId);
  if (!record) return false;
  return Date.now() - record.flashStartedAt < FLASH_DURATION_MS;
};

// Selector: is session in sticky phase (flash-then-sticky type)
export const selectIsSticky = (sessionId: string) => (state: CompletionStore) => {
  const record = state.completionState.get(sessionId);
  return record?.type === 'flash-then-sticky';
};

// Constants for consumers
export const COMPLETION_FLASH_DURATION_MS = FLASH_DURATION_MS;
