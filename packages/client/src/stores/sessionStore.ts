import { create } from 'zustand';
import type { Session, Message, Part, QueuedMessage } from '@jean2/sdk';

// --- Session Usage ---
export type SessionUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

const DEFAULT_USAGE: SessionUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

// --- Type Aliases ---
type SessionsUpdater = Session[] | ((prev: Session[]) => Session[]);
type MessagesBySessionState = Record<string, Message[]>;
type PartsBySessionState = Record<string, Record<string, Part[]>>;
type MessagesBySessionUpdater = MessagesBySessionState | ((prev: MessagesBySessionState) => MessagesBySessionState);
type PartsBySessionUpdater = PartsBySessionState | ((prev: PartsBySessionState) => PartsBySessionState);

// --- Combined Store ---
interface SessionState {
  // --- Active Session ---
  currentSession: Session | null;

  // --- Session List ---
  sessions: Session[];

  // --- Chat Session ---
  sessionUsage: SessionUsage;
  currentModel: string;
  selectedVariant: string | null;
  compactionSuccess: boolean;

  // --- Session Content ---
  messagesBySession: MessagesBySessionState;
  partsBySession: PartsBySessionState;

  // --- Message Queue ---
  queuedMessages: Record<string, QueuedMessage[]>;
}

interface SessionActions {
  // --- Active Session ---
  setCurrentSession: (session: Session | null) => void;
  clearActiveSession: () => void;

  // --- Session List ---
  setSessions: (updater: SessionsUpdater) => void;
  addSessionToFront: (session: Session) => void;
  updateSession: (session: Session) => void;
  removeSessionById: (sessionId: string) => void;
  clearSessions: () => void;

  // --- Chat Session ---
  setSessionUsage: (usage: SessionUsage) => void;
  setCurrentModel: (model: string) => void;
  setSelectedVariant: (variant: string | null) => void;
  setCompactionSuccess: (success: boolean) => void;
  clearChatSession: () => void;

  // --- Session Content ---
  setMessagesBySession: (updater: MessagesBySessionUpdater) => void;
  setPartsBySession: (updater: PartsBySessionUpdater) => void;
  getMessagesBySessionKeysCount: () => number;

  // --- Message Queue ---
  clearQueuedMessages: () => void;
  setQueuedMessagesForSession: (sessionId: string, messages: QueuedMessage[]) => void;
  addQueuedMessage: (sessionId: string, message: QueuedMessage) => void;
  removeQueuedMessageById: (sessionId: string, queueId: string) => void;
  removeQueuedMessagesByIds: (sessionId: string, queueIds: string[]) => void;
}

type SessionStore = SessionState & SessionActions;

export const useSessionStore = create<SessionStore>((set, get) => ({
  // --- Active Session ---
  currentSession: null,

  setCurrentSession: (session) => set({ currentSession: session }),
  clearActiveSession: () => set({ currentSession: null }),

  // --- Session List ---
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

  // --- Chat Session ---
  sessionUsage: { ...DEFAULT_USAGE },
  currentModel: 'gpt-4o',
  selectedVariant: null,
  compactionSuccess: false,

  setSessionUsage: (sessionUsage) => set({ sessionUsage }),
  setCurrentModel: (currentModel) => set({ currentModel }),
  setSelectedVariant: (selectedVariant) => set({ selectedVariant }),
  setCompactionSuccess: (compactionSuccess) => set({ compactionSuccess }),
  clearChatSession: () =>
    set({
      sessionUsage: { ...DEFAULT_USAGE },
      currentModel: 'gpt-4o',
      selectedVariant: null,
      compactionSuccess: false,
    }),

  // --- Session Content ---
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

  getMessagesBySessionKeysCount: () => Object.keys(get().messagesBySession).length,

  // --- Message Queue ---
  queuedMessages: {},

  clearQueuedMessages: () => set({ queuedMessages: {} }),

  setQueuedMessagesForSession: (sessionId, messages) =>
    set((state) => ({
      queuedMessages: { ...state.queuedMessages, [sessionId]: messages },
    })),

  addQueuedMessage: (sessionId, message) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionId]: [...(state.queuedMessages[sessionId] || []), message],
      },
    })),

  removeQueuedMessageById: (sessionId, queueId) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionId]: (state.queuedMessages[sessionId] || []).filter((q) => q.id !== queueId),
      },
    })),

  removeQueuedMessagesByIds: (sessionId, queueIds) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionId]: (state.queuedMessages[sessionId] || []).filter((q) => !queueIds.includes(q.id)),
      },
    })),
}));

// --- Utility Function ---
export function clearSessionState() {
  const state = useSessionStore.getState();
  state.clearSessions();
  state.clearActiveSession();
  state.clearChatSession();
  state.clearQueuedMessages();
  state.setMessagesBySession({});
  state.setPartsBySession({});
}