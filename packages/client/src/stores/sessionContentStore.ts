import { create } from 'zustand';
import type { Message, Part } from '@jean2/shared';

type MessagesBySessionState = Record<string, Message[]>;
type PartsBySessionState = Record<string, Record<string, Part[]>>;

type MessagesBySessionUpdater =
  | MessagesBySessionState
  | ((prev: MessagesBySessionState) => MessagesBySessionState);
type PartsBySessionUpdater =
  | PartsBySessionState
  | ((prev: PartsBySessionState) => PartsBySessionState);

interface SessionContentState {
  messagesBySession: MessagesBySessionState;
  partsBySession: PartsBySessionState;
}

interface SessionContentActions {
  setMessagesBySession: (updater: MessagesBySessionUpdater) => void;
  setPartsBySession: (updater: PartsBySessionUpdater) => void;
}

type SessionContentStore = SessionContentState & SessionContentActions;

export const useSessionContentStore = create<SessionContentStore>((set) => ({
  messagesBySession: {},
  partsBySession: {},

  setMessagesBySession: (updater) =>
    set((state) => ({
      messagesBySession:
        typeof updater === 'function'
          ? updater(state.messagesBySession)
          : updater,
    })),

  setPartsBySession: (updater) =>
    set((state) => ({
      partsBySession:
        typeof updater === 'function' ? updater(state.partsBySession) : updater,
    })),
}));
